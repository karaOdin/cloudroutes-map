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

async function getDevices() {
  const { data } = await traccarClient.get<Array<Device>>("/devices");

  // Same defence: never let a non-array reach the marker layers.
  return Array.isArray(data) ? data : [];
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
