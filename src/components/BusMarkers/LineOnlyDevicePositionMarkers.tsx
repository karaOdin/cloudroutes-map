import { useMemo } from "react";
import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { BusMarker } from "./BusMarker.tsx";
import { Device, MapFilters, Position } from "../../types.ts";
import { busFreshness, busPositionAge } from "../../helpers.ts";
import { useLivePositions } from "../../hooks/use-live-positions.ts";
import { useNow } from "../../hooks/use-now.ts";
import { useFocusedDeviceIds } from "../../hooks/use-focused-device-ids.ts";
import { useDevicePaths } from "../../hooks/use-device-paths.ts";
import { useMapZoom } from "../../hooks/use-map-zoom.ts";
import { labelledVehicles } from "./bus-labels.ts";
import { useSpiderfy } from "../../hooks/use-spiderfy.ts";
import { useFollowStore } from "../../hooks/use-follow-store.ts";
import { useRouteStore } from "../../hooks/use-route-store.ts";
import { useVehicleLines } from "../../hooks/use-vehicle-lines.ts";
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
  const routePoints = useMemo(
    () => devicePaths.all.map((line) => line.points),
    [devicePaths]
  );
  const zoom = useMapZoom();
  const spiderfy = useSpiderfy();
  const toggleFollow = useFollowStore((state) => state.toggleFollow);
  const routeLines = useRouteStore((state) => state.routeLines);
  const { data: lines } = useLines();
  const vehicleLines = useVehicleLines(positions?.data);

  useLivePositions();

  if (!positions?.data || !devices?.data || !lines) return <></>;

  const filteredDevices = filteredDevicesData(
    devices.data,
    lines,
    filters,
    positions.data,
    vehicleLines
  );

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

  spiderfy.observe(
    drawn.map(({ device, position }) => ({
      id: device.id,
      lat: position.latitude,
      lng: position.longitude,
    }))
  );

  return drawn.map(({ device, position, freshness }) => (
    <BusMarker
      key={device.id}
      device={device}
      position={position}
      freshness={freshness}
      age={busPositionAge(device, position, now)}
      dimmed={
        (!!focusedDeviceIds && !focusedDeviceIds.has(device.uniqueId)) ||
        // A journey is on the map and this vehicle is not part of it.
        // A journey is on the map and this vehicle is on none of its lines.
        (!!routeLines &&
          !(vehicleLines.get(device.id) ?? []).some((line) =>
            routeLines.includes(line)
          ))
      }
      path={devicePaths.byDevice.get(device.uniqueId)}
      routes={routePoints}
      labelled={labelled.has(device.id)}
      spider={spiderfy.offsets.get(device.id)}
      onTap={(id) => {
        const action = spiderfy.handleTap(id);

        if (action === "select") toggleFollow(id);

        return action;
      }}
    />
  ));
}

function filteredDevicesData(
  devices: Device[],
  lines: Line[],
  filters: MapFilters,
  positions: Position[],
  vehicleLines: Map<number, string[]>
): Device[] {
  if (filters.line === "none") return [];
  if (filters.line === "all") return devices;

  const wanted = filters.line;
  const busesIds: string[] = [];

  lines
    .filter((line) => wanted.includes(line.name))
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

  // Where a vehicle has no declared line — which on most tenants is nearly all
  // of them, and on a bus not yet on the tracker system is all of them — fall
  // back to the line it is actually driving along. A declared link still wins
  // where it exists, since the operator saying so beats us inferring it.
  const byPosition = new Set(
    positions
      .filter((position) =>
        (vehicleLines.get(position.deviceId) ?? []).some((line) =>
          wanted.includes(line)
        )
      )
      .map((position) => position.deviceId)
  );

  return devices.filter(
    (device) =>
      busesIds.includes(device.uniqueId) || byPosition.has(device.id)
  );
}
