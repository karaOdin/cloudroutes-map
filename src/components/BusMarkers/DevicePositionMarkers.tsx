import { useFilterStore } from "../../hooks/use-filter-store.ts";
import { AllDevicePositionMarkers } from "./AllDevicePositionMarkers.tsx";
import { LineOnlyDevicePositionMarkers } from "./LineOnlyDevicePositionMarkers.tsx";

export function DevicePositionMarkers() {
  const filters = useFilterStore((state) => state.filters);

  if (filters.bus === "none") return <></>;

  return filters.bus === "all" ? (
    <AllDevicePositionMarkers />
  ) : (
    <LineOnlyDevicePositionMarkers />
  );
}
