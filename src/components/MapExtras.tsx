import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { latLngBounds, LatLngExpression } from "leaflet";
import { insetPadding } from "../services/map-insets.ts";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";

/**
 * Clears the loading sweep once the basemap has actually painted.
 *
 * Leaflet fires `load` on a tile layer when its visible tiles are in, which is
 * the only honest moment to stop saying "loading". Re-arms on a style change,
 * since the new basemap has to load from scratch.
 */
export function TileReadyFlag() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const ready = () => container.classList.add("tiles-ready");
    const pending = () => container.classList.remove("tiles-ready");

    map.eachLayer((layer) => {
      if ("_url" in layer) {
        layer.on("load", ready);
        layer.on("loading", pending);
      }
    });

    // A cached basemap can be in before this effect runs, so never wait forever.
    const failsafe = setTimeout(ready, 6000);

    return () => {
      clearTimeout(failsafe);
      map.eachLayer((layer) => {
        if ("_url" in layer) {
          layer.off("load", ready);
          layer.off("loading", pending);
        }
      });
    };
  }, [map]);

  return null;
}

/**
 * Frames the whole network.
 *
 * Panning away and not finding your way back is the easiest way to get lost on
 * a map this size, and the network's extent is the one view that is always
 * meaningful. Built from the line geometry, which is the only thing that
 * describes where the service actually runs.
 */
export function FitNetworkControl() {
  const map = useMap();
  const { t } = useTranslation();
  const { data: lines } = useLines({ queryKey: [QUERY_KEYS.LINES] });

  const fit = () => {
    const points: LatLngExpression[] = [];

    (lines as Line[] | undefined)?.forEach((line) => {
      (line.waypoints ?? []).forEach((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          points.push(point as LatLngExpression);
        }
      });
    });

    if (points.length < 2) return;

    map.fitBounds(latLngBounds(points), insetPadding(36));
  };

  if (!lines?.length) return null;

  return (
    <button
      type="button"
      className="control-button"
      onClick={fit}
      aria-label={t("controls.fit_network")}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.3" fill="currentColor" />
      </svg>
    </button>
  );
}
