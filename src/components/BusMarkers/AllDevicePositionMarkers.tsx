import { useMemo } from "react";
import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { Device } from "../../types.ts";
import { BusMarker } from "./BusMarker.tsx";
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

export function AllDevicePositionMarkers() {
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const focusedDeviceIds = useFocusedDeviceIds();
  const devicePaths = useDevicePaths();
  const routePoints = useMemo(
    () => devicePaths.all.map((line) => line.points),
    [devicePaths]
  );
  const zoom = useMapZoom();
  const vehicleLines = useVehicleLines(positions?.data);
  const spiderfy = useSpiderfy();
  const toggleFollow = useFollowStore((state) => state.toggleFollow);
  const routeLines = useRouteStore((state) => state.routeLines);

  useLivePositions();

  if (!positions?.data) return <></>;

  // Driven by positions, not by the Traccar device list.
  //
  // The device list is only ever decoration here — names and categories — but
  // iterating it meant no vehicle could be drawn without it, and on Traccar 4
  // tenants a browser cannot reach it at all: that version rejects the Bearer
  // header outright and authenticates only by a session cookie which comes
  // back without a SameSite attribute, so it is never sent cross-site.
  // Positions come from the tenant's own API and are unaffected, so a vehicle
  // that is reporting is now drawn whether or not Traccar can be reached.
  const knownDevices = devices?.data ?? [];
  const deviceById = new Map(knownDevices.map((device) => [device.id, device]));
  const drawn = [];

  for (const position of positions.data) {
    const known = deviceById.get(position.deviceId);

    // While the list is trustworthy, a position with no device behind it is a
    // stale row rather than a vehicle. Only stand in when there is no list.
    if (!known && knownDevices.length > 0) continue;

    const device = known ?? unknownDevice(position.deviceId);

    // Traccar keeps serving the last known fix forever. A vehicle that has
    // not reported for half an hour is not where this says it is, so it is
    // not drawn at all rather than drawn as if it were live.
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

/**
 * Stand-in for a vehicle that is reporting a position while its Traccar record
 * is out of reach. Named by device id, which is honest: it is what we know.
 */
function unknownDevice(deviceId: number): Device {
  return {
    id: deviceId,
    name: `#${deviceId}`,
    uniqueId: "",
    status: "",
    category: null,
  } as Device;
}
