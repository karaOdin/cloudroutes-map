---
"cloudroutes-map": patch
---

- Fixed the whole map disappearing on tenants whose line data contains a malformed waypoint list. Leaflet's `latLng()` answers `null` for input it cannot read rather than throwing, and M'sila's "ligne 18" stores a single flat `[lat, lng]` pair where a list of pairs belongs — which reads as two bare numbers and produced two nulls. Those reached the route geometry and threw during render, unmounting the entire application. Unreadable waypoints are now dropped when the paths are built, and the geometry additionally skips malformed points rather than throwing.
