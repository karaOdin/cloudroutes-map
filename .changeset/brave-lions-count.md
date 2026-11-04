---
"cloudroutes-map": minor
---

- Traccar 4 tenants can now authenticate. That version answers 400 to the `Authorization: Bearer` header the token path uses and 401 to `?token=` on everything but `/session`; Basic auth is the only credential that both works there and survives a cross-origin request. Set `VITE_TRACCAR_USER` and `VITE_TRACCAR_PASSWORD` to use it. Unset, nothing changes and the token is used, so tenants on 5+ are untouched. Djelfa goes from 0 vehicles to 25, with real names.
- Positions fall back to Traccar's own `/positions` when a tenant's GPS proxy answers with an error envelope rather than a list. Only reachable from that failure, so healthy tenants are unaffected.
- The socket asks Traccar for a session before connecting when a login is configured, since Traccar 4 authenticates its WebSocket by session cookie alone. That cookie is returned without a `SameSite` attribute, so browsers will not keep it cross-site and the socket still cannot open until the Traccar host sets `SameSite=None; Secure` — proven by injecting exactly that cookie, after which the socket streamed normally.
