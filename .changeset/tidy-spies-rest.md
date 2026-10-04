---
"cloudroutes-map": minor
---

- Tapping a stop now says which stop. Flying to one from the lines sheet moved the map but left the rider to guess which of the dots on screen was the one they asked for; the stop is now enlarged, named in a pill above it, and ringed by an expanding pulse. Tapping a stop marker on the map calls it out the same way.
- The callout clears on the next tap on the map, and on its own after nine seconds — a marker pulsing indefinitely stops reading as an answer and starts reading as a fault.
- Stops are drawn by their own component so one can be called out without rebuilding any icon, leaving the per-colour icon cache intact.
