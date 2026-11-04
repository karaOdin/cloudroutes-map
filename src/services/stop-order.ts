import { Env } from "../config/env.ts";

/**
 * Recovering a line's stop order from the road network.
 *
 * The API gives a line's stops as an unordered set, so the order is normally
 * derived by projecting each onto the line's drawn route. That is the right
 * answer when it works — the drawn route is what the operator says the bus
 * does — but on some lines the stops sit hundreds to thousands of metres off
 * it, and projecting onto a route the stops do not follow produces an order
 * that is confident and wrong.
 *
 * For those lines there is no ground truth left, so the best available guess is
 * the shortest way to drive through all of them, which is what OSRM's trip
 * service solves. Measured on the lines whose projection fails, it cuts the
 * implied driving distance substantially — Chlef's SOGRAL from 25.6 km to
 * 20.1 km, M'sila's Line 17 from 28.3 km to 20.6 km.
 *
 * Deliberately not used on lines whose projection holds: shortest is not the
 * same as correct, and a real bus route is allowed to double back.
 */

export type OrderedStop<T> = { stop: T; along: number };

/**
 * Our own router. The public demo server was the earlier default and is
 * explicitly not for production use; this one answers in about 350ms, snaps
 * Algerian stops to within a few tens of metres, and sends
 * `access-control-allow-origin: *` so the browser can call it directly.
 *
 * `OSRM_URL` still overrides it, for a tenant pointed somewhere else.
 */
const DEFAULT_OSRM = "https://osrm-car.devcloud.dz";
const TIMEOUT_MS = 12_000;
/** OSRM's trip service is a travelling-salesman solve and gets slow past this. */
const MAX_STOPS = 60;

type TripResponse = {
  code: string;
  waypoints?: Array<{ waypoint_index: number }>;
  trips?: Array<{ legs?: Array<{ distance: number }> }>;
};

/**
 * Orders stops along the road network, with each one's driving distance from
 * the start. Answers null whenever the router cannot help, so the caller keeps
 * whatever order it already had rather than losing the list.
 */
export async function orderStopsByRoad<T extends { lat: number; lng: number }>(
  stops: T[]
): Promise<OrderedStop<T>[] | null> {
  if (stops.length < 3 || stops.length > MAX_STOPS) return null;

  // Trailing slashes are easy to leave in a configured value and would build
  // a double-slashed path.
  const base = (Env.OSRM_URL || DEFAULT_OSRM).replace(/\/+$/, "");
  const coordinates = stops.map((s) => `${s.lng},${s.lat}`).join(";");
  const url =
    `${base}/trip/v1/driving/${coordinates}` +
    `?source=first&roundtrip=false&overview=false`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as TripResponse;

    if (data.code !== "Ok" || !data.waypoints) return null;

    // `waypoint_index` is each input's position in the solved order.
    const sequence = data.waypoints
      .map((waypoint, input) => ({ input, order: waypoint.waypoint_index }))
      .sort((a, b) => a.order - b.order);

    // Leg n is the drive from ordered stop n to n+1, so cumulative distance
    // along them is a real road distance rather than a straight-line estimate.
    const legs = data.trips?.[0]?.legs ?? [];
    let travelled = 0;

    return sequence.map((entry, index) => {
      if (index > 0) travelled += legs[index - 1]?.distance ?? 0;

      return { stop: stops[entry.input], along: travelled };
    });
  } catch {
    return null;
  }
}
