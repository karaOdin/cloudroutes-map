import { useEffect } from "react";
import { subscribeToPositionMessages } from "../services/traccar-socket.ts";

export function useDevicePositionListener(
  onPositionUpdate: (e: MessageEvent<string>) => void = () => {}
) {
  useEffect(
    () => subscribeToPositionMessages(onPositionUpdate),
    [onPositionUpdate]
  );
}
