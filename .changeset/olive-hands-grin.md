---
"cloudroutes-map": patch
---

- Fixed vehicles crossing a whole block in a fifth of a second and then sitting still. A blanket `.leaflet-marker-icon { transition: transform var(--dur) ... }` sat later in App.css than the vehicle rule and won on source order, so every hop animated over 220ms whatever duration the code asked for. Measured on the running app, vehicles moved on 12 of 393 frames with steps up to 38px; they now move on 263 of 394 frames with a largest step of 0.7px and no jumps at all. The same rule also made all 83 stop markers slide into place after every zoom, since Leaflet repositions markers on zoom and only vehicle markers were guarded against it.
- Slide duration now comes from the smoothed reporting cadence rather than one packet's arrival gap. The trackers report on a flat 10s beat while arrivals range from 0.08s to 31.8s, so 7% of hops changed pace by more than 3x.
- Plausibility is judged from GPS `fixTime` deltas rather than arrival gaps, so two packets landing together no longer make ordinary travel look like 1000 km/h and snap.
- A stretch now resumes from where the vehicle visibly is rather than from its last fix. 36% of updates arrive before the previous stretch has finished, and restarting from the last fix threw the marker forward to a point it had not reached.
- `BusMarker` is memoised and its position tuple is stable, so react-leaflet stops calling `setLatLng` on every re-render — that was dragging a mid-slide marker to its destination a median of 37 times per slide.
- Added `scripts/observe-markers.mjs`, which samples rendered marker transforms against the dev server and reports whether they actually animate.
