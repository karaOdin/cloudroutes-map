import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Modal from "react-modal";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { latLng, latLngBounds } from "leaflet";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines, useStops } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";
import { distanceAlong } from "../services/route-path.ts";
import { orderStopsByRoad } from "../services/stop-order.ts";
import { flyToVisible, insetPadding } from "../services/map-insets.ts";
import { useFocusStore } from "../hooks/use-focus-store.ts";
import { useHighlightStore } from "../hooks/use-highlight-store.ts";
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
  name: string;
  lat: number;
  lng: number;
  lines: Array<{ name: string; colour?: string }>;
};

type SheetLine = {
  id: string;
  name: string;
  colour: string;
  stops: SheetStop[];
  length: number;
  /**
   * Whether the order below is trustworthy. The order is derived from
   * geometry, so on a line whose stops do not sit on its drawn route it is
   * nonsense, and saying nothing would be worse than saying so.
   */
  ordered: boolean;
};

/**
 * Does the derived order hold together?
 *
 * If the stops really are in travelling order, the straight-line gap between
 * neighbours is about the same as the distance along the route between them.
 * Where a stop has been placed out of order, that ratio blows up. Measured
 * across four tenants, 21 of 33 lines score zero bad pairs and the rest tail
 * off to 43%, so a tenth is a clear separator — it rejects exactly the lines
 * whose stops sit kilometres off their own route.
 */
function orderingHolds(stops: SheetStop[]): boolean {
  let pairs = 0;
  let bad = 0;

  for (let i = 1; i < stops.length; i += 1) {
    const along = stops[i].along - stops[i - 1].along;

    // Stops on top of each other say nothing either way.
    if (!Number.isFinite(along) || along < 5) continue;

    const direct = latLng(stops[i - 1].lat, stops[i - 1].lng).distanceTo(
      latLng(stops[i].lat, stops[i].lng)
    );

    pairs += 1;

    if (direct / along > 2) bad += 1;
  }

  return pairs === 0 || bad / pairs <= 0.1;
}

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

    const ordered = orderingHolds(stops);

    return {
      id: line.name,
      name: line.name,
      colour: (line as any).color || "#0c4a6e",
      // An order we cannot vouch for is not shown as one: the stops stay in
      // the order the API gave them, which is at least not invented.
      stops: ordered ? stops : raw
        .map((stop) => ({
          id: stop.id,
          name: stop.name,
          lat: parseFloat(stop.Lat ?? stop.latitude),
          lng: parseFloat(stop.Long ?? stop.longitude),
          along: Number.POSITIVE_INFINITY,
        }))
        .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)),
      length,
      ordered,
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Marks the part of a name that matched, so a result explains itself. */
function Marked({ text, needle }: { text: string; needle: string }) {
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;

  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark className="match">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

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
  const highlight = useHighlightStore((state) => state.highlight);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeStop, setActiveStop] = useState<number | null>(null);
  const lineColours = useLineColours();

  const { data: lines } = useLines({ queryKey: [QUERY_KEYS.LINES] });
  const { data: stops } = useStops<StopLines[]>({
    queryKey: [QUERY_KEYS.STOPS],
    /* eslint-disable @typescript-eslint/no-explicit-any */
    select: (data) =>
      (data as any[]).map((stop) => ({
        id: stop.id,
        name: stop.name,
        lat: parseFloat(stop.latitude ?? stop.Lat),
        lng: parseFloat(stop.longitude ?? stop.Long),
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

  const needle = query.trim().toLowerCase();

  // Searching used to filter the line list, which answered a question nobody
  // asked: typing a stop's name returned line cards with no sign of which stop
  // matched or why. Stops are what people search for, so they are results in
  // their own right.
  const results = useMemo(() => {
    if (!needle) return null;

    return {
      lines: sheetLines.filter((line) =>
        line.name.toLowerCase().includes(needle)
      ),
      stops: (stops ?? [])
        .filter(
          (stop) =>
            stop.name?.toLowerCase().includes(needle) &&
            Number.isFinite(stop.lat) &&
            Number.isFinite(stop.lng)
        )
        .slice(0, 40),
    };
  }, [needle, sheetLines, stops]);

  const visible = sheetLines;

  const showOnMap = (line: SheetLine) => {
    const points = line.stops.map((stop) => latLng(stop.lat, stop.lng));

    setFocus(line.name);

    if (points.length > 1) {
      map.fitBounds(latLngBounds(points), insetPadding(40));
    }

    onClose();
  };

  const goToStop = (stop: SheetStop) => {
    // Mark it before flying: arriving at a screenful of identical dots with no
    // indication of which one was asked for is the whole problem here.
    highlight(stop.id);

    // Lands in the middle of what can be seen, which is neither the middle of
    // the map nor a fixed offset: the drawer covers the bottom and the host's
    // search bar covers the top.
    flyToVisible(map, [stop.lat, stop.lng], Math.max(map.getZoom(), 16));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="ReactModal__Content lines-drawer"
      overlayClassName="ReactModal__Overlay lines-drawer__overlay"
      closeTimeoutMS={300}
      contentLabel={t("lines_sheet.title")}
      /* A drawer, not a modal: the map behind it is the thing being talked
         about, so it stays visible and usable while this is open. */
      shouldCloseOnOverlayClick={false}
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
          {results && results.stops.length === 0 && results.lines.length === 0 && (
            <p className="lines-sheet__empty">{t("lines_sheet.none")}</p>
          )}

          {results && results.stops.length > 0 && (
            <>
              <p className="lines-sheet__group">
                {t("lines_sheet.stops_found", { count: results.stops.length })}
              </p>
              <ul className="result-list">
                {results.stops.map((stop) => (
                  <li key={stop.id}>
                    <button
                      type="button"
                      className="result"
                      onClick={() => {
                        setActiveStop(stop.id);
                        goToStop({
                          id: stop.id,
                          name: stop.name,
                          lat: stop.lat,
                          lng: stop.lng,
                          along: Number.POSITIVE_INFINITY,
                        });
                      }}
                    >
                      <span className="result__pin" aria-hidden="true">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                          <path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
                          <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
                        </svg>
                      </span>
                      <span className="result__text">
                        <span className="result__name">
                          <Marked text={stop.name} needle={needle} />
                        </span>
                        {stop.lines.length > 0 && (
                          <span className="stop-list__changes">
                            {stop.lines.slice(0, 5).map((served) => (
                              <span
                                key={served.name}
                                className="stop-list__chip"
                                style={{
                                  background:
                                    served.colour ??
                                    lineColours.get(served.name) ??
                                    FALLBACK_LINE_COLOUR,
                                }}
                              >
                                {served.name}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {results && results.lines.length > 0 && (
            <p className="lines-sheet__group">
              {t("lines_sheet.lines_found", { count: results.lines.length })}
            </p>
          )}

          {(results ? results.lines : visible).map((line) => {
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
                    {line.ordered && line.stops.length > 1 && (
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
                  <LineDetail
                    line={line}
                    servedBy={servedBy}
                    onShowOnMap={() => showOnMap(line)}
                    activeStop={activeStop}
                    onGoToStop={(stop) => {
                      setActiveStop(stop.id);
                      goToStop(stop);
                    }}
                  />
                )}
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/**
 * The stops of one line.
 *
 * Split out so the road-order lookup is mounted — and requested — only for the
 * line actually open, and only when the geometry could not answer.
 */
function LineDetail({
  line,
  servedBy,
  activeStop,
  onShowOnMap,
  onGoToStop,
}: {
  line: SheetLine;
  servedBy: Map<number, Array<{ name: string; colour: string }>>;
  activeStop: number | null;
  onShowOnMap: () => void;
  onGoToStop: (stop: SheetStop) => void;
}) {
  const { t } = useTranslation();
  // Which end the line is read from. Nothing in the data says which direction
  // is "outbound", so the rider decides — and the one they want is as likely
  // to be either.
  const [reversed, setReversed] = useState(false);

  const { data: byRoad, isFetching } = useQuery({
    queryKey: ["stop-order", line.id],
    queryFn: () => orderStopsByRoad(line.stops),
    // Only where projecting onto the drawn route failed. Where it held, that
    // route is what the operator says the bus does, and shortest is not the
    // same as correct — a real line is allowed to double back.
    enabled: !line.ordered && line.stops.length >= 3,
    staleTime: Infinity,
    retry: false,
  });

  const stops = useMemo(() => {
    const resolved =
      line.ordered || !byRoad
        ? line.stops
        : byRoad.map((entry) => ({ ...entry.stop, along: entry.along }));

    if (!reversed) return resolved;

    // Distances are measured from the start, so reading from the other end
    // means measuring from it too, or every number would be wrong.
    const total = resolved[resolved.length - 1]?.along ?? 0;

    return [...resolved].reverse().map((stop) => ({
      ...stop,
      along: Number.isFinite(stop.along) ? total - stop.along : stop.along,
    }));
  }, [line.ordered, line.stops, byRoad, reversed]);

  // A distance is only shown where it means something: along the drawn route,
  // or along the road the router found. Never against an order we are holding
  // only because nothing better was available.
  const showDistances = line.ordered || !!byRoad;

  return (
    <div className="line-card__detail">
      <div className="line-card__actions">
        <button type="button" className="line-card__show" onClick={onShowOnMap}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.9" />
        </svg>
          {t("lines_sheet.show_on_map")}
        </button>

        <button
          type="button"
          className="line-card__reverse"
          onClick={() => setReversed((was) => !was)}
          aria-pressed={reversed}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {/* Two arrows pointing opposite ways: the list can be read from
                either end, which is what the button does. */}
            <path
              d="M8 20V4m0 0L5 7m3-3 3 3M16 4v16m0 0 3-3m-3 3-3-3"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("lines_sheet.reverse")}
        </button>
      </div>

      {isFetching && (
        <p className="line-card__working">{t("lines_sheet.working_out_order")}</p>
      )}

      <ol
        className="stop-list"
        style={{ "--line-colour": line.colour } as React.CSSProperties}
      >
        {stops.map((stop, index) => {
          const others = (servedBy.get(stop.id) ?? []).filter(
            (served) => served.name !== line.name
          );
          // The ends of a line are landmarks: they are how a rider decides
          // whether this is the direction they want, so they are drawn as
          // stops of a different kind.
          const terminus = index === 0 || index === stops.length - 1;

          return (
            <li key={stop.id} className="stop-list__item">
              <button
                type="button"
                className={
                  "stop-list__row" +
                  (activeStop === stop.id ? " is-active" : "")
                }
                aria-current={activeStop === stop.id ? "true" : undefined}
                onClick={() => onGoToStop(stop)}
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
                {showDistances && Number.isFinite(stop.along) && (
                  <span className="stop-list__along">{km(stop.along)}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
