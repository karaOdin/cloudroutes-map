---
"cloudroutes-map": minor
---

- The buses drawer now opens with the vehicles nearest the rider, measured along the road rather than as the crow flies. In a town built around a river or a dual carriageway the closest bus in a straight line can be the one with no way across — on M'sila a bus 530 m away in a straight line is 790 m by road, half as far again.
- Measured in one OSRM table request for every candidate at once, after narrowing the field by straight line, rather than a route call per bus. Refreshed every 20 seconds rather than on every fix.
- Where the router cannot be reached the straight-line figure is shown and marked as one, since the two are not the same claim.
- Only appears where the host has reported the rider's position; it comes over the bridge as `LOCATION_UPDATE` and now lives in a store so more than the map marker can read it.
