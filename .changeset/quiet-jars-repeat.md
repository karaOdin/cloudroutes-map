---
"cloudroutes-map": patch
---

- Fixed live buses being drawn ~28px north of their real position. `iconAnchor` was `[w/2, h * 1.2]` = `[18.5, 55.2]` on a 46px-tall icon, placing the anchor below the artwork. Because the offset was in screen pixels, its ground error scaled with zoom — about 107 m at the default zoom 15 and 13 m at zoom 18, which is why vehicles appeared to sit on houses and then drift back towards the road as you zoomed in. The anchor is now the centre of the vehicle disc.
- Fixed the heading rotation pivoting on the icon box centre rather than the disc centre, which made a bus appear to shift position as it turned.
