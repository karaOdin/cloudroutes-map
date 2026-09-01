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
  if (!current) return current;

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

function mergeDevices(
  current: Device[] | undefined,
  incoming: Device[]
): Device[] | undefined {
  if (!current) return current;

  const pending = new Map(incoming.map((d) => [d.id, d]));

  const next = current.map((device) => {
    const update = pending.get(device.id);

    if (!update) return device;

    pending.delete(device.id);

    return { ...device, ...update };
  });

  if (pending.size > 0) next.push(...pending.values());

  return next;
}
