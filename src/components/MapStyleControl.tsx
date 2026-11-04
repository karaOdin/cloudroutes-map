import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { LEAFLET_PROVIDERS } from "../constants";
import { LeafletProvider } from "../types.ts";
import { useGlobalStore } from "../store";

/** Zoom the thumbnails are rendered at: enough context to tell styles apart. */
const PREVIEW_ZOOM = 13;

/** Slippy-map tile containing a coordinate, the standard Web Mercator formula. */
function tileAt(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;

  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    ),
  };
}

function tileUrl(provider: LeafletProvider, z: number, x: number, y: number) {
  return provider.url
    .replace("{s}", "a")
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{r}", "");
}

/**
 * Basemap picker, as a map control rather than a field buried in the filters
 * sheet — the same place a rider expects to find it on any other map app.
 *
 * Each option previews the style over the area actually on screen, because a
 * row of names tells you nothing about what you are choosing between.
 */
export function MapStyleControl() {
  const map = useMap();
  const { t } = useTranslation();
  const provider = useGlobalStore((state) => state.leafletProvider);
  const setProvider = useGlobalStore((state) => state.setLeafletProvider);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const centre = map.getCenter();
  const tile = tileAt(centre.lat, centre.lng, PREVIEW_ZOOM);

  // Close on anything that means "I am done here": a tap elsewhere, Escape, or
  // moving the map. Leaflet swallows document clicks over the map itself, so
  // the map's own click has to be listened for separately.
  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    map.on("movestart", close);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      map.off("movestart", close);
    };
  }, [open, map]);

  return (
    <div className="map-style" ref={panelRef}>
      {open && (
        <div
          className="map-style__panel"
          role="listbox"
          aria-label={t("map_style.title")}
        >
          <p className="map-style__heading">{t("map_style.title")}</p>
          <div className="map-style__options">
            {LEAFLET_PROVIDERS.map((option) => {
              const active = option.url === provider.url;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="map-style__option"
                  onClick={() => {
                    setProvider(option);
                    setOpen(false);
                  }}
                >
                  <span className="map-style__swatch">
                    <img
                      src={tileUrl(option, PREVIEW_ZOOM, tile.x, tile.y)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </span>
                  <span className="map-style__name">{t(option.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        className="control-button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label={t("map_style.title")}
        aria-haspopup="listbox"
        aria-expanded={open}
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
            d="M12 3.5 3 8l9 4.5L21 8l-9-4.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m3.5 12.5 8.5 4.2 8.5-4.2M3.5 16.6l8.5 4.2 8.5-4.2"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
