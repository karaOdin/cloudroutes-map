import { useMap, useMapEvents } from "react-leaflet";

/**
 * Suppresses marker position transitions while the map is zooming.
 *
 * Leaflet recomputes every marker's pixel transform on a zoom change. With a
 * transition attached, each marker would slide from its pre-zoom position to
 * its new one over the following second, so the whole fleet visibly drifted
 * into place after every pinch. Panning is done by transforming the marker
 * pane as a whole, so it needs no guard.
 *
 * `zoomstart` fires before Leaflet repositions the markers and `zoomend`
 * after, on both the animated and non-animated zoom paths. Renders nothing.
 */
export function MarkerMotionGuard() {
  const map = useMap();

  useMapEvents({
    zoomstart: () => map.getContainer().classList.add("map-zooming"),
    zoomend: () => {
      requestAnimationFrame(() =>
        map.getContainer().classList.remove("map-zooming")
      );
    },
  });

  return null;
}
