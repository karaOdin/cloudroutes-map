import { useQueries, UseQueryResult } from "@tanstack/react-query";
import { Device, Position } from "../types.ts";
import axios, { AxiosError } from "axios";
import { traccarClient } from "../helpers.ts";
import { Env } from "../config/env.ts";
import { useTraccarSocketStatus } from "./use-traccar-socket-status.ts";

/**
 * The positions endpoint does not always answer with an array. When a tenant's
 * backend cannot reach its own Traccar it answers with an envelope instead —
 * `{ message: "GPS server temporarily unavailable", positions: [] }` — and
 * older tenants answer that way routinely. Handing that straight on meant
 * `positions.data.find(...)` threw during render, and with no error boundary
 * above it that blanked the entire map rather than showing it without vehicles.
 */
type PositionsResponse =
  | Position[]
  | { positions?: Position[] | null; message?: string };

function toPositions(data: PositionsResponse): Position[] {
  if (Array.isArray(data)) return data;

  return Array.isArray(data?.positions) ? data.positions : [];
}

// TODO: move getPositions and getDevices to @cloudroutes/core package
async function getPositions() {
  try {
    const { data } = await axios.get<PositionsResponse>(
      `${Env.API_URL}/gps/positstions`,
    );

    // An array, even an empty one, is an answer. Only the envelope means the
    // tenant could not reach its own Traccar.
    if (Array.isArray(data)) return data;

    const positions = toPositions(data);

    if (positions.length > 0) return positions;

    return await getPositionsFromTraccar(positions);
  } catch {
    return await getPositionsFromTraccar([]);
  }
}

/**
 * Last resort when a tenant's own GPS proxy is down — Djelfa answers
 * `{ message: "GPS server temporarily unavailable", positions: [] }`
 * persistently — while Traccar itself is up and holding the same data.
 *
 * Deliberately only reachable from that failure: with a healthy tenant
 * endpoint this never runs, so nothing changes for tenants that work today.
 * If Traccar cannot be reached either, the empty answer stands rather than the
 * error propagating and blanking the map.
 */
async function getPositionsFromTraccar(fallback: Position[]) {
  try {
    const { data } = await traccarClient.get<Array<Position>>("/positions");

    return Array.isArray(data) ? data : fallback;
  } catch {
    return fallback;
  }
}

/** Same envelope shape the positions endpoint uses. */
type DevicesResponse =
  | Device[]
  | { devices?: Device[] | null; message?: string };

async function getDevices() {
  try {
    const { data } = await traccarClient.get<DevicesResponse>("/devices");

    // Same defence: never let a non-array reach the marker layers.
    if (Array.isArray(data) && data.length > 0) return data;
  } catch {
    // Falls through to the tenant's own copy below.
  }

  return await getDevicesFromTenant();
}

/**
 * The device list by way of the tenant's backend, for the tenants where a
 * browser cannot read it from Traccar directly.
 *
 * This list is the only place a vehicle's identity exists: not every bus is in
 * the tenant's own `buses` table, and the ones that are carry a
 * `traccar_device_id` that is an IMEI on one tenant and an unrelated small
 * number on another, so it cannot be joined to a position's `deviceId`.
 * Traccar's `name` is the fleet number — ` 651/04`, `B20 - L04` — and without
 * it a vehicle can only be labelled by Traccar's internal row id, which means
 * nothing to a rider.
 *
 * Reaching it from the browser fails two ways and both are measured: Ain
 * Temouchent answers 401 to the client's token while its backend reads the
 * same server fine, and Djelfa's Traccar 4 answers 400 to the `Bearer` header
 * and accepts only Basic auth — which would put a Traccar login in the
 * bundle. The backend already proxies positions with credentials it keeps to
 * itself, so the device list belongs on the same path.
 *
 * Tried second, so nothing changes for a tenant whose Traccar the browser can
 * already read, and harmless where the endpoint does not exist yet.
 */
async function getDevicesFromTenant(): Promise<Device[]> {
  try {
    const { data } = await axios.get<DevicesResponse>(
      `${Env.API_URL}/gps/devices`,
    );

    if (Array.isArray(data)) return data;

    return Array.isArray(data?.devices) ? data.devices : [];
  } catch {
    return [];
  }
}

/**
 * Poll interval used only while the position socket is down or has gone
 * silent. With the feed healthy this stays off entirely and adds no load;
 * without it, `refetchOnWindowFocus` was the only thing that ever refreshed
 * positions, which in a WebView can be a very long time.
 *
 * Set just above the measured 9.8s median reporting interval, so falling back
 * costs at most one skipped report rather than a visibly frozen map.
 */
const FALLBACK_POLL_MS = 12_000;

/**
 * Spread the fallback across clients. If the feed goes down it goes down for
 * everyone at once, and every rider's app would otherwise start polling the
 * same endpoint on the same 12s beat — a synchronised load spike on a backend
 * that is already having a bad time. Fixed once per session so the interval
 * does not change under react-query on every render.
 */
const POLL_JITTER_MS = Math.floor(Math.random() * 5_000);

export function useDevicePosition() {
  const socketConnected = useTraccarSocketStatus();

  return useQueries<
    [
      UseQueryResult<Position[], AxiosError>,
      UseQueryResult<Device[], AxiosError>,
    ]
  >({
    queries: [
      {
        queryKey: ["positions"],
        queryFn: getPositions,
        refetchOnWindowFocus: true,
        refetchInterval: socketConnected
          ? false
          : FALLBACK_POLL_MS + POLL_JITTER_MS,
      },
      {
        queryKey: ["devices"],
        queryFn: getDevices,
        refetchOnWindowFocus: true,
      },
    ],
  });
}
