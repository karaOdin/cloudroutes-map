/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStops } from "@cloudroutes/query/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import { busStopIconFor, MINOR_STOP_MIN_ZOOM } from "../icons.ts";
import { Marker } from "react-leaflet";
import { useFilterStore } from "../hooks/use-filter-store.ts";
import { useMapZoom } from "../hooks/use-map-zoom.ts";
import {
  FALLBACK_LINE_COLOUR,
  useLineColours,
} from "../hooks/use-line-colours.ts";
import { useFocusStore } from "../hooks/use-focus-store.ts";
import { MapFilters } from "../types.ts";
import  { useState } from "react";
import { BusStopModal } from "./BusStopModal";

type StopMarker = {
  id: number;
  title: string;
  coordinate: [number, number];
  lines: Array<{
    name: string;
    color: string;
  }>;
};

export function BusStopsMarkers() {
  const filters = useFilterStore((state) => state.filters);
  const zoom = useMapZoom();
  const lineColours = useLineColours();
  const focusedLine = useFocusStore((state) => state.focusedLine);
  const [selectedStop, setSelectedStop] = useState<StopMarker | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: stops } = useStops<StopMarker[]>({
    queryKey: [QUERY_KEYS.STOPS],
    select: (data) => {
      return data.map((stop) => {
        return {
          id: stop.id,
          title: stop.name,
          coordinate: [
            parseFloat(stop.latitude),
            parseFloat(stop.longitude),
          ] as [number, number],
          lines: stop.lines.map((line) => ({
            name: line.name,
            // The stops endpoint carries no colour, so every bead fell back to
            // one shade. The colour belongs to the line, so it is joined in.
            color:
              (line as any).color ||
              lineColours.get(line.name) ||
              FALLBACK_LINE_COLOUR,
          })),
        };
      });
    },
  });

  if (!stops || filters.stop === "none") return <></>;

  // Filtering is untouched; this only decides how much of the result is worth
  // drawing at the current zoom. Zoomed out, minor stops collapse away and the
  // interchanges carry the shape of the network.
  const filteredStops = visibleStops(
    filteredStopsData(stops, filters),
    zoom,
    focusedLine
  );

  const handleMarkerClick = (stop: StopMarker) => {
    setSelectedStop(stop);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedStop(null), 300); // Wait for animation
  };

  return (
    <>
      {filteredStops.map((stop) => (
        <Marker
          key={stop.id}
          position={stop.coordinate}
          icon={busStopIconFor(stop.lines)}
          title={stop.title}
          opacity={servesFocusedLine(stop, focusedLine) ? 1 : 0.2}
          eventHandlers={{
            click: () => handleMarkerClick(stop),
          }}
        />
      ))}

      <BusStopModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        stop={selectedStop}
        // onSetAsDestination={() => {
        //   // This will be passed from parent component
        //   console.log("Set as destination:", selectedStop);
        // }}
      />
    </>
  );
}

function filteredStopsData(
  stops: StopMarker[],
  filters: MapFilters
): StopMarker[] {
  if (filters.stop === "all" || filters.line === "all") return stops;
  if (filters.line === "none" && filters.stop === "line-only") return [];

  if (Array.isArray(filters.line) && filters.stop === "line-only") {
    return stops.filter((stop) =>
      stop.lines.some((line) => filters.line.includes(line.name))
    );
  }

  return stops;
}

function servesFocusedLine(
  stop: StopMarker,
  focusedLine: string | null
): boolean {
  if (!focusedLine) return true;

  return stop.lines.some((line) => line.name === focusedLine);
}

function visibleStops(
  stops: StopMarker[],
  zoom: number,
  focusedLine: string | null
): StopMarker[] {
  if (zoom >= MINOR_STOP_MIN_ZOOM) return stops;

  // Zoomed out the interchanges carry the shape of the network on their own —
  // except on a focused line, where its own stops are the whole point.
  return stops.filter(
    (stop) =>
      stop.lines.length > 1 ||
      (!!focusedLine && stop.lines.some((line) => line.name === focusedLine))
  );
}
