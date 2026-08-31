import { Fragment } from "react";
import { Polyline } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import { Line } from "@cloudroutes/core/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines } from "@cloudroutes/query/lines";
import { LineFilters, LineMarker } from "../types.ts";
import { useFilterStore } from "../hooks/use-filter-store.ts";
import { darkenColor } from "../helpers.ts";

export function LineMarkers() {
  const filters = useFilterStore((state) => state.filters);

  const { data: linesData } = useLines({
    queryKey: [QUERY_KEYS.LINES],
    select: selectLines,
  });

  if (filters.line === "none") return <></>;

  if (!linesData || linesData.length === 0) return <></>;

  const filteredLinesData = filteredLines(linesData, filters.line);

  return filteredLinesData.map((line) => {
    if (
      !line.coordinate ||
      line.coordinate.some((c) => !c || !Array.isArray(c))
    ) {
      return <Fragment key={line.id} />;
    }

    return (
      <Fragment key={line.id}>
        {/* Darkened casing. Line colours come from the tenant and some sit
            near-invisible on a light basemap (#FFFF00 measures 1.07:1); the
            casing gives every line a readable edge without altering its
            colour. Same treatment the route polylines already use. */}
        <Polyline
          positions={line.coordinate}
          pathOptions={{
            color: darkenColor(line.color, 0.45),
            weight: 7,
            opacity: 0.55,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
        {/* Coloured core, held back so lines read as context behind the
            stops and live vehicles rather than competing with them. */}
        <Polyline
          positions={line.coordinate}
          pathOptions={{
            color: line.color,
            weight: 4,
            opacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
          }}
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
