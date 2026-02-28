import { create } from "zustand";
import { DEFAULT_LEAFLET_PROVIDER, STORAGE_KEYS } from "./constants";
import { Storage } from "./services/client";
import { LeafletProvider } from "./types";

type GlobalState = {
  leafletProvider: LeafletProvider;
};

type GlobalAction = {
  setLeafletProvider: (provider: LeafletProvider) => void;
};

export const useGlobalStore = create<GlobalState & GlobalAction>((set) => ({
  leafletProvider:
    Storage.get(STORAGE_KEYS.LEAFLET_PROVIDERS) || DEFAULT_LEAFLET_PROVIDER,
  setLeafletProvider: (provider) => {
    Storage.set(STORAGE_KEYS.LEAFLET_PROVIDERS, provider);
    set({ leafletProvider: provider });
  },
}));
