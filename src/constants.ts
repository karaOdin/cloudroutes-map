import { MapFilterOptions, MapFilters, LeafletProvider } from "./types.ts";

export const DEFAULT_SAVED_FILTERS: MapFilters = {
  line: "all",
  stop: "all",
  bus: "all",
};

export const DEFAULT_FILTER_OPTIONS: MapFilterOptions = {
  line: [{ value: "all", label: "All" }],
  stop: { value: "all", label: "All" },
  bus: { value: "all", label: "All" },
};

export const STORAGE_KEYS = {
  MAP_FILTERS: "map_filters",
  LEAFLET_PROVIDERS: "leaflet_provider",
} as const;

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI_ATTRIBUTION = "Tiles &copy; Esri";
const ESRI_IMAGERY_ATTRIBUTION =
  "Tiles &copy; Esri, Maxar, Earthstar Geographics";

/**
 * Basemap styles offered in the style picker.
 *
 * Curated to be visibly different from one another, and every one checked by
 * rendering an actual tile in a browser rather than by trusting a 200 response.
 * That matters: CARTO now serves an "API KEY REQUIRED" image for its free
 * basemaps, with HTTP 200 and a plausible content length, so the three CARTO
 * styles that used to be here — including the one shipped as an option —
 * rendered as a watermark over a blank background. They are gone.
 *
 * The previous list also carried the German, Swiss and French OpenStreetMap
 * mirrors, which look the same as the standard one and gave the picker nothing
 * to choose between.
 *
 * All of these work without an API key.
 */
export const LEAFLET_PROVIDERS: LeafletProvider[] = [
  {
    id: 2,
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    name: "OpenStreetMap",
    labelKey: "map_style.classic",
    attribution: OSM_ATTRIBUTION,
  },
  {
    id: 11,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    name: "Esri Streets",
    labelKey: "map_style.streets",
    attribution: ESRI_ATTRIBUTION,
  },
  {
    id: 12,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    name: "Esri Light Gray",
    labelKey: "map_style.light",
    attribution: ESRI_ATTRIBUTION,
  },
  {
    id: 13,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    name: "Esri Dark Gray",
    theme: "dark",
    labelKey: "map_style.dark",
    attribution: ESRI_ATTRIBUTION,
  },
  {
    id: 9,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    name: "Esri Satellite",
    theme: "dark",
    labelKey: "map_style.satellite",
    attribution: ESRI_IMAGERY_ATTRIBUTION,
  },
  {
    id: 10,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    name: "Esri Terrain",
    labelKey: "map_style.terrain",
    attribution: ESRI_ATTRIBUTION,
  },
];

/** OpenStreetMap, as before. Looked up rather than indexed, so reordering the
 *  list above cannot silently change which basemap everyone opens on. */
export const DEFAULT_LEAFLET_PROVIDER: LeafletProvider =
  LEAFLET_PROVIDERS.find((provider) => provider.id === 2) ?? LEAFLET_PROVIDERS[0];
