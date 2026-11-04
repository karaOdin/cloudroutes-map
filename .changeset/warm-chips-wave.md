---
"cloudroutes-map": minor
---

- Every line is now a chip across the top of the map. Focusing a line draws that one service and its vehicles and hides the rest, which is the most useful thing the map does, and it was three taps down — open the drawer, expand a card, press "Show on map". Tapping a chip focuses and frames the line; tapping it again clears. The active chip takes the line's colour and scrolls itself into view, so the strip never contradicts the map.
- The strip sits under whatever the host draws above the WebView, read from the same `--map-inset-top` the control stack uses. The host does not currently inject `MAP_INSET_TOP`, so until it does this falls back to an assumed 140px.
- Tapping the map background cleared the focused line, and that included taps on controls drawn over the map. Leaflet's handler runs before React's, so choosing the line already focused cleared it and then re-selected it, and a chip could never be switched off.
