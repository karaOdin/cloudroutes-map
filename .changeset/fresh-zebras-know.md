---
"cloudroutes-map": minor
---

- Lines whose stop order cannot be derived from their drawn route now get one from the road network instead of showing a warning. Those lines' stops sit hundreds to thousands of metres off the route they supposedly follow, so projecting onto it produces a confident, wrong order; OSRM's trip service is asked for the shortest way to drive through them instead, and its leg distances give a real road distance per stop. Measured on M'sila, this is requested for exactly two of ten lines and only when one is opened — Line 17 goes from a meaningless 1.4 km span to 20.1 km of road.
- Deliberately not used where the drawn route does hold: that route is what the operator says the bus does, and the shortest path is not the same as the correct one — a real line is allowed to double back.
- `OSRM_URL` can point at a self-hosted router; it defaults to the public demo server, which carries no SLA. If the router cannot be reached the line keeps the order it had.
