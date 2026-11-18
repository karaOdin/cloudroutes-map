import { useEffect, useMemo, useRef } from "react";
import { latLng, LatLng } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { ArrivalLine, arrivalsAt, minutesFor } from "../services/arrivals.ts";
import {
  AT_STOP_METRES,
  Band,
  Catch,
  catchable,
  estimatedWalk,
  orientLine,
  Ride,
} from "../services/journey.ts";
import { distanceAlong, distanceToPath } from "../services/route-path.ts";
import { LiveJourney, LiveRide } from "./use-journey.ts";
import { toArrivalLine } from "./use-arrivals.ts";
import { useGoStore } from "./use-go-store.ts";
import { useLiveBuses } from "./use-live-buses.ts";

/**
 * Where the rider is in their journey, and what to tell them next.
 *
 * Stages move on only by evidence, never by the clock:
 *
 * - aboard: the rider has left the stop *along the line*, on the line, with
 *   a bus of that line beside them (or far enough along it that nothing but
 *   a bus explains it);
 * - off: they are at the stop they were to get off at.
 *
 * Both are tested against the line's own drawn route, which is the same
 * projection the arrivals use, so "3 stops to go" here and "3 stops away" on
 * a stop agree.
 */

/** A rider this close to the route is on it, allowing for GPS and road width. */
const ON_LINE_M = 45;

/** Clear of the boarding stop by this much, along the line, to count as moving. */
const LEFT_STOP_M = 60;

/** A bus within this of the rider is the one they are on. */
const BESIDE_BUS_M = 80;

/** This far along the line with no bus seen, and only a bus explains it. */
const ALONG_WITHOUT_BUS_M = 250;

/**
 * Close enough to the boarding stop to have been "at it" — looser than
 * standing at the pole, because a fix or two can be missed while a bus pulls
 * in and the rider steps aboard.
 */
const REACHED_STOP_M = 100;

/** "Get off now" from this close to the stop. */
const GET_OFF_NOW_M = 150;

/** One fix cannot carry the rider further than this; it is the other pass of a loop. */
const MAX_JUMP_M = 2000;

export type GoStage =
  | { kind: "walk"; ride: LiveRide; metres: number; minutes: number; caught: Catch }
  | { kind: "wait"; ride: LiveRide; caught: Catch }
  | {
      kind: "ride";
      ride: LiveRide;
      stopsLeft: number;
      nextStop: string | null;
      metresLeft: number;
    }
  | { kind: "get_off_next"; ride: LiveRide; metresLeft: number }
  | { kind: "get_off_now"; ride: LiveRide }
  | { kind: "arrived"; minutes: number };

export type GoState = {
  stage: GoStage;
  leg: number;
  legs: number;
  /** Minutes to the destination, and whether an unknown wait sits inside it. */
  remaining: { band: Band; partial: boolean } | null;
};

type NamedStop = { name: string; along: number };

type LineGeometry = {
  path: LatLng[];
  stops: NamedStop[];
  /** The same line, as the arrivals at its boarding stop are measured on. */
  arrival: ArrivalLine;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The line as this ride travels it — see `orientLine`. */
function geometryOf(line: any, ride: Ride): LineGeometry | null {
  const drawn = toArrivalLine(line);

  if (!drawn) return null;

  const base = orientLine(drawn, ride);
  const stops = ((line.bus_stops ?? []) as any[])
    .map((stop) => {
      const lat = parseFloat(stop.Lat ?? stop.latitude);
      const lng = parseFloat(stop.Long ?? stop.longitude);

      return Number.isFinite(lat) && Number.isFinite(lng)
        ? { name: String(stop.name ?? ""), along: distanceAlong(base.path, latLng(lat, lng)) }
        : null;
    })
    .filter((stop): stop is NamedStop => stop != null && Number.isFinite(stop.along))
    .sort((a, b) => a.along - b.along);

  return { path: base.path, stops, arrival: base };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function addBands(bands: Band[]): Band {
  return bands.reduce(
    (sum, band) => ({ from: sum.from + band.from, to: sum.to + band.to }),
    { from: 0, to: 0 }
  );
}

/** Tell the host, which can turn it into a notification the WebView cannot. */
function tellHost(message: Record<string, unknown>) {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message));
  } catch {
    /* No host, or it is gone; the card still says it. */
  }
}

export function useGo(live: LiveJourney | null): GoState | null {
  const { data: lines } = useLines();
  const buses = useLiveBuses();
  const go = useGoStore();
  const { board, advance, nextLeg, arrive } = go;

  // One per ride, not per line: the same line can be ridden either way.
  const geometry = useMemo(
    () =>
      (live?.rides ?? []).map((ride) => {
        const line = lines?.find((one) => one.name === ride.line);

        return line ? geometryOf(line, ride) : null;
      }),
    [lines, live?.rides]
  );

  const here = live?.here ?? null;
  const ride = live?.rides[go.leg] ?? null;
  const shape = ride ? geometry[go.leg] ?? null : null;

  // Where the rider and this ride's two stops sit along the line.
  // Evidence gathered on this leg, kept per leg of this run of Go.
  const evidence = useRef<{ key: string; reachedStop: boolean; startAlong: number | null }>({
    key: "",
    reachedStop: false,
    startAlong: null,
  });

  const position = useMemo(() => {
    if (!here || !ride || !shape) return null;

    const at = latLng(here[0], here[1]);

    return {
      at,
      along: distanceAlong(shape.path, at),
      off: distanceToPath(shape.path, at),
      boardAlong: distanceAlong(shape.path, latLng(ride.board.lat, ride.board.lng)),
      alightAlong: distanceAlong(shape.path, latLng(ride.alight.lat, ride.alight.lng)),
      toAlight: at.distanceTo(latLng(ride.alight.lat, ride.alight.lng)),
    };
  }, [here, ride, shape]);

  // Move the journey on. Kept in an effect, not in render, because it writes
  // to the store and the next render reads the result.
  useEffect(() => {
    if (!go.active || go.arrivedAt || !ride || !position || !here) return;

    const { along, off, boardAlong, alightAlong, toAlight, at } = position;

    if (!go.onBoard) {
      const key = `${go.startedAt}:${go.leg}`;

      if (evidence.current.key !== key) {
        evidence.current = { key, reachedStop: false, startAlong: off <= ON_LINE_M ? along : null };
      }

      const seen = evidence.current;

      if (at.distanceTo(latLng(ride.board.lat, ride.board.lng)) <= REACHED_STOP_M) {
        seen.reachedStop = true;
      }

      seen.startAlong ??= off <= ON_LINE_M ? along : null;

      const leftStop =
        off <= ON_LINE_M &&
        along > boardAlong + LEFT_STOP_M &&
        along < alightAlong;

      if (!leftStop) return;

      const besideBus = buses.some(
        (bus) =>
          bus.lines.includes(ride.line) &&
          at.distanceTo(latLng(bus.lat, bus.lng)) <= BESIDE_BUS_M
      );

      // Being past the stop on the line proves nothing by itself: a rider can
      // start out downstream of it, or walk to it along the street the bus
      // uses and be overtaken by one. So they must have been at the stop —
      // or, for a rider who only pressed Go once aboard, have travelled a
      // good way along the line since, with a bus of it beside them.
      const aboard = seen.reachedStop
        ? besideBus || along > boardAlong + ALONG_WITHOUT_BUS_M
        : besideBus &&
          seen.startAlong != null &&
          along - seen.startAlong >= ALONG_WITHOUT_BUS_M;

      if (aboard) board(along);

      return;
    }

    // Only forward, and only when it is forward: writing the same value back
    // still notifies, and this effect would answer its own update forever.
    if (
      off <= ON_LINE_M * 2 &&
      (go.along == null ||
        (along > go.along && along - go.along < MAX_JUMP_M))
    ) {
      advance(along);
    }

    if (toAlight <= AT_STOP_METRES * 1.5) {
      if (go.leg >= (live?.rides.length ?? 1) - 1) arrive();
      else nextLeg();
    }
  }, [
    go.active,
    go.arrivedAt,
    go.onBoard,
    go.along,
    go.leg,
    go.startedAt,
    board,
    advance,
    nextLeg,
    arrive,
    ride,
    position,
    here,
    buses,
    live?.rides.length,
  ]);

  const state = useMemo<GoState | null>(() => {
    if (!live || !ride) return null;

    const legs = live.rides.length;
    const later = live.rides.slice(go.leg + 1).map((one) => one.band);

    if (go.arrivedAt) {
      return {
        leg: go.leg,
        legs,
        remaining: null,
        stage: {
          kind: "arrived",
          minutes: Math.max(1, Math.round((go.arrivedAt - (go.startedAt ?? go.arrivedAt)) / 60_000)),
        },
      };
    }

    if (go.onBoard && position && shape) {
      const riderAlong = Math.max(go.along ?? position.along, position.along);
      const metresLeft = Math.max(0, position.alightAlong - riderAlong);
      const between = shape.stops.filter(
        (stop) => stop.along > riderAlong + 20 && stop.along < position.alightAlong - 20
      );
      const remaining = {
        band: addBands([minutesFor(metresLeft), ...later]),
        partial: later.length > 0,
      };

      if (metresLeft <= GET_OFF_NOW_M || position.toAlight <= GET_OFF_NOW_M) {
        return { leg: go.leg, legs, remaining, stage: { kind: "get_off_now", ride } };
      }

      if (between.length === 0) {
        return {
          leg: go.leg,
          legs,
          remaining,
          stage: { kind: "get_off_next", ride, metresLeft },
        };
      }

      return {
        leg: go.leg,
        legs,
        remaining,
        stage: {
          kind: "ride",
          ride,
          stopsLeft: between.length,
          nextStop: between[0]?.name ?? null,
          metresLeft,
        },
      };
    }

    // Not aboard: walking to this ride's stop, or waiting at it.
    const atStop = here
      ? latLng(here[0], here[1]).distanceTo(latLng(ride.board.lat, ride.board.lng)) <=
        AT_STOP_METRES
      : false;
    const walk =
      go.leg === 0 && live.walk
        ? live.walk
        : here
          ? estimatedWalk({ lat: here[0], lng: here[1] }, ride.board)
          : null;
    const walkMin = walk && !atStop ? Math.ceil(walk.seconds / 60) : 0;

    const arrivalLine = shape?.arrival ?? null;
    const caught =
      go.leg === 0
        ? catchable(live.arrivals, walkMin, atStop)
        : catchable(
            arrivalLine ? arrivalsAt(ride.board, [arrivalLine], buses) : [],
            walkMin,
            atStop
          );

    const wait =
      caught.kind === "no_bus" || caught.kind === "missed"
        ? null
        : { from: Math.max(walkMin, caught.band.from), to: Math.max(walkMin, caught.band.to) };
    const remaining = wait
      ? { band: addBands([wait, ride.band, ...later]), partial: later.length > 0 }
      : null;

    if (atStop || !walk) {
      return { leg: go.leg, legs, remaining, stage: { kind: "wait", ride, caught } };
    }

    return {
      leg: go.leg,
      legs,
      remaining,
      stage: { kind: "walk", ride, metres: walk.metres, minutes: Math.max(1, walkMin), caught },
    };
  }, [live, ride, go, position, shape, here, buses]);

  // Say the moments that matter out loud — a buzz, and a message the host can
  // raise as a notification when the phone is in a pocket.
  const said = useRef<string | null>(null);

  useEffect(() => {
    if (!go.active || !state) return;

    const kind = state.stage.kind;
    const key = `${state.leg}:${kind}`;

    if (said.current === key) return;

    said.current = key;

    if (kind === "get_off_next" || kind === "get_off_now" || kind === "arrived") {
      navigator.vibrate?.(kind === "get_off_now" ? [250, 120, 250, 120, 250] : [200, 100, 200]);
    }

    const stop =
      "ride" in state.stage ? state.stage.ride.alight.name : live?.journey.destination?.name;

    tellHost({ type: "JOURNEY_STAGE", stage: kind, leg: state.leg, stop });
  }, [go.active, state, live?.journey.destination?.name]);

  useEffect(() => {
    if (!go.active) said.current = null;
  }, [go.active]);

  return go.active ? state : null;
}
