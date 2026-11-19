import { ReactNode, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { LiveJourney } from "../hooks/use-journey.ts";
import { GoState } from "../hooks/use-go.ts";
import { useGoStore } from "../hooks/use-go-store.ts";
import { useRouteStore } from "../hooks/use-route-store.ts";
import { useFollowStore } from "../hooks/use-follow-store.ts";
import { useLineColours } from "../hooks/use-line-colours.ts";
import { useNow } from "../hooks/use-now.ts";
import { panToVisible } from "../services/map-insets.ts";
import {
  bandLabel,
  clockAt,
  describeCatch,
  isolate,
  metresLabel,
  usePublishHeight,
} from "./journey-shared.ts";
import {
  BellGlyph,
  BusGlyph,
  CheckGlyph,
  CloseGlyph,
  ExitGlyph,
  RecenterGlyph,
  WalkGlyph,
} from "./journey-glyphs.tsx";

/**
 * The journey, one instruction at a time.
 *
 * A banner across the top says the one thing to do now, in large type, and
 * changes colour as it gets urgent: walk, wait, stay on, your stop is next,
 * get off now. A bar along the bottom keeps the arrival time and the way out.
 * Everything else on the map steps back while this is up.
 *
 * The camera stays with the rider until they move the map themselves, then
 * waits for Recenter — it should not fight a thumb.
 */

const TRACKING_ZOOM = 17;

type Banner = {
  tone: "walk" | "wait" | "ride" | "soon" | "now" | "done";
  glyph: ReactNode;
  title: string;
  detail: string;
  colour?: string;
};

export function GoMode({ live, go }: { live: LiveJourney; go: GoState }) {
  const { t, i18n } = useTranslation();
  const map = useMap();
  const isRTL = i18n.language === "ar";
  const now = useNow(15_000);
  const colours = useLineColours();
  const bar = useRef<HTMLDivElement>(null);
  const stop = useGoStore((state) => state.stop);
  const tracking = useGoStore((state) => state.tracking);
  const setTracking = useGoStore((state) => state.setTracking);
  const setJourneyBus = useRouteStore((state) => state.setJourneyBus);
  const stopFollowing = useFollowStore((state) => state.stopFollowing);
  const { stage } = go;
  const here = live.here;

  usePublishHeight(bar);

  // The rider is what the camera follows now, not a bus.
  useEffect(() => {
    stopFollowing();
  }, [stopFollowing]);

  // Close in on the rider when Go starts, then keep them in view.
  const framed = useRef(false);

  useEffect(() => {
    if (!here || !tracking) return;

    if (!framed.current) {
      framed.current = true;
      map.setView(here, Math.max(map.getZoom(), TRACKING_ZOOM), { animate: true });

      return;
    }

    panToVisible(map, here);
  }, [here, tracking, map]);

  // A drag is the rider wanting to look elsewhere; stop pulling them back.
  useEffect(() => {
    const release = () => setTracking(false);

    map.on("dragstart", release);

    return () => {
      map.off("dragstart", release);
    };
  }, [map, setTracking]);

  const recenter = () => {
    setTracking(true);
    if (here) map.setView(here, Math.max(map.getZoom(), TRACKING_ZOOM), { animate: true });
  };

  // Ring the bus to catch while there is one to catch.
  const waiting = stage.kind === "walk" || stage.kind === "wait";
  const text = waiting
    ? describeCatch(t, stage.caught, {
        line: stage.ride.line,
        running: stage.ride.running,
        walkMin: stage.kind === "walk" ? stage.minutes : 0,
      })
    : null;
  const targetId = text?.target?.deviceId ?? null;

  useEffect(() => {
    setJourneyBus(targetId);
  }, [targetId, setJourneyBus]);

  useEffect(() => () => setJourneyBus(null), [setJourneyBus]);

  const lineColour =
    "ride" in stage ? colours.get(stage.ride.line) ?? stage.ride.colour : undefined;

  let banner: Banner;

  switch (stage.kind) {
    case "walk":
      banner = {
        tone: "walk",
        glyph: <WalkGlyph size={34} />,
        title: t("go.walk_to", { stop: isolate(stage.ride.board.name) }),
        detail: `${metresLabel(stage.metres)} · ${stage.minutes} ${t("arrivals.min")} — ${text!.headline}`,
      };
      break;
    case "wait":
      banner = {
        tone: "wait",
        glyph: <BusGlyph size={34} />,
        title: t("go.wait_for", { line: stage.ride.line }),
        detail: text!.tone === "idle" ? text!.headline : text!.detail,
        colour: lineColour,
      };
      break;
    case "ride":
      banner = {
        tone: "ride",
        glyph: <span className="go-banner__count">{stage.stopsLeft}</span>,
        title: t("go.stops_to_go", { count: stage.stopsLeft }),
        detail: stage.nextStop
          ? t("go.next_stop", { stop: isolate(stage.nextStop), alight: isolate(stage.ride.alight.name) })
          : t("journey.get_off_at", { stop: isolate(stage.ride.alight.name) }),
        colour: lineColour,
      };
      break;
    case "get_off_next":
      banner = {
        tone: "soon",
        glyph: <BellGlyph size={32} />,
        title: t("go.stop_is_next"),
        detail: t("go.ring_bell", {
          stop: isolate(stage.ride.alight.name),
          distance: metresLabel(stage.metresLeft),
        }),
      };
      break;
    case "get_off_now":
      banner = {
        tone: "now",
        glyph: <ExitGlyph size={34} />,
        title: t("go.get_off_now"),
        detail: stage.ride.alight.name,
      };
      break;
    default:
      banner = {
        tone: "done",
        glyph: <CheckGlyph size={34} />,
        title: t("go.arrived"),
        detail: t("go.trip_took", {
          stop: isolate(live.journey.destination?.name ?? ""),
          minutes: stage.minutes,
        }),
      };
  }

  const arrived = stage.kind === "arrived";

  return (
    <div
      className="go"
      dir={isRTL ? "rtl" : "ltr"}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="go-banner"
        data-tone={banner.tone}
        style={banner.colour ? { ["--go-line" as string]: banner.colour } : undefined}
        role="status"
        aria-live="assertive"
      >
        <div className="go-banner__glyph">{banner.glyph}</div>
        <div className="go-banner__text">
          <span className="go-banner__title">{banner.title}</span>
          <span className="go-banner__detail">{banner.detail}</span>
        </div>
        {go.legs > 1 && !arrived && (
          <div className="go-banner__legs" aria-label={t("go.leg", { leg: go.leg + 1, legs: go.legs })}>
            {Array.from({ length: go.legs }, (_, index) => (
              <span key={index} className={index <= go.leg ? "is-done" : undefined} />
            ))}
          </div>
        )}
      </div>

      {!here && <div className="go-locating">{t("go.locating")}</div>}

      {!tracking && here && (
        <button type="button" className="go-recenter" onClick={recenter}>
          <RecenterGlyph size={18} />
          <span>{t("go.recenter")}</span>
        </button>
      )}

      <div className="go-bar" ref={bar}>
        {arrived ? (
          <button type="button" className="go-bar__done" onClick={stop}>
            <CheckGlyph size={20} />
            <span>{t("go.done")}</span>
          </button>
        ) : (
          <>
            <div className="go-bar__cell">
              <span className="go-bar__big" dir="ltr">
                {go.remaining
                  ? clockAt(i18n.language, now, go.remaining.band.from)
                  : "--:--"}
              </span>
              <span className="go-bar__label">
                {go.remaining?.waitUnknown
                  ? t("go.plus_wait")
                  : go.remaining?.partial
                    ? t("go.arrival_plus")
                    : t("journey.arrive")}
              </span>
            </div>
            <div className="go-bar__cell">
              <span className="go-bar__big" dir="ltr">
                {go.remaining ? bandLabel(go.remaining.band) : "–"}
              </span>
              <span className="go-bar__label">{t("arrivals.min")}</span>
            </div>
            <button
              type="button"
              className="go-bar__end"
              onClick={stop}
              aria-label={t("go.end")}
            >
              <CloseGlyph size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
