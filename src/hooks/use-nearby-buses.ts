import { useMemo, useRef } from "react";
import { latLng } from "leaflet";
import { useQuery } from "@tanstack/react-query";
import { roadDistances } from "../services/road-distance.ts";
import { LiveBus, useLiveBuses } from "./use-live-buses.ts";
import { useLocationStore } from "./use-location-store.ts";
import { useNow } from "./use-now.ts";

/**
 * The buses nearest the rider, by road.
 *
 * Straight-line distance answers the wrong question in a town laid out around
 * a river or a dual carriageway: the closest bus as the crow flies can be the
 * one with no way across. So the field is narrowed by straight line — cheap,
 * and it keeps the router request small — and then the survivors are measured
 * along actual road in a single OSRM table call.
 *
 * Falls back to the straight-line figure when the router cannot be reached,
 * and says which it is, because the two are not the same claim.
 */

/** How many to measure properly. More is a bigger table for no better answer. */
const CANDIDATES = 30;

/** Vehicles move, but not enough to re-solve a table every fix. */
const REFRESH_MS = 20_000;

export type NearbyBus = LiveBus & {
  metres: number;
  /** False when this is a straight line because the router was unreachable. */
  byRoad: boolean;
};

export function useNearbyBuses(limit = 6): {
  buses: NearbyBus[];
  /** Null when the host has not told us where the rider is. */
  here: [number, number] | null;
} {
  const here = useLocationStore((state) => state.here);
  const buses = useLiveBuses();
  const tick = useNow(REFRESH_MS);

  const candidates = useMemo(() => {
    if (!here) return [];

    const from = latLng(here[0], here[1]);

    return buses
      .map((bus) => ({ bus, direct: from.distanceTo(latLng(bus.lat, bus.lng)) }))
      .sort((a, b) => a.direct - b.direct)
      .slice(0, CANDIDATES);
  }, [buses, here]);

  // The query runs on a timer, so it must read the candidates as they are
  // when it fires rather than as they were when it was defined.
  const latest = useRef(candidates);
  latest.current = candidates;

  const { data } = useQuery({
    queryKey: ["nearby-buses", here?.[0].toFixed(4), here?.[1].toFixed(4), tick],
    queryFn: async () => {
      const asked = latest.current;
      const metres = await roadDistances(
        { lat: here![0], lng: here![1] },
        asked.map(({ bus }) => ({ lat: bus.lat, lng: bus.lng }))
      );

      // Paired with the vehicle, not left as a bare row: the answer arrives
      // after a round trip and the list may have moved on by then. Kept as an
      // array rather than a Map so react-query's structural sharing has a
      // shape it understands.
      return asked.map(
        ({ bus }, index) => [bus.id, metres?.[index] ?? null] as const
      );
    },
    enabled: !!here && candidates.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const byDevice = useMemo(() => new Map(data ?? []), [data]);

  return useMemo(
    () => ({
      here,
      buses: candidates
        .map(({ bus, direct }) => {
          const road = byDevice.get(bus.id);

          return typeof road === "number"
            ? { ...bus, metres: road, byRoad: true }
            : { ...bus, metres: direct, byRoad: false };
        })
        .sort((a, b) => a.metres - b.metres)
        .slice(0, limit),
    }),
    [candidates, byDevice, here, limit]
  );
}
