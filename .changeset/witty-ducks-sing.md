---
"cloudroutes-map": patch
---

- Vehicles whose Traccar device record cannot be fetched are no longer captioned with their internal device id. A marker previously fell back to `#1202`, which reads as a name and is not one — it is Traccar's internal identifier, and positions carry no name field at all. Such a vehicle is now drawn without a name, no label and no tooltip; only a name Traccar actually supplied is ever shown. Unnamed vehicles also stop competing for label space, so they cannot deny a named neighbour its label.
