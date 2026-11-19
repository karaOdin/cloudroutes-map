import { latLng, LatLng, LatLngExpression } from "leaflet";
import { RouteData } from "../types.ts";
import { Arrival, ArrivalLine, minutesFor } from "./arrivals.ts";
import { distanceAlong, measure } from "./route-path.ts";

/**
 * A planned journey, made live.
 *
 * The tenant API plans the shape of a trip — walk here, board this line, change
 * there — and its times are not usable (see `RouteData`). What a rider needs
 * at the kerb is the opposite: not the shape, which they can see on the map,
 * but "is there a bus I can catch, and do I have to run". That is answered
 * here from the vehicles actually on the road.
 *
 * Every time is a band, on the same terms as stop arrivals: a distance
 * measured along the route, turned into minutes at urban speeds. A journey
 * adds bands together, so the arrival estimate is a band too, and it is not
 * offered at all where an unknown — a wait for a connecting bus — sits inside
 * it.
 */

export type Band = { from: number; to: number };

export type JourneyStop = { name: string; lat: number; lng: number };

export type Ride = {
  line: string;
  colour?: string;
  board: JourneyStop;
  alight: JourneyStop;
  /** Stops ridden, boarding stop excluded. */
  stops: number;
  /** Metres of road between boarding and alighting. */
  metres: number;
  /** The ride as the planner drew it, to check the answer against itself. */
  path: LatLng[];
};

export type Journey = {
  /** Where the walk to the first stop starts, when the plan says. */
  start: JourneyStop | null;
  /** The planner's own walk, as a fallback when the rider's position is not known. */
  plannedWalkMetres: number | null;
  rides: Ride[];
  destination: JourneyStop | null;
};

/** Walking pace for when the foot router cannot be reached. */
const WALK_KMH = 4.8;

/** Streets are not straight lines; a common detour factor for town grids. */
const DETOUR = 1.3;

/** Close enough to the stop to call it "there". */
export const AT_STOP_METRES = 40;

/** Minutes kept in hand so "leave in 3" does not mean "arrive as it leaves". */
const MARGIN_MIN = 1;

function toStop(
  name: string | undefined,
  at: LatLngExpression | undefined
): JourneyStop | null {
  if (!at) return null;

  const point = latLng(at);

  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return null;
  }

  return { name: name ?? "", lat: point.lat, lng: point.lng };
}

function pathLength(path: LatLng[]): number {
  let total = 0;

  for (let i = 1; i < path.length; i += 1) {
    total += path[i - 1].distanceTo(path[i]);
  }

  return total;
}

/**
 * Read the planner's steps into rides.
 *
 * A travel step carries the line and its polyline; the stop it starts at is
 * the preceding board or transfer, and the stop it ends at is the following
 * transfer or arrival. Where one of those has no location, the end of the
 * travel polyline stands in — it is drawn to the stop.
 */
export function readJourney(route: RouteData): Journey {
  const steps = route.steps ?? [];
  const rides: Ride[] = [];
  let start: JourneyStop | null = null;
  let plannedWalkMetres: number | null = null;
  let destination: JourneyStop | null = null;

  steps.forEach((step, index) => {
    const isWalk = step.action === "walk" || step.type === "walk";

    if (isWalk && rides.length === 0 && step.polyline?.length) {
      start ??= toStop(step.from, step.polyline[0]);

      if (typeof step.distance === "number") {
        plannedWalkMetres = step.distance * 1000;
      }
    }

    if (step.action === "arrive") {
      destination = toStop(step.at, step.location);
    }

    if (step.action !== "travel" || !step.line) return;

    const path = (step.polyline ?? [])
      .map((point) => latLng(point))
      .filter((point): point is LatLng => point != null);
    const before = steps
      .slice(0, index)
      .reverse()
      .find((other) => other.action === "board" || other.action === "transfer");
    const after = steps
      .slice(index + 1)
      .find((other) => other.action === "transfer" || other.action === "arrive");
    const names = step.stops_between ?? [];

    const board =
      toStop(before?.at ?? names[0], before?.location) ??
      toStop(names[0], path[0]);
    const alight =
      toStop(after?.at ?? names[names.length - 1], after?.location) ??
      toStop(names[names.length - 1], path[path.length - 1]);

    if (!board || !alight) return;

    rides.push({
      line: step.line,
      colour: step.color,
      board,
      alight,
      stops:
        typeof step.stops === "number"
          ? step.stops
          : Math.max(0, names.length - 1),
      metres:
        path.length > 1 ? pathLength(path) : (step.distance ?? 0) * 1000,
      path,
    });
  });

  return { start, plannedWalkMetres, rides, destination };
}

/** Distance between two stops along a line's own route, when it runs that way. */
/**
 * A line as this ride travels it.
 *
 * A line is drawn once, in one direction, and served both ways — Biskra's L2
 * runs from Lbechache north, and a rider going back to Lbechache rides it
 * against the drawing. Everything measured along the line assumes travel in
 * drawn order: which buses are "coming", how far the ride is, how many stops
 * are left. So where the ride's stop to get off sits behind its stop to
 * board, the line is turned round first. Without this the card named a bus
 * driving the other way as the one to catch.
 *
 * The return may use other streets than the drawing; projecting onto the
 * reversed drawing is an approximation of it, and close enough to order buses
 * and count stops by.
 */
export function orientLine(line: ArrivalLine, ride: Ride): ArrivalLine {
  const from = distanceAlong(line.path, latLng(ride.board.lat, ride.board.lng));
  const to = distanceAlong(line.path, latLng(ride.alight.lat, ride.alight.lng));

  if (!(Number.isFinite(from) && Number.isFinite(to) && to < from)) return line;

  const { total } = measure(line.path);

  return {
    name: line.name,
    path: [...line.path].reverse(),
    stopsAlong: line.stopsAlong.map((along) => total - along).sort((a, b) => a - b),
  };
}

export function rideMetresAlong(
  path: LatLng[],
  ride: Ride
): number | null {
  if (path.length < 2) return null;

  const from = distanceAlong(path, latLng(ride.board.lat, ride.board.lng));
  const to = distanceAlong(path, latLng(ride.alight.lat, ride.alight.lng));
  const metres = to - from;

  return Number.isFinite(metres) && metres > 0 ? metres : null;
}

/** A straight line, priced as a walk round the block. */
export function estimatedWalk(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): { metres: number; seconds: number } {
  const metres = latLng(from.lat, from.lng).distanceTo(latLng(to.lat, to.lng)) * DETOUR;

  return { metres, seconds: metres / ((WALK_KMH * 1000) / 3600) };
}

export function walkSeconds(metres: number): number {
  return metres / ((WALK_KMH * 1000) / 3600);
}

export function rideBand(metres: number): Band {
  return minutesFor(metres);
}

/**
 * What the rider should do about the first bus.
 *
 * - `leave_in`  — a bus will be there comfortably after they are; wait.
 * - `leave_now` — they have about the time it takes to walk there.
 * - `hurry`     — the bus's band overlaps their walk: it may be gone.
 * - `at_stop`   — they are there; this is the wait.
 * - `missed`    — the buses on the way will all be gone before they arrive.
 * - `no_bus`    — nothing on this line is heading for the stop at all.
 */
export type Catch =
  | { kind: "leave_in"; arrival: Arrival; minutes: number; band: Band }
  | { kind: "leave_now"; arrival: Arrival; band: Band }
  | { kind: "hurry"; arrival: Arrival; band: Band }
  | { kind: "at_stop"; arrival: Arrival; band: Band }
  | { kind: "missed"; next: Arrival }
  | { kind: "no_bus" };

/**
 * The first bus on `arrivals` (soonest first) the rider can reach, given a
 * walk of `walkMin` minutes to the stop. Only buses with a recent fix carry a
 * time; one without cannot be planned around and is passed over.
 */
export function catchable(
  arrivals: Arrival[],
  walkMin: number,
  atStop: boolean
): Catch {
  const timed = arrivals.filter(
    (arrival): arrival is Arrival & { minutes: Band } => arrival.minutes != null
  );

  if (timed.length === 0) return { kind: "no_bus" };

  for (const arrival of timed) {
    const band = arrival.minutes;

    if (atStop) return { kind: "at_stop", arrival, band };

    // Even at its slowest the bus is through before the rider gets there.
    if (band.to < walkMin) continue;

    const spare = band.from - walkMin - MARGIN_MIN;

    if (spare >= 2) return { kind: "leave_in", arrival, minutes: spare, band };
    if (spare >= 0) return { kind: "leave_now", arrival, band };

    return { kind: "hurry", arrival, band };
  }

  return { kind: "missed", next: timed[0] };
}

/**
 * When the rider gets in, as a band of minutes from now: the later of their
 * walk and the bus, then the ride. Null when the journey changes lines — the
 * wait for the second bus is not known now, and a band that leaves it out
 * would be a promise.
 */
export function arrivalBand(
  walkMin: number,
  caught: Catch,
  rides: Band[]
): Band | null {
  if (rides.length !== 1) return null;
  if (caught.kind === "no_bus" || caught.kind === "missed") return null;

  const ride = rides[0];

  return {
    from: Math.max(walkMin, caught.band.from) + ride.from,
    to: Math.max(walkMin, caught.band.to) + ride.to,
  };
}
