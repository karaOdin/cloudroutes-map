import { Fragment } from "react";
import { Polyline } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import { Line } from "@cloudroutes/core/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines } from "@cloudroutes/query/lines";
import { LineFilters, LineMarker } from "../types.ts";
import { useFilterStore } from "../hooks/use-filter-store.ts";
import { useFocusStore } from "../hooks/use-focus-store.ts";
import { darkenColor } from "../helpers.ts";

export function LineMarkers() {
  const filters = useFilterStore((state) => state.filters);
  const focusedLine = useFocusStore((state) => state.focusedLine);
  const toggleFocus = useFocusStore((state) => state.toggleFocus);

  const { data: linesData } = useLines({
    queryKey: [QUERY_KEYS.LINES],
    select: selectLines,
  });

  if (filters.line === "none") return <></>;

  if (!linesData || linesData.length === 0) return <></>;

  const filteredLinesData = filteredLines(linesData, filters.line);

  // Leaflet paints in insertion order, so the focused line is drawn last and
  // ends up on top of the ones it is being distinguished from.
  const orderedLines = [...filteredLinesData].sort(
    (a, b) => Number(a.name === focusedLine) - Number(b.name === focusedLine)
  );

  return orderedLines.map((line) => {
    if (
      !line.coordinate ||
      line.coordinate.some((c) => !c || !Array.isArray(c))
    ) {
      return <Fragment key={line.id} />;
    }

    const isDimmed = focusedLine !== null && focusedLine !== line.name;

    // `bubblingMouseEvents: false` keeps a tap on a line from also reaching
    // the map, whose click handler clears the focus we are about to set.
    const hitArea = {
      color: line.color,
      weight: 22,
      opacity: 0,
      lineCap: "round" as const,
      lineJoin: "round" as const,
      bubblingMouseEvents: false,
    };

    const onClick = { click: () => toggleFocus(line.name) };

    if (isDimmed) {
      return (
        <Fragment key={line.id}>
          <Polyline
            positions={line.coordinate}
            pathOptions={hitArea}
            eventHandlers={onClick}
          />
          <Polyline
            positions={line.coordinate}
            pathOptions={{
              color: line.color,
              weight: 3,
              opacity: 0.16,
              lineCap: "round",
              lineJoin: "round",
              bubblingMouseEvents: false,
            }}
            eventHandlers={onClick}
          />
        </Fragment>
      );
    }

    const isFocused = focusedLine === line.name;

    return (
      <Fragment key={line.id}>
        {/* Invisible fat stroke. A 4px line is close to untappable with a
            thumb, so the hit target is widened without widening the ink. */}
        <Polyline
          positions={line.coordinate}
          pathOptions={hitArea}
          eventHandlers={onClick}
        />
        {/* Darkened casing. Line colours come from the tenant and some sit
            near-invisible on a light basemap (#FFFF00 measures 1.07:1); the
            casing gives every line a readable edge without altering its
            colour. Same treatment the route polylines already use. */}
        <Polyline
          positions={line.coordinate}
          pathOptions={{
            color: darkenColor(line.color, 0.45),
            weight: isFocused ? 9 : 7,
            opacity: isFocused ? 0.7 : 0.55,
            lineCap: "round",
            lineJoin: "round",
            bubblingMouseEvents: false,
          }}
          eventHandlers={onClick}
        />
        {/* Coloured core, held back so lines read as context behind the
            stops and live vehicles rather than competing with them. */}
        <Polyline
          positions={line.coordinate}
          pathOptions={{
            color: line.color,
            weight: isFocused ? 6 : 4,
            opacity: isFocused ? 1 : 0.85,
            lineCap: "round",
            lineJoin: "round",
            bubblingMouseEvents: false,
          }}
          eventHandlers={onClick}
        />
      </Fragment>
    );
  });
}

function selectLines(lines: Line[]): LineMarker[] {
  return lines.map((line) => {
    return {
      id: line.name,
      name: line.name,
      color: line.color,
      coordinate: line.waypoints || ([] as LatLngExpression[]),
    };
  });
}

function filteredLines(
  lines: LineMarker[],
  filter: Exclude<LineFilters, "none">
): LineMarker[] {
  if (filter === "all") return lines;

  return lines.filter((line) => filter.includes(line.name));
}
