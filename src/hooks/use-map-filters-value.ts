import { DEFAULT_SAVED_FILTERS, STORAGE_KEYS } from "../constants.ts";
import { useLocalStorage } from "./use-local-storage.ts";

export function useMapFiltersValue() {
  const [savedFilters] = useLocalStorage(
    STORAGE_KEYS.MAP_FILTERS,
    DEFAULT_SAVED_FILTERS,
  );

  return savedFilters;
}
