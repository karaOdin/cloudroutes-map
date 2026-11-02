---
"cloudroutes-map": patch
---

- Swiping the lines strip now scrolls the chips instead of dragging the map. Leaflet begins a map drag from a pointer press anywhere inside its container, and the strip is inside it, so a sideways swipe panned the map 272px and left the strip exactly where it was — the chips past the edge of the screen could only be reached by tapping. Only the press is held back, so taps on a chip still work and the map still pans from anywhere else.
