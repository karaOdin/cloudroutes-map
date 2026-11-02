import { useMemo } from "react";
import { Device } from "../types.ts";
import { BusFreshness, busFreshness, busPositionAge } from "../helpers.ts";
import { tidyVehicleName } from "../components/BusMarkers/bus-labels.ts";
import { useDevicePosition } from "./use-device-position.ts";
import { useNow } from "./use-now.ts";
import { useVehicleLines } from "./use-vehicle-lines.ts";
import { useDeclaredBuses } from "./use-declared-buses.ts";

/**
 * Every vehicle the map is currently drawing, as a list.
 *
 * The map answers "which bus is near me"; it is a poor way to answer "where is
 * bus 04/H017". Finding one particular vehicle meant panning around hunting
 * for a label, and below zoom 16 there are no labels to hunt for.
 *
 * Deliberately built from positions on the same terms the marker layers use —
 * the same device join, the same offline cut — because a row that flies the
 * map to a vehicle that is not drawn there is worse than no row at all.
 */

export type LiveBus = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  freshness: BusFreshness;
  /** Age of the last fix in ms. */
  age: number;
  /** km/h. Traccar reports knots. */
  speed: number;
  /** Lines this vehicle is attributed to, declared or driven. */
  lines: string[];
  /** True when the tenant's records name that line, rather than geometry. */
  declared: boolean;
};

const KNOTS_TO_KMH = 1.852;

/** Stand-in matching the marker layers', so the list and the map agree. */
function unknownDevice(deviceId: number): Device {
  return {
    id: deviceId,
    name: `#${deviceId}`,
    uniqueId: "",
    status: "",
    category: null,
  } as Device;
}

export function useLiveBuses(): LiveBus[] {
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const vehicleLines = useVehicleLines(positions?.data, devices?.data);
  const declared = useDeclaredBuses();

  return useMemo(() => {
    const known = devices?.data ?? [];
    const byId = new Map(known.map((device) => [device.id, device]));
    const list: LiveBus[] = [];

    for (const position of positions?.data ?? []) {
      const found = byId.get(position.deviceId);

      // While the list is trustworthy, a position with no device behind it is
      // a stale row rather than a vehicle.
      if (!found && known.length > 0) continue;

      const device = found ?? unknownDevice(position.deviceId);
      const freshness = busFreshness(device, position, now);

      // Not drawn on the map, so not listed here either.
      if (freshness === "offline") continue;

      list.push({
        id: device.id,
        // Traccar is the register, so its name leads. Where it has none, the
        // tenant's records may still know the number painted on the bus,
        // which is a real identifier where the device id is not.
        name:
          tidyVehicleName(device.name ?? "") ||
          declared.get(device.uniqueId)?.number ||
          `#${device.id}`,
        lat: position.latitude,
        lng: position.longitude,
        freshness,
        age: busPositionAge(device, position, now),
        speed: Math.max(0, (position.speed ?? 0) * KNOTS_TO_KMH),
        lines: vehicleLines.get(device.id)?.lines ?? [],
        declared: vehicleLines.get(device.id)?.declared ?? false,
      });
    }

    // Reporting vehicles first — a rider looking for a bus wants the ones that
    // are actually running — then by name, read as a number where it is one so
    // that 9 comes before 10.
    return list.sort(
      (a, b) =>
        Number(b.freshness === "live") - Number(a.freshness === "live") ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    );
  }, [positions?.data, devices?.data, now, vehicleLines, declared]);
}
