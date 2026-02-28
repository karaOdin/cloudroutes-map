import { MultiValue } from "react-select";
import { LatLngExpression } from "leaflet";

export type Position = {
  id: number;
  attributes: {
    batteryLevel?: number;
    hours?: number;
    distance: number;
    totalDistance: number;
    motion: boolean;
  };
  deviceId: number;
  protocol: string;
  serverTime: string;
  deviceTime: string;
  fixTime: string;
  outdated: boolean;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  address: string | null;
  accuracy: number;
  network: string | null;
  geofenceIds: string[] | null;
};

export type Device = {
  id: number;
  attributes: {
    speedLimit: number;
    deviceImage: string;
    "web.reportColor": string;
  };
  groupId: number;
  calendarId: number;
  name: string;
  uniqueId: string;
  status: string;
  lastUpdate: string;
  positionId: number;
  phone: string | null;
  model: string | null;
  contact: string | null;
  category: string | null;
  disabled: boolean;
  expirationTime: string | null;
};

export type PositionEvent = {
  positions: Position[];
};

export type DeviceEvent = {
  devices: Device[];
};

export type Filters = "all" | "none" | "line-only";
export type LineFilters = Exclude<Filters, "line-only"> | string[];
export type MapFilters = {
  line: LineFilters;
  stop: Filters;
  bus: Filters;
};
export type MapFilterOptions = {
  line: MultiValue<{ label: string; value: string }>;
  stop: { label: string; value: Filters };
  bus: { label: string; value: Filters };
};

export type LineMarker = {
  id: string;
  name: string;
  color: string;
  coordinate: LatLngExpression[];
};

export type LeafletProvider = {
  id: number;
  url: string;
  name: string;
};
