import L from "leaflet";
import { darkenColor } from "./helpers.ts";

/**
 * Map marker icons.
 *
 * All three are div icons so they stay crisp at any DPI and can be themed
 * from App.css. Geometry (iconSize / iconAnchor) is unchanged from the
 * original raster icons — only the visual treatment differs.
 */

const BUS_STOP_GLYPH = `
  <svg width="15" height="15" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 3V12C20 12.71 19.62 13.36 19 13.72V15.25C19 15.66 18.66 16 18.25 16H17.75C17.34 16 17 15.66 17 15.25V14H10V15.25C10 15.66 9.66 16 9.25 16H8.75C8.34 16 8 15.66 8 15.25V13.72C7.39 13.36 7 12.71 7 12V3C7 0 10 0 13.5 0C17 0 20 0 20 3ZM11 11C11 10.45 10.55 10 10 10C9.45 10 9 10.45 9 11C9 11.55 9.45 12 10 12C10.55 12 11 11.55 11 11ZM18 11C18 10.45 17.55 10 17 10C16.45 10 16 10.45 16 11C16 11.55 16.45 12 17 12C17.55 12 18 11.55 18 11ZM18 3H9V7H18V3ZM5 5.5C4.97 4.12 3.83 3 2.45 3.05C1.07 3.08 -0.0299996 4.22 4.40981e-07 5.6C0.0300004 6.77 0.86 7.77 2 8V16H3V8C4.18 7.76 5 6.71 5 5.5Z" fill="currentColor"/>
  </svg>
`;

/** Static bus stop. Anchored at its centre, popup opens clear of the tile. */
export const busStopIcon = L.divIcon({
  className: "bus-stop-marker",
  html: `<div class="bus-stop-marker__tile">${BUS_STOP_GLYPH}</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

/** Falls back to the brand ink when a line has no usable colour. */
const STOP_FALLBACK = "#0c4a6e";

/** Colours arrive from the tenant API, so only accept a literal hex value. */
function safeColor(color: string | undefined): string {
  return color && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
    ? color
    : STOP_FALLBACK;
}

/**
 * Bus stops, coloured by the line they serve.
 *
 *   - ordinary stop -> a small disc in its line's colour, ringed in a darker
 *     shade of the same colour and haloed in white. It reads as a bead on
 *     that route rather than as a separate grey layer on top of the map.
 *   - interchange (2+ lines) -> a white disc with a dark ring. Neutral on
 *     purpose: it belongs to several lines, so it belongs to none of them.
 *
 * The rings are box-shadows, not borders, so they cost no layout size — the
 * marker stays as small as its `iconSize` says while still reading clearly
 * over both pale tiles and dark route lines.
 *
 * Icons are cached per colour; there are only a handful of lines.
 */
const stopIconCache = new Map<string, L.DivIcon>();

export function busStopIconFor(lines: Array<{ color: string }>): L.DivIcon {
  const isInterchange = lines.length > 1;
  const color = safeColor(lines[0]?.color);
  const key = isInterchange ? "interchange" : color;

  const cached = stopIconCache.get(key);
  if (cached) return cached;

  const size = isInterchange ? 11 : 8;
  const style = isInterchange
    ? ""
    : ` style="--stop-color: ${color}; --stop-ring: ${darkenColor(color, 0.5)};"`;

  const icon = L.divIcon({
    className: "bus-stop-marker",
    html: `<div class="bus-stop-marker__dot${
      isInterchange ? " bus-stop-marker__dot--interchange" : ""
    }"${style}></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 5],
  });

  stopIconCache.set(key, icon);
  return icon;
}

/**
 * Below this zoom only interchanges are drawn. The map opens at z15, so the
 * default view is unaffected; zooming out to see the whole network no longer
 * buries it under every minor stop at once.
 */
export const MINOR_STOP_MIN_ZOOM = 15;

/**
 * Bus icon geometry, taken from the SVG below: a 37x46 canvas whose vehicle
 * disc is centred at (18.5, 27.5) with the heading arrow above it.
 */
const BUS_ICON_W = 37;
const BUS_ICON_H = 46;
const BUS_DISC_CX = 18.5;
const BUS_DISC_CY = 27.5;

/**
 * Live vehicle.
 *
 * Neither the heading nor the vehicle name is baked in here — both would
 * defeat the cache, and the name would need escaping. The label's text comes
 * from a `--bus-label` custom property read by a CSS `content`, so the markup
 * stays identical for every vehicle.
 *
 * Heading is deliberately NOT baked in here. Returning a fresh icon per course
 * made react-leaflet call `setIcon()` on every update, which replaces the
 * marker's DOM element — killing any in-flight CSS transition and making the
 * vehicle teleport. The icon is now cached and stationary, and BusMarker sets
 * the `--angle` custom property on the live element instead, so both the slide
 * and the turn animate.
 *
 * A `stale` vehicle (no fix for a few minutes) is drawn grey and semi
 * transparent so it is visibly a last known position rather than a live one.
 */
const busIconCache = new Map<boolean, L.DivIcon>();

export function busIcon(stale: boolean = false): L.DivIcon {
  const cached = busIconCache.get(stale);

  if (cached) return cached;

  const icon = L.divIcon({
    className: "bus-icon",
    html: `<div class="bus-icon-container${stale ? " bus-icon-container--stale" : ""}">
          <div class="bus-pulse" aria-hidden="true"></div>
          <div class="bus-label" aria-hidden="true"></div>
          <div class="bus-direction">
            <svg width="37" height="46" viewBox="0 0 37 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="18.5" cy="27.5" r="17.5" fill="white"/>
              <circle cx="18.5" cy="27.5" r="15.5" fill="white" stroke="currentColor" stroke-width="2"/>
              <path d="M18 17C23.25 17 26.75 18.375 26.75 20.125V20.75V22C27.4414 22 28 22.5586 28 23.25V25.75C28 26.4414 27.4414 27 26.75 27V33.25C26.75 33.9414 26.1914 34.5 25.5 34.5V35.75C25.5 36.4414 24.9414 37 24.25 37H23C22.3086 37 21.75 36.4414 21.75 35.75V34.5H14.25V35.75C14.25 36.4414 13.6914 37 13 37H11.75C11.0586 37 10.5 36.4414 10.5 35.75V34.5C9.80859 34.5 9.25 33.9414 9.25 33.25V27C8.55859 27 8 26.4414 8 25.75V23.25C8 22.5586 8.55859 22 9.25 22V20.75V20.125C9.25 18.375 12.75 17 18 17ZM11.75 23.25V27C11.75 27.6914 12.3086 28.25 13 28.25H17.375V22H13C12.3086 22 11.75 22.5586 11.75 23.25ZM18.625 28.25H23C23.6914 28.25 24.25 27.6914 24.25 27V23.25C24.25 22.5586 23.6914 22 23 22H18.625V28.25ZM12.375 32.625C12.7065 32.625 13.0245 32.4933 13.2589 32.2589C13.4933 32.0245 13.625 31.7065 13.625 31.375C13.625 31.0435 13.4933 30.7255 13.2589 30.4911C13.0245 30.2567 12.7065 30.125 12.375 30.125C12.0435 30.125 11.7255 30.2567 11.4911 30.4911C11.2567 30.7255 11.125 31.0435 11.125 31.375C11.125 31.7065 11.2567 32.0245 11.4911 32.2589C11.7255 32.4933 12.0435 32.625 12.375 32.625ZM23.625 32.625C23.9565 32.625 24.2745 32.4933 24.5089 32.2589C24.7433 32.0245 24.875 31.7065 24.875 31.375C24.875 31.0435 24.7433 30.7255 24.5089 30.4911C24.2745 30.2567 23.9565 30.125 23.625 30.125C23.2935 30.125 22.9755 30.2567 22.7411 30.4911C22.5067 30.7255 22.375 31.0435 22.375 31.375C22.375 31.7065 22.5067 32.0245 22.7411 32.2589C22.9755 32.4933 23.2935 32.625 23.625 32.625ZM21.75 20.125C21.75 19.7812 21.4688 19.5 21.125 19.5H14.875C14.5312 19.5 14.25 19.7812 14.25 20.125C14.25 20.4688 14.5312 20.75 14.875 20.75H21.125C21.4688 20.75 21.75 20.4688 21.75 20.125Z" fill="currentColor"/>
              <path d="M18.5 4L16 8L18.5 7.33333L21 8L18.5 4Z" fill="white" stroke="white" stroke-width="6.5" stroke-linejoin="round"/>
              <path d="M18.5 4L16 8L18.5 7.33333L21 8L18.5 4Z" fill="currentColor" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
            </svg>
          </div>
         </div>
      `,
    iconSize: new L.Point(BUS_ICON_W, BUS_ICON_H),
    // The vehicle's coordinate is the centre of the disc, not a point below
    // the icon. The previous anchor of [w/2, h * 1.2] placed the coordinate
    // 27.7px *under* the artwork, which drew every bus that many pixels north
    // of where it actually was — ~107 m at the default zoom 15, shrinking as
    // you zoom in, which is why the buses appeared to sit on houses and then
    // drift back towards the road.
    iconAnchor: [BUS_DISC_CX, BUS_DISC_CY],
    // Clears the top of the artwork so the popup does not cover the vehicle.
    popupAnchor: [0, -(BUS_DISC_CY + 6)],
  });

  busIconCache.set(stale, icon);

  return icon;
}

/** The user's own position, when the host app supplies one. */
export const userIcon = () => {
  return L.divIcon({
    className: "user-location-icon",
    html: `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="24" cy="24" r="11" fill="url(#userGradient)" opacity="0.18"/>
        <circle cx="24" cy="24" r="9" fill="white"/>
        <circle cx="24" cy="24" r="7" fill="url(#userGradient)"/>
        <path d="M30.0641 31.7983C30.6395 31.9901 31.1749 31.4184 30.9457 30.8567L24.6573 15.4417C24.417 14.8528 23.583 14.8528 23.3427 15.4417L17.0543 30.8567C16.8251 31.4184 17.3605 31.9901 17.936 31.7983L23.7755 29.8517C23.9212 29.8032 24.0788 29.8032 24.2245 29.8517L30.0641 31.7983Z" fill="white"/>

        <circle cx="24" cy="24" r="12" fill="none" stroke="url(#userGradient)" stroke-width="2" opacity="0.6">
          <animate attributeName="r" from="12" to="23" dur="1.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" from="0.6" to="0" dur="1.8s" repeatCount="indefinite"/>
        </circle>

        <defs>
          <linearGradient id="userGradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#10b981"/>
            <stop offset="100%" stop-color="#06b6d4"/>
          </linearGradient>
        </defs>
      </svg>
    `,
    iconSize: new L.Point(48, 48),
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
};
