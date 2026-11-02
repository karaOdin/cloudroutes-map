import { useMemo } from "react";
import { latLng, LatLng, LatLngExpression } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { distanceAlong } from "../services/route-path.ts";
import { Arrival, ArrivalLine, arrivalsAt } from "../services/arrivals.ts";
import { useLiveBuses } from "./use-live-buses.ts";

/**
 * The buses coming to one stop, soonest first.
 *
 * Only the lines that actually serve the stop are considered, so opening a
 * stop costs a projection per line it is on rather than per line in the
 * network.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function useArrivals(
  stop: { lat: number; lng: number; lines: string[] } | null
): Arrival[] {
  const { data: lines } = useLines();
  const buses = useLiveBuses();

  return useMemo(() => {
    if (!stop || !lines) return [];

    const serving: ArrivalLine[] = [];

    lines.forEach((line) => {
      if (!stop.lines.includes(line.name)) return;

      const path = ((line.waypoints ?? []) as LatLngExpression[])
        .map((waypoint) => latLng(waypoint))
        .filter((point): point is LatLng => point != null);

      if (path.length < 2) return;

      const stopsAlong = (((line as any).bus_stops ?? []) as any[])
        .map((other) => {
          const lat = parseFloat(other.Lat ?? other.latitude);
          const lng = parseFloat(other.Long ?? other.longitude);

          return Number.isFinite(lat) && Number.isFinite(lng)
            ? distanceAlong(path, latLng(lat, lng))
            : Number.POSITIVE_INFINITY;
        })
        .filter((along) => Number.isFinite(along));

      serving.push({ name: line.name, path, stopsAlong });
    });

    return arrivalsAt(stop, serving, buses);
  }, [stop, lines, buses]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
