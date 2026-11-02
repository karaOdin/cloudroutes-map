import { useFocusStore } from "./use-focus-store.ts";
import { VehicleLines } from "./use-vehicle-lines.ts";

/**
 * Traccar ids of the vehicles running the focused line, or null when nothing
 * is focused. Both bus layers use it to decide what to draw.
 *
 * It used to read `line.buses[].traccar_device_id` alone. That is admin data
 * and it is mostly missing — M'sila links two vehicles out of sixty-five with
 * ids that match nothing, Constantine and Djelfa return `buses: []` — so
 * focusing a line produced a nearly empty set and the layers held back the
 * whole fleet, the focused line's own buses among them. Focus is now answered
 * by the same attribution the rest of the map uses, which reads the tenant's
 * records, the line the operator wrote into the tracker's name, and failing
 * both, the road the bus is driving on.
 */
export function useFocusedDeviceIds(
  vehicleLines: Map<number, VehicleLines>
): Set<number> | null {
  const focusedLine = useFocusStore((state) => state.focusedLine);

  if (!focusedLine) return null;

  const ids = new Set<number>();

  vehicleLines.forEach((attribution, deviceId) => {
    if (attribution.lines.includes(focusedLine)) ids.add(deviceId);
  });

  return ids;
}
