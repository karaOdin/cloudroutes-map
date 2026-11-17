import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { LiveJourney } from "../hooks/use-journey.ts";
import { useRouteStore } from "../hooks/use-route-store.ts";
import { useFollowStore } from "../hooks/use-follow-store.ts";
import { useGoStore } from "../hooks/use-go-store.ts";
import { useTripStore } from "../hooks/use-trip-store.ts";
import { useLineColours } from "../hooks/use-line-colours.ts";
import { useNow } from "../hooks/use-now.ts";
import {
  bandLabel,
  clockAt,
  describeCatch,
  isolate,
  metresLabel,
  usePublishHeight,
} from "./journey-shared.ts";
import {
  BusGlyph,
  ChevronGlyph,
  CloseGlyph,
  FlagGlyph,
  GoGlyph,
  RecenterGlyph,
  WalkGlyph,
} from "./journey-glyphs.tsx";

/**
 * The journey, as something to act on.
 *
 * The map already shows where the trip goes. What it could not say is what to
 * do about it right now — so the card leads with one instruction ("Leave in
 * 4 min", "Hurry") in a countdown bubble, sums the trip up as a strip of
 * steps, and offers Go to be walked through it. The full step list is a swipe
 * away for whoever wants it.
 */
export function JourneyCard({ live }: { live: LiveJourney }) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const now = useNow(15_000);
  const colours = useLineColours();
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const setJourneyBus = useRouteStore((state) => state.setJourneyBus);
  const followed = useFollowStore((state) => state.followed);
  const toggleFollow = useFollowStore((state) => state.toggleFollow);
  const startGo = useGoStore((state) => state.start);
  const clearTrip = useTripStore((state) => state.clear);

  usePublishHeight(card);

  const { caught, walk, walkMin, rides, journey, arrive } = live;
  const first = rides[0];
  const text = describeCatch(t, caught, {
    line: first.line,
    running: first.running,
    walkMin,
  });
  const destination =
    journey.destination?.name ?? rides[rides.length - 1].alight.name;

  // Tell the map which vehicle is the rider's.
  const targetId = text.target?.deviceId ?? null;

  useEffect(() => {
    setJourneyBus(targetId);
  }, [targetId, setJourneyBus]);

  useEffect(() => () => setJourneyBus(null), [setJourneyBus]);

  const colourOf = (line: string, fallback?: string) =>
    colours.get(line) ?? fallback;

  // Following pans to the bus and keeps it in view, which is the whole ask.
  const showBus = () => {
    if (targetId != null && followed !== targetId) toggleFollow(targetId);
  };

  const strip: ReactNode[] = [];

  if (walk && !live.atStop) {
    strip.push(
      <span key="walk" className="trip-strip__walk">
        <WalkGlyph size={16} />
        {Math.max(1, walkMin)}
      </span>
    );
  }

  rides.forEach((ride, index) => {
    strip.push(
      <span
        key={`ride-${index}`}
        className="trip-strip__line"
        style={{ background: colourOf(ride.line, ride.colour) }}
      >
        <BusGlyph size={14} />
        {ride.line}
      </span>
    );
  });

  strip.push(
    <span key="end" className="trip-strip__end">
      <FlagGlyph size={15} />
    </span>
  );

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

      <button
        type="button"
        className="journey__close"
        onClick={clearTrip}
        aria-label={t("trip.close")}
      >
        <CloseGlyph size={16} />
      </button>

      <div className="journey__hero" data-tone={text.tone}>
        <div className="journey__bubble" aria-hidden="true">
          {"minutes" in text.bubble ? (
            <>
              <span className="journey__bubble-value">{text.bubble.minutes}</span>
              <span className="journey__bubble-unit">{t("arrivals.min")}</span>
            </>
          ) : text.bubble.glyph === "bus" ? (
            <BusGlyph size={30} />
          ) : (
            <span className={clsx({ "is-running": text.bubble.glyph === "run" })}>
              <WalkGlyph size={32} />
            </span>
          )}
        </div>

        <div className="journey__hero-text">
          <span className="journey__headline" role="status" aria-live="polite">
            {text.headline}
          </span>
          <span className="journey__detail">{text.detail}</span>
        </div>

        {targetId != null && (
          <button
            type="button"
            className="journey__show"
            onClick={showBus}
            aria-label={t("journey.show_bus")}
          >
            <RecenterGlyph size={20} />
          </button>
        )}
      </div>

      <div className="journey__summary">
        <div className="trip-strip" aria-hidden="true">
          {strip.map((item, index) => (
            <Fragment key={index}>
              {index > 0 && <ChevronGlyph size={12} />}
              {item}
            </Fragment>
          ))}
        </div>

        <div className="journey__eta">
          {arrive ? (
            <>
              <span className="journey__eta-time" dir="ltr">
                {/* A range, not one time: it is built from ranges. */}
                {clockAt(i18n.language, now, arrive.from)}–
                {clockAt(i18n.language, now, arrive.to)}
              </span>
              <span className="journey__eta-label">{t("journey.arrive")}</span>
            </>
          ) : rides.length > 1 ? (
            <span className="journey__eta-label">
              {t("journey.changes", { count: rides.length - 1 })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="journey__to">
        <FlagGlyph size={14} />
        <span className="journey__to-name">{destination}</span>
      </div>

      <button type="button" className="journey__go" onClick={startGo}>
        <GoGlyph size={20} />
        <span>{t("go.start")}</span>
      </button>

      {walk && walk.source !== "road" && (
        <p className="journey__caveat">
          {walk.source === "plan"
            ? t("journey.no_location")
            : t("journey.walk_estimated")}
        </p>
      )}

      {open && (
        <ol className="journey__steps">
          {walk && !live.atStop && (
            <li className="journey__step" data-kind="walk">
              <span className="journey__dot" aria-hidden="true" />
              <span className="journey__step-text">
                {(walk.source === "road" ? "" : "≈ ") +
                  t("journey.walk_to", {
                    minutes: Math.max(1, walkMin),
                    distance: metresLabel(walk.metres),
                    stop: isolate(first.board.name),
                  })}
              </span>
            </li>
          )}

          {rides.map((ride, index) => (
            <li key={`${ride.line}-${index}`} className="journey__step" data-kind="ride">
              <span
                className="journey__dot"
                style={{ background: colourOf(ride.line, ride.colour) }}
                aria-hidden="true"
              />
              <span className="journey__step-text">
                <span className="journey__step-title">
                  <span
                    className="journey__chip"
                    style={{ background: colourOf(ride.line, ride.colour) }}
                  >
                    {ride.line}
                  </span>
                  {index === 0
                    ? t("journey.board_at", { stop: isolate(ride.board.name) })
                    : t("journey.change_at", { stop: isolate(ride.board.name) })}
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
                  {t("journey.get_off_at", { stop: isolate(ride.alight.name) })}
                </span>
              </span>
            </li>
          ))}

          <li className="journey__step" data-kind="arrive">
            <span className="journey__dot" aria-hidden="true" />
            <span className="journey__step-text">
              {t("journey.arrive_at", { stop: isolate(destination) })}
            </span>
          </li>
        </ol>
      )}

      {open && <p className="journey__caveat">{t("arrivals.caveat")}</p>}
    </section>
  );
}
