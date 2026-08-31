import { Marker, Popup } from "react-leaflet";
import { busIcon } from "../../icons.ts";
import { capitalize } from "../../helpers.ts";

type BusMarkerProps = {
  device: { name: string; category: string | null };
  position: { latitude: number; longitude: number; course: number };
};

/**
 * Presentational marker for a live vehicle. Shared by the "all buses" and
 * "line only" marker layers, which differ only in how they pick devices.
 */
export function BusMarker({ device, position }: BusMarkerProps) {
  const busCategory = capitalize(device?.category || "bus");
  const busName = device?.name ?? "Unknown";

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={busIcon(position.course)}
      title={busName}
      zIndexOffset={1000}
    >
      <Popup>
        <div className="bus-popup">
          <svg
            className="bus-popup__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z" />
            <path
              d="M7.5 15c.83 0 1.5-.67 1.5-1.5S8.33 12 7.5 12 6 12.67 6 13.5 6.67 15 7.5 15zM16.5 15c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM18 6H6v5h12V6z"
              fill="#0891b2"
            />
          </svg>
          <span>
            {busCategory} - {busName}
          </span>
        </div>
      </Popup>
    </Marker>
  );
}
