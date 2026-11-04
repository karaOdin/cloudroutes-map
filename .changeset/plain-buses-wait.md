---
"cloudroutes-map": patch
---

- The device list is now read through the tenant's backend when Traccar locks the browser out. A vehicle's name comes from that list and nowhere else: not every bus is in the tenant's own `buses` table, and the ones that are carry a `traccar_device_id` that is an IMEI on Ain Temouchent and an unrelated small number on M'sila, so it cannot be joined to a position's `deviceId`. Two tenants cannot reach the list at all — Ain Temouchent answers 401 to the client's token while its own backend reads the same server fine, and Djelfa's Traccar 4 answers 400 to the `Bearer` header and takes only Basic auth, which would put a Traccar login in the bundle — so riders there saw `#1197` instead of `B20 - L04`. Traccar is still tried first, so the tenants that work today make no extra request, and the fallback is harmless where the endpoint does not exist yet.
