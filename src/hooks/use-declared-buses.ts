import { useMemo } from "react";
import { useLines } from "@cloudroutes/query/lines";
import { isEmpty } from "@cloudroutes/core";
import { tidyVehicleName } from "../components/BusMarkers/bus-labels.ts";

/**
 * The vehicles the tenant's own records can account for.
 *
 * Traccar is the fleet register — not every bus is in the tenant's `buses`
 * table, which is why a vehicle is drawn whenever it reports a position. But
 * where the table *does* hold a vehicle, it knows something Traccar never
 * does: which line that bus is assigned to, and the number painted on it.
 *
 * The join is Traccar's `uniqueId` — the IMEI in the device's Identifier
 * field. Where the records hold that, this is an operator-stated fact and
 * outranks anything inferred from where the bus happens to be driving. Where
 * they hold nothing, there is simply no entry and the caller falls back to
 * the live feed alone.
 *
 * Tenants fill these columns differently. Most put the IMEI in
 * `traccar_device_id`; Biskra puts Traccar's numeric device id there and the
 * IMEI in `traccar_device_unique_id`. So both are indexed, and a numeric id is
 * also indexed as a device id — which is what a position carries, and the only
 * join left when Traccar's device list cannot be fetched. Use `declaredFor`
 * to look a vehicle up.
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
        const entry: DeclaredBus = {
          line: line.name,
          number: isEmpty(bus.number) ? null : String(bus.number),
          plate: isEmpty(bus.license_plate) ? null : String(bus.license_plate),
        };
        const keys: string[] = [];

        for (const value of [bus.traccar_device_unique_id, bus.traccar_device_id]) {
          if (isEmpty(value)) continue;

          const text = String(value).trim();

          keys.push(text);
          // An IMEI is 15 digits; anything this short is Traccar's own id.
          if (/^\d{1,9}$/.test(text)) keys.push(deviceKey(Number(text)));
        }

        // First assignment wins. A vehicle listed under two lines is a records
        // error, and picking the later one silently would make the answer
        // depend on payload order.
        for (const key of keys) {
          if (!byUniqueId.has(key)) byUniqueId.set(key, entry);
        }
      });
    });

    return byUniqueId;
  }, [lines]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const deviceKey = (id: number) => `device:${id}`;

/** The records' entry for a vehicle, by its IMEI or else its Traccar id. */
export function declaredFor(
  declared: Map<string, DeclaredBus>,
  vehicle: { id: number; uniqueId?: string | null }
): DeclaredBus | undefined {
  return (
    (vehicle.uniqueId ? declared.get(vehicle.uniqueId) : undefined) ??
    declared.get(deviceKey(vehicle.id))
  );
}

/**
 * What to call a vehicle. Traccar is the register, so its name leads; where
 * it has none — or Traccar's device list could not be fetched and the vehicle
 * is a stand-in named after its id — the number painted on the bus, from the
 * tenant's records, is a real identifier where the device id is not.
 */
export function vehicleName(
  declared: Map<string, DeclaredBus>,
  device: { id: number; name?: string | null; uniqueId?: string | null }
): string {
  const own = tidyVehicleName(device.name ?? "");
  const standIn = own === "" || own === `#${device.id}`;

  return (
    (standIn ? declaredFor(declared, device)?.number : null) ||
    own ||
    `#${device.id}`
  );
}
