import axios from "axios";
import { Env } from "../config/env.ts";
import { RouteData } from "../types.ts";

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
  constructor(public readonly reason: "no_route" | "failed", message?: string) {
    super(message ?? reason);
  }
}

export async function planTrip(from: TripFrom, to: string): Promise<RouteData> {
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
