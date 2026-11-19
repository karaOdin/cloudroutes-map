import { useMemo } from "react";
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import { useArrivals } from "../hooks/use-arrivals.ts";
import { Arrival } from "../services/arrivals.ts";
import { useTripStore } from "../hooks/use-trip-store.ts";
import { GoGlyph } from "./journey-glyphs.tsx";

type BusStopModalProps = {
  isOpen: boolean;
  onClose: () => void;
  stop: {
    id: number;
    title: string;
    coordinate: [number, number];
    lines: Array<{
      name: string;
      color: string;
    }>;
  } | null;
  onSetAsStart?: () => void;
  onSetAsDestination?: () => void;
};

export function BusStopModal({
  isOpen,
  onClose,
  stop,
  // onSetAsDestination,
}: BusStopModalProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";

  // Hooks cannot sit behind the early return below, and the stop identity has
  // to be stable or every render would rebuild the projections.
  const target = useMemo(
    () =>
      stop
        ? {
            lat: stop.coordinate[0],
            lng: stop.coordinate[1],
            lines: stop.lines.map((line) => line.name),
          }
        : null,
    [stop]
  );
  const arrivals = useArrivals(target);
  const plan = useTripStore((state) => state.plan);
  const colours = new Map(stop?.lines.map((line) => [line.name, line.color]));

  if (!stop) return null;

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      className="ReactModal__Content"
      overlayClassName="ReactModal__Overlay"
      closeTimeoutMS={300}
      contentLabel={stop.title}
    >
      <div className={isRTL ? "rtl" : ""}>
        {/* Header */}
        <header className="bus-stop-modal-header">
          <div className="bus-stop-modal-drag"></div>
          <div className="bus-stop-modal-title-row">
            <div className="bus-stop-modal-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 3V12C20 12.71 19.62 13.36 19 13.72V15.25C19 15.66 18.66 16 18.25 16H17.75C17.34 16 17 15.66 17 15.25V14H10V15.25C10 15.66 9.66 16 9.25 16H8.75C8.34 16 8 15.66 8 15.25V13.72C7.39 13.36 7 12.71 7 12V3C7 0 10 0 13.5 0C17 0 20 0 20 3Z"
                  fill="#0c4a6e"
                />
              </svg>
            </div>
            <h2 className="bus-stop-modal-title">{stop.title}</h2>
            <button
              type="button"
              className="bus-stop-modal-close"
              onClick={onClose}
              aria-label={t("filters.close")}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="bus-stop-modal-info">
            <div className="bus-stop-modal-info-item">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 6v6l4 2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span>
                {t("bus_stop.type")}: {t("bus_stop.title")}
              </span>
            </div>
            <div className="bus-stop-modal-info-item">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M19 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="3"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <span>
                {stop.lines.length} {t("bus_stop.lines")}
              </span>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="bus-stop-modal-body">
          {/* First, because it is what most riders opening a stop want. */}
          {/* A stop no line serves cannot be reached by bus; offering a trip
              there only ends in "no route". */}
          {stop.lines.length > 0 ? (
            <button
              type="button"
              className="stop-go"
              onClick={() => {
                onClose();
                void plan(stop.title);
              }}
            >
              <GoGlyph size={18} />
              <span>{t("trip.take_me_here")}</span>
            </button>
          ) : (
            <p className="stop-unserved">{t("trip.stop_unserved")}</p>
          )}

          {/* Lines Section */}
          <div className="bus-stop-section">
            <div className="bus-stop-section-title">
              <div className="bus-stop-section-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 18V7.414a1 1 0 01.293-.707l2.414-2.414A1 1 0 0110.414 4H17a1 1 0 011 1v13M7 14h10"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span>
                {t("bus_stop.lines")} ({stop.lines.length})
              </span>
            </div>
            <ul className="bus-lines-horizontal">
              {stop.lines.map((line, index) => (
                <li
                  key={index}
                  className="bus-line-badge"
                  style={{
                    borderColor: line.color,
                    color: line.color,
                  }}
                >
                  {line.name}
                </li>
              ))}
            </ul>
          </div>

          {/* Next buses.
              A measurement first — road between the bus and this stop, and
              the stops in between — with a time band after it. Never a single
              promised minute: see services/arrivals.ts. */}
          <div className="bus-stop-section">
            <div className="bus-stop-section-title">
              <div className="bus-stop-section-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12v5z" />
                </svg>
              </div>
              <span>{t("arrivals.title")}</span>
            </div>

            {arrivals.length === 0 ? (
              <p className="arrivals__none">{t("arrivals.none")}</p>
            ) : (
              <>
                <ul className="arrivals">
                  {arrivals.slice(0, 4).map((arrival) => (
                    <ArrivalRow
                      key={arrival.deviceId}
                      arrival={arrival}
                      colour={colours.get(arrival.line)}
                    />
                  ))}
                </ul>
                <p className="arrivals__caveat">{t("arrivals.caveat")}</p>
              </>
            )}
          </div>

          {/* Actions */}
          {/* <div className="bus-stop-actions">
            <button
              className="bus-stop-action-btn bus-stop-action-primary"
              onClick={() => {
                if (onSetAsDestination) {
                  onSetAsDestination();
                }
                onClose();
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                  fill="currentColor"
                />
              </svg>
              <span>{t("bus_stop.view_route")}</span>
            </button>
            <button
              className="bus-stop-action-btn bus-stop-action-secondary"
              onClick={() => {
                // Handle viewing times
                onClose();
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M12 6v6l4 2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span>{t("bus_stop.view_times")}</span>
            </button>
          </div> */}
        </div>
      </div>
    </Modal>
  );
}

/**
 * One approaching bus.
 *
 * The distance leads because it is the part that was measured. The time is a
 * range and is shown as one; where the last fix is too old to support even a
 * range, it is left out rather than guessed.
 */
function ArrivalRow({
  arrival,
  colour,
}: {
  arrival: Arrival;
  colour?: string;
}) {
  const { t } = useTranslation();
  const km = arrival.metres >= 1000;

  return (
    <li className="arrival">
      <span
        className={"arrival__line" + (arrival.declared ? "" : " is-inferred")}
        style={
          arrival.declared
            ? { background: colour }
            : { color: colour, borderColor: colour }
        }
      >
        {arrival.line}
      </span>
      <span className="arrival__text">
        <span className="arrival__name">{arrival.name}</span>
        <span className="arrival__distance">
          {arrival.stopsAway > 0 &&
            `${t("arrivals.stops_away", { count: arrival.stopsAway })} · `}
          {km
            ? `${(arrival.metres / 1000).toFixed(1)} km`
            : `${Math.round(arrival.metres / 10) * 10} m`}
        </span>
      </span>
      <span className="arrival__when">
        {arrival.minutes ? (
          <>
            <span className="arrival__minutes">
              {arrival.minutes.from}–{arrival.minutes.to}
            </span>
            <span className="arrival__unit">{t("arrivals.min")}</span>
          </>
        ) : (
          <span className="arrival__unknown">
            {t(arrival.parked ? "arrivals.parked" : "arrivals.no_time")}
          </span>
        )}
      </span>
    </li>
  );
}
