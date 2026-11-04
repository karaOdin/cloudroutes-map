---
"cloudroutes-map": patch
---

- The development Traccar proxy now reads `TRACCAR_USER` / `TRACCAR_PASSWORD` without the `VITE_` prefix, so the login stays server-side and never enters the client bundle. Vite compiles every `VITE_`-prefixed value into the build: verified that the prefixed form put the literal username and password into `dist/assets/*.js`, and the unprefixed form does not. A warning is logged if the prefixed variables are set.
- Documented what must not be shipped to the client. These Traccar accounts are typically not read-only — the one checked reports `readonly: false`, `deviceReadonly: false` and `limitCommands: false`, meaning the API can issue device commands — so a leaked login is control of the fleet's hardware, not just read access to positions.
