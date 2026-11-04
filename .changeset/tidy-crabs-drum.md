---
"cloudroutes-map": patch
---

- A road matched only by proximity is now held to a 25 m tolerance rather than 60 m. Following a road displaces the marker onto it by up to the tolerance — a correction when the road is right, an error of the same size when it is a parallel street — so a guess earns a tighter bound than an assignment does. On live Constantine data, where every match is a guess, this cost two percentage points of coverage and halved the worst displacement, 47 m to 21 m.
- Added `docs/LIVE-MAP.md`, documenting the live map end to end: feed transport and fallback, measured cadence and latency, vehicle freshness and movement, road-following and its failure modes, stops, lines, labels, the diagnostic scripts, every tunable constant with the measurement behind it, known tenant data problems and known gaps.
