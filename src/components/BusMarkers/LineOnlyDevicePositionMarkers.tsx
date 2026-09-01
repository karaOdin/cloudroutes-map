import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { BusMarker } from "./BusMarker.tsx";
import { Device, MapFilters } from "../../types.ts";
import { busFreshness, busPositionAge } from "../../helpers.ts";
import { useLivePositions } from "../../hooks/use-live-positions.ts";
import { useNow } from "../../hooks/use-now.ts";
import { useFocusedDeviceIds } from "../../hooks/use-focused-device-ids.ts";
import { useDevicePaths } from "../../hooks/use-device-paths.ts";
import { useMapZoom } from "../../hooks/use-map-zoom.ts";
import { labelledVehicles } from "./bus-labels.ts";
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
  const zoom = useMapZoom();
  const { data: lines } = useLines();

  useLivePositions();

  if (!positions?.data || !devices?.data || !lines) return <></>;

  const filteredDevices = filteredDevicesData(devices.data, lines, filters);

  // See AllDevicePositionMarkers: labels are allocated against what is really
  // on screen, so resolve the drawn set first.
  const drawn = [];

  for (const device of filteredDevices) {
    const position = positions.data.find((p) => p.deviceId === device.id);

    if (!position) continue;

    // A fix this old is misleading, not useful.
    const freshness = busFreshness(device, position, now);

    if (freshness === "offline") continue;

    drawn.push({ device, position, freshness });
  }

  const labelled = labelledVehicles(
    drawn.map(({ device, position }) => ({
      id: device.id,
      lat: position.latitude,
      lng: position.longitude,
      focused: !!focusedDeviceIds && focusedDeviceIds.has(device.uniqueId),
    })),
    zoom
  );

  return drawn.map(({ device, position, freshness }) => (
    <BusMarker
      key={device.id}
      device={device}
      position={position}
      freshness={freshness}
      age={busPositionAge(device, position, now)}
      dimmed={!!focusedDeviceIds && !focusedDeviceIds.has(device.uniqueId)}
      path={devicePaths.get(device.uniqueId)}
      labelled={labelled.has(device.id)}
    />
  ));
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
