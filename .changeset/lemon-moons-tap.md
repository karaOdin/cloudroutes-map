---
"cloudroutes-map": patch
---

- Vehicles no longer cut corners through buildings when turning. Interpolation followed a vehicle's assigned line, but that link is admin data and some tenants have none of it — Constantine returns `buses: []` on all twelve lines, so every vehicle there fell back to a straight line between fixes. When there is no usable assignment the nearest line is now used instead: the aim is to know which road the vehicle is on, not which service it runs, and where two lines share a road they describe the same tarmac. The off-route and detour guards still decide each hop. Measured on live Constantine data, 93% of moving hops now follow a road, and the straight line they replace was straying a median of 6 m and up to 45.6 m from it.
