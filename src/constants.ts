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

export const LEAFLET_PROVIDERS: LeafletProvider[] = [
  {
    id: 1,
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    name: "CartoDB Light",
  },
  {
    id: 2,
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    name: "OpenStreetMap.ORG",
  },
  {
    id: 3,
    url: "https://tile.openstreetmap.de/{z}/{x}/{y}.png",
    name: "OpenStreetMap.DE",
  },
  {
    id: 4,
    url: "https://tile.osm.ch/switzerland/{z}/{x}/{y}.png",
    name: "OpenStreetMap.SW",
  },
  {
    id: 5,
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    name: "OpenStreetMap.FR",
  },
  {
    id: 6,
    url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    name: "OpenStreetMap.HOT",
  },
];

export const DEFAULT_LEAFLET_PROVIDER: LeafletProvider = LEAFLET_PROVIDERS[1];
