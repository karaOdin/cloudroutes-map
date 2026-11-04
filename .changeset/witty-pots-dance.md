---
"cloudroutes-map": minor
---

- Added a Lines & stops sheet: every line with its colour, stop count and length, expanding to its stops in the order they are travelled, each tappable to fly there. A map answers "what is near me" and is a poor way to answer "where does this line go", which had no surface at all before.
- Stop order is recovered from the geometry. The API returns a line's stops as an unordered set — the pivot carries only the two ids and no sequence — so each stop is projected onto its line's polyline and sorted by distance along it, which also gives the distance shown against each stop.
- Search filters by line name or stop name; interchanges are marked on the timeline.
