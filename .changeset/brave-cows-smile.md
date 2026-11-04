---
"cloudroutes-map": minor
---

- Added a basemap style picker as a map control, where a rider expects it, rather than a field buried in the filters sheet. Each option previews the style over the area actually on screen.
- Replaced the basemap list. All three CARTO styles were serving an "API KEY REQUIRED" watermark instead of a map — with HTTP 200 and a plausible content length, so only rendering a tile reveals it — and one of them was already offered to users. The list also held the German, Swiss and French OpenStreetMap mirrors, which look identical to the standard one. It is now six visibly different styles that were each checked by rendering a real tile: Classic, Streets, Light, Dark, Satellite and Terrain.
- A saved basemap that is no longer offered now falls back to the default instead of being restored with a dead URL.
- The map now shows tile attribution, which OpenStreetMap's licence and Esri's terms both require and which was missing entirely.
- Zoom controls use drawn icons rather than `+` and `−` text glyphs.
