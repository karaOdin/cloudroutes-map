import { useMemo, useRef } from "react";
import { latLng } from "leaflet";
import { Device, Position } from "../types.ts";
import { distanceToPath } from "../services/route-path.ts";
import { useDevicePaths } from "./use-device-paths.ts";
import { useDeclaredBuses } from "./use-declared-buses.ts";
import {
  lineFromDeviceName,
  lineNumbers,
} from "../services/line-in-name.ts";

/**
 * Which line each vehicle is driving on, worked out from where it is.
 *
 * The declared link — `line.buses[].traccar_device_id` matched to a Traccar
 * `uniqueId` — is admin data, and it is mostly missing: Constantine and Djelfa
 * return `buses: []` on every line, and M'sila links two vehicles out of
 * sixty-five with ids that match nothing in Traccar. Line filtering built on it
 * therefore shows nothing on three tenants out of four. It also cannot cover a
 * bus that is not on the tracker system yet.
 *
 * A vehicle's position does not have that problem. If it is driving along a
 * line's route, that is a line it is on, whatever the admin records say.
 *
 * Deliberately every line it could be on, not the nearest one. Lines share
 * roads — on M'sila, Line 16 and Line 17 run the same street for part of their
 * length, both exactly on it — and a position cannot tell them apart. Picking
 * the nearest would be a coin toss presented as fact, and would drop a bus
 * from the filter for the line it is genuinely running.
 */

/**
 * How close a vehicle must be to a line to be counted as running it. Wide
 * enough for GPS error, road width and waypoint simplification; narrow enough
 * that a parallel street is not mistaken for the route.
 */
const ON_LINE_M = 45;

/** Below this a vehicle has not really moved, so its last answer still holds. */
const RECHECK_AFTER_M = 25;

type Remembered = { lat: number; lng: number; lines: string[] };

/**
 * What a vehicle's line attribution rests on.
 *
 * `declared` is the tenant's own record, matched through the device's
 * Identifier. `driven` is inferred from where the bus is, which is a reading
 * of the road rather than a statement about the service — so the two must not
 * be presented as the same kind of fact.
 */
export type VehicleLines = { lines: string[]; declared: boolean };

export function useVehicleLines(
  positions: Position[] | undefined,
  devices?: Device[]
): Map<number, VehicleLines> {
  const { all } = useDevicePaths();
  const declared = useDeclaredBuses();
  const remembered = useRef(new Map<number, Remembered>());

  return useMemo(() => {
    const attributed = new Map<number, VehicleLines>();

    if (!positions) return attributed;

    // A position carries Traccar's numeric id; the tenant's records are keyed
    // by the device Identifier, so the device list is what joins them.
    const byId = new Map((devices ?? []).map((device) => [device.id, device]));
    const byNumber = lineNumbers(all.map((line) => line.name));

    for (const position of positions) {
      // An operator-stated assignment is not improved on by guessing. Where
      // the records account for this vehicle, that is the answer, and it holds
      // whether the bus is on its route, at the depot or parked overnight.
      const device = byId.get(position.deviceId);
      const stated = device?.uniqueId
        ? declared.get(device.uniqueId)
        : undefined;

      if (stated) {
        attributed.set(position.deviceId, {
          lines: [stated.line],
          declared: true,
        });

        continue;
      }

      // Nothing in the records, but the operator may have written the line
      // into the tracker's own name. Also a statement, so also not improved
      // on by guessing.
      const named = lineFromDeviceName(device?.name ?? "", byNumber);

      if (named) {
        attributed.set(position.deviceId, { lines: [named], declared: true });

        continue;
      }

      if (all.length === 0) continue;

      const previous = remembered.current.get(position.deviceId);
      const here = latLng(position.latitude, position.longitude);

      // Snapping every vehicle against every line on every update would be
      // thousands of segment projections a second for an answer that rarely
      // changes, so a vehicle that has barely moved keeps its last one.
      if (
        previous &&
        latLng(previous.lat, previous.lng).distanceTo(here) < RECHECK_AFTER_M
      ) {
        if (previous.lines.length > 0) {
          attributed.set(position.deviceId, {
            lines: previous.lines,
            declared: false,
          });
        }

        continue;
      }

      const on = all
        .filter((line) => distanceToPath(line.points, here) <= ON_LINE_M)
        .map((line) => line.name);

      remembered.current.set(position.deviceId, {
        lat: position.latitude,
        lng: position.longitude,
        lines: on,
      });

      if (on.length > 0) {
        attributed.set(position.deviceId, { lines: on, declared: false });
      }
    }

    return attributed;
  }, [positions, all, devices, declared]);
}
