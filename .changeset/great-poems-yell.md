---
"cloudroutes-map": minor
---

- Vehicles can now show their name without crowding the map. A label is placed only where there is room for it, checked greedily in screen pixels at the zoom being viewed, so a cluster yields one label rather than a pile. Hidden below zoom 16, and from zoom 14 for the vehicles of a focused line, which get first claim on the space. Against real fleet positions this shows 0 of 25 labels at the depot at zoom 15 and 22 of 25 once vehicles are spread along their routes at zoom 16.
- Label text comes from a CSS custom property rather than the markup, so one cached icon is still shared by every vehicle and showing or hiding a label costs no re-render.
- Vehicle names are tidied for display; the tenant data carries stray spacing such as "23 / AADL  NUIT".
