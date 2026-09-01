import { useState } from "react";
import { useMap, useMapEvent } from "react-leaflet";

/**
 * Current zoom level of the enclosing map, as state.
 *
 * Purely presentational: it lets a layer decide how much detail is worth
 * drawing at the level the user is actually looking at. It reads Leaflet and
 * never writes to it.
 */
export function useMapZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());

  useMapEvent("zoomend", () => setZoom(map.getZoom()));

  return zoom;
}
