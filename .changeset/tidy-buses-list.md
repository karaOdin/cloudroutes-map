---
"cloudroutes-map": minor
---

- Buses are now a list you can work from, alongside lines and stops. The map answers "which bus is near me"; it could not answer "where is 04/H017", and below zoom 16 there are no labels to hunt for. Tapping a row flies to that vehicle and follows it, since unlike a stop it drives away from wherever you were taken. The drawer stays open and the row is marked, the same as choosing a stop.
- A vehicle's line is now taken from what the operator stated rather than from where it happens to be. Two statements count: the tenant's own records, matched on the device Identifier, and the line written into the Traccar name — `B05 - L06` on Djelfa, `04/H017` and `607/04` on M'sila. Where neither exists the line is still worked out from the road, but it is drawn as an outlined chip instead of a solid one, so a reading of the road never passes for a fact about the service. On M'sila this took 44 of 54 vehicles from up to four guessed lines each down to one stated line.
- A number in a device name only counts as a line where the operator marked it as one — after an `L`, or as a whole field across a slash — and only where it names a line the tenant has. Djelfa's `dj.01`–`dj.21` are sequential device numbers and would otherwise have matched LIGNE 01–20 almost perfectly by accident.
- The bus popup carries that line too, so tapping a vehicle says which service it is running rather than only what it is called.
