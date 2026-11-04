import { useMemo } from "react";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines } from "@cloudroutes/query/lines";
import { Line } from "@cloudroutes/core/lines";

/** Used when a line has no colour at all, matching the map's own fallback. */
export const FALLBACK_LINE_COLOUR = "#0c4a6e";

/**
 * Line name to colour.
 *
 * The stops endpoint describes each stop's lines as `{ id, name }` and no
 * colour, so anything colouring by line from that payload silently falls back
 * to one shade for the whole network — which is what was happening to the stop
 * markers. The colours live on the lines endpoint, so they are joined here.
 */
export function useLineColours(): Map<string, string> {
  const { data: lines } = useLines({ queryKey: [QUERY_KEYS.LINES] });

  return useMemo(() => {
    const colours = new Map<string, string>();

    (lines as Line[] | undefined)?.forEach((line) => {
      const colour = (line as unknown as { color?: string }).color;

      if (line.name && colour) colours.set(line.name, colour);
    });

    return colours;
  }, [lines]);
}
