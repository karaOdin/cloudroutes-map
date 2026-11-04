---
"cloudroutes-map": minor
---

- Fixed a missing semicolon in the `--primary-blue` declaration that made all 32 of its usages invalid at computed-value time (control borders, active states, focus rings never rendered).
- Moved design tokens into `index.css` as a global base layer and removed the leftover Vite starter styles; legacy variable names kept as aliases.
- Refreshed map controls, bottom sheets, popups and buttons; markers redrawn as crisp div icons.
- Bus marker is now black with a white casing ring so it separates from any line colour.
- Line polylines gained a darkened casing, making low-contrast tenant colours readable without changing their colour.
- Bus stops ranked: interchanges (2+ lines) carry more weight than ordinary stops.
- Popup offset now handled per-icon via `popupAnchor` instead of a global `-75px` shift that misplaced route popups.
