import { useEffect, useLayoutEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import { latLng, Marker as LeafletMarker } from "leaflet";
import { useTranslation } from "react-i18next";
import { busIcon } from "../../icons.ts";
import { BusFreshness, capitalize, formatAge } from "../../helpers.ts";

type BusMarkerProps = {
  device: { name: string; category: string | null };
  position: { latitude: number; longitude: number; course: number };
  /** How recent this vehicle's last fix is. */
  freshness?: BusFreshness;
  /** Age of that fix in ms, shown in the popup when the vehicle is stale. */
  age?: number;
  /** True when another line is focused and this vehicle is not on it. */
  dimmed?: boolean;
};

/**
 * Presentational marker for a live vehicle. Shared by the "all buses" and
 * "line only" marker layers, which differ only in how they pick devices.
 */
export function BusMarker({
  device,
  position,
  freshness = "live",
  age = NaN,
  dimmed = false,
}: BusMarkerProps) {
  const { t } = useTranslation();
  const { latitude, longitude, course } = position;
  const markerRef = useRef<LeafletMarker>(null);
  const lastFix = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const lastGap = useRef<number | null>(null);
  const awaitingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<number | null>(null);
  const busCategory = capitalize(device?.category || "bus");
  const busName = device?.name ?? "Unknown";
  const isStale = freshness === "stale";

  // Match the slide to the interval the fixes actually arrive at.
  //
  // A fixed duration cannot work here: Traccar reports every several seconds
  // at best, so a short transition darts across the gap and then sits still
  // until the next one, which reads as jumping. Timing each hop to roughly
  // how long the previous one took keeps the vehicle in continuous motion.
  //
  // useLayoutEffect on purpose — this must set the duration *before*
  // react-leaflet's own effect calls setLatLng, or it would arrive one hop
  // late. Parent layout effects run before child passive effects.
  useLayoutEffect(() => {
    const element = markerRef.current?.getElement();
    const at = performance.now();
    const previous = lastFix.current;

    lastGap.current = previous ? at - previous.at : null;
    lastFix.current = { at, lat: latitude, lng: longitude };

    if (!element) return;

    element.style.setProperty(
      "--move-duration",
      `${slideDuration(previous, latitude, longitude, at)}ms`
    );
  }, [latitude, longitude]);

  // Heading is applied to the live element rather than baked into the icon.
  // Custom properties inherit, so setting it on the marker root reaches the
  // rotating inner div without replacing any DOM — which is what lets the
  // position transition and the turn run instead of snapping.
  //
  // The angle accumulates rather than resetting into 0-360, because CSS
  // interpolates rotation numerically: going 350deg -> 10deg would spin the
  // bus 340deg backwards instead of 20deg forwards.
  // `isStale` is a dependency because changing it does swap the icon element.
  useEffect(() => {
    const element = markerRef.current?.getElement();

    if (!element) return;

    const previous = heading.current;
    const next =
      previous === null
        ? course
        : previous + shortestTurn(previous, course);

    heading.current = next;
    element.style.setProperty("--angle", `${next}deg`);
  }, [course, isStale]);

  // "Waiting for the next fix", shown only once one is actually overdue.
  //
  // This animates confidence, not position. Carrying the vehicle forward on
  // its last known heading during the gap would look convincing and would be
  // a guess presented as a reading — a bus stopped at a light would keep
  // rolling down the street. So the marker stays put at the last position it
  // actually reported, and the ring says the reading is ageing.
  //
  // It is driven by classList and CSS rather than by state, so waiting costs
  // no re-renders. Nothing is shown while fixes arrive on time.
  useEffect(() => {
    const element = markerRef.current?.getElement();
    const expected = lastGap.current;

    if (awaitingTimer.current) clearTimeout(awaitingTimer.current);
    element?.classList.remove("is-awaiting-fix");

    // A stale vehicle already says what it needs to by going grey; pulsing it
    // would read as liveness.
    if (!element || isStale || !expected) return;

    awaitingTimer.current = setTimeout(
      () => element.classList.add("is-awaiting-fix"),
      expected * AWAITING_GRACE
    );

    return () => {
      if (awaitingTimer.current) clearTimeout(awaitingTimer.current);
    };
  }, [latitude, longitude, isStale]);

  return (
    <Marker
      ref={markerRef}
      position={[latitude, longitude]}
      icon={busIcon(isStale)}
      title={busName}
      opacity={dimmed ? 0.25 : 1}
      zIndexOffset={dimmed ? 400 : isStale ? 600 : 1000}
    >
      <Popup>
        <div className="bus-popup">
          <svg
            className="bus-popup__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path d="M12 2C8 2 4 2.5 4 6v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4z" />
            <path
              d="M7.5 15c.83 0 1.5-.67 1.5-1.5S8.33 12 7.5 12 6 12.67 6 13.5 6.67 15 7.5 15zM16.5 15c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM18 6H6v5h12V6z"
              fill="var(--surface)"
            />
          </svg>
          <div className="bus-popup__text">
            <span>
              {busCategory} - {busName}
            </span>
            {isStale && (
              <span className="bus-popup__stale">
                {t("bus.last_seen", { age: formatAge(age) })}
              </span>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

/** Shortest signed rotation from one bearing to another, in [-180, 180). */
function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** How far past the expected interval a fix is before the ring appears. */
const AWAITING_GRACE = 1.5;

/** Slides shorter than this look like a twitch. */
const MIN_SLIDE_MS = 900;
/**
 * Beyond this a gap is a dropped feed rather than a reporting interval, so the
 * vehicle snaps. Set generously: whatever cadence the trackers actually report
 * at, a real interval should slide rather than jump, and interpolating means
 * the marker trails the true position by at most one interval either way.
 */
const MAX_SLIDE_MS = 60_000;
/** Above this the gap is a dropped feed, not travel: ~120 km/h. */
const MAX_PLAUSIBLE_SPEED_MS = 33;

function slideDuration(
  previous: { at: number; lat: number; lng: number } | null,
  latitude: number,
  longitude: number,
  at: number
): number {
  // First placement: put the vehicle down, do not fly it in.
  if (!previous) return 0;

  const gap = at - previous.at;

  if (gap <= 0 || gap > MAX_SLIDE_MS) return 0;

  const moved = latLng(previous.lat, previous.lng).distanceTo(
    latLng(latitude, longitude)
  );

  // A reconnect or a resumed background tab arrives as one huge leap. Sliding
  // that would draw a bus straight through the town at speed; snap instead.
  if (moved / (gap / 1000) > MAX_PLAUSIBLE_SPEED_MS) return 0;

  return Math.max(gap, MIN_SLIDE_MS);
}
