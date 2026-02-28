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
