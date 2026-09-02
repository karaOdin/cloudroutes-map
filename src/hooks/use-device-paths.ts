import { useMemo } from "react";
import { LatLng, latLng, LatLngExpression } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";

export type RoutePaths = {
  /** Traccar `uniqueId` -> the waypoints of the line that vehicle is assigned. */
  byDevice: Map<string, LatLng[]>;
  /**
   * Every line's waypoints. Needed because the vehicle-to-line link is admin
   * data and some tenants have none of it — Constantine returns `buses: []` on
   * all twelve lines — so a vehicle there can only be matched to a road by
   * where it actually is.
   */
  all: LatLng[][];
};

/**
 * The route geometry the marker layer needs, built once per lines payload and
 * shared by every marker rather than once per vehicle.
 */
export function useDevicePaths(): RoutePaths {
  const { data: lines } = useLines();

  return useMemo(() => {
    const byDevice = new Map<string, LatLng[]>();
    const all: LatLng[][] = [];

    lines?.forEach((line) => {
      const waypoints = (line.waypoints || []) as LatLngExpression[];

      if (waypoints.length < 2) return;

      const points = waypoints.map((waypoint) => latLng(waypoint));

      all.push(points);

      line.buses.forEach((bus) => {
        if (!isEmpty(bus.traccar_device_id)) {
          byDevice.set(bus.traccar_device_id, points);
        }
      });
    });

    return { byDevice, all };
  }, [lines]);
}
