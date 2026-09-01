import { useQueries, UseQueryResult } from "@tanstack/react-query";
import { Device, Position } from "../types.ts";
import axios, { AxiosError } from "axios";
import { traccarClient } from "../helpers.ts";
import { Env } from "../config/env.ts";
import { useTraccarSocketStatus } from "./use-traccar-socket-status.ts";

// TODO: move getPositions and getDevices to @cloudroutes/core package
async function getPositions() {
  const { data } = await axios.get<Array<Position>>(
    `${Env.API_URL}/gps/positstions`,
  );

  return data;
}

async function getDevices() {
  const { data } = await traccarClient.get<Array<Device>>("/devices");

  return data;
}

/**
 * Poll interval used only while the position socket is down. With the socket
 * up this stays off and the feed does the work; without it, `refetchOnWindow
 * Focus` alone was the only thing that ever refreshed positions, which in a
 * WebView can be a very long time.
 */
const FALLBACK_POLL_MS = 20_000;

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
        refetchInterval: socketConnected ? false : FALLBACK_POLL_MS,
      },
      {
        queryKey: ["devices"],
        queryFn: getDevices,
        refetchOnWindowFocus: true,
      },
    ],
  });
}
