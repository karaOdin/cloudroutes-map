---
"cloudroutes-map": minor
---

- The Traccar socket can now be reached through a same-origin reverse proxy, which is what makes it work in a browser on Traccar 4 without changing the Traccar server. Served from the app's own origin the session cookie is first-party, so the SameSite rule that otherwise discards it never applies. A `VITE_TRACCAR_WS_URL` that is not an absolute `ws://`/`wss://` URL is treated as a path on the current origin and no token is appended. `vite.config.ts` provides the development proxy when `VITE_TRACCAR_ORIGIN` is set, opening a Traccar session server-side and attaching its cookie to proxied requests and upgrades. Verified on Traccar 4.14: 21 socket frames and 25 vehicles, with no server change. Tenants without `VITE_TRACCAR_ORIGIN` are unaffected.
