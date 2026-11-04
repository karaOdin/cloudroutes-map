import { useCallback, useRef, useState } from "react";
import { useMap, useMapEvent } from "react-leaflet";
import { latLngBounds } from "leaflet";
import {
  MAX_SPIDER_GROUP,
  overlappingGroups,
  spiderPositions,
  SpiderOffset,
} from "../components/BusMarkers/spiderfy.ts";

type Vehicle = { id: number; lat: number; lng: number };

/**
 * Opens a pile-up of vehicles so the ones underneath can be reached.
 *
 * Collisions are judged in screen space, because that is where they happen: two
 * vehicles a hundred metres apart overlap at one zoom and not at another. Which
 * group is open is keyed by its lowest member id, so it survives the group
 * being recomputed as vehicles move.
 */
export function useSpiderfy() {
  const map = useMap();
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  const groups = useRef<number[][]>([]);
  const offsets = useRef(new Map<number, SpiderOffset>());
  const located = useRef(new Map<number, [number, number]>());

  // Any map movement changes what overlaps, so an open group stops meaning
  // anything. Closing is also the obvious way out for the user.
  useMapEvent("zoomstart", () => setOpenGroup(null));
  useMapEvent("click", () => setOpenGroup(null));

  const observe = useCallback(
    (vehicles: Vehicle[]) => {
      located.current = new Map(vehicles.map((v) => [v.id, [v.lat, v.lng]]));

      const placed = vehicles.map((v) => {
        const point = map.latLngToContainerPoint([v.lat, v.lng]);

        return { id: v.id, x: point.x, y: point.y };
      });

      groups.current = overlappingGroups(placed);

      const next = new Map<number, SpiderOffset>();
      const open = groups.current.find(
        (group) => Math.min(...group) === openGroup
      );

      if (open && open.length <= MAX_SPIDER_GROUP) {
        for (const [id, offset] of spiderPositions(open)) next.set(id, offset);
      }

      offsets.current = next;
    },
    [map, openGroup]
  );

  /** The group a vehicle belongs to, or null when it stands alone. */
  const groupKeyFor = useCallback((id: number) => {
    const group = groups.current.find((members) => members.includes(id));

    return group ? Math.min(...group) : null;
  }, []);

  const toggleAt = useCallback(
    (id: number) => {
      const key = groupKeyFor(id);

      if (key === null) return false;

      setOpenGroup((current) => (current === key ? null : key));

      return true;
    },
    [groupKeyFor]
  );

  /**
   * What a tap on a vehicle should do.
   *
   * In a pile-up that is still closed, the tap opens it — selecting a marker
   * you cannot distinguish from its neighbours is not a choice the user made.
   * Once open, or when the vehicle stands alone, the tap means what it says.
   */
  const handleTap = useCallback(
    (id: number) => {
      const group = groups.current.find((members) => members.includes(id));
      const key = group ? Math.min(...group) : null;

      if (group && key !== openGroup) {
        // Too many to fan: zoom to them instead, which separates them for real
        // rather than drawing them somewhere they are not.
        if (group.length > MAX_SPIDER_GROUP) {
          const points = group
            .map((member) => located.current.get(member))
            .filter((point): point is [number, number] => !!point);

          if (points.length > 1) {
            map.fitBounds(latLngBounds(points), {
              padding: [70, 70],
              maxZoom: map.getZoom() + 4,
            });
          }

          return "opened" as const;
        }

        setOpenGroup(key);

        return "opened" as const;
      }

      return "select" as const;
    },
    [openGroup, map]
  );

  return { observe, offsets: offsets.current, handleTap, toggleAt, openGroup };
}
