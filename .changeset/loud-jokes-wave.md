---
"cloudroutes-map": minor
---

- Added support for tenants on Traccar 4. That version rejects the `Authorization: Bearer` header the app sends (400) and authenticates its `/devices` endpoint and WebSocket only by a session cookie returned without a `SameSite` attribute, which browsers treat as `Lax` and never send cross-site — so a browser cannot reach Traccar at all there. Verified in a real browser against a 4.14 server.
- Vehicles are now drawn from positions rather than from the Traccar device list, standing in a `#<deviceId>` name when that list is unreachable. Positions come from the tenant API and are unaffected by the Traccar version, so vehicles appear on v4 tenants as soon as their backend serves positions.
- The socket stops retrying after four attempts with no successful open, instead of burning a TLS handshake every 30s forever on a server that can never accept it. Returning to the foreground retries once more.
- Fixed a blank map on tenants whose `/gps/positstions` answers with an envelope rather than an array — `{"message":"GPS server temporarily unavailable","positions":[]}`, which Djelfa returns persistently. That reached `positions.data.find(...)` and threw during render.
- `gps-probe.mjs` now reports the Traccar version and flags v4.
