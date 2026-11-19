import axios from "axios";
import { Env } from "../config/env.ts";
import { RouteData } from "../types.ts";
import { metresBetween, planTripLocally, PlanStop } from "./planner.ts";
import { walkingTimes } from "./walking.ts";
import { usePlannerFeed } from "../hooks/use-planner-feed.ts";

/**
 * Ask the tenant to plan a trip.
 *
 * Two shapes, as the API has them: from where the rider stands
 * (`/plan-journey`, which adds the walk to the first stop) or from a named
 * stop (`/find-route`). Only the shape of the trip is taken from the answer;
 * its times are not usable and are worked out live — see `RouteData`.
 */

export type TripFrom = { here: [number, number] } | { stop: string };

export class PlanError extends Error {
  constructor(
    public readonly reason: "no_route" | "failed" | "walk",
    message?: string,
    /** For `walk`: how far, and how long on foot. */
    public readonly detail?: { metres: number; seconds: number }
  ) {
    super(message ?? reason);
  }
}

export type PlannedOptions = {
  route: RouteData;
  /** Every trip found, best first; `route` is the first. */
  options: RouteData[];
};

/**
 * `?planner=backend` asks the tenant API instead, to compare the two on the
 * same trip.
 */
function backendRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("planner") === "backend";
  } catch {
    return false;
  }
}

/** The stop a name stands for, the nearest one if the name is used twice. */
function stopNamed(
  stops: PlanStop[],
  name: string,
  near?: { lat: number; lng: number }
): PlanStop | null {
  const named = stops.filter((stop) => stop.name === name);

  if (named.length <= 1 || !near) return named[0] ?? null;

  const gap = (stop: PlanStop) => Math.hypot(stop.lat - near.lat, stop.lng - near.lng);

  return named.reduce((best, stop) => (gap(stop) < gap(best) ? stop : best));
}

/**
 * Plan a trip — on the map, from the lines as drawn (see `planner.ts`), or
 * with the tenant API while the network has not loaded.
 */
export async function planTrip(
  from: TripFrom,
  to: string,
  toAt?: { lat: number; lng: number }
): Promise<PlannedOptions> {
  const feed = usePlannerFeed.getState().feed;

  if (feed && !backendRequested()) {
    const destination = stopNamed(feed.stops, to, toAt);
    const start = "stop" in from ? stopNamed(feed.stops, from.stop) : null;

    if (destination && ("here" in from || start)) {
      const here = "here" in from ? from.here : null;
      const target = toAt ? { ...destination, lat: toAt.lat, lng: toAt.lng } : destination;
      const [first, last] = await Promise.all([
        here ? streetWalks({ lat: here[0], lng: here[1] }, feed.stops, 1500) : null,
        streetWalks(target, feed.stops, 700),
      ]);
      const result = planTripLocally(feed.lines, feed.stops, feed.buses, {
        from: start ? { stop: start } : { here: here! },
        to: target,
        alternatives: 3,
        walks: { first: first ?? undefined, last: last ?? undefined },
      });

      if (result.kind === "walk") {
        throw new PlanError("walk", undefined, { metres: result.metres, seconds: result.seconds });
      }

      if (result.kind === "none") throw new PlanError("no_route");

      const options = result.trips.map((trip) => trip.route);

      return { route: options[0], options };
    }
  }

  return { route: await planTripRemotely(from, to), options: [] };
}

/**
 * Street walking distances between a point and the stops within `radius`
 * of it, by stop. Null when the foot router cannot be reached; the planner
 * then falls back to straight lines.
 */
async function streetWalks(
  point: { lat: number; lng: number },
  stops: PlanStop[],
  radius: number
): Promise<Map<PlanStop["id"], number | null> | null> {
  const near = stops
    .map((stop) => ({ stop, straight: metresBetween([point.lat, point.lng], [stop.lat, stop.lng]) }))
    .filter(({ straight }) => straight <= radius)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, 60)
    .map(({ stop }) => stop);

  if (near.length === 0) return null;

  const walks = await walkingTimes(point, near);

  if (!walks) return null;

  return new Map(near.map((stop, index) => [stop.id, walks[index]?.metres ?? null]));
}

async function planTripRemotely(from: TripFrom, to: string): Promise<RouteData> {
  let data: (RouteData & { success?: boolean; message?: string }) | undefined;

  try {
    const response =
      "here" in from
        ? await axios.post(`${Env.API_URL}/plan-journey`, {
            start_lat: from.here[0],
            start_lng: from.here[1],
            end_stop: to,
          })
        : await axios.get(`${Env.API_URL}/find-route`, {
            params: { start: from.stop, end: to },
          });

    data = response.data;
  } catch (error) {
    // The API answers "nothing connects these" as a 4xx with a message; that
    // is a no-route, not a failure, and the rider should be told which.
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;

    if (status && status >= 400 && status < 500) throw new PlanError("no_route");

    throw new PlanError("failed");
  }

  if (!data?.success || !Array.isArray(data.steps) || data.steps.length === 0) {
    throw new PlanError("no_route", data?.message);
  }

  return data;
}

/**
 * Where the rider is, asking for it if nobody has said.
 *
 * In the app the host owns location and sends it as `LOCATION_UPDATE`; it is
 * asked with `REQUEST_LOCATION` and given a few seconds. In a browser the
 * page can ask the device itself.
 */
export async function locateRider(
  current: () => [number, number] | null,
  setHere: (here: [number, number]) => void
): Promise<[number, number] | null> {
  const known = current();

  if (known) return known;

  if (window.ReactNativeWebView) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "REQUEST_LOCATION" }));
    } catch {
      /* No host to ask. */
    }

    for (let waited = 0; waited < 4000; waited += 250) {
      await new Promise((resolve) => setTimeout(resolve, 250));

      const arrived = current();

      if (arrived) return arrived;
    }

    return null;
  }

  if (!("geolocation" in navigator)) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here: [number, number] = [position.coords.latitude, position.coords.longitude];

        setHere(here);
        resolve(here);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/** The last few places a rider went, newest first. Per device only. */
const RECENT_KEY = "cr.trip.recent";
const RECENT_MAX = 5;

export function recentPlaces(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");

    return Array.isArray(stored) ? stored.filter((one) => typeof one === "string") : [];
  } catch {
    return [];
  }
}

export function rememberPlace(name: string) {
  try {
    const next = [name, ...recentPlaces().filter((one) => one !== name)].slice(0, RECENT_MAX);

    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* Private window or storage blocked; recents are a convenience. */
  }
}
