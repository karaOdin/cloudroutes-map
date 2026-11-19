import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import { divIcon, LatLng, latLng, Popup as LeafletPopup } from "leaflet";
import { useTranslation } from "react-i18next";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useStops } from "@cloudroutes/query/lines";
import { useTripStore } from "../hooks/use-trip-store.ts";
import { metresLabel } from "./journey-shared.ts";
import { GoGlyph } from "./journey-glyphs.tsx";

/**
 * Press and hold anywhere on the map to go there.
 *
 * The planner only knows stops, so the place is answered with the nearest
 * one — said plainly, with the walk from it — rather than pretending to route
 * to the exact spot.
 *
 * The hold is detected here rather than left to `contextmenu`: Leaflet only
 * gets that from browsers that send one on a long press, and iOS does not.
 */

const HOLD_MS = 550;
const SLOP_PX = 10;
/** Further than this from any stop, there is no honest "nearest stop". */
const MAX_STOP_M = 1500;

type Stop = { name: string; lat: number; lng: number; served: boolean };

const pinIcon = divIcon({
  className: "press-pin",
  html: '<span class="press-pin__dot"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export function PressToGo() {
  const { t } = useTranslation();
  const map = useMap();
  const plan = useTripStore((state) => state.plan);
  const [point, setPoint] = useState<LatLng | null>(null);
  const popup = useRef<LeafletPopup | null>(null);

  const { data: stops } = useStops<Stop[]>({
    queryKey: [QUERY_KEYS.STOPS],
    /* eslint-disable @typescript-eslint/no-explicit-any */
    select: (data) =>
      (data as any[])
        .map((stop) => ({
          name: String(stop.name ?? ""),
          lat: parseFloat(stop.latitude ?? stop.Lat),
          lng: parseFloat(stop.longitude ?? stop.Long),
          served: (stop.lines ?? []).length > 0,
        }))
        // Only stops a line serves: the nearest stop is offered as a trip.
        .filter(
          (stop) =>
            stop.name && stop.served && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
        ),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  useEffect(() => {
    const container = map.getContainer();
    let timer: number | null = null;
    let start: { x: number; y: number } | null = null;
    let pointers = 0;
    let firedAt = 0;

    const cancel = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = null;
      start = null;
    };

    // Only a hold on the map itself, not on a marker, button or popup.
    const onMap = (target: EventTarget | null) =>
      target instanceof Element &&
      !target.closest(".leaflet-marker-icon, .leaflet-popup, button, a, input, [role=dialog]") &&
      !!target.closest(".leaflet-container");

    const down = (event: PointerEvent) => {
      pointers += 1;

      if (pointers > 1 || !event.isPrimary || event.button > 0 || !onMap(event.target)) {
        cancel();

        return;
      }

      start = { x: event.clientX, y: event.clientY };
      timer = window.setTimeout(() => {
        timer = null;
        firedAt = Date.now();
        setPoint(map.mouseEventToLatLng(event));
        navigator.vibrate?.(30);
      }, HOLD_MS);
    };

    const move = (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) {
        cancel();
      }
    };

    const up = () => {
      pointers = Math.max(0, pointers - 1);
      cancel();
    };

    // Letting go after a hold is also a click, and Leaflet closes popups on
    // a map click — the one just opened would vanish as the finger lifts.
    const swallow = (event: MouseEvent) => {
      if (Date.now() - firedAt < 800) {
        event.stopPropagation();
        event.preventDefault();
      }
    };

    // Desktop right-click, and browsers that do send one on a hold.
    const menu = (event: MouseEvent) => {
      if (!onMap(event.target)) return;

      event.preventDefault();
      if (Date.now() - firedAt > 1000) setPoint(map.mouseEventToLatLng(event));
    };

    container.addEventListener("pointerdown", down);
    container.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    container.addEventListener("contextmenu", menu);
    container.addEventListener("click", swallow, true);
    map.on("movestart zoomstart", cancel);

    return () => {
      cancel();
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      container.removeEventListener("contextmenu", menu);
      container.removeEventListener("click", swallow, true);
      map.off("movestart zoomstart", cancel);
    };
  }, [map]);

  const nearest = useMemo(() => {
    if (!point || !stops?.length) return null;

    let best: Stop | null = null;
    let bestM = Infinity;

    for (const stop of stops) {
      const metres = point.distanceTo(latLng(stop.lat, stop.lng));

      if (metres < bestM) {
        bestM = metres;
        best = stop;
      }
    }

    return best && bestM <= MAX_STOP_M ? { stop: best, metres: bestM } : null;
  }, [point, stops]);

  // Open the popup as soon as the pin is down, and move the map so the card
  // above the pin has room under the line chips and above the bottom bar.
  // Done here rather than by the popup's own auto-pan, which measures the
  // popup before its contents have rendered and comes up short.
  useEffect(() => {
    if (!point) return;

    if (popup.current) popup.current.openOn(map);
    map.panInside(point, { paddingTopLeft: [16, 400], paddingBottomRight: [16, 130] });
  }, [point, map]);

  if (!point) return null;

  const close = () => setPoint(null);

  return (
    <>
      <Marker position={point} icon={pinIcon} interactive={false} />
      {nearest && (
        <Polyline
          positions={[point, latLng(nearest.stop.lat, nearest.stop.lng)]}
          pathOptions={{ color: "#0891b2", weight: 3, dashArray: "2 8", lineCap: "round" }}
          interactive={false}
        />
      )}
      <Popup
        ref={popup}
        position={point}
        className="press-popup"
        closeButton={false}
        autoPan={false}
        offset={[0, -10]}
        eventHandlers={{ remove: close }}
      >
        <div className="press-card">
          {nearest ? (
            <>
              <span className="press-card__label">{t("trip.nearest_stop")}</span>
              <span className="press-card__name">{nearest.stop.name}</span>
              <span className="press-card__walk">
                {t("trip.walk_from_stop", { distance: metresLabel(nearest.metres) })}
              </span>
              <button
                type="button"
                className="press-card__go"
                onClick={() => {
                  map.closePopup();
                  close();
                  void plan(nearest.stop.name);
                }}
              >
                <GoGlyph size={16} />
                <span>{t("trip.take_me_here")}</span>
              </button>
            </>
          ) : (
            <span className="press-card__none">{t("trip.no_stop_near")}</span>
          )}
        </div>
      </Popup>
    </>
  );
}
