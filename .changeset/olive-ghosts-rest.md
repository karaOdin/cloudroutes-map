---
"cloudroutes-map": patch
---

- Focusing a line now hides the stops it does not serve, rather than drawing them at a fifth opacity. With the vehicles off that line already hidden, half-filtering the stops left the map speckled with ghosts around the one route being looked at and read as broken rather than filtered. Measured on M'sila: focusing a line went from 112 stops drawn, 95 of them ghosted, to 17 drawn and none faded.
- A journey drawn on the map likewise hides the vehicles that are on none of its lines instead of fading them.
- The dimming path is gone rather than left unused: nothing sets it any more, so the opacity, z-index and label-suppression branches that depended on it have been removed from both marker components.
