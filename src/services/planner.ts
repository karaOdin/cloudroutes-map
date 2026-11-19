import type { RouteData, RouteStep } from "../types.ts";

/**
 * Plan a bus trip on the map itself, from the lines as drawn.
 *
 * The tenant planner (`/plan-journey`, `/find-route`) gets riders lost in
 * ways no amount of checking its answers can fix:
 *
 * - it walks the rider to the single nearest stop and plans from there only,
 *   even when a stop a minute further away is on a line that goes straight
 *   to the destination;
 * - it changes lines only at the very same stop record, so two stops either
 *   side of a street (M'sila's "A"/"B" pairs, 10-60 m apart) never connect;
 * - it picks the trip with the fewest stops, not the quickest, and invents
 *   its times (3 min a stop);
 * - it orders a line's stops by nearest waypoint in raw degrees and rides
 *   any line in either direction without asking which way the bus goes.
 *
 * This searches the network the map already has. Every stop within a walk of
 * the rider is a possible start and every stop within a walk of the
 * destination a possible end; a line is ridden in the direction its drawing
 * runs, and back the other way unless it is drawn as a loop; changes may be
 * at the same stop or a short walk apart; and trips are ranked by time, with
 * the wait for the first bus taken from the buses on the road when there are
 * any. A tenant network is about a hundred stops and a dozen lines, so the
 * whole search takes milliseconds.
 *
 * Kept free of Leaflet and React so it can be run against tenant data on its
 * own.
 */

export type PlanStop = { id: number | string; name: string; lat: number; lng: number };

export type PlanLine = {
  name: string;
  colour?: string;
  path: Array<[number, number]>;
  stops: PlanStop[];
};

export type PlanBus = {
  lat: number;
  lng: number;
  /** Degrees, or null when the heading is not known. */
  course: number | null;
  lines: string[];
  /** False when the bus has not moved lately. */
  active?: boolean;
  /** Milliseconds since its last fix. */
  age?: number;
};

export type PlanPlace = { name: string; lat: number; lng: number };

export type PlanOptions = {
  /** The rider's position, or a stop to start from. */
  from: { here: [number, number] } | { stop: PlanStop };
  to: PlanPlace;
  /** How many different trips to return, best first. */
  alternatives?: number;
  /**
   * Walks measured along streets by the foot router, in metres, by stop:
   * from the rider to each stop near them, and from each stop near the
   * destination to it. A straight line hides a railway or a wall between a
   * rider and the stop that looks closest; with these, the stop is the one
   * that is actually near. A stop the router could not reach is left out.
   */
  walks?: {
    first?: Map<PlanStop["id"], number | null>;
    last?: Map<PlanStop["id"], number | null>;
  };
};

export type PlannedTrip = {
  route: RouteData;
  /** Seconds from now to arrival, as estimated when planned. */
  seconds: number;
  /** True when every wait in it came from a bus actually on the road. */
  liveWait: boolean;
  lines: string[];
};

export type PlanResult =
  | { kind: "trips"; trips: PlannedTrip[] }
  /** Walking is as quick as any bus, or the destination is just there. */
  | { kind: "walk"; metres: number; seconds: number }
  | { kind: "none" };

/** Walking pace, and the street-grid detour over a straight line. */
const WALK_MPS = 4.8 / 3.6;
const DETOUR = 1.3;

/** Mid-way between the slow and fast urban speeds used for arrival bands. */
const BUS_MPS = 18 / 3.6;
/** Time lost at each stop the bus calls at. */
const DWELL_S = 20;

/** Furthest a rider is asked to walk to the first stop, and from the last. */
const FIRST_WALK_M = 1500;
const LAST_WALK_M = 700;
/** Furthest between two stops to change lines on foot. */
const CHANGE_WALK_M = 400;

/** A stop further than this from its line's drawing is not served by it. */
const STOP_ON_LINE_M = 300;
/** A drawing whose ends meet within this is a loop, run one way round. */
const LOOP_M = 250;

const MAX_BOARDINGS = 3;
/** Each change costs this on top of its time: changing is a risk and a bother. */
const CHANGE_PENALTY_S = 240;
/** Walking counts for a little more than its minutes. */
const WALK_WEIGHT = 1.3;
/** The wait assumed when no bus on the line can be timed. */
const UNKNOWN_WAIT_S = 12 * 60;
/** Walking wins when it is no slower than the bus by this much… */
const WALK_IF_WITHIN_S = 3 * 60;
/** …and is not a long walk: past this, a slightly slower bus still beats it. */
const WALK_INSTEAD_MAX_M = 1000;
/** Under this, just walk. */
const ALWAYS_WALK_M = 450;

// ---------------------------------------------------------------- geometry

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function metresBetween(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Measured = { points: Array<[number, number]>; cum: number[]; total: number };

function measure(points: Array<[number, number]>): Measured {
  const cum = [0];

  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + metresBetween(points[i - 1], points[i]));
  }

  return { points, cum, total: cum[cum.length - 1] ?? 0 };
}

/** Where a point falls on a path: metres along it, and metres off it. */
function project(path: Measured, p: [number, number]): { along: number; off: number; segment: number } {
  const k = Math.cos(rad(p[0]));
  let best = { along: Infinity, off: Infinity, segment: 0 };

  for (let i = 0; i < path.points.length - 1; i += 1) {
    const a = path.points[i];
    const b = path.points[i + 1];
    const ax = a[1] * k;
    const ay = a[0];
    const dx = b[1] * k - ax;
    const dy = b[0] - ay;
    const den = dx * dx + dy * dy;
    const t = den === 0 ? 0 : Math.max(0, Math.min(1, ((p[1] * k - ax) * dx + (p[0] - ay) * dy) / den));
    const q: [number, number] = [ay + t * dy, (ax + t * dx) / k];
    const off = metresBetween(p, q);

    if (off < best.off) {
      best = { along: path.cum[i] + metresBetween(a, q), off, segment: i };
    }
  }

  return best;
}

function bearing(a: [number, number], b: [number, number]): number {
  const k = Math.cos(rad(a[0]));

  return (Math.atan2((b[1] - a[1]) * k, b[0] - a[0]) * 180) / Math.PI;
}

/** The part of a path between two distances along it. */
function slice(path: Measured, from: number, to: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const at = (d: number): [number, number] => {
    const i = path.cum.findIndex((c) => c >= d);

    if (i <= 0) return path.points[Math.max(0, i)];

    const span = path.cum[i] - path.cum[i - 1] || 1;
    const t = (d - path.cum[i - 1]) / span;
    const a = path.points[i - 1];
    const b = path.points[i];

    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  };

  out.push(at(from));
  path.cum.forEach((c, i) => {
    if (c > from && c < to) out.push(path.points[i]);
  });
  out.push(at(to));

  return out;
}

const walkSeconds = (metres: number) => (metres * DETOUR) / WALK_MPS;

// ---------------------------------------------------------------- network

type Pattern = {
  line: string;
  colour?: string;
  path: Measured;
  /** Stops in the order the bus reaches them, with metres along `path`. */
  calls: Array<{ stop: PlanStop; along: number }>;
};

/**
 * Each line as the services that run on it: its drawing forwards, and
 * backwards unless the drawing is a loop. Stops are put in order by where
 * they project onto the drawing, in metres; a stop too far off it is left
 * out, since its bus does not pass it.
 */
export function buildPatterns(lines: PlanLine[]): Pattern[] {
  const patterns: Pattern[] = [];

  for (const line of lines) {
    const points = line.path.filter(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
    );

    if (points.length < 2) continue;

    const forward = measure(points);
    const seen = new Set<PlanStop["id"]>();
    const calls = line.stops
      .map((stop) => ({ stop, ...project(forward, [stop.lat, stop.lng]) }))
      .filter((call) => {
        if (call.off > STOP_ON_LINE_M || seen.has(call.stop.id)) return false;
        seen.add(call.stop.id);

        return true;
      })
      .sort((a, b) => a.along - b.along)
      .map(({ stop, along }) => ({ stop, along }));

    if (calls.length < 2) continue;

    patterns.push({ line: line.name, colour: line.colour, path: forward, calls });

    const isLoop = metresBetween(points[0], points[points.length - 1]) <= LOOP_M;

    if (!isLoop) {
      const backward = measure([...points].reverse());

      patterns.push({
        line: line.name,
        colour: line.colour,
        path: backward,
        calls: [...calls].reverse().map(({ stop, along }) => ({ stop, along: forward.total - along })),
      });
    }
  }

  return patterns;
}

/**
 * Seconds until a bus of this pattern reaches call `index`, for a rider
 * there from `ready` seconds from now. Only buses on the drawing, heading its
 * way, still before the stop and moving count. Null when none can be timed.
 */
function liveWait(pattern: Pattern, index: number, ready: number, buses: PlanBus[]): number | null {
  const stopAlong = pattern.calls[index].along;
  let best: number | null = null;

  for (const bus of buses) {
    if (!bus.lines.includes(pattern.line)) continue;
    if (bus.active === false || bus.course == null) continue;
    if ((bus.age ?? 0) > 120_000) continue;

    const at = project(pattern.path, [bus.lat, bus.lng]);

    if (at.off > 60 || at.along >= stopAlong) continue;

    const runs = bearing(pattern.path.points[at.segment], pattern.path.points[at.segment + 1]);
    const apart = Math.abs(((bus.course - runs + 540) % 360) - 180);

    if (apart > 90) continue;

    const between = pattern.calls.filter((c) => c.along > at.along && c.along < stopAlong).length;
    const eta = (stopAlong - at.along) / BUS_MPS + between * DWELL_S;

    if (eta >= ready - 30) {
      const wait = Math.max(0, eta - ready);

      if (best == null || wait < best) best = wait;
    }
  }

  return best;
}

// ---------------------------------------------------------------- search

type Label = {
  key: string;
  time: number;
  cost: number;
  boardings: number;
  live: boolean;
  prev: Label | null;
  /** What brought the rider here. */
  via:
    | { kind: "start" }
    | { kind: "walk"; from: PlanStop | null; to: PlanStop; metres: number }
    | { kind: "board"; pattern: number; index: number; wait: number; live: boolean }
    | { kind: "ride"; pattern: number; index: number }
    | { kind: "alight"; pattern: number; index: number; stop: PlanStop }
    | { kind: "end"; from: PlanStop; metres: number };
  /** Where the label is: a stop, a seat on a pattern, or the destination. */
  at:
    | { kind: "stop"; stop: PlanStop; walkedLast: boolean }
    | { kind: "seat"; pattern: number; index: number; rode: boolean }
    | { kind: "end" };
};

/** A small binary heap on cost. */
class Heap {
  private items: Label[] = [];

  push(item: Label) {
    const a = this.items;

    a.push(item);

    let i = a.length - 1;

    while (i > 0) {
      const parent = (i - 1) >> 1;

      if (a[parent].cost <= a[i].cost) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): Label | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();

    if (a.length > 0 && last) {
      a[0] = last;

      let i = 0;

      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;

        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }

    return top;
  }

  get size() {
    return this.items.length;
  }
}

function search(
  patterns: Pattern[],
  stops: PlanStop[],
  origin: [number, number],
  originStop: PlanStop | null,
  to: PlanPlace,
  buses: PlanBus[],
  banned: Set<string>,
  walks: PlanOptions["walks"] = {}
): Label | null {
  /** Seconds on foot: along streets when measured, a padded straight line if not. */
  const footSeconds = (
    measured: Map<PlanStop["id"], number | null> | undefined,
    stop: PlanStop,
    straight: number
  ): number | null => {
    if (measured?.has(stop.id)) {
      const metres = measured.get(stop.id);

      return metres == null ? null : metres / WALK_MPS;
    }

    return walkSeconds(straight);
  };
  const callsAt = new Map<PlanStop["id"], Array<{ pattern: number; index: number }>>();

  patterns.forEach((pattern, p) => {
    if (banned.has(pattern.line)) return;
    pattern.calls.forEach((call, index) => {
      const list = callsAt.get(call.stop.id) ?? [];

      list.push({ pattern: p, index });
      callsAt.set(call.stop.id, list);
    });
  });

  const served = stops.filter((stop) => callsAt.has(stop.id));
  const nearStops = new Map<PlanStop["id"], Array<{ stop: PlanStop; metres: number }>>();

  for (const a of served) {
    const list: Array<{ stop: PlanStop; metres: number }> = [];

    for (const b of served) {
      if (a.id === b.id) continue;

      const metres = metresBetween([a.lat, a.lng], [b.lat, b.lng]);

      if (metres <= CHANGE_WALK_M) list.push({ stop: b, metres });
    }

    nearStops.set(a.id, list);
  }

  const toPoint: [number, number] = [to.lat, to.lng];
  const best = new Map<string, number>();
  const heap = new Heap();
  const push = (label: Label) => {
    const known = best.get(label.key);

    if (known != null && known <= label.cost) return;
    best.set(label.key, label.cost);
    heap.push(label);
  };

  const start: Label = {
    key: "start",
    time: 0,
    cost: 0,
    boardings: 0,
    live: true,
    prev: null,
    via: { kind: "start" },
    at: { kind: "end" },
  };

  if (originStop) {
    push({
      ...start,
      key: `s:${originStop.id}:0:0`,
      at: { kind: "stop", stop: originStop, walkedLast: true },
    });
  } else {
    for (const stop of served) {
      const metres = metresBetween(origin, [stop.lat, stop.lng]);

      if (metres > FIRST_WALK_M) continue;

      const seconds = footSeconds(walks.first, stop, metres);

      // Unreachable on foot, or a long way round what looked close.
      if (seconds == null || seconds * WALK_MPS > FIRST_WALK_M * DETOUR) continue;

      push({
        key: `s:${stop.id}:0:1`,
        time: seconds,
        cost: seconds * WALK_WEIGHT,
        boardings: 0,
        live: true,
        prev: start,
        via: { kind: "walk", from: null, to: stop, metres },
        at: { kind: "stop", stop, walkedLast: true },
      });
    }
  }

  while (heap.size > 0) {
    const label = heap.pop()!;

    if (best.get(label.key) !== label.cost) continue;
    if (label.at.kind === "end") return label;

    if (label.at.kind === "stop") {
      const { stop, walkedLast } = label.at;

      // Finish: at least one ride, then a short walk to the destination.
      if (label.boardings > 0) {
        const metres = metresBetween([stop.lat, stop.lng], toPoint);

        const seconds = metres <= LAST_WALK_M ? footSeconds(walks.last, stop, metres) : null;

        if (seconds != null && seconds * WALK_MPS <= LAST_WALK_M * DETOUR) {
          push({
            ...label,
            key: "end",
            time: label.time + seconds,
            cost: label.cost + seconds * WALK_WEIGHT,
            prev: label,
            via: { kind: "end", from: stop, metres },
            at: { kind: "end" },
          });
        }
      }

      // Change on foot to a stop across the street — once, not a chain.
      if (label.boardings > 0 && !walkedLast) {
        for (const { stop: next, metres } of nearStops.get(stop.id) ?? []) {
          const seconds = walkSeconds(metres);

          push({
            ...label,
            key: `s:${next.id}:${label.boardings}:1`,
            time: label.time + seconds,
            cost: label.cost + seconds * WALK_WEIGHT,
            prev: label,
            via: { kind: "walk", from: stop, to: next, metres },
            at: { kind: "stop", stop: next, walkedLast: true },
          });
        }
      }

      if (label.boardings >= MAX_BOARDINGS) continue;

      for (const { pattern, index } of callsAt.get(stop.id) ?? []) {
        if (index >= patterns[pattern].calls.length - 1) continue;

        const timed = liveWait(patterns[pattern], index, label.time, buses);
        const wait = timed ?? UNKNOWN_WAIT_S;
        const boardings = label.boardings + 1;

        push({
          ...label,
          key: `b:${pattern}:${index}:${boardings}:0`,
          time: label.time + wait,
          cost: label.cost + wait + (label.boardings > 0 ? CHANGE_PENALTY_S : 0),
          boardings,
          live: label.live && timed != null,
          prev: label,
          via: { kind: "board", pattern, index, wait, live: timed != null },
          at: { kind: "seat", pattern, index, rode: false },
        });
      }

      continue;
    }

    // On board: stay on to the next stop, or get off here.
    const { pattern, index, rode } = label.at;
    const calls = patterns[pattern].calls;

    if (index + 1 < calls.length) {
      const seconds = (calls[index + 1].along - calls[index].along) / BUS_MPS + DWELL_S;

      push({
        ...label,
        key: `b:${pattern}:${index + 1}:${label.boardings}:1`,
        time: label.time + seconds,
        cost: label.cost + seconds,
        prev: label,
        via: { kind: "ride", pattern, index: index + 1 },
        at: { kind: "seat", pattern, index: index + 1, rode: true },
      });
    }

    if (rode) {
      const stop = calls[index].stop;

      push({
        ...label,
        key: `s:${stop.id}:${label.boardings}:0`,
        prev: label,
        via: { kind: "alight", pattern, index, stop },
        at: { kind: "stop", stop, walkedLast: false },
      });
    }
  }

  return null;
}

// ---------------------------------------------------------------- output

type Leg =
  | { kind: "walk"; from: PlanStop | null; to: PlanStop | PlanPlace; metres: number }
  | { kind: "ride"; pattern: number; from: number; to: number; wait: number; live: boolean };

function legsOf(end: Label): Leg[] {
  const chain: Label[] = [];

  for (let label: Label | null = end; label; label = label.prev) chain.unshift(label);

  const legs: Leg[] = [];

  for (const label of chain) {
    const via = label.via;

    if (via.kind === "walk") legs.push({ kind: "walk", from: via.from, to: via.to, metres: via.metres });
    if (via.kind === "board") {
      legs.push({ kind: "ride", pattern: via.pattern, from: via.index, to: via.index, wait: via.wait, live: via.live });
    }
    if (via.kind === "ride") {
      const last = legs[legs.length - 1];

      if (last?.kind === "ride") last.to = via.index;
    }
    if (via.kind === "end" && via.metres > 0) {
      legs.push({ kind: "walk", from: via.from, to: { name: "", lat: NaN, lng: NaN }, metres: via.metres });
    }
  }

  return legs;
}

const loc = (p: { lat: number; lng: number }): [number, number] => [p.lat, p.lng];
const km = (m: number) => Math.round(m) / 1000;
const min = (s: number) => Math.max(1, Math.round(s / 60));

function toRoute(
  legs: Leg[],
  patterns: Pattern[],
  origin: [number, number],
  to: PlanPlace,
  seconds: number
): RouteData {
  const steps: RouteStep[] = [];
  const rides = legs.filter((leg): leg is Extract<Leg, { kind: "ride" }> => leg.kind === "ride");

  legs.forEach((leg, i) => {
    const next = legs[i + 1];

    if (leg.kind === "walk") {
      const toPlace = Number.isFinite(leg.to.lat) ? leg.to : to;

      // A walk off a bus is announced by getting off first.
      if (leg.from && i > 0) {
        steps.push({ action: "exit", type: "exit", at: leg.from.name, location: loc(leg.from) });
      }

      steps.push({
        action: "walk",
        type: "walk",
        from: leg.from?.name ?? "Current location",
        to: toPlace.name || to.name,
        distance: km(leg.metres),
        duration: min(walkSeconds(leg.metres)),
        polyline: [leg.from ? loc(leg.from) : origin, loc(toPlace)],
      });
      return;
    }

    const pattern = patterns[leg.pattern];
    const calls = pattern.calls.slice(leg.from, leg.to + 1);
    const boardAt = calls[0].stop;
    const previous = legs[i - 1];

    // Same stop as the last bus left the rider at: a change, said as one.
    if (previous?.kind === "ride") {
      steps.push({ action: "transfer", type: "transfer", at: boardAt.name, to: pattern.line, location: loc(boardAt) });
    } else {
      steps.push({ action: "board", type: "board", line: pattern.line, at: boardAt.name, location: loc(boardAt) });
    }

    const metres = calls[calls.length - 1].along - calls[0].along;

    steps.push({
      action: "travel",
      type: "bus",
      line: pattern.line,
      color: pattern.colour,
      stops: calls.length - 1,
      stops_between: calls.map((call) => call.stop.name),
      polyline: slice(pattern.path, calls[0].along, calls[calls.length - 1].along),
      distance: km(metres),
      duration: min(metres / BUS_MPS + (calls.length - 2) * DWELL_S),
    });

    if (!next) {
      steps.push({ action: "arrive", type: "arrive", at: to.name, location: loc(to) });
    }

  });

  if (legs[legs.length - 1]?.kind === "walk") {
    steps.push({ action: "arrive", type: "arrive", at: to.name, location: loc(to) });
  }

  const lines = rides.map((ride) => patterns[ride.pattern].line);

  return {
    success: true,
    type: rides.length > 1 ? "transfer" : "direct",
    summary: lines.join(" → "),
    total_time: min(seconds),
    total_price: 0,
    total_distance: km(
      legs.reduce(
        (sum, leg) =>
          sum +
          (leg.kind === "walk"
            ? leg.metres
            : patterns[leg.pattern].calls[leg.to].along - patterns[leg.pattern].calls[leg.from].along),
        0
      )
    ),
    steps,
    metadata: { transfers: Math.max(0, rides.length - 1), lines_used: lines, total_stops: 0, warning: null },
  };
}

// ---------------------------------------------------------------- entry

export function planTripLocally(
  lines: PlanLine[],
  stops: PlanStop[],
  buses: PlanBus[],
  options: PlanOptions
): PlanResult {
  const patterns = buildPatterns(lines);
  const originStop = "stop" in options.from ? options.from.stop : null;
  const origin: [number, number] =
    "here" in options.from ? options.from.here : loc(options.from.stop);
  const direct = metresBetween(origin, loc(options.to));

  if (direct <= ALWAYS_WALK_M) {
    return { kind: "walk", metres: direct * DETOUR, seconds: walkSeconds(direct) };
  }

  const trips: PlannedTrip[] = [];
  const banned = new Set<string>();
  const wanted = Math.max(1, options.alternatives ?? 1);

  for (let attempt = 0; attempt < wanted + 2 && trips.length < wanted; attempt += 1) {
    const end = search(patterns, stops, origin, originStop, options.to, buses, banned, options.walks);

    if (!end) break;

    const legs = legsOf(end);
    const lines = legs
      .filter((leg): leg is Extract<Leg, { kind: "ride" }> => leg.kind === "ride")
      .map((leg) => patterns[leg.pattern].line);

    // The next option may not use this one's first line, which is what
    // most often makes two trips the same trip.
    banned.add(lines[0]);

    if (trips.some((trip) => trip.lines.join("|") === lines.join("|"))) continue;

    trips.push({
      route: toRoute(legs, patterns, origin, options.to, end.time),
      seconds: end.time,
      liveWait: end.live,
      lines,
    });
  }

  if (trips.length === 0) return { kind: "none" };

  if (walkSeconds(direct) <= trips[0].seconds + WALK_IF_WITHIN_S && direct <= WALK_INSTEAD_MAX_M) {
    return { kind: "walk", metres: direct * DETOUR, seconds: walkSeconds(direct) };
  }

  return { kind: "trips", trips: trips.sort((a, b) => a.seconds - b.seconds) };
}
