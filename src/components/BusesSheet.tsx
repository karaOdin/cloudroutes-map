import { useMemo, useState } from "react";
import Modal from "react-modal";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { flyToVisible } from "../services/map-insets.ts";
import { formatAge } from "../helpers.ts";
import { useFollowStore } from "../hooks/use-follow-store.ts";
import { LiveBus, useLiveBuses } from "../hooks/use-live-buses.ts";
import {
  FALLBACK_LINE_COLOUR,
  useLineColours,
} from "../hooks/use-line-colours.ts";
import { Marked } from "./Marked.tsx";

/**
 * The fleet as a list.
 *
 * Its own drawer rather than a section of the lines one: a rider opening
 * "lines and stops" is asking where a service goes, and a rider looking for a
 * vehicle is asking where one thing is right now. Those are different
 * questions, and burying the second inside the first meant two taps and a
 * scroll past every line to reach it.
 *
 * The map cannot answer the second question on its own — below zoom 16 no
 * vehicle is labelled, so finding 04/H017 meant panning and hoping.
 */
export function BusesSheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const map = useMap();
  const [query, setQuery] = useState("");
  const buses = useLiveBuses();
  const lineColours = useLineColours();
  const followed = useFollowStore((state) => state.followed);
  const toggleFollow = useFollowStore((state) => state.toggleFollow);

  const needle = query.trim().toLowerCase();

  // Matching the line as well as the name, because "show me the 11" is at
  // least as natural a way to look for a bus as naming the vehicle.
  const visible = useMemo(
    () =>
      needle
        ? buses.filter(
            (bus) =>
              bus.name.toLowerCase().includes(needle) ||
              bus.lines.some((line) => line.toLowerCase().includes(needle))
          )
        : buses,
    [buses, needle]
  );

  // A bus is not a stop: it drives away from wherever it was flown to. So this
  // also follows it, which is what tapping the marker already does — the map
  // keeps it in view instead of leaving the rider to chase it. Tapping the
  // same row again stops following, and the row stops being marked.
  const goToBus = (bus: LiveBus) => {
    toggleFollow(bus.id);
    flyToVisible(map, [bus.lat, bus.lng], Math.max(map.getZoom(), 16));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="ReactModal__Content lines-drawer"
      overlayClassName="ReactModal__Overlay lines-drawer__overlay"
      closeTimeoutMS={300}
      contentLabel={t("buses_sheet.title")}
      /* A drawer, not a modal: the map behind it is the thing being talked
         about, so it stays visible and usable while this is open. */
      shouldCloseOnOverlayClick={false}
    >
      <div className={i18n.language === "ar" ? "rtl" : ""}>
        <header className="lines-sheet__header">
          <div className="bus-stop-modal-drag" />
          <div className="lines-sheet__title-row">
            <h2 className="lines-sheet__title">{t("buses_sheet.title")}</h2>
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
            placeholder={t("buses_sheet.search")}
            aria-label={t("buses_sheet.search")}
          />
        </header>

        <div className="lines-sheet__body">
          <p className="lines-sheet__group">
            {buses.length === 0
              ? t("buses_sheet.no_buses")
              : needle
                ? t("buses_sheet.found", { count: visible.length })
                : t("buses_sheet.count", { count: buses.length })}
          </p>

          {buses.length > 0 && visible.length === 0 && (
            <p className="lines-sheet__empty">{t("lines_sheet.none")}</p>
          )}

          <ul className="bus-list">
            {visible.map((bus) => (
              <li key={bus.id}>
                <BusRow
                  bus={bus}
                  needle={needle}
                  active={followed === bus.id}
                  colours={lineColours}
                  onClick={() => goToBus(bus)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One vehicle in the list.
 *
 * The line chips are the attribution made visible: until now the only way to
 * learn which line a bus was on was to watch where it drove.
 */
function BusRow({
  bus,
  needle,
  active,
  colours,
  onClick,
}: {
  bus: LiveBus;
  needle: string;
  active: boolean;
  colours: Map<string, string>;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      className={"bus-row" + (active ? " is-active" : "")}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      <span className={`bus-row__glyph is-${bus.freshness}`} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z" />
          <path
            d="M7.5 15c.83 0 1.5-.67 1.5-1.5S8.33 12 7.5 12 6 12.67 6 13.5 6.67 15 7.5 15zM16.5 15c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM18 6H6v5h12V6z"
            fill="var(--surface)"
          />
        </svg>
      </span>
      <span className="bus-row__text">
        <span className="bus-row__name">
          <Marked text={bus.name} needle={needle} />
        </span>
        {bus.lines.length > 0 && (
          <span className="stop-list__changes">
            {bus.lines.slice(0, bus.declared ? 1 : 3).map((line) => (
              <span
                key={line}
                className={
                  "stop-list__chip" + (bus.declared ? "" : " is-inferred")
                }
                style={
                  bus.declared
                    ? { background: colours.get(line) ?? FALLBACK_LINE_COLOUR }
                    : {
                        color: colours.get(line) ?? FALLBACK_LINE_COLOUR,
                        borderColor: colours.get(line) ?? FALLBACK_LINE_COLOUR,
                      }
                }
                title={
                  bus.declared
                    ? undefined
                    : t("buses_sheet.line_inferred", { line })
                }
              >
                {line}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="bus-row__state">
        {active && (
          <span className="bus-row__following">{t("buses_sheet.following")}</span>
        )}
        {bus.freshness === "stale" ? (
          <span className="bus-row__stale">
            {t("bus.last_seen", { age: formatAge(bus.age) })}
          </span>
        ) : bus.speed >= 3 ? (
          <span className="bus-row__speed">
            {Math.round(bus.speed)} {t("bus.kmh")}
          </span>
        ) : (
          <span className="bus-row__idle">{t("bus.stopped")}</span>
        )}
      </span>
    </button>
  );
}
