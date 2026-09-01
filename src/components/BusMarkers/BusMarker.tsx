import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import { LatLng, latLng, Marker as LeafletMarker } from "leaflet";
import { useTranslation } from "react-i18next";
import { busIcon } from "../../icons.ts";
import { BusFreshness, capitalize, formatAge } from "../../helpers.ts";
import {
  MeasuredPath,
  measure,
  pathBetween,
  pointAt,
} from "../../services/route-path.ts";

type BusMarkerProps = {
  device: { name: string; category: string | null };
  position: { latitude: number; longitude: number; course: number };
  /** How recent this vehicle's last fix is. */
  freshness?: BusFreshness;
  /** Age of that fix in ms, shown in the popup when the vehicle is stale. */
  age?: number;
  /** True when another line is focused and this vehicle is not on it. */
  dimmed?: boolean;
  /** Waypoints of the line this vehicle runs, when it has one. */
  path?: LatLng[];
};

/**
 * How the vehicle gets from its last fix to this one.
 *
 * `walk` follows the route line and is driven frame by frame; `slide` is the
 * straight-line CSS transition used when the line cannot account for the
 * movement; `snap` is for a jump that should not be animated at all.
 */
type MovePlan =
  | { kind: "snap" }
  | { kind: "slide" }
  | { kind: "walk"; route: MeasuredPath; duration: number };

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
  path,
}: BusMarkerProps) {
  const { t } = useTranslation();
  const { latitude, longitude, course } = position;
  const markerRef = useRef<LeafletMarker>(null);
  const lastFix = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const lastGap = useRef<number | null>(null);
  const awaitingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<number | null>(null);
  const plan = useRef<MovePlan | null>(null);
  const busCategory = capitalize(device?.category || "bus");
  const busName = device?.name ?? "Unknown";
  const isStale = freshness === "stale";

  /**
   * Point the vehicle at a bearing.
   *
   * The angle accumulates rather than resetting into 0-360, because CSS
   * interpolates rotation numerically: going 350deg -> 10deg would spin the
   * bus 340deg backwards instead of 20deg forwards. Applied to the live
   * element rather than baked into the icon, since replacing the icon
   * replaces the DOM node and would interrupt whatever is in flight; custom
   * properties inherit, so setting it on the root reaches the rotating div.
   */
  const turnTo = useCallback((bearing: number) => {
    const element = markerRef.current?.getElement();

    if (!element) return;

    const previous = heading.current;
    const next =
      previous === null ? bearing : previous + shortestTurn(previous, bearing);

    heading.current = next;
    element.style.setProperty("--angle", `${next}deg`);
  }, []);

  // Decide how this hop should be travelled.
  //
  // A fixed duration cannot work against this feed: Traccar reports every
  // several seconds at best, so a short transition darts across the gap and
  // then sits still until the next one, which reads as jumping. Timing each
  // hop to roughly how long the previous one took keeps the vehicle moving.
  //
  // useLayoutEffect on purpose — the CSS duration must be set *before*
  // react-leaflet's own effect calls setLatLng, or it would arrive one hop
  // late. Parent layout effects run before child passive effects.
  useLayoutEffect(() => {
    const element = markerRef.current?.getElement();
    const at = performance.now();
    const previous = lastFix.current;

    lastGap.current = previous ? at - previous.at : null;
    lastFix.current = { at, lat: latitude, lng: longitude };

    const duration = slideDuration(previous, latitude, longitude, at);
    const route =
      previous && duration > 0 && path
        ? pathBetween(
            path,
            latLng(previous.lat, previous.lng),
            latLng(latitude, longitude),
            {
              maxOffRoute: MAX_OFF_ROUTE_M,
              maxDetourRatio: MAX_DETOUR_RATIO,
            }
          )
        : null;

    const next: MovePlan = route
      ? { kind: "walk", route: measure(route), duration }
      : { kind: duration > 0 ? "slide" : "snap" };

    plan.current = next;

    if (!element) return;

    // A walk drives every frame itself, so the CSS transition has to be off
    // or it would lag a step behind each frame it is given.
    const css = next.kind === "walk" ? 0 : duration;

    element.style.setProperty("--move-duration", `${css}ms`);
    element.style.setProperty("--turn-duration", `${css}ms`);
  }, [latitude, longitude, path]);

  // Heading, when the vehicle is not being walked along its route. During a
  // walk it comes from the road being travelled instead, which is a better
  // reading than a course sampled once at the last fix.
  // `isStale` is a dependency because changing it does swap the icon element,
  // which loses the property and needs it restored.
  useEffect(() => {
    if (plan.current?.kind === "walk" && heading.current !== null) {
      markerRef.current
        ?.getElement()
        ?.style.setProperty("--angle", `${heading.current}deg`);

      return;
    }

    turnTo(course);
  }, [course, isStale, turnTo]);

  // Walk the vehicle along its own route line.
  //
  // Interpolating straight between two fixes cuts across blocks and through
  // buildings wherever the route bends. Both endpoints are positions the
  // vehicle actually reported and the line between them is the road it runs,
  // so following the polyline is not a guess — it is a closer reconstruction
  // of the same known journey. `pathBetween` returns null whenever the line
  // cannot honestly account for the movement, and then this does not run.
  useEffect(() => {
    const marker = markerRef.current;
    const current = plan.current;

    if (!marker || current?.kind !== "walk") return;

    const { route, duration } = current;
    const startedAt = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const { point, bearing } = pointAt(route, route.total * progress);

      marker.setLatLng(point);
      turnTo(bearing);

      if (progress < 1) frame = requestAnimationFrame(step);
    };

    // react-leaflet has already placed the marker at the destination, so put
    // it back at the start of the stretch before the first frame is drawn.
    const start = pointAt(route, 0);

    marker.setLatLng(start.point);
    turnTo(start.bearing);

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [latitude, longitude, path, turnTo]);

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

/**
 * How far off its line a fix may be and still be treated as having travelled
 * along it. Covers GPS error, road width and waypoint simplification; beyond
 * it the vehicle is on diversion, deadheading, or assigned to a line it is not
 * currently running, and claiming it followed the route would be fiction.
 */
const MAX_OFF_ROUTE_M = 60;
/**
 * Reject a route this many times longer than the direct line. Usually means
 * the two fixes snapped to opposite arms of a loop, which would send the
 * vehicle the long way round the network.
 */
const MAX_DETOUR_RATIO = 3;

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
