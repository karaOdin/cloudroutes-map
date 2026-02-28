import { MapFilters } from "../types.ts";
import { create } from "zustand";
import { getCurrentFilters } from "../helpers.ts";
import { STORAGE_KEYS } from "../constants.ts";
import { Storage } from "../services/client.ts";

type State = {
  filters: MapFilters;
};

type Actions = {
  setFilters: (filters: MapFilters) => void;
};

export const useFilterStore = create<State & Actions>((set) => ({
  filters: getCurrentFilters(),
  setFilters: (filters: MapFilters) => {
    Storage.set(STORAGE_KEYS.MAP_FILTERS, filters);
    set(() => ({ filters }));
  },
}));
