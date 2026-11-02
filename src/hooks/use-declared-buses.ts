import { useMemo } from "react";
import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";

/**
 * The vehicles the tenant's own records can account for.
 *
 * Traccar is the fleet register — not every bus is in the tenant's `buses`
 * table, which is why a vehicle is drawn whenever it reports a position. But
 * where the table *does* hold a vehicle, it knows something Traccar never
 * does: which line that bus is assigned to, and the number painted on it.
 *
 * The join is Traccar's `uniqueId` — the IMEI in the device's Identifier
 * field. Where `traccar_device_id` holds that, this is an operator-stated fact
 * and outranks anything inferred from where the bus happens to be driving.
 * Where it holds something else, or nothing, there is simply no entry and the
 * caller falls back to the live feed alone.
 */

export type DeclaredBus = {
  /** The line the operator assigned this vehicle to. */
  line: string;
  /** Fleet number from the tenant's records, e.g. "46-20". */
  number: string | null;
  plate: string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useDeclaredBuses(): Map<string, DeclaredBus> {
  const { data: lines } = useLines();

  return useMemo(() => {
    const byUniqueId = new Map<string, DeclaredBus>();

    lines?.forEach((line) => {
      (line.buses ?? []).forEach((bus: any) => {
        if (isEmpty(bus.traccar_device_id)) return;

        // First assignment wins. A vehicle listed under two lines is a records
        // error, and picking the later one silently would make the answer
        // depend on payload order.
        if (byUniqueId.has(bus.traccar_device_id)) return;

        byUniqueId.set(String(bus.traccar_device_id), {
          line: line.name,
          number: isEmpty(bus.number) ? null : String(bus.number),
          plate: isEmpty(bus.license_plate) ? null : String(bus.license_plate),
        });
      });
    });

    return byUniqueId;
  }, [lines]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
