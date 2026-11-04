---
"cloudroutes-map": patch
---

- Vehicle movement now slides over the interval the fixes actually arrive at, instead of a fixed 900ms. A fixed duration darted across the gap and then sat still until the next fix, which read as jumping; the duration is now taken from the previous hop, so the vehicle is still moving when the next one lands and it self-tunes to whatever cadence the trackers use.
- Fixed a bus spinning 340 degrees backwards whenever its heading crossed north. CSS interpolates rotation numerically, so 350deg to 10deg went the long way round; the angle now accumulates using the shortest signed turn.
- Added an "awaiting fix" ring that pulses on a vehicle only once its next fix is overdue, so the map shows something is late without carrying the vehicle forward on a guess. Dead reckoning would present a prediction as a reading — a bus at a red light would keep rolling down the street.
