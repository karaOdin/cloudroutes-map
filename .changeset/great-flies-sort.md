---
"cloudroutes-map": minor
---

- Line filtering no longer depends on Traccar or on admin data. It matched `line.buses[].traccar_device_id` against a Traccar `uniqueId`, which is empty on Constantine and Djelfa and wrong on both of M'sila's two links, so the filter showed nothing on three tenants of four — and it could never cover a bus not yet on the tracker system. A vehicle is now also matched to a line by the line it is driving along. A declared link still wins where it exists.
- A vehicle is attributed to every line it could be on, not the nearest. Lines share roads — M'sila's Line 16 and Line 17 run the same street, both exactly on it — and a position cannot tell them apart, so picking one would be a coin toss presented as fact.
- While a journey is drawn, vehicles on none of its lines are dimmed. The route takes its line's colour, and where that colour is dark, as Line 16's `#000000` is, an unrelated bus marker on top of it read as part of the journey.
