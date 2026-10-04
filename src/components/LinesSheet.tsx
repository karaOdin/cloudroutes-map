import { useMemo, useState } from "react";
import Modal from "react-modal";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { latLng, latLngBounds } from "leaflet";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines, useStops } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";
import { distanceAlong } from "../services/route-path.ts";
import { useFocusStore } from "../hooks/use-focus-store.ts";

type SheetStop = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  /** Metres from the start of the line, used to order and to label. */
  along: number;
};

type SheetLine = {
  id: string;
  name: string;
  colour: string;
  stops: SheetStop[];
  length: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSheetLines(lines: Line[]): SheetLine[] {
  return lines.map((line) => {
    const path = ((line.waypoints ?? []) as [number, number][])
      .filter((w) => Array.isArray(w) && w.length >= 2)
      .map((w) => latLng(+w[0], +w[1]));

    const raw = ((line as any).bus_stops ?? []) as any[];

    const stops: SheetStop[] = raw
      .map((stop) => {
        const lat = parseFloat(stop.Lat ?? stop.latitude);
        const lng = parseFloat(stop.Long ?? stop.longitude);

        return {
          id: stop.id,
          name: stop.name,
          lat,
          lng,
          // The API gives a line's stops as an unordered set — the pivot holds
          // only the two ids. The order riders travel in is recovered by
          // projecting each stop onto the route.
          along:
            path.length > 1 && Number.isFinite(lat) && Number.isFinite(lng)
              ? distanceAlong(path, latLng(lat, lng))
              : Number.POSITIVE_INFINITY,
        };
      })
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
      .sort((a, b) => a.along - b.along);

    const length = path.reduce(
      (total, point, index) =>
        index === 0 ? 0 : total + path[index - 1].distanceTo(point),
      0
    );

    return {
      id: line.name,
      name: line.name,
      colour: (line as any).color || "#0c4a6e",
      stops,
      length,
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;

/**
 * The network as a list: every line, and every line's stops in the order they
 * are travelled.
 *
 * A map answers "what is near me"; it is a poor way to answer "where does this
 * line go". Both questions are worth answering, and the second one has had no
 * surface at all.
 */
export function LinesSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const map = useMap();
  const setFocus = useFocusStore((state) => state.toggleFocus);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: lines } = useLines({ queryKey: [QUERY_KEYS.LINES] });
  const { data: stops } = useStops<Array<{ id: number; lines?: unknown[] }>>({
    queryKey: [QUERY_KEYS.STOPS],
    select: (data) =>
      (data as unknown as Array<{ id: number; lines?: unknown[] }>).map(
        (stop) => ({ id: stop.id, lines: stop.lines })
      ),
  });

  const sheetLines = useMemo(
    () => (lines ? toSheetLines(lines as Line[]) : []),
    [lines]
  );

  /** How many lines serve a stop, for the interchange marker. */
  const servedBy = useMemo(() => {
    const counts = new Map<number, number>();

    (stops ?? []).forEach((stop) => {
      counts.set(stop.id, stop.lines?.length ?? 0);
    });

    return counts;
  }, [stops]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return sheetLines;

    return sheetLines.filter(
      (line) =>
        line.name.toLowerCase().includes(needle) ||
        line.stops.some((stop) => stop.name.toLowerCase().includes(needle))
    );
  }, [sheetLines, query]);

  const showOnMap = (line: SheetLine) => {
    const points = line.stops.map((stop) => latLng(stop.lat, stop.lng));

    setFocus(line.name);

    if (points.length > 1) {
      map.fitBounds(latLngBounds(points), { padding: [40, 40] });
    }

    onClose();
  };

  const goToStop = (stop: SheetStop) => {
    map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom(), 16));
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="ReactModal__Content"
      overlayClassName="ReactModal__Overlay"
      closeTimeoutMS={300}
      contentLabel={t("lines_sheet.title")}
    >
      <div className={i18n.language === "ar" ? "rtl" : ""}>
        <header className="lines-sheet__header">
          <div className="bus-stop-modal-drag" />
          <div className="lines-sheet__title-row">
            <h2 className="lines-sheet__title">{t("lines_sheet.title")}</h2>
            <button
              type="button"
              className="bus-stop-modal-close"
              onClick={onClose}
              aria-label={t("filters.close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <input
            className="lines-sheet__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("lines_sheet.search")}
            aria-label={t("lines_sheet.search")}
          />
        </header>

        <div className="lines-sheet__body">
          {visible.length === 0 && (
            <p className="lines-sheet__empty">{t("lines_sheet.none")}</p>
          )}

          {visible.map((line) => {
            const open = expanded === line.id;

            return (
              <section key={line.id} className="line-card">
                <button
                  type="button"
                  className="line-card__head"
                  onClick={() => setExpanded(open ? null : line.id)}
                  aria-expanded={open}
                >
                  <span
                    className="line-card__swatch"
                    style={{ background: line.colour }}
                    aria-hidden="true"
                  />
                  <span className="line-card__text">
                    <span className="line-card__name">{line.name}</span>
                    <span className="line-card__meta">
                      {line.stops.length > 0
                        ? t("lines_sheet.stops_count", { count: line.stops.length })
                        : t("lines_sheet.no_stops")}
                      {line.length > 0 && ` · ${km(line.length)}`}
                    </span>
                  </span>
                  <span
                    className={`line-card__chevron${open ? " is-open" : ""}`}
                    aria-hidden="true"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                {open && (
                  <div className="line-card__detail">
                    <button
                      type="button"
                      className="line-card__show"
                      onClick={() => showOnMap(line)}
                    >
                      {t("lines_sheet.show_on_map")}
                    </button>

                    <ol
                      className="stop-list"
                      style={{ "--line-colour": line.colour } as React.CSSProperties}
                    >
                      {line.stops.map((stop) => {
                        const interchange = (servedBy.get(stop.id) ?? 0) > 1;

                        return (
                          <li key={stop.id} className="stop-list__item">
                            <button
                              type="button"
                              className="stop-list__row"
                              onClick={() => goToStop(stop)}
                            >
                              <span
                                className={`stop-list__dot${interchange ? " is-interchange" : ""}`}
                                aria-hidden="true"
                              />
                              <span className="stop-list__name">{stop.name}</span>
                              {Number.isFinite(stop.along) && (
                                <span className="stop-list__along">{km(stop.along)}</span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
