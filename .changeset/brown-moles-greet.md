---
"cloudroutes-map": patch
---

- The stop order shown for a line is now checked before it is presented. The order is derived from geometry — the API returns a line's stops as an unordered set — and on a line whose stops do not sit on its drawn route it is nonsense. Each line's derived order is validated by comparing the straight-line gap between consecutive stops to the distance along the route between them; a line failing that check keeps the order the API gave, hides the distances and says the order is unconfirmed. Audited across four tenants, this rejects exactly the four lines whose stops sit hundreds to thousands of metres off their own route, and trusts the other twenty-nine.
- Tightened the sheet header, which took a third of the panel before any content.
- Fixed Arabic terminus names being truncated at the wrong end in the left-to-right summary row.
