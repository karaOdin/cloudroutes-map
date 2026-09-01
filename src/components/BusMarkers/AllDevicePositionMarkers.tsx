import { useDevicePosition } from "../../hooks/use-device-position.ts";
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

  if (!positions?.data || !devices?.data) return <></>;

  // Resolve what is actually going to be drawn before deciding anything about
  // labels — a label's competition is the other vehicles on screen, not the
  // ones filtered out or too stale to draw.
  const drawn = [];

  for (const device of devices.data) {
    const position = positions.data.find((p) => p.deviceId === device.id);

    if (!position) continue;

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
