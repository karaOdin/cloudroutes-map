/**
 * Fanning out vehicles that land on top of each other.
 *
 * Measured on M'sila at the default view: 53 vehicles with 15 pairs closer
 * together than one icon is wide. The one underneath cannot be tapped at all —
 * the information is on screen and unreachable.
 *
 * The offset is applied to the icon's inner container as a CSS translation, so
 * the marker's own position is never moved: Leaflet still has it at the
 * coordinate the vehicle reported, and a leader line is drawn back to that
 * point. Clustering was the alternative and was rejected — it hides live
 * vehicles, which is the thing the map exists to show.
 */

/** Two vehicles closer than this on screen are treated as overlapping. */
export const OVERLAP_RADIUS_PX = 34;
/** How far out members are pushed when a group is opened. */
const SPREAD_RADIUS_PX = 46;
/** Beyond this a ring gets too tight, so it grows. */
const RING_CAPACITY = 7;
/**
 * Past this many vehicles, fanning stops helping: the rings reach far enough
 * to cross the whole screen and the leader lines become their own clutter.
 * A pile that dense is better answered by zooming into it, which separates the
 * vehicles for real instead of drawing them somewhere they are not.
 */
export const MAX_SPIDER_GROUP = 8;

export type Placed = { id: number; x: number; y: number };

export type SpiderOffset = { dx: number; dy: number };

/**
 * Groups of vehicles that visually collide, by single-link clustering: anything
 * within the radius of a member joins the group, which is what the eye does.
 */
export function overlappingGroups(placed: Placed[]): number[][] {
  const seen = new Set<number>();
  const groups: number[][] = [];

  for (const start of placed) {
    if (seen.has(start.id)) continue;

    const queue = [start];
    const group: number[] = [];

    seen.add(start.id);

    while (queue.length > 0) {
      const current = queue.pop() as Placed;

      group.push(current.id);

      for (const other of placed) {
        if (seen.has(other.id)) continue;

        if (Math.hypot(current.x - other.x, current.y - other.y) < OVERLAP_RADIUS_PX) {
          seen.add(other.id);
          queue.push(other);
        }
      }
    }

    if (group.length > 1) groups.push(group);
  }

  return groups;
}

/**
 * Where each member sits once the group is opened: evenly spaced on a ring,
 * growing to further rings past `RING_CAPACITY` so the icons never crowd.
 */
export function spiderPositions(group: number[]): Map<number, SpiderOffset> {
  const offsets = new Map<number, SpiderOffset>();

  group.forEach((id, index) => {
    const ring = Math.floor(index / RING_CAPACITY);
    const withinRing = index % RING_CAPACITY;
    const onThisRing = Math.min(RING_CAPACITY, group.length - ring * RING_CAPACITY);
    const radius = SPREAD_RADIUS_PX * (ring + 1);
    // Start at twelve o'clock; a marker directly above reads as "the first one".
    const angle = (withinRing / onThisRing) * Math.PI * 2 - Math.PI / 2;

    offsets.set(id, {
      dx: Math.cos(angle) * radius,
      dy: Math.sin(angle) * radius,
    });
  });

  return offsets;
}
