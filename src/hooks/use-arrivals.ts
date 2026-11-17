import { useMemo } from "react";
import { latLng, LatLng, LatLngExpression } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { distanceAlong } from "../services/route-path.ts";
import { Arrival, ArrivalLine, arrivalsAt } from "../services/arrivals.ts";
import { useLiveBuses } from "./use-live-buses.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A line as the arrivals calculation wants it: the drawn route, and every stop
 * on it as distance along that route. Null when there is no route to project
 * onto.
 */
export function toArrivalLine(line: any): ArrivalLine | null {
  const path = ((line.waypoints ?? []) as LatLngExpression[])
    .map((waypoint) => latLng(waypoint))
    .filter((point): point is LatLng => point != null);

  if (path.length < 2) return null;

  const stopsAlong = ((line.bus_stops ?? []) as any[])
    .map((other) => {
      const lat = parseFloat(other.Lat ?? other.latitude);
      const lng = parseFloat(other.Long ?? other.longitude);

      return Number.isFinite(lat) && Number.isFinite(lng)
        ? distanceAlong(path, latLng(lat, lng))
        : Number.POSITIVE_INFINITY;
    })
    .filter((along) => Number.isFinite(along));

  return { name: line.name, path, stopsAlong };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The buses coming to one stop, soonest first.
 *
 * Only the lines that actually serve the stop are considered, so opening a
 * stop costs a projection per line it is on rather than per line in the
 * network.
 */
export function useArrivals(
  stop: { lat: number; lng: number; lines: string[] } | null
): Arrival[] {
  const { data: lines } = useLines();
  const buses = useLiveBuses();

  return useMemo(() => {
    if (!stop || !lines) return [];

    const serving = lines
      .filter((line) => stop.lines.includes(line.name))
      .map(toArrivalLine)
      .filter((line): line is ArrivalLine => line != null);

    return arrivalsAt(stop, serving, buses);
  }, [stop, lines, buses]);
}
