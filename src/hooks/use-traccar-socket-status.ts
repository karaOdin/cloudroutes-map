import { useSyncExternalStore } from "react";
import {
  isSocketConnected,
  subscribeToSocketStatus,
} from "../services/traccar-socket.ts";

/** Whether the Traccar position feed is currently connected. */
export function useTraccarSocketStatus(): boolean {
  return useSyncExternalStore(subscribeToSocketStatus, isSocketConnected);
}
