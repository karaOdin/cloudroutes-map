import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import {
  DomEvent,
  latLng,
  latLngBounds,
  LatLng,
  LatLngExpression,
} from "leaflet";
import { useLines } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";
import { insetPadding } from "../services/map-insets.ts";
import { useFocusStore } from "../hooks/use-focus-store.ts";
import {
  FALLBACK_LINE_COLOUR,
  useLineColours,
} from "../hooks/use-line-colours.ts";

/**
 * Every line, one tap away.
 *
 * Focusing a line is the most useful thing the map does — it draws one
 * service and its vehicles and hides everything else — and it was three taps
 * down: open the drawer, expand a card, press "Show on map". The network is
 * ten to seventeen lines on these tenants, which is small enough to simply
 * offer.
 *
 * Sits under whatever the host draws above the WebView, read from the same
 * `--map-inset-top` the control stack uses. Without the host saying, that
 * falls back to an assumed 140px, so this is only ever as well placed as the
 * value the host injects.
 */
export function LinesCarousel({ hidden = false }: { hidden?: boolean }) {
  const map = useMap();
  const { t } = useTranslation();
  const { data: lines } = useLines();
  const focusedLine = useFocusStore((state) => state.focusedLine);
  const toggleFocus = useFocusStore((state) => state.toggleFocus);
  const lineColours = useLineColours();
  const strip = useRef<HTMLDivElement | null>(null);

  /**
   * Let a sideways swipe scroll the chips instead of dragging the map.
   *
   * Leaflet begins a map drag from a pointer press anywhere inside its
   * container, and this strip is inside it, so a swipe across the chips
   * panned the map by 272px and left the strip exactly where it was.
   *
   * Only the press is held back. `click` still bubbles, so React's own
   * handlers — and the chip taps — are untouched, and the browser's native
   * scrolling is driven by `touch-action`, not by propagation.
   *
   * A callback ref rather than an effect, because this component renders
   * nothing until the lines arrive and an effect with no dependencies would
   * have run against a node that did not exist yet.
   */
  const attach = useCallback((element: HTMLDivElement | null) => {
    strip.current = element;

    if (!element) return;

    const hold = (event: Event) => event.stopPropagation();

    ["pointerdown", "mousedown", "touchstart"].forEach((type) =>
      element.addEventListener(type, hold)
    );

    // Wheel and trackpad, which Leaflet would otherwise read as a zoom.
    DomEvent.disableScrollPropagation(element);
  }, []);

  // A chip chosen from the drawer, or one scrolled out of sight, has to come
  // back into view or the strip contradicts the map.
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [focusedLine]);

  if (hidden || !lines?.length) return null;

  const choose = (line: Line) => {
    const clearing = focusedLine === line.name;

    toggleFocus(line.name);

    if (clearing) return;

    const points = ((line.waypoints ?? []) as LatLngExpression[])
      .map((waypoint) => latLng(waypoint))
      .filter((point): point is LatLng => point != null);

    if (points.length > 1) {
      map.fitBounds(latLngBounds(points), insetPadding(40));
    }
  };

  return (
    <div className="line-strip" ref={attach}>
      <div
        className="line-strip__track"
        role="group"
        aria-label={t("lines_sheet.title")}
      >
        {(lines as Line[]).map((line) => {
          const colour = lineColours.get(line.name) ?? FALLBACK_LINE_COLOUR;
          const active = focusedLine === line.name;

          return (
            <button
              key={line.name}
              type="button"
              className={"line-chip" + (active ? " is-active" : "")}
              aria-pressed={active}
              onClick={() => choose(line)}
              /* Only the active chip takes the line's colour as a fill. An
                 inactive one keeps body text and lets the swatch carry the
                 colour: several of these lines are light — Line 12 is cyan —
                 and coloured label text on white was barely readable. */
              style={
                active ? { background: colour, borderColor: colour } : undefined
              }
              title={line.name}
            >
              {!active && (
                <span
                  className="line-chip__swatch"
                  style={{ background: colour }}
                  aria-hidden="true"
                />
              )}
              <span className="line-chip__name">{line.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
