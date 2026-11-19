import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines, useStops } from "@cloudroutes/query/lines";
import { PlanBus, PlanLine, PlanStop } from "../services/planner.ts";
import { useLiveBuses } from "./use-live-buses.ts";

/**
 * What the trip planner plans over: the lines and stops the map has loaded,
 * and the buses on the road for the wait at the first stop.
 *
 * Kept in a store rather than passed down, because a trip is planned from a
 * store action (`useTripStore.plan`), not from a component.
 */

export type PlannerFeed = { lines: PlanLine[]; stops: PlanStop[]; buses: PlanBus[] };

export const usePlannerFeed = create<{ feed: PlannerFeed | null }>(() => ({ feed: null }));

/* eslint-disable @typescript-eslint/no-explicit-any */
function toPlanLines(lines: any[]): PlanLine[] {
  return lines.map((line) => ({
    name: String(line.name ?? ""),
    colour: line.color,
    path: ((line.waypoints ?? []) as any[])
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [Number(point[0]), Number(point[1])] as [number, number]),
    stops: ((line.bus_stops ?? []) as any[])
      .map((stop) => ({
        id: stop.id,
        name: String(stop.name ?? ""),
        lat: parseFloat(stop.Lat ?? stop.latitude),
        lng: parseFloat(stop.Long ?? stop.longitude),
      }))
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
  }));
}

function toPlanStops(stops: any[]): PlanStop[] {
  return stops
    .map((stop) => ({
      id: stop.id,
      name: String(stop.name ?? ""),
      lat: parseFloat(stop.latitude ?? stop.Lat),
      lng: parseFloat(stop.longitude ?? stop.Long),
    }))
    .filter((stop) => stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Keep the planner's copy of the network current. Mounted once, in App. */
export function useFeedPlanner() {
  const { data: lines } = useLines();
  const { data: stops } = useStops({ queryKey: [QUERY_KEYS.STOPS] });
  const buses = useLiveBuses();
  // The network changes rarely and the buses every few seconds; only the
  // buses are redone on each report.
  const planLines = useMemo(() => (lines ? toPlanLines(lines) : []), [lines]);
  const planStops = useMemo(() => (stops ? toPlanStops(stops as unknown[]) : []), [stops]);

  useEffect(() => {
    if (!planLines.length || !planStops.length) return;

    usePlannerFeed.setState({
      feed: {
        lines: planLines,
        stops: planStops,
        buses: buses.map((bus) => ({
          lat: bus.lat,
          lng: bus.lng,
          course: bus.course,
          lines: bus.lines,
          active: bus.active,
          age: bus.age,
        })),
      },
    });
  }, [planLines, planStops, buses]);
}
