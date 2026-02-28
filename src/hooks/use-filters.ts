import { MapFilterOptions } from "../types.ts";
import { useState } from "react";
import {
  mapSavedFiltersToSelectOptions,
  mapSelectOptionsToSavedFilters,
} from "../helpers.ts";
import { MultiValue, SingleValue } from "react-select";
import { useFilterStore } from "./use-filter-store.ts";
import { useMapLinesOption } from "./use-map-lines-name.ts";

export function useFilters() {
  const lineFilters = useMapLinesOption();
  const savedFilters = useFilterStore((state) => state.filters);
  const setSavedFilters = useFilterStore((state) => state.setFilters);

  const [selectedFilters, setSelectedFilters] = useState<MapFilterOptions>(() =>
    mapSavedFiltersToSelectOptions(savedFilters),
  );

  const handleChange = (
    key: keyof MapFilterOptions,
    selected:
      | MultiValue<{ value: string; label: string }>
      | SingleValue<{ label: string; value: string }>,
  ) => {
    if (key === "line") {
      return lineChangeHandler(
        selected as MultiValue<{ value: string; label: string }>,
      );
    }

    setSelectedFilters((prev) => ({
      ...prev,
      [key]: selected,
    }));
  };

  const lineChangeHandler = (
    selected: MultiValue<{ value: string; label: string }>,
  ) => {
    const currentValue = [...selected].pop();

    if (!selected || selected.length === 0) {
      return setSelectedFilters((prev) => ({
        ...prev,
        line: [{ value: "none", label: "None" }],
      }));
    }

    const hasNone = selected.some((item) => item.value === "none");

    if (hasNone && currentValue?.value === "none") {
      console.log("none");
      return setSelectedFilters((prev) => ({
        ...prev,
        line: [{ value: "none", label: "None" }],
      }));
    }

    const hasAll =
      selected.length === lineFilters.length - 2 ||
      currentValue?.value === "all";

    if (hasAll) {
      return setSelectedFilters((prev) => ({
        ...prev,
        line: [{ value: "all", label: "All" }],
      }));
    }

    if (currentValue?.value !== "all" && currentValue?.value !== "none") {
      return setSelectedFilters((prev) => ({
        ...prev,
        line: selected.filter(
          (item) => item.value !== "all" && item.value !== "none",
        ),
      }));
    }
  };

  const handleApply = () => {
    setSavedFilters(mapSelectOptionsToSavedFilters(selectedFilters));
  };

  return {
    selectedFilters,
    handleChange,
    handleApply,
  };
}
