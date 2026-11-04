/**
 * Deciding which vehicles may show their name.
 *
 * Labels are the first thing to make a map unreadable, and this fleet has a
 * pathological case: overnight all 25 vehicles park within 90 m of each other,
 * which is 23 px at zoom 15 — every label on top of every other. So rather
 * than shrinking labels or hoping, a label is only drawn where there is room
 * for it, measured in screen pixels at the zoom actually being viewed.
 */

/** Vehicles are anonymous below this; tap for the popup instead. */
export const LABEL_MIN_ZOOM = 16;
/**
 * Lower bar for a focused line. The user has asked for that line specifically
 * and its vehicles are the only ones drawn at full strength, so naming them is
 * the point rather than noise.
 */
export const FOCUS_LABEL_MIN_ZOOM = 14;

/** Roughly a label's own width, so two labels cannot touch. */
const LABEL_CLEARANCE_PX = 52;

export type LabelCandidate = {
  id: number;
  lat: number;
  lng: number;
  focused: boolean;
};

function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Flat-earth metres — fine at the scale two labels can collide over. */
function separation(a: LabelCandidate, b: LabelCandidate): number {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lng - a.lng) * k * 111_320;
  const dy = (b.lat - a.lat) * 110_574;

  return Math.hypot(dx, dy);
}

/**
 * Which vehicles get a name, placed greedily so that a crowd yields one label
 * rather than none.
 *
 * Ordering is focused-first and then by device id — deliberately stable, so a
 * label does not flicker between neighbours as positions update.
 */
export function labelledVehicles(
  candidates: LabelCandidate[],
  zoom: number
): Set<number> {
  const eligible = candidates
    .filter((c) => zoom >= (c.focused ? FOCUS_LABEL_MIN_ZOOM : LABEL_MIN_ZOOM))
    .sort((a, b) => Number(b.focused) - Number(a.focused) || a.id - b.id);

  const placed: LabelCandidate[] = [];
  const ids = new Set<number>();

  for (const candidate of eligible) {
    const clearance = LABEL_CLEARANCE_PX * metresPerPixel(candidate.lat, zoom);

    if (placed.some((other) => separation(candidate, other) < clearance)) {
      continue;
    }

    placed.push(candidate);
    ids.add(candidate.id);
  }

  return ids;
}

/** Tenant vehicle names carry stray spacing, e.g. "23 / AADL  NUIT". */
export function tidyVehicleName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
}
