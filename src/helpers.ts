import axios from "axios";
import { Env } from "./config/env.ts";
import {
  DeviceEvent,
  MapFilterOptions,
  MapFilters,
  PositionEvent,
} from "./types.ts";
import {
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_SAVED_FILTERS,
  STORAGE_KEYS,
} from "./constants.ts";
import { Storage } from "./services/client.ts";
import { MultiValue } from "react-select";

/**
 * BASIC UTILITIES
 */

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Darkens a hex colour toward black. Used to draw a casing under a coloured
 * polyline so pale line colours (e.g. #FFFF00, which sits at 1.07:1 against a
 * light basemap) still read against the map.
 */
export function darkenColor(color: string, amount: number = 0.3): string {
  if (!color.startsWith("#")) return color;

  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const num = parseInt(full, 16);

  if (Number.isNaN(num)) return color;

  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
  const b = Math.max(0, (num & 0xff) * (1 - amount));

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/**
 * TRRACAR API UTILITIES
 */

export async function initTraccarSession() {
  await fetch(`${Env.TRACCAR_URL}/session?token=${Env.TRACCAR_TOKEN}`, {
    credentials: "include",
  });
}

export const traccarClient = axios.create({
  baseURL: Env.TRACCAR_URL,
  params: {
    token: Env.TRACCAR_TOKEN,
  },
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${Env.TRACCAR_TOKEN}`,
  },
});

export async function initTraccarClient() {
  await traccarClient.get("/session");
}

export function isPositionEvent(
  event: PositionEvent | DeviceEvent,
): event is PositionEvent {
  return typeof event === "object" && "positions" in event;
}

export function isDeviceEvent(
  event: PositionEvent | DeviceEvent,
): event is DeviceEvent {
  return typeof event === "object" && "devices" in event;
}

/**
 * FILTER UTILITIES
 */

export function getCurrentFilters(): MapFilters {
  return (
    Storage.get<MapFilters>(STORAGE_KEYS.MAP_FILTERS) ?? DEFAULT_SAVED_FILTERS
  );
}

export function mapSavedFiltersToSelectOptions(
  savedFilters: MapFilters,
): MapFilterOptions {
  const options: MapFilterOptions = {
    ...DEFAULT_FILTER_OPTIONS,
  };

  if (savedFilters.line === "none") {
    options.line = [{ value: "none", label: "None" }];
  } else if (savedFilters.line !== "all") {
    options.line = savedFilters.line.map((line) => ({
      value: line,
      label: capitalize(line),
    }));
  }

  options.stop = {
    value: savedFilters.stop,
    label: capitalize(savedFilters.stop),
  };
  options.bus = {
    value: savedFilters.bus,
    label: capitalize(savedFilters.bus),
  };

  return options;
}

export function mapSelectOptionsToSavedFilters(
  options: MapFilterOptions,
): MapFilters {
  const filters: MapFilters = {
    ...DEFAULT_SAVED_FILTERS,
  };

  if (
    options.line.length === 1 &&
    (options.line[0].value === "none" || options.line[0].value === "all")
  ) {
    filters.line = options.line[0].value;
  } else {
    filters.line = options.line.map((option) => option.value);
  }

  filters.stop = options.stop.value;
  filters.bus = options.bus.value;

  return filters;
}

export function mapLinesToSelectOptions(
  lines: string[],
): MultiValue<{ label: string; value: string }> {
  const basicOptions = [
    { label: "All", value: "all" },
    { label: "None", value: "none" },
  ];

  lines.forEach((line) => {
    basicOptions.push({ label: line, value: line });
  });

  return basicOptions;
}

/**
 * VEHICLE FRESHNESS
 *
 * Traccar keeps returning a device's last known position indefinitely, so a
 * bus that stopped reporting hours ago still arrives with coordinates and
 * would otherwise be drawn as if it were live. That is worse than clutter:
 * the vehicle may be kilometres from where the map shows it.
 */

export const BUS_STALE_AFTER_MS = 5 * 60 * 1000;
export const BUS_OFFLINE_AFTER_MS = 30 * 60 * 1000;

export type BusFreshness = "live" | "stale" | "offline";

type FreshnessDevice = { status?: string; lastUpdate?: string };
type FreshnessPosition = {
  fixTime?: string;
  deviceTime?: string;
  outdated?: boolean;
};

/** Age of a vehicle's last fix in ms, or NaN when there is no usable stamp. */
export function busPositionAge(
  device: FreshnessDevice,
  position: FreshnessPosition,
  now: number = Date.now()
): number {
  const stamp = position.fixTime || position.deviceTime || device.lastUpdate;

  if (!stamp) return NaN;

  const at = new Date(stamp).getTime();

  return Number.isNaN(at) ? NaN : now - at;
}

export function busFreshness(
  device: FreshnessDevice,
  position: FreshnessPosition,
  now: number = Date.now()
): BusFreshness {
  const age = busPositionAge(device, position, now);

  // No timestamp at all: fall back to Traccar's own view of the device.
  if (Number.isNaN(age)) return device.status === "online" ? "live" : "offline";

  if (age >= BUS_OFFLINE_AFTER_MS) return "offline";
  if (age >= BUS_STALE_AFTER_MS || position.outdated) return "stale";

  return "live";
}

/** Coarse "12 min" / "2 h 05" label for a duration in ms. */
export function formatAge(ms: number): string {
  if (Number.isNaN(ms) || ms < 0) return "";

  const minutes = Math.floor(ms / 60_000);

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);

  return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
}
