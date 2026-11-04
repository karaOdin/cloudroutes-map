import { create } from "zustand";
import {
  DEFAULT_LEAFLET_PROVIDER,
  LEAFLET_PROVIDERS,
  STORAGE_KEYS,
} from "./constants";
import { Storage } from "./services/client";
import { LeafletProvider } from "./types";

type GlobalState = {
  leafletProvider: LeafletProvider;
};

type GlobalAction = {
  setLeafletProvider: (provider: LeafletProvider) => void;
};

export const useGlobalStore = create<GlobalState & GlobalAction>((set) => ({
  leafletProvider: storedProvider(),
  setLeafletProvider: (provider) => {
    Storage.set(STORAGE_KEYS.LEAFLET_PROVIDERS, provider);
    set({ leafletProvider: provider });
  },
}));

/**
 * The saved basemap, if it is still one we offer.
 *
 * The whole provider object is persisted, so a style that has since been
 * removed would otherwise be restored with its dead URL and render nothing —
 * which is exactly what would happen to anyone who had picked one of the CARTO
 * styles before they began demanding an API key.
 */
function storedProvider(): LeafletProvider {
  const saved = Storage.get<LeafletProvider>(STORAGE_KEYS.LEAFLET_PROVIDERS);
  const known = LEAFLET_PROVIDERS.find(
    (provider) => provider.url === saved?.url
  );

  return known ?? DEFAULT_LEAFLET_PROVIDER;
}
