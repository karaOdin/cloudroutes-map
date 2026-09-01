import { useQueryClient } from "@tanstack/react-query";
import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { BusMarker } from "./BusMarker.tsx";
import { useCallback } from "react";
import { Device, DeviceEvent, MapFilters, PositionEvent } from "../../types.ts";
import { busFreshness, busPositionAge, isPositionEvent } from "../../helpers.ts";
import { useDevicePositionListener } from "../../hooks/use-device-position-listener.ts";
import { useNow } from "../../hooks/use-now.ts";
import { useFocusedDeviceIds } from "../../hooks/use-focused-device-ids.ts";
import { useLines } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";
import { useFilterStore } from "../../hooks/use-filter-store.ts";
import { isEmpty } from "@cloudroutes/core";

export function LineOnlyDevicePositionMarkers() {
  const filters = useFilterStore((state) => state.filters);
  const queryClient = useQueryClient();
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const focusedDeviceIds = useFocusedDeviceIds();
  const { data: lines } = useLines();

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

  if (!positions?.data || !devices?.data || !lines) return <></>;

  const filteredDevices = filteredDevicesData(devices.data, lines, filters);

  return filteredDevices.map((device) => {
    const position = positions.data.find((p) => p.deviceId === device.id);

    if (!position) return null;

    // See AllDevicePositionMarkers: a fix this old is misleading, not useful.
    const freshness = busFreshness(device, position, now);

    if (freshness === "offline") return null;

    return (
      <BusMarker
        key={device.id + "_" + position.latitude + "_" + position.longitude}
        device={device}
        position={position}
        freshness={freshness}
        age={busPositionAge(device, position, now)}
        dimmed={!!focusedDeviceIds && !focusedDeviceIds.has(device.uniqueId)}
      />
    );
  });
}

function filteredDevicesData(
  devices: Device[],
  lines: Line[],
  filters: MapFilters
): Device[] {
  if (filters.line === "none") return [];
  if (filters.line === "all") return devices;
  const busesIds: string[] = [];

  lines
    .filter((line) => filters.line.includes(line.name))
    .forEach((line) => {
      line.buses.forEach((bus) => {
        if (
          !isEmpty(bus.traccar_device_id) &&
          !busesIds.includes(bus.traccar_device_id)
        ) {
          busesIds.push(bus.traccar_device_id);
        }
      });
    });

  return devices.filter((device) => busesIds.includes(device.uniqueId));
}
