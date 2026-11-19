import { useMemo, useRef } from "react";
import { Device } from "../types.ts";
import { BusFreshness, busFreshness, busPositionAge } from "../helpers.ts";
import { useDevicePosition } from "./use-device-position.ts";
import { useNow } from "./use-now.ts";
import { useVehicleLines } from "./use-vehicle-lines.ts";
import { useDeclaredBuses, vehicleName } from "./use-declared-buses.ts";

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
  /**
   * Compass heading in degrees, used to tell the two directions apart. The
   * last one seen while moving — see `MOVING_KMH` — and null when there has
   * been none to see.
   */
  course: number | null;
  /** Lines this vehicle is attributed to, declared or driven. */
  lines: string[];
  /** True when the tenant's records name that line, rather than geometry. */
  declared: boolean;
  /**
   * Whether the bus is moving or moved lately. A tracker keeps reporting
   * through the night from a bus parked on its own route, and without this
   * every one of them counted as "running".
   */
  active: boolean;
};

/** Faster than this is moving, not GPS drift. */
const MOVING_NOW_KMH = 5;

/** A bus that moved this recently is in service, waiting at a stop or a light. */
const ACTIVE_FOR_MS = 10 * 60_000;

const KNOTS_TO_KMH = 1.852;

/**
 * Below this a tracker's course is not a heading. A stopped bus reports 0 —
 * due north — whichever way it faces, and one creeping through a stop
 * swings tens of degrees between fixes. Seen in Biskra: a bus dwelling at a
 * stop dropped out of "coming to you" and back every 30 s, because the
 * direction test read its parked "north" as driving away. So a slow bus keeps
 * the heading it last had while moving.
 */
const MOVING_KMH = 12;

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

function heading(
  memory: Map<number, number>,
  id: number,
  position: { course?: number; speed?: number }
): number | null {
  const course = position.course ?? 0;

  if ((position.speed ?? 0) * KNOTS_TO_KMH >= MOVING_KMH) {
    memory.set(id, course);

    return course;
  }

  const remembered = memory.get(id);

  if (remembered != null) return remembered;

  // Slow and never seen moving. Trackers that hold their last heading while
  // stopped report it here and it can be used; exactly 0 is what the others
  // send for "no heading", and reading it as due north is how a bus parked
  // for the night came to be announced as two minutes away.
  return course === 0 ? null : course;
}

export function useLiveBuses(): LiveBus[] {
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const vehicleLines = useVehicleLines(positions?.data, devices?.data);
  const declared = useDeclaredBuses();
  const headings = useRef(new Map<number, number>());
  const lastMoved = useRef(new Map<number, number>());

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

      const speed = Math.max(0, (position.speed ?? 0) * KNOTS_TO_KMH);
      // Traccar's own motion flag counts too: it carries over the gaps
      // between fixes that our speed reading misses.
      const motion = (position.attributes as { motion?: boolean } | undefined)?.motion;

      if (speed >= MOVING_NOW_KMH || motion === true) lastMoved.current.set(device.id, now);

      const movedAt = lastMoved.current.get(device.id);

      list.push({
        id: device.id,
        // Traccar is the register, so its name leads. Where it has none, the
        // tenant's records may still know the number painted on the bus,
        // which is a real identifier where the device id is not.
        name: vehicleName(declared, device),
        lat: position.latitude,
        lng: position.longitude,
        freshness,
        age: busPositionAge(device, position, now),
        speed,
        course: heading(headings.current, device.id, position),
        lines: vehicleLines.get(device.id)?.lines ?? [],
        declared: vehicleLines.get(device.id)?.declared ?? false,
        active: movedAt != null && now - movedAt <= ACTIVE_FOR_MS,
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
