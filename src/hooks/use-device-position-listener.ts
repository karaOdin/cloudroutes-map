import { Env } from "../config/env.ts";
import { useEffect } from "react";

const ws = new WebSocket(`${Env.TRACCAR_WS_URL}?token=${Env.TRACCAR_TOKEN}`);

export function useDevicePositionListener(
  onPositionUpdate: (e: MessageEvent<string>) => void = () => {},
) {
  useEffect(() => {
    ws.addEventListener("message", onPositionUpdate);

    return () => {
      ws.removeEventListener("message", onPositionUpdate);
    };
  }, [onPositionUpdate]);
}
