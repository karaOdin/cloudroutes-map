import { Polyline } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import { Line } from "@cloudroutes/core/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import { useLines } from "@cloudroutes/query/lines";
import { LineFilters, LineMarker } from "../types.ts";
import { useFilterStore } from "../hooks/use-filter-store.ts";

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
      return <></>;
    }

    return (
      <Polyline
        key={line.id}
        positions={line.coordinate}
        pathOptions={{ color: line.color }}
      />
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
