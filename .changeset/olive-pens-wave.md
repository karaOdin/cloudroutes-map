---
"cloudroutes-map": minor
---

- Overlapping vehicles can now be reached. Measured at the default view, 53 vehicles produced 15 pairs closer together than one icon is wide, and the one underneath could not be tapped at all. Tapping a pile now fans it out, each vehicle keeping a leader line back to the position it actually reported — the marker's coordinate is never moved, only the icon steps aside. A pile of more than eight zooms in instead, which separates them for real rather than drawing a starburst across the screen.
- Tapping a vehicle follows it: the map pans to keep it in view, with a banner naming what is happening and one tap to stop. Panning rather than re-centring, so the user's own zoom is left alone.
- Map chrome follows the chosen basemap. Controls, popups, scale and attribution go dark over the Dark and Satellite styles, where white chrome was unreadable. Keyed off the style rather than `prefers-color-scheme`, since what matters is what sits behind the controls.
- Added a scale bar, a button that frames the whole network, press feedback on controls, and a loading sweep in place of the grey void shown before the first tiles paint.
