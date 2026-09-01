import { useMemo } from "react";
import { LatLng, latLng, LatLngExpression } from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";

/**
 * Traccar `uniqueId` -> the waypoints of the line that vehicle runs.
 *
 * Built once per lines payload and shared by every marker, so following the
 * route costs one pass over the lines rather than one per vehicle.
 */
export function useDevicePaths(): Map<string, LatLng[]> {
  const { data: lines } = useLines();

  return useMemo(() => {
    const paths = new Map<string, LatLng[]>();

    lines?.forEach((line) => {
      const waypoints = (line.waypoints || []) as LatLngExpression[];

      if (waypoints.length < 2) return;

      const points = waypoints.map((waypoint) => latLng(waypoint));

      line.buses.forEach((bus) => {
        if (!isEmpty(bus.traccar_device_id)) {
          paths.set(bus.traccar_device_id, points);
        }
      });
    });

    return paths;
  }, [lines]);
}
