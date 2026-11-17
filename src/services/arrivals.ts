import { LatLng, latLng } from "leaflet";
import { bearingBetween, distanceAlong } from "./route-path.ts";

/**
 * Which buses are coming to a stop, and roughly when.
 *
 * Deliberately a measurement wrapped in a range, not a prediction. The honest
 * part is the distance: the stop and the bus are both projected onto the
 * line's drawn route, so the gap between them is road the bus has to cover,
 * not a straight line across the town. The time is a band derived from that
 * distance at urban speeds, and it is presented as a band because that is
 * what it is.
 *
 * Not derived from the bus's own speedometer. A bus at a red light reads
 * 0 km/h and would give an infinite wait; one on a clear stretch reads 50 and
 * would promise an arrival it cannot keep. Over a kilometre or two of city
 * driving the band below is closer than either.
 */

/** Urban running speeds, stops and lights included. */
const SLOW_KMH = 12;
const FAST_KMH = 25;

/** Beyond this the bus is not meaningfully "coming", it is somewhere else. */
const MAX_AHEAD_M = 12_000;

/**
 * A fix older than this cannot carry a time. The bus has moved and we do not
 * know where, so the distance is reported and the clock is not.
 */
export const NO_TIME_AFTER_MS = 120_000;

/** Two fixes on one polyline can be the two directions of one service. */
const OPPOSITE_DEGREES = 90;

export type Arrival = {
  deviceId: number;
  name: string;
  line: string;
  /** Metres of road between the bus and the stop. */
  metres: number;
  stopsAway: number;
  /** True when the line came from the operator rather than from geometry. */
  declared: boolean;
  /** Null when the last fix is too old to say anything about time. */
  minutes: { from: number; to: number } | null;
};

export type ArrivalBus = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  course: number;
  age: number;
  lines: string[];
  declared: boolean;
};

export type ArrivalLine = {
  name: string;
  path: LatLng[];
  /** Every stop on the line, as distance along that path. */
  stopsAlong: number[];
};

export function minutesFor(metres: number): { from: number; to: number } {
  return {
    from: Math.max(1, Math.round(metres / ((FAST_KMH * 1000) / 60))),
    to: Math.max(2, Math.round(metres / ((SLOW_KMH * 1000) / 60))),
  };
}

/** Is the bus travelling the way this stretch of the route runs? */
function headingAgrees(path: LatLng[], here: LatLng, course: number): boolean {
  let nearest = 0;
  let best = Infinity;

  for (let i = 0; i < path.length - 1; i += 1) {
    const gap = path[i].distanceTo(here);

    if (gap < best) {
      best = gap;
      nearest = i;
    }
  }

  const along = bearingBetween(path[nearest], path[nearest + 1]);
  const apart = Math.abs(((course - along + 540) % 360) - 180);

  return apart <= 180 - OPPOSITE_DEGREES;
}

/**
 * Buses approaching `stop` along the lines that serve it, soonest first.
 *
 * A line is one polyline and a service runs it both ways, so a bus on the
 * return leg projects onto the same route behind the stop and would be
 * announced as arriving. Its heading is compared with the direction the route
 * runs at that point and it is dropped when the two disagree — without that,
 * half the answers would be buses driving away.
 */
export function arrivalsAt(
  stop: { lat: number; lng: number },
  lines: ArrivalLine[],
  buses: ArrivalBus[]
): Arrival[] {
  const here = latLng(stop.lat, stop.lng);
  const found: Arrival[] = [];

  for (const line of lines) {
    if (line.path.length < 2) continue;

    const stopAlong = distanceAlong(line.path, here);

    if (!Number.isFinite(stopAlong)) continue;

    for (const bus of buses) {
      if (!bus.lines.includes(line.name)) continue;

      const at = latLng(bus.lat, bus.lng);
      const busAlong = distanceAlong(line.path, at);

      if (!Number.isFinite(busAlong)) continue;

      const metres = stopAlong - busAlong;

      // Already past, or far enough away that it is not this journey.
      if (metres <= 0 || metres > MAX_AHEAD_M) continue;

      if (!headingAgrees(line.path, at, bus.course)) continue;

      found.push({
        deviceId: bus.id,
        name: bus.name,
        line: line.name,
        metres,
        stopsAway: line.stopsAlong.filter(
          (along) => along > busAlong && along < stopAlong
        ).length,
        declared: bus.declared,
        minutes: bus.age > NO_TIME_AFTER_MS ? null : minutesFor(metres),
      });
    }
  }

  // One bus can be attributed to several lines that share this stop; the
  // nearest reading is the one worth showing.
  const nearest = new Map<number, Arrival>();

  found
    .sort((a, b) => a.metres - b.metres)
    .forEach((arrival) => {
      if (!nearest.has(arrival.deviceId)) nearest.set(arrival.deviceId, arrival);
    });

  return [...nearest.values()];
}
