---
"cloudroutes-map": patch
---

- Fixed every bus stop on the map rendering in the same fallback colour. The stops endpoint describes each stop's lines as `{ id, name }` with no colour, so the line-coloured stop beads were silently falling back to one shade for the whole network. Colours are joined from the lines endpoint, which has them — M'sila goes from one colour to six.
- The Lines & stops sheet now shows each line's two termini on its collapsed row, which is how a rider identifies a line and decides on a direction.
- Interchange stops list what they connect to, as a chip per line in that line's own colour.
- Terminus stops are drawn as a distinct mark rather than a larger version of an ordinary stop, and "Show on map" is a quiet secondary pill instead of a full-width gradient bar that shouted louder than the stops beneath it.
