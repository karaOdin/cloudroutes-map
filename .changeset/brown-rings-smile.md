---
"cloudroutes-map": minor
---

- Vehicles now interpolate along their own route line between fixes instead of moving in a straight line across the map. Both endpoints are positions the vehicle actually reported and the polyline between them is the road it runs, so a bus rounding a corner turns with the street rather than cutting through the block. Heading during the walk comes from the road being travelled.
- Falls back to the straight-line slide whenever the line cannot honestly account for the movement: a fix more than 60 m off route (diversion, deadheading, or a bus not currently running its assigned line), or a route more than 3x longer than the direct line (usually two fixes snapped to opposite arms of a loop).
