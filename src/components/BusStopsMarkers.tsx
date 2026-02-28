/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStops } from "@cloudroutes/query/lines";
import { QUERY_KEYS } from "@cloudroutes/query";
import { busStopIcon } from "../icons.ts";
import { Marker } from "react-leaflet";
import { useFilterStore } from "../hooks/use-filter-store.ts";
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
            color: (line as any).color || "#0c4a6e", // Fallback to indigo if color not available
          })),
        };
      });
    },
  });

  if (!stops || filters.stop === "none") return <></>;

  const filteredStops = filteredStopsData(stops, filters);

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
          icon={busStopIcon}
          title={stop.title}
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
