import { latLng, LatLng, LatLngExpression } from "leaflet";
import { Journey, Ride } from "./journey.ts";
import { distanceToPath } from "./route-path.ts";

/**
 * Whether a planned trip can be believed, judged against the lines as drawn.
 *
 * Tenants enter their own lines, and the planner trusts what they entered.
 * Measured on live data (Biskra, M'sila, Constantine, Aïn Témouchent), the
 * mistakes that reach a rider are:
 *
 * - a stop attached to a line its bus never passes. Biskra lists its bus
 *   depot on L1, L8 and L10, 0.7 to 3.4 km from their routes, and plans did
 *   "board L10 at the depot". M'sila's Line 17 lists a stop 411 m from its
 *   route. A rider sent there waits for a bus that cannot come;
 * - so a change of lines at a stop that only one of them really serves: the
 *   "connection" is a data entry, not a street corner;
 * - a ride with nothing to ride: no stops and no distance between boarding
 *   and getting off, which the planner returns as a step of its own;
 * - a line that is not drawn, or that the plan names but the line list
 *   does not have;
 * - an answer broken in itself: M'sila's planner answered "ride Line 17"
 *   between two stops 175 m apart with a one-point path, 0 km, 0 minutes and
 *   0 stops, and the map showed a trip card with no ride drawn on it. A ride
 *   whose own path does not cover the distance between its stops, or does
 *   not start and end at them, is not a ride the planner actually found.
 *
 * A trip with any of the first kind is not shown at all — the rider is told
 * which stop is wrong instead. Being sent to the wrong kerb is worse than
 * being told there is no trip. Smaller gaps are within what a stop on the
 * far side of a junction, or a route drawn down the next street, explains.
 */

/** Further than this from the line's route, a stop is not served by it. */
export const STOP_OFF_LINE_M = 300;

/** A change of lines needs the two stops within a short walk of each other. */
export const TRANSFER_WALK_M = 500;

/** Closer than this, boarding and getting off are the same place. */
const SAME_PLACE_M = 30;

/** The ride's own path must end this close to its stops. */
const PATH_END_M = 300;

/** A ride's path shorter than this share of the straight line between its stops is not the ride. */
const MIN_PATH_SHARE = 0.5;

export type PlanIssue =
  | { kind: "unknown_line"; line: string }
  | { kind: "stop_off_line"; line: string; stop: string; metres: number }
  | { kind: "transfer_gap"; from: string; to: string; metres: number }
  | { kind: "not_drawn"; line: string }
  | { kind: "nothing_to_ride" }
  | { kind: "broken_answer"; line: string; from: string; to: string };

export type PlanCheck = {
  /** The journey, with rides that go nowhere taken out. */
  journey: Journey;
  /** Mistakes that make the trip wrong; it must not be offered. */
  fatal: PlanIssue[];
  /** Gaps in what can be checked; the trip stands, it cannot be followed live. */
  warnings: PlanIssue[];
};

/** Line names as tenants type them: stray spaces and case are not a difference. */
export function lineKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function drawnPath(line: any): LatLng[] {
  return ((line?.waypoints ?? []) as LatLngExpression[])
    .map((point) => {
      try {
        return latLng(point);
      } catch {
        return null;
      }
    })
    .filter(
      (point): point is LatLng =>
        point != null && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const at = (stop: { lat: number; lng: number }) => latLng(stop.lat, stop.lng);

function goesNowhere(ride: Ride): boolean {
  return at(ride.board).distanceTo(at(ride.alight)) < SAME_PLACE_M;
}

/** Does the planner's own drawing of the ride hold together? */
function answerHolds(ride: Ride): boolean {
  const { path } = ride;

  if (path.length < 2) return false;

  const straight = at(ride.board).distanceTo(at(ride.alight));
  let length = 0;

  for (let i = 1; i < path.length; i += 1) length += path[i - 1].distanceTo(path[i]);

  if (length < straight * MIN_PATH_SHARE) return false;

  const first = path[0];
  const last = path[path.length - 1];
  const fits = (start: LatLng, end: LatLng) =>
    start.distanceTo(at(ride.board)) <= PATH_END_M && end.distanceTo(at(ride.alight)) <= PATH_END_M;

  // Either way round: a path drawn backwards is still the same stretch.
  return fits(first, last) || fits(last, first);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function checkJourney(journey: Journey, lines: any[]): PlanCheck {
  const byKey = new Map(lines.map((line) => [lineKey(String(line.name ?? "")), line]));
  const fatal: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];

  const rides = journey.rides.filter((ride) => !goesNowhere(ride));

  for (const ride of rides) {
    const before = fatal.length;

    checkAgainstLine(ride);

    // The line's own mistake explains a broken answer and names the stop to
    // fix, so it is the one reported; this is for answers broken on their own.
    if (fatal.length === before && !answerHolds(ride)) {
      fatal.push({
        kind: "broken_answer",
        line: ride.line,
        from: ride.board.name,
        to: ride.alight.name,
      });
    }
  }

  function checkAgainstLine(ride: Ride) {
    const line = byKey.get(lineKey(ride.line));

    if (!line) {
      fatal.push({ kind: "unknown_line", line: ride.line });
      return;
    }

    const path = drawnPath(line);

    if (path.length < 2) {
      warnings.push({ kind: "not_drawn", line: ride.line });
      return;
    }

    for (const stop of [ride.board, ride.alight]) {
      const metres = distanceToPath(path, at(stop));

      if (metres > STOP_OFF_LINE_M) {
        fatal.push({ kind: "stop_off_line", line: ride.line, stop: stop.name, metres });
      }
    }
  }

  for (let i = 1; i < rides.length; i += 1) {
    const metres = at(rides[i - 1].alight).distanceTo(at(rides[i].board));

    if (metres > TRANSFER_WALK_M) {
      fatal.push({
        kind: "transfer_gap",
        from: rides[i - 1].alight.name,
        to: rides[i].board.name,
        metres,
      });
    }
  }

  // Every ride went nowhere: there is no bus in this trip at all.
  if (journey.rides.length > 0 && rides.length === 0) {
    fatal.push({ kind: "nothing_to_ride" });
  }

  return { journey: { ...journey, rides }, fatal, warnings };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * A line with nothing a rider can use: no route drawn and no stops. M'sila
 * has five, entered by name only. A chip for one focuses an empty map.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function lineIsEmpty(line: any): boolean {
  return drawnPath(line).length < 2 && ((line?.bus_stops ?? []) as any[]).length === 0;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
