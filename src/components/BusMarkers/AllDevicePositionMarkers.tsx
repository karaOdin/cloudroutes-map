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

export function AllDevicePositionMarkers() {
  const [positions, devices] = useDevicePosition();
  const now = useNow();
  const focusedDeviceIds = useFocusedDeviceIds();
  const devicePaths = useDevicePaths();
  const zoom = useMapZoom();

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

  // Only named vehicles compete for label space. An unnamed one has nothing to
  // show, so it must not deny a neighbour the room.
  const labelled = labelledVehicles(
    drawn
      .filter(({ device }) => !!device.name)
      .map(({ device, position }) => ({
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
      path={devicePaths.byDevice.get(device.uniqueId)}
      routes={devicePaths.all}
      labelled={labelled.has(device.id)}
    />
  ));
}

/**
 * Stand-in for a vehicle that is reporting a position while its Traccar record
 * is out of reach — an expired token, or a server the browser cannot read.
 *
 * Deliberately nameless. The position is real and worth drawing, but the only
 * identifier we hold is Traccar's internal device id, and captioning a marker
 * with it presents a number nobody uses as if it were the vehicle's name. An
 * unnamed marker says what is true: there is a bus here, and we do not know
 * which one.
 */
function unknownDevice(deviceId: number): Device {
  return {
    id: deviceId,
    name: "",
    uniqueId: "",
    status: "",
    category: null,
  } as Device;
}
