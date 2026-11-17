import { Env } from "../config/env.ts";
import { MAX_TABLE_POINTS } from "./road-distance.ts";

/**
 * How far, and how long, on foot.
 *
 * A journey starts and ends with a walk, and whether the rider catches the
 * next bus depends on it: "bus in 4 min" means nothing without "stop is 6 min
 * away". The driving router cannot answer that — it routes round one-way
 * systems a pedestrian ignores and prices the walk at car speed — so this
 * talks to an OSRM instance built on the foot profile.
 *
 * Both calls answer null when the router cannot help, so a caller can fall
 * back to a straight line and say that it has, rather than lose the journey.
 */

const DEFAULT_OSRM_FOOT = "https://osrm-foot.devcloud.dz";
const TIMEOUT_MS = 10_000;

type Point = { lat: number; lng: number };

export type Walk = {
  metres: number;
  seconds: number;
};

export type WalkRoute = Walk & {
  /** The path to draw, as [lat, lng] pairs. */
  path: Array<[number, number]>;
};

function base(): string {
  return (Env.OSRM_FOOT_URL || DEFAULT_OSRM_FOOT).replace(/\/+$/, "");
}

function coordinates(points: Point[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

/**
 * Walking distance and time from `from` to each of `to`, in the same order,
 * in one table request. Unreachable points come back as null entries.
 */
export async function walkingTimes(
  from: Point,
  to: Point[]
): Promise<Array<Walk | null> | null> {
  if (to.length === 0 || to.length + 1 > MAX_TABLE_POINTS) return null;

  const url =
    `${base()}/table/v1/foot/${coordinates([from, ...to])}` +
    `?sources=0&annotations=distance,duration`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      code: string;
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    };

    const metres = data.distances?.[0];
    const seconds = data.durations?.[0];

    if (data.code !== "Ok" || !metres || !seconds) return null;

    // Row 0 is the source against every point, itself included at index 0.
    return to.map((_, index) => {
      const m = metres[index + 1];
      const s = seconds[index + 1];

      return m == null || s == null ? null : { metres: m, seconds: s };
    });
  } catch {
    return null;
  }
}

/** The walking path between two points, with its length and time. */
export async function walkingRoute(
  from: Point,
  to: Point
): Promise<WalkRoute | null> {
  const url =
    `${base()}/route/v1/foot/${coordinates([from, to])}` +
    `?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: Array<[number, number]> };
      }>;
    };

    const route = data.routes?.[0];

    if (data.code !== "Ok" || !route) return null;

    return {
      metres: route.distance,
      seconds: route.duration,
      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
      path: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    };
  } catch {
    return null;
  }
}
