import { useQueries, UseQueryResult } from "@tanstack/react-query";
import { Device, Position } from "../types.ts";
import axios, { AxiosError } from "axios";
import { traccarClient } from "../helpers.ts";
import { Env } from "../config/env.ts";

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

export function useDevicePosition() {
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
      },
      {
        queryKey: ["devices"],
        queryFn: getDevices,
        refetchOnWindowFocus: true,
      },
    ],
  });
}
