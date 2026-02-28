import { useQueryClient } from "@tanstack/react-query";
import { useDevicePosition } from "../../hooks/use-device-position.ts";
import { useCallback, useRef } from "react";
import { DeviceEvent, PositionEvent } from "../../types.ts";
import { capitalize, isPositionEvent } from "../../helpers.ts";
import { useDevicePositionListener } from "../../hooks/use-device-position-listener.ts";
import { Marker, Popup } from "react-leaflet";
import { busIcon } from "../../icons.ts";
import { Marker as LeafletMarker } from "leaflet";

function BusMarkerWithHoverPopup({
  device,
  position,
}: {
  device: { id: number; name: string; category: string | null };
  position: { latitude: number; longitude: number; course: number };
}) {
  const markerRef = useRef<LeafletMarker>(null);

  const busCategory = capitalize(device?.category || "bus");
  const busName = device?.name ?? "Unknown";

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={busIcon(position.course)}
      zIndexOffset={1000}
    >
      <Popup>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 0",
          }}
        >
          {/* Bus icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z"
              fill="#06b6d4"
            />
            <path
              d="M7.5 15c.83 0 1.5-.67 1.5-1.5S8.33 12 7.5 12 6 12.67 6 13.5 6.67 15 7.5 15zM16.5 15c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM18 6H6v5h12V6z"
              fill="#0891b2"
            />
          </svg>
          {/* Bus name */}
          <span
            style={{
              fontWeight: "600",
              fontSize: "14px",
              color: "#1f2937",
            }}
          >
            {busCategory} - {busName}
          </span>
        </div>
      </Popup>
    </Marker>
  );
}

export function AllDevicePositionMarkers() {
  const queryClient = useQueryClient();
  const [positions, devices] = useDevicePosition();

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

    return (
      <BusMarkerWithHoverPopup
        key={device.id}
        device={device}
        position={position}
      />
    );
  });
}
