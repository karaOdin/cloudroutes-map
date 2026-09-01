import { useQueryClient } from "@tanstack/react-query";
import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { BusMarker } from "./BusMarker.tsx";
import { useCallback } from "react";
import { DeviceEvent, PositionEvent } from "../../types.ts";
import { busFreshness, busPositionAge, isPositionEvent } from "../../helpers.ts";
import { useDevicePositionListener } from "../../hooks/use-device-position-listener.ts";
import { useNow } from "../../hooks/use-now.ts";
import { useFocusedDeviceIds } from "../../hooks/use-focused-device-ids.ts";
import { useDevicePaths } from "../../hooks/use-device-paths.ts";

export function AllDevicePositionMarkers() {
  const queryClient = useQueryClient();
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const focusedDeviceIds = useFocusedDeviceIds();
  const devicePaths = useDevicePaths();

  const onPositionUpdate = useCallback(
    (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as PositionEvent | DeviceEvent;

      if (isPositionEvent(event)) {
        const updated = positions.data?.map((p) => {
          const update = event.positions.find(
            (pos) => pos.deviceId === p.deviceId
          );

          return update
            ? {
                ...p,
                latitude: update.latitude,
                longitude: update.longitude,
                course: update.course,
              }
            : p;
        });

        if (updated) {
          queryClient.setQueryData(["positions"], updated);
        }
      }
    },
    [queryClient, positions.data]
  );

  useDevicePositionListener(onPositionUpdate);

  if (!positions?.data || !devices?.data) return <></>;

  return devices.data.map((device) => {
    const position = positions.data.find((p) => p.deviceId === device.id);

    if (!position) return null;

    // Traccar keeps serving the last known fix forever. A vehicle that has
    // not reported for half an hour is not where this says it is, so it is
    // not drawn at all rather than drawn as if it were live.
    const freshness = busFreshness(device, position, now);

    if (freshness === "offline") return null;

    return (
      <BusMarker
        key={device.id}
        device={device}
        position={position}
        freshness={freshness}
        age={busPositionAge(device, position, now)}
        dimmed={!!focusedDeviceIds && !focusedDeviceIds.has(device.uniqueId)}
        path={devicePaths.get(device.uniqueId)}
      />
    );
  });
}
