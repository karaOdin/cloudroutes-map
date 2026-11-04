---
"cloudroutes-map": patch
---

- The Traccar session is now opened with `POST /session` and the configured login rather than `GET /session?token=`. That request answers 404 on Traccar 4 and still returns a JSESSIONID — an anonymous one — so every authenticated call afterwards failed with a 401 that pointed nowhere near the login.
- Documented deploying on Vercel, which cannot proxy a WebSocket: its rewrites ignore a `wss://` destination. The proxy does not need to be same-origin though, since WebSockets are not subject to CORS and a proxy holding the session server-side removes the browser's need for a cookie at all.
