---
"cloudroutes-map": patch
---

- The stop-order router now defaults to `https://osrm-car.devcloud.dz` instead of OSRM's public demo server, which is explicitly not for production use. Verified from a browser: the trip service answers in about 350ms, snaps Algerian stops to within tens of metres, and sends `access-control-allow-origin: *`. `OSRM_URL` still overrides it, and a trailing slash in a configured value no longer builds a double-slashed path.
