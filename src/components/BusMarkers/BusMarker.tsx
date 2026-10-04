import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import {
  LatLng,
  latLng,
  LatLngTuple,
  Marker as LeafletMarker,
} from "leaflet";
import { useTranslation } from "react-i18next";
import { busIcon } from "../../icons.ts";
import { BusFreshness, capitalize, formatAge } from "../../helpers.ts";
import { tidyVehicleName } from "./bus-labels.ts";
import { useFollowStore } from "../../hooks/use-follow-store.ts";
import {
  MeasuredPath,
  chooseRoute,
  measure,
  pathBetween,
  pointAt,
} from "../../services/route-path.ts";

type BusMarkerProps = {
  device: { id?: number; name: string; category: string | null };
  position: {
    latitude: number;
    longitude: number;
    course: number;
    /** GPS clock. The only trustworthy measure of time between two fixes. */
    fixTime?: string;
    deviceTime?: string;
  };
  /** How recent this vehicle's last fix is. */
  freshness?: BusFreshness;
  /** Age of that fix in ms, shown in the popup when the vehicle is stale. */
  age?: number;
  /** True when another line is focused and this vehicle is not on it. */
  dimmed?: boolean;
  /** Waypoints of the line this vehicle is assigned, if the tenant links them. */
  path?: LatLng[];
  /** Every line's waypoints, to match a vehicle to a road when it is not. */
  routes?: LatLng[][];
  /** True when this vehicle has been allocated room to show its name. */
  labelled?: boolean;
  /** Screen-space nudge applied when an overlapping group has been opened. */
  spider?: { dx: number; dy: number };
  /**
   * What a tap means here — the layer decides, since it knows about pile-ups.
   * Answering "opened" means the tap fanned a group out rather than choosing
   * this vehicle.
   */
  onTap?: (deviceId: number) => "opened" | "select";
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
 *
 * Memoised, and it has to be. A position message arrives about twice a second
 * and re-renders the whole layer, but only one vehicle in it has actually
 * moved; the cache merge hands back the identical position object for all the
 * others, so every marker but that one can skip the render entirely.
 */
function BusMarkerComponent({
  device,
  position,
  freshness = "live",
  age = NaN,
  dimmed = false,
  path,
  routes = EMPTY_ROUTES,
  labelled = false,
  spider,
  onTap,
}: BusMarkerProps) {
  const { t } = useTranslation();
  const map = useMap();
  const followed = useFollowStore((state) => state.followed);
  const toggleFollow = useFollowStore((state) => state.toggleFollow);
  const { latitude, longitude, course } = position;
  const fixAt = Date.parse(position.fixTime ?? position.deviceTime ?? "");
  const markerRef = useRef<LeafletMarker>(null);
  const lastFix = useRef<Fix | null>(null);
  const expectedGap = useRef<number | null>(null);
  const awaitingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<number | null>(null);
  const plan = useRef<MovePlan | null>(null);
  const road = useRef<LatLng[] | null>(null);
  // react-leaflet compares `position` by reference and calls setLatLng on any
  // change, so a fresh array literal each render would drag a marker that is
  // mid-slide back to its destination on every re-render — about twice a
  // second — and the next animation frame would pull it back again. That
  // flicker is what still read as jumping.
  const target = useMemo<LatLngTuple>(
    () => [latitude, longitude],
    [latitude, longitude]
  );
  const busCategory = capitalize(device?.category || "bus");
  const busName = tidyVehicleName(device?.name ?? "Unknown");
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

    // Smoothed rather than "the last gap", which is far too noisy to judge
    // lateness by: measured against the live feed the intervals run from 4.6s
    // to 31.8s around a 9.8s median, so comparing each one to the single one
    // before it flags ordinary jitter as a late vehicle.
    const gap = previous ? at - previous.at : null;

    if (gap !== null && gap >= MIN_MEANINGFUL_GAP_MS) {
      expectedGap.current =
        expectedGap.current === null
          ? gap
          : expectedGap.current * (1 - GAP_SMOOTHING) + gap * GAP_SMOOTHING;
    }

    lastFix.current = { at, fixAt, lat: latitude, lng: longitude };

    const duration = slideDuration(
      previous,
      latitude,
      longitude,
      fixAt,
      at,
      expectedGap.current
    );

    // Start the next stretch from where the vehicle visibly IS, not from its
    // last fix. 36% of updates arrive before the previous stretch has finished
    // — the feed is quicker than its own 10s cadence about a third of the time
    // — and resuming from the last fix threw the marker forward to a point it
    // had not reached yet before setting off again. That forward snap is what
    // read as changing position rather than travelling. Mid-walk this ref
    // holds the interpolated position, because the animation writes it every
    // frame; react-leaflet has not applied the new one yet, since that happens
    // in a passive effect after this.
    const resumeFrom = markerRef.current?.getLatLng();
    const here = latLng(latitude, longitude);

    // Which road this vehicle is on. Prefers its assigned line, falls back to
    // whichever line it is actually nearest, because some tenants never link
    // buses to lines at all and every vehicle there would otherwise cut every
    // corner in a straight line.
    const chosen = chooseRoute(
      path,
      road.current,
      routes,
      here,
      MAX_OFF_ROUTE_M,
      MAX_GUESSED_OFF_ROUTE_M
    );

    road.current = chosen?.path ?? null;

    const route =
      previous && duration > 0 && chosen
        ? pathBetween(
            chosen.path,
            resumeFrom ?? latLng(previous.lat, previous.lng),
            here,
            {
              maxOffRoute: chosen.maxOffRoute,
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
  }, [latitude, longitude, fixAt, path, routes]);

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
    // it back at the start of the stretch — which is where it already was —
    // before the first frame is drawn.
    const start = pointAt(route, 0);

    marker.setLatLng(start.point);
    turnTo(start.bearing);

    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [latitude, longitude, path, routes, turnTo]);

  // Keep a followed vehicle in view. `panTo` rather than `setView`, so the
  // user's own zoom is left alone — following should not fight them.
  const isFollowed = device.id !== undefined && followed === device.id;

  useEffect(() => {
    if (!isFollowed) return;

    map.panTo([latitude, longitude], { animate: true });
  }, [isFollowed, latitude, longitude, map]);


  // The name, when the layer has decided there is room for it. Written as a
  // custom property that CSS `content` reads, so the icon markup stays shared
  // and cached across every vehicle and nothing needs re-rendering to show or
  // hide a label.
  useEffect(() => {
    const element = markerRef.current?.getElement();

    if (!element) return;

    element.style.setProperty("--bus-label", JSON.stringify(busName));
    element.classList.toggle("is-labelled", labelled && !dimmed);
  }, [busName, labelled, dimmed, isStale]);

  // Fan this vehicle out of a pile-up. The translation is on the inner
  // container, so Leaflet still has the marker at the reported coordinate and
  // the leader line drawn by CSS points back to it — the position on the map
  // stays true while the icon steps aside to be reachable.
  useEffect(() => {
    const element = markerRef.current?.getElement();

    if (!element) return;

    const container = element.firstElementChild as HTMLElement | null;

    if (!container) return;

    if (spider) {
      element.classList.add("is-spidered");
      element.style.setProperty("--spider-x", `${spider.dx}px`);
      element.style.setProperty("--spider-y", `${spider.dy}px`);
      element.style.setProperty(
        "--spider-len",
        `${Math.hypot(spider.dx, spider.dy)}px`
      );
      element.style.setProperty(
        "--spider-angle",
        `${(Math.atan2(spider.dy, spider.dx) * 180) / Math.PI}deg`
      );
    } else {
      element.classList.remove("is-spidered");
    }
  }, [spider, isStale]);

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
    const expected = expectedGap.current;

    if (awaitingTimer.current) clearTimeout(awaitingTimer.current);
    element?.classList.remove("is-awaiting-fix");

    // A stale vehicle already says what it needs to by going grey; pulsing it
    // would read as liveness.
    if (!element || isStale || !expected) return;

    awaitingTimer.current = setTimeout(
      () => element.classList.add("is-awaiting-fix"),
      Math.max(expected * AWAITING_GRACE, MIN_AWAITING_MS)
    );

    return () => {
      if (awaitingTimer.current) clearTimeout(awaitingTimer.current);
    };
  }, [latitude, longitude, isStale]);

  return (
    <Marker
      ref={markerRef}
      position={target}
      icon={busIcon(isStale)}
      title={busName}
      opacity={dimmed ? 0.25 : 1}
      eventHandlers={{
        click: () => {
          if (device.id === undefined) return;

          if (!onTap) {
            toggleFollow(device.id);

            return;
          }

          // Opening a pile-up is not picking a vehicle out of it. Leaflet opens
          // a marker's popup on click regardless, so an arbitrary member of the
          // pile would otherwise announce itself as the one you chose.
          if (onTap(device.id) === "opened") markerRef.current?.closePopup();
        },
      }}
      zIndexOffset={spider ? 1400 : dimmed ? 400 : isStale ? 600 : 1000}
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

export const BusMarker = memo(BusMarkerComponent);

/** Shortest signed rotation from one bearing to another, in [-180, 180). */
function shortestTurn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** How far past the expected interval a fix is before the ring appears. */
const AWAITING_GRACE = 1.5;
/**
 * ...but never call a vehicle late sooner than this, whatever its cadence.
 * The ring has to mean "overdue", not "slightly irregular". Replaying the live
 * feed, the grace factor alone fired on 20% of intervals — about a fifth of
 * the fleet ringing at any moment. With this floor it fires on 3.9%.
 */
const MIN_AWAITING_MS = 20_000;
/** Traccar occasionally double-sends; those gaps must not teach the cadence. */
const MIN_MEANINGFUL_GAP_MS = 1_000;
/** Weight given to the newest interval when smoothing the expected cadence. */
const GAP_SMOOTHING = 0.3;

/**
 * How far off its line a fix may be and still be treated as having travelled
 * along it. Covers GPS error, road width and waypoint simplification; beyond
 * it the vehicle is on diversion, deadheading, or assigned to a line it is not
 * currently running, and claiming it followed the route would be fiction.
 */
const MAX_OFF_ROUTE_M = 60;
/**
 * The same, for a road matched only by proximity because the vehicle has no
 * line assigned. Following a road moves the marker onto it by up to the
 * tolerance — a correction when the road is right, an error of the same size
 * when it is a parallel street — so a guess is held to a tighter bound than an
 * assignment. On live Constantine data, where every match is a guess, 25m
 * against 60m cost two points of coverage and halved the worst displacement.
 */
const MAX_GUESSED_OFF_ROUTE_M = 25;
/**
 * Reject a route this many times longer than the direct line. Usually means
 * the two fixes snapped to opposite arms of a loop, which would send the
 * vehicle the long way round the network.
 */
const MAX_DETOUR_RATIO = 3;

type Fix = { at: number; fixAt: number; lat: number; lng: number };

/** Stable default so an absent `routes` prop cannot break memoisation. */
const EMPTY_ROUTES: LatLng[][] = [];

/** Slides shorter than this look like a twitch. */
const MIN_SLIDE_MS = 900;
/** And longer than this, like drift. The measured cadence is 10s. */
const MAX_SLIDE_MS = 20_000;
/**
 * Beyond this a vehicle did not travel, it stopped reporting, so it snaps to
 * wherever it turned up rather than gliding across the gap.
 */
const MAX_TRAVEL_GAP_MS = 60_000;
/** Above this the gap is a dropped feed, not travel: ~120 km/h. */
const MAX_PLAUSIBLE_SPEED_MS = 33;

function slideDuration(
  previous: Fix | null,
  latitude: number,
  longitude: number,
  fixAt: number,
  at: number,
  expected: number | null
): number {
  // First placement: put the vehicle down, do not fly it in.
  if (!previous) return 0;

  // Real travel time, from the GPS clock rather than from when the packet
  // happened to land. Measured against the live feed the trackers report on a
  // flat 10s beat, while arrival gaps run from 0.08s to 31.8s — that is the
  // mobile network, not the vehicle, and judging movement by it declares
  // ordinary travel impossible whenever two packets arrive together.
  const travelled =
    Number.isFinite(fixAt) && Number.isFinite(previous.fixAt)
      ? fixAt - previous.fixAt
      : at - previous.at;

  if (travelled > MAX_TRAVEL_GAP_MS) return 0;

  // A duplicate or out-of-order fix carries no travel time to judge by. It is
  // not evidence of a teleport, so it must not cause one — glide anyway.
  if (travelled > 0) {
    const moved = latLng(previous.lat, previous.lng).distanceTo(
      latLng(latitude, longitude)
    );

    // A reconnect or a resumed background tab arrives as one huge leap.
    // Sliding that would draw a bus through the town at speed; snap instead.
    if (moved / (travelled / 1000) > MAX_PLAUSIBLE_SPEED_MS) return 0;
  }

  // Animate over the cadence we are actually being fed at, not over this one
  // hop's arrival gap. Using the raw gap made 7% of hops change pace by more
  // than 3x — dart, crawl, dart — which is exactly what reads as jumping.
  return Math.min(
    Math.max(expected ?? travelled, MIN_SLIDE_MS),
    MAX_SLIDE_MS
  );
}
