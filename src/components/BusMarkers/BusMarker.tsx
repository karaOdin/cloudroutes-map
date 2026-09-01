import { useEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import { Marker as LeafletMarker } from "leaflet";
import { useTranslation } from "react-i18next";
import { busIcon } from "../../icons.ts";
import { BusFreshness, capitalize, formatAge } from "../../helpers.ts";

type BusMarkerProps = {
  device: { name: string; category: string | null };
  position: { latitude: number; longitude: number; course: number };
  /** How recent this vehicle's last fix is. */
  freshness?: BusFreshness;
  /** Age of that fix in ms, shown in the popup when the vehicle is stale. */
  age?: number;
  /** True when another line is focused and this vehicle is not on it. */
  dimmed?: boolean;
};

/**
 * Presentational marker for a live vehicle. Shared by the "all buses" and
 * "line only" marker layers, which differ only in how they pick devices.
 */
export function BusMarker({
  device,
  position,
  freshness = "live",
  age = NaN,
  dimmed = false,
}: BusMarkerProps) {
  const { t } = useTranslation();
  const markerRef = useRef<LeafletMarker>(null);
  const busCategory = capitalize(device?.category || "bus");
  const busName = device?.name ?? "Unknown";
  const isStale = freshness === "stale";

  // Heading is applied to the live element rather than baked into the icon.
  // Custom properties inherit, so setting it on the marker root reaches the
  // rotating inner div without replacing any DOM — which is what lets the
  // position transition and the turn run instead of snapping.
  // `isStale` is a dependency because changing it does swap the icon element.
  useEffect(() => {
    markerRef.current
      ?.getElement()
      ?.style.setProperty("--angle", `${position.course}deg`);
  }, [position.course, isStale]);

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={busIcon(isStale)}
      title={busName}
      opacity={dimmed ? 0.25 : 1}
      zIndexOffset={dimmed ? 400 : isStale ? 600 : 1000}
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
              fill="var(--surface)"
            />
          </svg>
          <div className="bus-popup__text">
            <span>
              {busCategory} - {busName}
            </span>
            {isStale && (
              <span className="bus-popup__stale">
                {t("bus.last_seen", { age: formatAge(age) })}
              </span>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
