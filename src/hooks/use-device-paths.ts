import { useMemo } from "react";
import { LatLng, latLng, LatLngExpression } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";

export type RoutePaths = {
  /** Traccar `uniqueId` -> the waypoints of the line that vehicle is assigned. */
  byDevice: Map<string, LatLng[]>;
  /**
   * Every line's waypoints, with its name. Needed because the vehicle-to-line
   * link is admin data that some tenants have none of — Constantine and Djelfa
   * return `buses: []` on every line, M'sila links two of sixty-five and both
   * ids are wrong — and because not every bus is on the tracker system yet.
   * Where it is absent a vehicle can still be matched to a line by where it is
   * actually driving.
   */
  all: Array<{ name: string; points: LatLng[] }>;
};

/**
 * The route geometry the marker layer needs, built once per lines payload and
 * shared by every marker rather than once per vehicle.
 */
export function useDevicePaths(): RoutePaths {
  const { data: lines } = useLines();

  return useMemo(() => {
    const byDevice = new Map<string, LatLng[]>();
    const all: RoutePaths["all"] = [];

    lines?.forEach((line) => {
      const waypoints = (line.waypoints || []) as LatLngExpression[];

      // `latLng()` answers null for anything it cannot read rather than
      // throwing, and tenant data does contain such rows — M'sila's "ligne 18"
      // stores a single flat pair, [lat, lng], where a list of pairs belongs,
      // which reads as two bare numbers and yields two nulls. Letting those
      // into a path put nulls in front of the geometry and took the whole map
      // down with it, so they are dropped at the door.
      const points = waypoints
        .map((waypoint) => latLng(waypoint))
        .filter((point): point is LatLng => point != null);

      if (points.length < 2) return;

      all.push({ name: line.name, points });

      line.buses.forEach((bus) => {
        if (!isEmpty(bus.traccar_device_id)) {
          byDevice.set(bus.traccar_device_id, points);
        }
      });
    });

    return { byDevice, all };
  }, [lines]);
}
