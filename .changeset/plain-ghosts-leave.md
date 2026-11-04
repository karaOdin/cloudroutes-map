---
"cloudroutes-map": patch
---

- Focusing a line now hides the other vehicles instead of ghosting them. They were drawn at a quarter opacity, which left a wash of overlapping markers across the whole map and obscured the very buses being looked for.
- Focus also stopped holding back the line it was meant to show. It matched vehicles on `line.buses[].traccar_device_id` alone, which is admin data that most tenants do not have — M'sila links two of sixty-five with ids that match nothing, Constantine and Djelfa return `buses: []` — so focusing a line produced an empty set of vehicles and every bus on the map was dimmed, that line's own among them. Focus now uses the same attribution as the rest of the map: the tenant's records, the line the operator wrote into the tracker name, and failing both, the road the bus is driving. Measured on M'sila: focusing Line 10 drew 43 ghosted vehicles and highlighted none; it now draws that line's 4 and nothing else.
