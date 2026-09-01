import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { BusMarker } from "./BusMarker.tsx";
import { Device, MapFilters } from "../../types.ts";
import { busFreshness, busPositionAge } from "../../helpers.ts";
import { useLivePositions } from "../../hooks/use-live-positions.ts";
import { useNow } from "../../hooks/use-now.ts";
import { useFocusedDeviceIds } from "../../hooks/use-focused-device-ids.ts";
import { useDevicePaths } from "../../hooks/use-device-paths.ts";
import { useLines } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";
import { useFilterStore } from "../../hooks/use-filter-store.ts";
import { isEmpty } from "@cloudroutes/core";

export function LineOnlyDevicePositionMarkers() {
  const filters = useFilterStore((state) => state.filters);
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const focusedDeviceIds = useFocusedDeviceIds();
  const devicePaths = useDevicePaths();
  const { data: lines } = useLines();

  useLivePositions();

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
        // Keyed by device only. Including the coordinates remounted the
        // marker on every update, so it could never animate between them.
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
