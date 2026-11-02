/**
 * The line an operator wrote into a vehicle's Traccar name.
 *
 * Tenants name their devices for the line they run: Djelfa uses `B05 - L06`,
 * M'sila uses `04/H017` and `607/04`, Constantine uses `L-08-2001`. That is a
 * statement by whoever set the tracker up, which makes it worth more than a
 * guess from where the bus happens to be — it stays true at the depot, and it
 * is the only signal at all on the nine Djelfa lines that have no drawn route.
 *
 * Read conservatively, because a bare number in a name is usually not a line.
 * Djelfa's `dj.01`–`dj.21` are sequential device numbers and would otherwise
 * match LIGNE 01–20 almost perfectly by accident, which is the worst kind of
 * wrong: confident and systematic. So a number only counts where the operator
 * marked it as a line — after an `L`, or as a whole field across a slash — and
 * only where it names a line this tenant actually has.
 */

/** The leading number in a line's name: "LIGNE 04" and "04" are both 4. */
export function lineNumber(name: string): number | null {
  const found = name.match(/\d+/);

  return found ? Number(found[0]) : null;
}

/** Line number -> the line's name, for every line whose name carries one. */
export function lineNumbers(names: string[]): Map<number, string> {
  const byNumber = new Map<number, string>();

  names.forEach((name) => {
    const number = lineNumber(name);

    // First wins: two lines sharing a number means the number identifies
    // neither, and silently preferring one would invent an answer.
    if (number !== null && !byNumber.has(number)) byNumber.set(number, name);
  });

  return byNumber;
}

export function lineFromDeviceName(
  deviceName: string,
  byNumber: Map<number, string>
): string | null {
  if (!deviceName) return null;

  const candidates = new Set<number>();

  // Marked as a line: "L06", "L-08", "L 17".
  for (const match of deviceName.matchAll(/\bL\s*-?\s*(\d{1,3})\b/gi)) {
    candidates.add(Number(match[1]));
  }

  // A whole field across a slash: "04/H017" and "607/04" both mean a line,
  // at opposite ends. Which end is not fixed, so both are offered and only a
  // number that names a real line survives.
  if (deviceName.includes("/")) {
    deviceName.split("/").forEach((part) => {
      const whole = part.match(/^\s*(\d{1,3})\s*$/);

      if (whole) candidates.add(Number(whole[1]));
    });
  }

  const named = [...candidates]
    .map((number) => byNumber.get(number))
    .filter((name): name is string => !!name);

  // Two readings is not an answer. `13/05` on a tenant with both lines says
  // nothing, and picking one would be a coin toss presented as a fact.
  return named.length === 1 ? named[0] : null;
}
