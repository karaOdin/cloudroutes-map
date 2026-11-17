import { useMemo } from "react";
import { latLng } from "leaflet";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLines } from "@cloudroutes/query/lines";
import { RouteData } from "../types.ts";
import { arrivalsAt, Arrival } from "../services/arrivals.ts";
import {
  arrivalBand,
  AT_STOP_METRES,
  Band,
  Catch,
  catchable,
  estimatedWalk,
  Journey,
  orientLine,
  readJourney,
  Ride,
  rideBand,
  rideMetresAlong,
  walkSeconds,
} from "../services/journey.ts";
import { walkingRoute } from "../services/walking.ts";
import { toArrivalLine } from "./use-arrivals.ts";
import { useLiveBuses } from "./use-live-buses.ts";
import { useLocationStore } from "./use-location-store.ts";

/**
 * A journey on the map, kept current against the buses on the road.
 *
 * Recomputed whenever a vehicle reports or the rider moves, which is what
 * makes it live: the answer to "leave now or wait" changes as the bus comes
 * on, and the card should change with it rather than describe the moment the
 * route was requested.
 */

/**
 * The walk is re-routed when the rider has moved about this far. Finer than
 * that and a walking rider re-asks every few seconds for a path that has not
 * changed; coarser and the time to the stop lags visibly.
 */
const REROUTE_GRID = 0.0005; // ≈ 50 m of latitude

function snapToGrid(value: number): number {
  return Math.round(value / REROUTE_GRID) * REROUTE_GRID;
}

export type JourneyWalk = {
  metres: number;
  seconds: number;
  /** Path from the rider to the stop, when the foot router supplied one. */
  path: Array<[number, number]> | null;
  /** Where the figure comes from — decides how firmly it is stated. */
  source: "road" | "straight" | "plan";
};

export type LiveRide = Ride & {
  /** Minutes on board. */
  band: Band;
  /** Vehicles currently attributed to the line, anywhere on it. */
  running: number;
};

export type LiveJourney = {
  journey: Journey;
  /** The rider, when the host has said where they are. */
  here: [number, number] | null;
  walk: JourneyWalk | null;
  walkMin: number;
  atStop: boolean;
  /** Buses coming to the first stop on the first line, soonest first. */
  arrivals: Arrival[];
  caught: Catch;
  rides: LiveRide[];
  /** Minutes from now to the destination, or null when it cannot be honest. */
  arrive: Band | null;
};

export function useJourney(route: RouteData | null): LiveJourney | null {
  const { data: lines } = useLines();
  const buses = useLiveBuses();
  const here = useLocationStore((state) => state.here);

  const journey = useMemo(() => (route ? readJourney(route) : null), [route]);
  const firstStop = journey?.rides[0]?.board ?? null;

  const gridLat = here ? snapToGrid(here[0]) : null;
  const gridLng = here ? snapToGrid(here[1]) : null;

  const { data: routed } = useQuery({
    queryKey: ["journey-walk", gridLat, gridLng, firstStop?.lat, firstStop?.lng],
    queryFn: () =>
      walkingRoute({ lat: here![0], lng: here![1] }, firstStop!),
    enabled: !!here && !!firstStop,
    staleTime: Infinity,
    retry: false,
    // Keep showing the last path while the next is fetched, so the walk does
    // not blink out every fifty metres.
    placeholderData: keepPreviousData,
  });

  const linesByName = useMemo(
    () => new Map((lines ?? []).map((line) => [line.name, line])),
    [lines]
  );

  return useMemo(() => {
    if (!journey || journey.rides.length === 0) return null;

    const first = journey.rides[0];

    // The walk to the first stop: road when the router answered, a padded
    // straight line when it did not, and the planner's own figure only when
    // we do not know where the rider is.
    let walk: JourneyWalk | null = null;

    if (here) {
      walk = routed
        ? { metres: routed.metres, seconds: routed.seconds, path: routed.path, source: "road" }
        : { ...estimatedWalk({ lat: here[0], lng: here[1] }, first.board), path: null, source: "straight" };
    } else if (journey.plannedWalkMetres != null) {
      walk = {
        metres: journey.plannedWalkMetres,
        seconds: walkSeconds(journey.plannedWalkMetres),
        path: null,
        source: "plan",
      };
    }

    // Straight-line closeness, not the routed walk: the foot router snaps
    // both ends to the nearest footway, so a rider standing at the pole can
    // still be "40 m" away by road.
    const atStop = here
      ? latLng(here[0], here[1]).distanceTo(latLng(first.board.lat, first.board.lng)) <=
        AT_STOP_METRES
      : false;

    const walkMin = walk && !atStop ? Math.ceil(walk.seconds / 60) : 0;

    const lineFor = (ride: Ride) => {
      const line = linesByName.get(ride.line);
      const drawn = line ? toArrivalLine(line) : null;

      return drawn ? orientLine(drawn, ride) : null;
    };

    const arrivalLine = lineFor(first);
    const arrivals = arrivalLine
      ? arrivalsAt(first.board, [arrivalLine], buses)
      : [];

    const caught = catchable(arrivals, walkMin, atStop);

    const rides: LiveRide[] = journey.rides.map((ride) => {
      const path = lineFor(ride)?.path;
      const metres = (path && rideMetresAlong(path, ride)) ?? ride.metres;

      return {
        ...ride,
        metres,
        band: rideBand(metres),
        running: buses.filter((bus) => bus.lines.includes(ride.line)).length,
      };
    });

    return {
      journey,
      here,
      walk,
      walkMin,
      atStop,
      arrivals,
      caught,
      rides,
      arrive: arrivalBand(
        walkMin,
        caught,
        rides.map((ride) => ride.band)
      ),
    };
  }, [journey, here, routed, linesByName, buses]);
}
