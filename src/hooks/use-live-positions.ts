import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Device, DeviceEvent, Position, PositionEvent } from "../types.ts";
import { isDeviceEvent, isPositionEvent } from "../helpers.ts";
import { useDevicePositionListener } from "./use-device-position-listener.ts";

/**
 * Applies the live Traccar feed to the query cache.
 *
 * One subscription, shared by both marker layers. Everything here is written
 * through functional cache updates rather than from values captured at render
 * time, which matters more than it looks: measured against the live feed, 50
 * of 253 position messages arrived within 30ms of the previous one — closer
 * together than React can re-render — so a handler closing over `positions
 * .data` rebuilt the array from stale data and silently discarded the update
 * before it. About one in five.
 *
 * Keeping the callback stable also means the listener is registered once for
 * the session instead of being torn down and re-added on every message.
 */
export function useLivePositions() {
  const queryClient = useQueryClient();

  const onMessage = useCallback(
    (event: MessageEvent<string>) => {
      let payload: PositionEvent | DeviceEvent;

      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (isPositionEvent(payload)) {
        queryClient.setQueryData<Position[]>(["positions"], (current) =>
          mergePositions(current, payload.positions)
        );

        return;
      }

      // Over half the socket traffic is device status, and it used to be
      // parsed and dropped. It carries whether a tracker is online and, for a
      // vehicle that was not in the initial snapshot, its existence at all.
      if (isDeviceEvent(payload)) {
        queryClient.setQueryData<Device[]>(["devices"], (current) =>
          mergeDevices(current, payload.devices)
        );
      }
    },
    [queryClient]
  );

  useDevicePositionListener(onMessage);
}

/**
 * The whole updated position replaces the old one, not just its coordinates.
 *
 * Copying only latitude/longitude/course left `fixTime` frozen at whatever the
 * initial HTTP snapshot said, so on a healthy socket — where nothing else
 * refreshes it — every vehicle aged into "stale" after five minutes and
 * stopped being drawn at thirty, while reporting normally the whole time.
 */
function mergePositions(
  current: Position[] | undefined,
  incoming: Position[]
): Position[] | undefined {
  // A cache holding an error envelope rather than a list must not be mapped.
  if (!Array.isArray(current)) return current;
  if (!Array.isArray(incoming)) return current;

  const pending = new Map(incoming.map((p) => [p.deviceId, p]));

  const next = current.map((position) => {
    const update = pending.get(position.deviceId);

    if (!update) return position;

    pending.delete(position.deviceId);

    return { ...position, ...update };
  });

  // A tracker that started reporting after the snapshot was taken would
  // otherwise never appear until a refetch.
  if (pending.size > 0) next.push(...pending.values());

  return next;
}

/**
 * Device records arrive about twice a second and almost always differ only in
 * `lastUpdate`, which ticks whether or not anything the map draws has changed.
 * Writing those through would re-render every marker twice a second for no
 * visible difference, so the cache is only replaced when a field the UI
 * actually reads has moved.
 *
 * `lastUpdate` is not one of them: it is only the third fallback in
 * `busFreshness`, behind `fixTime` and `deviceTime`, which arrive on the
 * position channel and are always present in practice.
 */
const DEVICE_FIELDS = [
  "status",
  "name",
  "category",
  "uniqueId",
  "disabled",
] as const;

function deviceChanged(a: Device, b: Device): boolean {
  return DEVICE_FIELDS.some((field) => a[field] !== b[field]);
}

function mergeDevices(
  current: Device[] | undefined,
  incoming: Device[]
): Device[] | undefined {
  // A cache holding an error envelope rather than a list must not be mapped.
  if (!Array.isArray(current)) return current;
  if (!Array.isArray(incoming)) return current;

  const pending = new Map(incoming.map((d) => [d.id, d]));
  let changed = false;

  const next = current.map((device) => {
    const update = pending.get(device.id);

    if (!update) return device;

    pending.delete(device.id);

    if (!deviceChanged(device, update)) return device;

    changed = true;

    return { ...device, ...update };
  });

  // A tracker that was not in the initial snapshot is always worth adding.
  if (pending.size > 0) {
    next.push(...pending.values());
    changed = true;
  }

  return changed ? next : current;
}
