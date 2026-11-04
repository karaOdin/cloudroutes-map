import { LatLngExpression, Map as LeafletMap, point } from "leaflet";
import { Env } from "../config/env.ts";

/**
 * The parts of the map that something is sitting on top of.
 *
 * The host app draws its own search bar above the WebView, so the top of the
 * map is covered by chrome this code never sees. Only the control buttons were
 * allowing for it, by way of a hardcoded 140px, which meant everything else —
 * flying to a stop, framing the network, a popup opening near the top — aimed
 * at the middle of a map that is not all visible, and put the answer under the
 * search bar.
 *
 * The drawer does the same from below whenever it is open.
 */

/** What the host covers if it does not say. Matches the previous hardcoded value. */
const ASSUMED_WEBVIEW_TOP = 140;

export type MapInsets = { top: number; bottom: number };

export function mapInsets(): MapInsets {
  const configured = Number(Env.MAP_INSET_TOP);
  const top = Number.isFinite(configured)
    ? configured
    : window.ReactNativeWebView
      ? ASSUMED_WEBVIEW_TOP
      : 0;

  // Measured rather than assumed: the drawer's height depends on its content
  // and the viewport, and it animates.
  const drawer = document.querySelector(".lines-drawer");
  const bottom = drawer
    ? Math.max(0, window.innerHeight - drawer.getBoundingClientRect().top)
    : 0;

  return { top, bottom };
}

/** Padding for `fitBounds`, so framed content clears the chrome. */
export function insetPadding(edge = 36) {
  const { top, bottom } = mapInsets();

  return {
    paddingTopLeft: point(edge, edge + top),
    paddingBottomRight: point(edge, edge + bottom),
  };
}

/**
 * Fly somewhere so it lands in the middle of what can actually be seen,
 * rather than the middle of the map element.
 */
export function flyToVisible(
  map: LeafletMap,
  target: LatLngExpression,
  zoom: number
) {
  const { top, bottom } = mapInsets();
  const size = map.getSize();
  const visibleHeight = Math.max(size.y - top - bottom, 80);
  const wanted = point(size.x / 2, top + visibleHeight / 2);
  const centre = map
    .project(target, zoom)
    .add(size.divideBy(2).subtract(wanted));

  map.flyTo(map.unproject(centre, zoom), zoom);
}
