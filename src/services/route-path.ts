import { LatLng, latLng } from "leaflet";

/**
 * Walking a vehicle along its own route line instead of straight across the
 * map between two fixes.
 *
 * Both endpoints are positions the vehicle actually reported, and the road
 * between them is the line it runs — so following the polyline is not a guess,
 * it is a better reconstruction of the same known journey than a straight line
 * that cuts through blocks and buildings.
 *
 * Geometry is done in a local planar frame (longitude scaled by cos(lat))
 * rather than on the sphere. Over the few hundred metres between two fixes the
 * error is far below the accuracy of the fixes themselves, and it keeps the
 * per-segment cost low enough to snap every vehicle on every update.
 */

type Snapped = {
  /** Index of the segment path[index] -> path[index + 1]. */
  index: number;
  /** Fraction along that segment, 0..1. */
  t: number;
  point: LatLng;
  /** Distance from the queried point to the line, in metres. */
  offRoute: number;
};

function cosLatOf(point: LatLng): number {
  return Math.cos((point.lat * Math.PI) / 180);
}

/** Nearest point on the polyline to `target`. */
function snap(path: LatLng[], target: LatLng): Snapped | null {
  if (path.length < 2) return null;

  const k = cosLatOf(target);
  const tx = target.lng * k;
  const ty = target.lat;

  let best: { index: number; t: number; x: number; y: number } | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < path.length - 1; i += 1) {
    const ax = path[i].lng * k;
    const ay = path[i].lat;
    const bx = path[i + 1].lng * k;
    const by = path[i + 1].lat;

    const abx = bx - ax;
    const aby = by - ay;
    const denominator = abx * abx + aby * aby;

    const t =
      denominator === 0
        ? 0
        : Math.min(
            1,
            Math.max(0, ((tx - ax) * abx + (ty - ay) * aby) / denominator)
          );

    const x = ax + t * abx;
    const y = ay + t * aby;
    const dx = tx - x;
    const dy = ty - y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = { index: i, t, x, y };
    }
  }

  if (!best) return null;

  const point = latLng(best.y, best.x / k);

  return {
    index: best.index,
    t: best.t,
    point,
    offRoute: target.distanceTo(point),
  };
}

/** Metres from a point to the nearest part of a polyline. */
export function distanceToPath(path: LatLng[], point: LatLng): number {
  const snapped = snap(path, point);

  return snapped ? snapped.offRoute : Infinity;
}

/**
 * The road to interpolate a vehicle along.
 *
 * Its assigned line is preferred, but that link is admin data and is simply
 * absent in some tenants — Constantine returns `buses: []` on every line — and
 * without a fallback every vehicle there interpolates in a straight line and
 * cuts corners through buildings.
 *
 * So when there is no usable assignment, the nearest line is used instead.
 * That is sound for this purpose: the point is not to know which service the
 * vehicle is running, it is to know which road it is on, and where two lines
 * share a road they describe the same tarmac. The caller's off-route and
 * detour guards still decide whether the result may be used for a given hop.
 *
 * `remembered` is the road chosen last time, checked first so that the full
 * scan only runs when a vehicle actually leaves it.
 */
export function chooseRoute(
  assigned: LatLng[] | undefined,
  remembered: LatLng[] | null,
  all: LatLng[][],
  point: LatLng,
  maxOffRoute: number
): LatLng[] | null {
  if (assigned && distanceToPath(assigned, point) <= maxOffRoute) {
    return assigned;
  }

  if (remembered && distanceToPath(remembered, point) <= maxOffRoute) {
    return remembered;
  }

  let best: LatLng[] | null = null;
  let bestDistance = maxOffRoute;

  for (const path of all) {
    const distance = distanceToPath(path, point);

    if (distance <= bestDistance) {
      bestDistance = distance;
      best = path;
    }
  }

  return best;
}

type PathBetweenOptions = {
  /** How far off the line a fix may be and still count as on this route. */
  maxOffRoute: number;
  /** Reject a route this many times longer than the direct line. */
  maxDetourRatio: number;
};

/**
 * The stretch of `path` between two fixes, or null when the line cannot
 * account for the movement and a straight line is the honest fallback.
 */
export function pathBetween(
  path: LatLng[],
  from: LatLng,
  to: LatLng,
  { maxOffRoute, maxDetourRatio }: PathBetweenOptions
): LatLng[] | null {
  const a = snap(path, from);
  const b = snap(path, to);

  if (!a || !b) return null;

  // Off the line: a bus on diversion, deadheading, or assigned to a line it is
  // not currently running. Pretending it followed the route would be fiction.
  if (a.offRoute > maxOffRoute || b.offRoute > maxOffRoute) return null;

  const forwards = b.index > a.index || (b.index === a.index && b.t >= a.t);

  const between = forwards
    ? path.slice(a.index + 1, b.index + 1)
    : path.slice(b.index + 1, a.index + 1).reverse();

  const points = [a.point, ...between, b.point];
  const direct = from.distanceTo(to);

  if (direct > 0 && measure(points).total > direct * maxDetourRatio) {
    // Usually the two fixes snapped to opposite arms of a loop, so following
    // the line would send the vehicle the long way round the network.
    return null;
  }

  return points;
}

export type MeasuredPath = {
  points: LatLng[];
  /** Cumulative distance in metres at each point. */
  distances: number[];
  total: number;
};

export function measure(points: LatLng[]): MeasuredPath {
  const distances = [0];
  let total = 0;

  for (let i = 1; i < points.length; i += 1) {
    total += points[i - 1].distanceTo(points[i]);
    distances.push(total);
  }

  return { points, distances, total };
}

/** Compass bearing from a to b, in degrees. */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const k = cosLatOf(a);

  return (Math.atan2((b.lng - a.lng) * k, b.lat - a.lat) * 180) / Math.PI;
}

/** Position and heading at a distance along a measured path. */
export function pointAt(
  path: MeasuredPath,
  distance: number
): { point: LatLng; bearing: number } {
  const { points, distances, total } = path;

  if (points.length < 2) {
    return { point: points[0], bearing: 0 };
  }

  const target = Math.min(Math.max(distance, 0), total);

  let i = 1;
  while (i < distances.length - 1 && distances[i] < target) i += 1;

  const span = distances[i] - distances[i - 1];
  const t = span === 0 ? 0 : (target - distances[i - 1]) / span;
  const a = points[i - 1];
  const b = points[i];

  return {
    point: latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t),
    bearing: bearingBetween(a, b),
  };
}
