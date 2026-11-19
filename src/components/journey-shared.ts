import { useLayoutEffect, RefObject } from "react";
import { useMap } from "react-leaflet";
import { TFunction } from "i18next";
import { Arrival } from "../services/arrivals.ts";
import { Band, Catch } from "../services/journey.ts";

/** Shared wording and plumbing for the journey card and Go mode. */

/**
 * Wrap a name in Unicode first-strong isolates. Stop names are Arabic and the
 * sentences around them may not be, so without this a name followed by a
 * number pulls the number to its own side — "1 · حي … min" instead of
 * "حي … · 1 min".
 */
export function isolate(name: string): string {
  return `\u2068${name}\u2069`;
}

export function metresLabel(metres: number): string {
  return metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.max(10, Math.round(metres / 10) * 10)} m`;
}

export function bandLabel(band: Band): string {
  return band.from === band.to ? `${band.from}` : `${band.from}–${band.to}`;
}

/**
 * A wall-clock time `inMinutes` from `now`. 24-hour, as clocks are read in
 * Algeria, and with no AM/PM marker to land on the wrong side of a range when
 * the text runs right-to-left.
 */
export function clockAt(locale: string, now: number, inMinutes: number): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now + inMinutes * 60_000));
}

export type Tone = "go" | "wait" | "warn" | "idle";

export type CatchText = {
  headline: string;
  detail: string;
  tone: Tone;
  /** What the countdown bubble shows: a number of minutes, or a pictogram. */
  bubble: { minutes: number } | { glyph: "walk" | "run" | "bus" };
  /** The vehicle this is about, if any. */
  target: Arrival | null;
};

function due(t: TFunction, arrival: Arrival, band: Band): string {
  return (
    t("journey.bus_due", { bus: arrival.name, minutes: bandLabel(band) }) +
    (arrival.stopsAway > 0
      ? ` · ${t("arrivals.stops_away", { count: arrival.stopsAway })}`
      : "")
  );
}

/** What to say about the first bus, given whether the rider can reach it. */
export function describeCatch(
  t: TFunction,
  caught: Catch,
  context: { line: string; running: number; walkMin: number }
): CatchText {
  const walk = Math.max(1, context.walkMin);

  switch (caught.kind) {
    case "leave_in":
      return {
        headline: t("journey.leave_in", { minutes: caught.minutes }),
        detail: due(t, caught.arrival, caught.band),
        tone: "wait",
        bubble: { minutes: caught.minutes },
        target: caught.arrival,
      };
    case "leave_now":
      return {
        headline: t("journey.leave_now"),
        detail: due(t, caught.arrival, caught.band),
        tone: "go",
        bubble: { glyph: "walk" },
        target: caught.arrival,
      };
    case "hurry":
      return {
        headline: t("journey.hurry"),
        detail: t("journey.hurry_detail", {
          bus: caught.arrival.name,
          minutes: bandLabel(caught.band),
          walk,
        }),
        tone: "warn",
        bubble: { glyph: "run" },
        target: caught.arrival,
      };
    case "at_stop":
      return {
        headline: t("journey.at_stop"),
        detail: due(t, caught.arrival, caught.band),
        tone: "go",
        bubble: { minutes: caught.band.from },
        target: caught.arrival,
      };
    case "missed":
      return {
        headline: t("journey.missed"),
        detail: t("journey.missed_detail", { bus: caught.next.name, walk }),
        tone: "warn",
        bubble: { glyph: "bus" },
        target: caught.next,
      };
    default:
      return {
        // None heading here and none on the line at all are different
        // answers: the first says wait, the second says not now.
        headline:
          context.running > 0
            ? t("journey.no_bus", { line: context.line })
            : t("journey.no_bus_running", { line: context.line }),
        detail:
          context.running > 0
            ? t("journey.running", { count: context.running })
            : t("journey.none_running"),
        tone: "idle",
        bubble: { glyph: "bus" },
        target: null,
      };
  }
}

/**
 * Publish an element's height on the map container as `--journey-h`, so the
 * banners and zoom buttons along the bottom can stand clear of it.
 */
export function usePublishHeight(ref: RefObject<HTMLElement | null>) {
  const map = useMap();

  useLayoutEffect(() => {
    const element = ref.current;
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
  }, [map, ref]);
}
