---
"cloudroutes-map": patch
---

- Corrected the documentation on where configuration comes from. In production each tenant's endpoints and token are fetched by the host app from the backend API and injected as `window.env`; the `VITE_*` values in `.env` are only a local development fallback. Enabling a Traccar 4 tenant is therefore a change to what the backend returns for it — adding `TRACCAR_USER` and `TRACCAR_PASSWORD` — and needs no redeploy of this app, since `Env` already reads those from `window.env` first.
- `traccar-audit.mjs` now accepts hosts as arguments or piped one per line, so the tenant list can come from the backend rather than from local env files.
