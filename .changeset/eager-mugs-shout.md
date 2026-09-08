---
"cloudroutes-map": patch
---

- Added `scripts/traccar-audit.mjs`, which reports each tenant's Traccar version and whether a browser can open its WebSocket, so the tenants needing work can be listed rather than guessed at. Reads every `.env*` file in the repo, or takes hosts as arguments. Read-only.
