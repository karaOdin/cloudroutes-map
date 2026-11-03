import { Env } from "../config/env.ts";

/**
 * How far away things are by road, from one point to many.
 *
 * Straight-line distance is the wrong answer to "which bus is near me" in a
 * town built around a river or a dual carriageway: the nearest bus as the
 * crow flies can be the one with no way across. OSRM's table service answers
 * the real question — how much road lies between — in a single request for
 * every candidate at once, rather than one route call per bus.
 */

const DEFAULT_OSRM = "https://osrm-car.devcloud.dz";
const TIMEOUT_MS = 10_000;

/**
 * OSRM's own default `max-table-size` is 100 including the source, and a
 * table is quadratic work even when only one row is asked for, so the caller
 * narrows the field first.
 */
export const MAX_TABLE_POINTS = 80;

type TableResponse = {
  code: string;
  distances?: Array<Array<number | null>>;
};

/**
 * Road metres from `from` to each of `to`, in the same order. Answers null
 * when the router cannot help, so the caller can fall back rather than lose
 * the list; individual unreachable points come back as null entries.
 */
export async function roadDistances(
  from: { lat: number; lng: number },
  to: Array<{ lat: number; lng: number }>
): Promise<Array<number | null> | null> {
  if (to.length === 0 || to.length + 1 > MAX_TABLE_POINTS) return null;

  const base = (Env.OSRM_URL || DEFAULT_OSRM).replace(/\/+$/, "");
  const points = [from, ...to].map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `${base}/table/v1/driving/${points}` +
    `?sources=0&annotations=distance`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TableResponse;

    if (data.code !== "Ok" || !data.distances?.[0]) return null;

    // Row 0 is the source against every point, itself included at index 0.
    return data.distances[0].slice(1);
  } catch {
    return null;
  }
}
