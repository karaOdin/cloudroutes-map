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
import {
  FALLBACK_LINE_COLOUR,
  useLineColours,
} from "../hooks/use-line-colours.ts";

type SheetStop = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  /** Metres from the start of the line, used to order and to label. */
  along: number;
};

type StopLines = {
  id: number;
  lines: Array<{ name: string; colour?: string }>;
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
  const lineColours = useLineColours();

  const { data: lines } = useLines({ queryKey: [QUERY_KEYS.LINES] });
  const { data: stops } = useStops<StopLines[]>({
    queryKey: [QUERY_KEYS.STOPS],
    /* eslint-disable @typescript-eslint/no-explicit-any */
    select: (data) =>
      (data as any[]).map((stop) => ({
        id: stop.id,
        lines: (stop.lines ?? []).map((line: any) => ({
          name: line.name,
          colour: line.color as string | undefined,
        })),
      })),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  const sheetLines = useMemo(
    () => (lines ? toSheetLines(lines as Line[]) : []),
    [lines]
  );

  /** Which lines serve each stop, so an interchange can show what it connects. */
  const servedBy = useMemo(() => {
    const byStop = new Map<number, Array<{ name: string; colour: string }>>();

    (stops ?? []).forEach((stop) =>
      byStop.set(
        stop.id,
        (stop.lines ?? []).map((line) => ({
          name: line.name,
          colour:
            line.colour ?? lineColours.get(line.name) ?? FALLBACK_LINE_COLOUR,
        }))
      )
    );

    return byStop;
  }, [stops, lineColours]);

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
                    {line.stops.length > 1 && (
                      <span className="line-card__termini">
                        <span className="line-card__terminus">
                          {line.stops[0].name}
                        </span>
                        <span className="line-card__arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="line-card__terminus">
                          {line.stops[line.stops.length - 1].name}
                        </span>
                      </span>
                    )}
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
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                        <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
                      </svg>
                      {t("lines_sheet.show_on_map")}
                    </button>

                    <ol
                      className="stop-list"
                      style={{ "--line-colour": line.colour } as React.CSSProperties}
                    >
                      {line.stops.map((stop, index) => {
                        const others = (servedBy.get(stop.id) ?? []).filter(
                          (served) => served.name !== line.name
                        );
                        // The ends of a line are landmarks: they are how a
                        // rider decides whether this is the direction they
                        // want, so they are drawn as stops of a different kind.
                        const terminus =
                          index === 0 || index === line.stops.length - 1;

                        return (
                          <li key={stop.id} className="stop-list__item">
                            <button
                              type="button"
                              className="stop-list__row"
                              onClick={() => goToStop(stop)}
                            >
                              <span
                                className={
                                  "stop-list__dot" +
                                  (terminus ? " is-terminus" : "") +
                                  (others.length > 0 ? " is-interchange" : "")
                                }
                                aria-hidden="true"
                              />
                              <span className="stop-list__text">
                                <span className="stop-list__name">{stop.name}</span>
                                {others.length > 0 && (
                                  <span className="stop-list__changes">
                                    {others.slice(0, 4).map((served) => (
                                      <span
                                        key={served.name}
                                        className="stop-list__chip"
                                        style={{ background: served.colour }}
                                        title={served.name}
                                      >
                                        {served.name}
                                      </span>
                                    ))}
                                    {others.length > 4 && (
                                      <span className="stop-list__chip stop-list__chip--more">
                                        +{others.length - 4}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </span>
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
