---
"cloudroutes-map": minor
---

- Added focus mode: tapping a line brings it forward and drops the rest of the network back, with a dismissable pill naming the focused line. Stops and vehicles off that line fade with it, and its own stops stay visible when zoomed out.
- Lines gained an invisible wide hit stroke so they are tappable with a thumb.
- Stale vehicles are no longer drawn as live: a fix older than 5 minutes renders grey with a "last seen" note, and one older than 30 minutes is not drawn at all. Traccar keeps serving the last known position indefinitely, so those markers were showing buses where they no longer are.
- Bus stops are now coloured by their line, with a darker ring of the same hue and a white halo; interchanges stay neutral white-on-dark. Minor stops are gated below zoom 15 so zooming out no longer stacks all 83 at once.
- Bus popup glyph no longer hardcodes cyan against the black marker.
