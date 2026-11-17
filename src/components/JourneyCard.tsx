import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { LiveJourney } from "../hooks/use-journey.ts";
import { useRouteStore } from "../hooks/use-route-store.ts";
import { useFollowStore } from "../hooks/use-follow-store.ts";
import { useLineColours } from "../hooks/use-line-colours.ts";
import { useNow } from "../hooks/use-now.ts";
import { Band, Catch } from "../services/journey.ts";
import { Arrival } from "../services/arrivals.ts";

/**
 * The journey, as something to act on.
 *
 * The map already shows where the trip goes. What it could not say is what to
 * do about it right now — so the card leads with one instruction ("Leave in
 * 4 min", "Hurry") and the bus it is about, and keeps the step-by-step below
 * for whoever wants it.
 *
 * Its height is published on the map container as `--journey-h`, so the
 * banners and zoom buttons that sit at the bottom can stand clear of it.
 */

function metresLabel(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.max(10, Math.round(metres / 10) * 10)} m`;
}

function bandLabel(band: Band): string {
  return band.from === band.to ? `${band.from}` : `${band.from}–${band.to}`;
}

function useClock(locale: string) {
  return (inMinutes: number, now: number) =>
    // 24-hour, as clocks are read in Algeria, and with no AM/PM marker to
    // land on the wrong side of a range when the card is right-to-left.
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(now + inMinutes * 60_000));
}

export function JourneyCard({ live }: { live: LiveJourney }) {
  const { t, i18n } = useTranslation();
  const map = useMap();
  const isRTL = i18n.language === "ar";
  const now = useNow(15_000);
  const clock = useClock(i18n.language);
  const colours = useLineColours();
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const setJourneyBus = useRouteStore((state) => state.setJourneyBus);
  const followed = useFollowStore((state) => state.followed);
  const toggleFollow = useFollowStore((state) => state.toggleFollow);

  const { caught, walk, walkMin, rides, journey, arrive } = live;
  const first = rides[0];
  const target =
    caught.kind === "missed"
      ? caught.next
      : caught.kind === "no_bus"
        ? null
        : caught.arrival;

  // Tell the map which vehicle is the rider's.
  const targetId = target?.deviceId ?? null;

  useEffect(() => {
    setJourneyBus(targetId);
  }, [targetId, setJourneyBus]);

  useEffect(() => () => setJourneyBus(null), [setJourneyBus]);

  // Stand the bottom chrome clear of the card, whatever height it has.
  useLayoutEffect(() => {
    const element = card.current;
    const container = map.getContainer();

    if (!element) return;

    const publish = () =>
      container.style.setProperty("--journey-h", `${element.offsetHeight}px`);
    const observer = new ResizeObserver(publish);

    publish();
    observer.observe(element);

    return () => {
      observer.disconnect();
      container.style.removeProperty("--journey-h");
    };
  }, [map]);

  const lineChip = (line: string, colour?: string) => (
    <span
      className="journey__chip"
      style={{ background: colours.get(line) ?? colour }}
    >
      {line}
    </span>
  );

  // Following pans to the bus and keeps it in view, which is the whole ask.
  const showBus = () => {
    if (target && followed !== target.deviceId) toggleFollow(target.deviceId);
  };

  const walkText =
    walk &&
    t("journey.walk_to", {
      minutes: Math.max(1, walkMin),
      distance: metresLabel(walk.metres),
      stop: first.board.name,
    });

  return (
    <section
      ref={card}
      className={clsx("journey", { "is-open": open })}
      dir={isRTL ? "rtl" : "ltr"}
      aria-label={t("journey.title")}
      // Leaflet would otherwise read a drag across the card as a pan.
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="journey__handle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? t("journey.less") : t("journey.more")}
      />

      <header className="journey__head">
        <div className="journey__to">
          <span className="journey__to-label">{t("journey.to")}</span>
          <span className="journey__to-name">
            {journey.destination?.name ?? rides[rides.length - 1].alight.name}
          </span>
        </div>
        {arrive ? (
          <div className="journey__eta">
            <span className="journey__eta-label">{t("journey.arrive")}</span>
            <span className="journey__eta-time" dir="ltr">
              {clock(arrive.from, now)}–{clock(arrive.to, now)}
            </span>
          </div>
        ) : rides.length > 1 ? (
          <div className="journey__eta">
            <span className="journey__eta-label">
              {t("journey.changes", { count: rides.length - 1 })}
            </span>
          </div>
        ) : null}
      </header>

      <Status
        caught={caught}
        line={first.line}
        running={first.running}
        walkMin={walkMin}
        stop={first.board.name}
        onShowBus={target ? showBus : undefined}
        chip={lineChip(first.line, first.colour)}
      />

      {walk?.source !== "road" && walk && (
        <p className="journey__caveat">
          {walk.source === "plan"
            ? t("journey.no_location")
            : t("journey.walk_estimated")}
        </p>
      )}

      {open && (
        <ol className="journey__steps">
          {walkText && !live.atStop && (
            <li className="journey__step" data-kind="walk">
              <span className="journey__dot" aria-hidden="true" />
              <span className="journey__step-text">
                {walk.source === "road" ? walkText : `≈ ${walkText}`}
              </span>
            </li>
          )}

          {rides.map((ride, index) => (
            <li key={`${ride.line}-${index}`} className="journey__step" data-kind="ride">
              <span
                className="journey__dot"
                style={{ background: colours.get(ride.line) ?? ride.colour }}
                aria-hidden="true"
              />
              <span className="journey__step-text">
                <span className="journey__step-title">
                  {lineChip(ride.line, ride.colour)}
                  {index === 0
                    ? t("journey.board_at", { stop: ride.board.name })
                    : t("journey.change_at", { stop: ride.board.name })}
                </span>
                <span className="journey__step-meta">
                  {t("journey.ride", {
                    count: ride.stops,
                    minutes: bandLabel(ride.band),
                  })}
                  {index > 0 &&
                    ` · ${
                      ride.running > 0
                        ? t("journey.running", { count: ride.running })
                        : t("journey.none_running")
                    }`}
                </span>
                <span className="journey__step-meta">
                  {t("journey.get_off_at", { stop: ride.alight.name })}
                </span>
              </span>
            </li>
          ))}

          <li className="journey__step" data-kind="arrive">
            <span className="journey__dot" aria-hidden="true" />
            <span className="journey__step-text">
              {t("journey.arrive_at", {
                stop:
                  journey.destination?.name ?? rides[rides.length - 1].alight.name,
              })}
            </span>
          </li>
        </ol>
      )}

      {open && <p className="journey__caveat">{t("arrivals.caveat")}</p>}
    </section>
  );
}

/** The one instruction the card leads with. */
function Status({
  caught,
  line,
  running,
  walkMin,
  stop,
  chip,
  onShowBus,
}: {
  caught: Catch;
  line: string;
  running: number;
  walkMin: number;
  stop: string;
  chip: React.ReactNode;
  onShowBus?: () => void;
}) {
  const { t } = useTranslation();

  const due = (arrival: Arrival, band: Band) =>
    t("journey.bus_due", { bus: arrival.name, minutes: bandLabel(band) }) +
    (arrival.stopsAway > 0
      ? ` · ${t("arrivals.stops_away", { count: arrival.stopsAway })}`
      : "");

  let headline: string;
  let detail: string;
  let tone: "go" | "wait" | "warn" | "idle";

  switch (caught.kind) {
    case "leave_in":
      headline = t("journey.leave_in", { minutes: caught.minutes });
      detail = due(caught.arrival, caught.band);
      tone = "wait";
      break;
    case "leave_now":
      headline = t("journey.leave_now");
      detail = due(caught.arrival, caught.band);
      tone = "go";
      break;
    case "hurry":
      headline = t("journey.hurry");
      detail = t("journey.hurry_detail", {
        bus: caught.arrival.name,
        minutes: bandLabel(caught.band),
        walk: Math.max(1, walkMin),
      });
      tone = "warn";
      break;
    case "at_stop":
      headline = t("journey.at_stop");
      detail = due(caught.arrival, caught.band);
      tone = "go";
      break;
    case "missed":
      headline = t("journey.missed");
      detail = t("journey.missed_detail", {
        bus: caught.next.name,
        walk: Math.max(1, walkMin),
      });
      tone = "warn";
      break;
    default:
      headline = t("journey.no_bus", { line });
      detail =
        running > 0
          ? t("journey.running", { count: running })
          : t("journey.none_running");
      tone = "idle";
  }

  return (
    <div className="journey__status" data-tone={tone}>
      {chip}
      <div className="journey__status-text">
        <span className="journey__headline" role="status" aria-live="polite">
          {headline}
        </span>
        <span className="journey__detail">
          {detail}
          {caught.kind !== "no_bus" && caught.kind !== "missed" && (
            <> · {t("journey.from_stop", { stop })}</>
          )}
        </span>
      </div>
      {onShowBus && (
        <button
          type="button"
          className="journey__show"
          onClick={onShowBus}
          aria-label={t("journey.show_bus")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
