import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import { latLng } from "leaflet";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useStops } from "@cloudroutes/query/lines";
import { useTripStore } from "../hooks/use-trip-store.ts";
import { useLocationStore } from "../hooks/use-location-store.ts";
import { useLineColours } from "../hooks/use-line-colours.ts";
import { recentPlaces } from "../services/plan-trip.ts";
import { metresLabel, usePublishHeight } from "./journey-shared.ts";
import { BusGlyph, CloseGlyph, FlagGlyph, GoGlyph } from "./journey-glyphs.tsx";
import { Marked } from "./Marked.tsx";

/**
 * The way into a trip, where a rider will see it.
 *
 * Trips could only be started from the host's own search, so on the map
 * itself there was nothing to say the feature existed. This puts a "Where
 * to?" bar along the bottom — where a thumb is, and where navigation apps
 * have taught people to look — opening a sheet to pick a stop, with recent
 * places and the stops nearby ready before anything is typed. The first time,
 * a short note points at it.
 */

type PlaceStop = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  lines: string[];
};

const HINT_KEY = "cr.hint.where-to";

/**
 * Fold the spellings a rider is likely to mix up, so "ain" finds "Aïn" and
 * a plain alef finds a hamza one.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function markHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* Storage blocked; the hint simply shows again next time. */
  }
}

export function WhereTo() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const bar = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(() => !hintSeen());
  const planning = useTripStore((state) => state.planning);
  const problem = useTripStore((state) => state.problem);
  const problemDetail = useTripStore((state) => state.problemDetail);
  const dismissProblem = useTripStore((state) => state.dismissProblem);
  const clear = useTripStore((state) => state.clear);

  usePublishHeight(bar);

  const openSheet = () => {
    setOpen(true);
    if (hint) {
      setHint(false);
      markHintSeen();
    }
  };

  return (
    <>
      <div
        ref={bar}
        className="where-to"
        dir={isRTL ? "rtl" : "ltr"}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {hint && !planning && (
          <div className="where-to__hint" role="note">
            <span className="where-to__hint-badge">{t("trip.new")}</span>
            <span className="where-to__hint-text">{t("trip.hint")}</span>
            <button
              type="button"
              className="where-to__hint-close"
              onClick={() => {
                setHint(false);
                markHintSeen();
              }}
              aria-label={t("filters.close")}
            >
              <CloseGlyph size={14} />
            </button>
          </div>
        )}

        {problem && (
          <div className="where-to__problem" role="alert">
            <span>
              {t(`trip.problem_${problem}`, {
                ...problemDetail,
                distance:
                  typeof problemDetail?.metres === "number"
                    ? metresLabel(problemDetail.metres)
                    : "",
              })}
            </span>
            <button type="button" onClick={dismissProblem} aria-label={t("filters.close")}>
              <CloseGlyph size={14} />
            </button>
          </div>
        )}

        {planning ? (
          <div className="where-to__bar is-planning" role="status" aria-live="polite">
            <span className="where-to__spinner" aria-hidden="true" />
            <span className="where-to__text">
              <span className="where-to__title">{t("trip.planning")}</span>
              <span className="where-to__sub">{planning}</span>
            </span>
            <button
              type="button"
              className="where-to__cancel"
              onClick={clear}
              aria-label={t("trip.cancel")}
            >
              <CloseGlyph size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="where-to__bar"
            onClick={openSheet}
            aria-haspopup="dialog"
            aria-expanded={open}
          >
            <span className="where-to__icon" aria-hidden="true">
              <SearchGlyph />
            </span>
            <span className="where-to__text">
              <span className="where-to__title">{t("trip.where_to")}</span>
              <span className="where-to__sub">{t("trip.where_to_sub")}</span>
            </span>
            <span className="where-to__go" aria-hidden="true">
              <GoGlyph size={20} />
            </span>
          </button>
        )}
      </div>

      <TripSheet isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

function TripSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const here = useLocationStore((state) => state.here);
  const plan = useTripStore((state) => state.plan);
  const colours = useLineColours();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState<string | null>(null);
  const [picking, setPicking] = useState<"to" | "from">("to");
  const [recent, setRecent] = useState<string[]>([]);

  const { data: stops } = useStops<PlaceStop[]>({
    queryKey: [QUERY_KEYS.STOPS],
    /* eslint-disable @typescript-eslint/no-explicit-any */
    select: (data) =>
      (data as any[])
        .map((stop) => ({
          id: stop.id,
          name: String(stop.name ?? ""),
          lat: parseFloat(stop.latitude ?? stop.Lat),
          lng: parseFloat(stop.longitude ?? stop.Long),
          lines: (stop.lines ?? []).map((line: any) => String(line.name)),
        }))
        // A stop no line serves is entered but not in service — tenants
        // leave from 3 to 36 of them — and a trip to it can only fail.
        .filter(
          (stop) =>
            stop.name &&
            stop.lines.length > 0 &&
            Number.isFinite(stop.lat) &&
            Number.isFinite(stop.lng)
        ),
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  useEffect(() => {
    if (!isOpen) return;

    setRecent(recentPlaces());
    setQuery("");
    setPicking("to");
  }, [isOpen]);

  const byName = useMemo(
    () => new Map((stops ?? []).map((stop) => [stop.name, stop])),
    [stops]
  );

  const needle = fold(query);

  const matches = useMemo(() => {
    if (!needle) return [];

    const seen = new Set<string>();

    return (stops ?? [])
      .filter((stop) => {
        if (seen.has(stop.name) || !fold(stop.name).includes(needle)) return false;
        seen.add(stop.name);

        return true;
      })
      .sort((a, b) => fold(a.name).indexOf(needle) - fold(b.name).indexOf(needle))
      .slice(0, 30);
  }, [stops, needle]);

  const nearby = useMemo(() => {
    if (!here || !stops) return [];

    const at = latLng(here[0], here[1]);
    const seen = new Set<string>();

    return stops
      .map((stop) => ({ stop, metres: at.distanceTo(latLng(stop.lat, stop.lng)) }))
      .sort((a, b) => a.metres - b.metres)
      .filter(({ stop, metres }) => {
        if (metres > 3000 || seen.has(stop.name)) return false;
        seen.add(stop.name);

        return true;
      })
      .slice(0, 5);
  }, [here, stops]);

  const choose = (name: string) => {
    if (picking === "from") {
      setFrom(name);
      setPicking("to");
      setQuery("");

      return;
    }

    onClose();
    void plan(name, from ? { stop: from } : undefined);
  };

  const row = (stop: PlaceStop, extra?: string, kind: "stop" | "recent" = "stop") => (
    <li key={`${kind}-${stop.id}-${stop.name}`}>
      <button type="button" className="place" onClick={() => choose(stop.name)}>
        <span className="place__icon" data-kind={kind} aria-hidden="true">
          {kind === "recent" ? <ClockGlyph /> : <BusGlyph size={16} />}
        </span>
        <span className="place__text">
          <span className="place__name">
            <Marked text={stop.name} needle={query.trim()} />
          </span>
          <span className="place__meta">
            {stop.lines.slice(0, 5).map((line) => (
              <span
                key={line}
                className="place__line"
                style={{ background: colours.get(line) }}
              >
                {line}
              </span>
            ))}
            {extra && <span className="place__extra">{extra}</span>}
          </span>
        </span>
      </button>
    </li>
  );

  const recentStops = recent
    .map((name) => byName.get(name))
    .filter((stop): stop is PlaceStop => !!stop);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="ReactModal__Content trip-sheet"
      overlayClassName="ReactModal__Overlay"
      closeTimeoutMS={300}
      contentLabel={t("trip.where_to")}
    >
      <div dir={isRTL ? "rtl" : "ltr"}>
        <header className="trip-sheet__header">
          <div className="bus-stop-modal-drag" />
          <div className="trip-sheet__title-row">
            <h2 className="trip-sheet__title">
              {picking === "from" ? t("trip.choose_start") : t("trip.where_to")}
            </h2>
            <button
              type="button"
              className="bus-stop-modal-close"
              onClick={picking === "from" ? () => setPicking("to") : onClose}
              aria-label={t("filters.close")}
            >
              <CloseGlyph size={20} />
            </button>
          </div>

          {picking === "to" && (
            <div className="trip-sheet__route">
              <button
                type="button"
                className="trip-sheet__from"
                onClick={() => {
                  setPicking("from");
                  setQuery("");
                }}
              >
                <span className="trip-sheet__dot is-from" aria-hidden="true" />
                <span className="trip-sheet__from-label">{t("trip.from")}</span>
                <span className="trip-sheet__from-value">
                  {from ?? t("trip.my_location")}
                </span>
                <span className="trip-sheet__change">{t("trip.change")}</span>
              </button>
              {from && (
                <button
                  type="button"
                  className="trip-sheet__reset"
                  onClick={() => setFrom(null)}
                >
                  {t("trip.use_my_location")}
                </button>
              )}
            </div>
          )}

          <label className="trip-sheet__search">
            <span className="trip-sheet__dot is-to" aria-hidden="true">
              {picking === "to" ? <FlagGlyph size={12} /> : null}
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={picking === "from" ? t("trip.search_start") : t("trip.search")}
              aria-label={picking === "from" ? t("trip.search_start") : t("trip.search")}
              autoFocus
              enterKeyHint="search"
            />
          </label>
        </header>

        <div className="trip-sheet__body">
          {needle ? (
            matches.length > 0 ? (
              <ul className="places">{matches.map((stop) => row(stop))}</ul>
            ) : (
              <p className="trip-sheet__empty">{t("trip.no_match")}</p>
            )
          ) : (
            <>
              {picking === "to" && recentStops.length > 0 && (
                <section>
                  <h3 className="trip-sheet__section">{t("trip.recent")}</h3>
                  <ul className="places">
                    {recentStops.map((stop) => row(stop, undefined, "recent"))}
                  </ul>
                </section>
              )}

              {nearby.length > 0 && (
                <section>
                  <h3 className="trip-sheet__section">{t("trip.nearby")}</h3>
                  <ul className="places">
                    {nearby.map(({ stop, metres }) => row(stop, metresLabel(metres)))}
                  </ul>
                </section>
              )}

              {picking === "to" && (
                <p className="trip-sheet__tip">
                  <span aria-hidden="true">👆</span>
                  {t("trip.long_press_tip")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SearchGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4" />
      <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
