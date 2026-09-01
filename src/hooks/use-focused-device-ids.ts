import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";
import { useFocusStore } from "./use-focus-store.ts";

/**
 * Traccar `uniqueId`s of the vehicles running the focused line, or null when
 * nothing is focused. Both bus layers use it to decide what to hold back.
 */
export function useFocusedDeviceIds(): Set<string> | null {
  const focusedLine = useFocusStore((state) => state.focusedLine);
  const { data: lines } = useLines();

  if (!focusedLine || !lines) return null;

  const ids = new Set<string>();

  lines
    .filter((line) => line.name === focusedLine)
    .forEach((line) => {
      line.buses.forEach((bus) => {
        if (!isEmpty(bus.traccar_device_id)) ids.add(bus.traccar_device_id);
      });
    });

  return ids;
}
