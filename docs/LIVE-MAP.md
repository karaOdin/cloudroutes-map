# The live map

How the rider map works: what it draws, where the data comes from, how vehicle
movement is reconstructed, and which numbers to turn when it misbehaves.

Everything here is measured against real tenant feeds rather than assumed. Where
a constant exists, the measurement that justifies it is given alongside it.

---

## 1. Shape of the system

```
Traccar  ──WebSocket──▶  traccar-socket.ts  ──▶  use-live-positions.ts  ──▶  react-query cache
   │                     (reconnect,               (merge, dedupe)              ["positions"]
   │                      silence watchdog)                                     ["devices"]
   │                                                                                 │
   └──HTTP /devices─────────────────────────────────────────────────┐                │
                                                                     ▼                ▼
tenant API  ──/lines /stops /default-map──▶  react-query  ──▶  marker layers ──▶ BusMarker
                                                                                      │
                                                              route-path.ts ◀──────────┘
                                                              (snap, slice, sample)
```

Two independent backends:

| | host pattern | serves |
|---|---|---|
| **tenant API** | `<tenant>.routes.devcloud.dz/api` | `/lines`, `/stops`, `/default-map`, `/gps/positstions` |
| **Traccar** | `<tenant>bus.malimspotter.dz/api` | `/session`, `/devices`, `wss://…/socket` |

Both are configured per tenant in `.env` (`VITE_API_URL`, `VITE_TRACCAR_URL`,
`VITE_TRACCAR_WS_URL`, `VITE_TRACCAR_TOKEN`), overridable at runtime by
`window.env` injected by the React Native host.

---

## 2. The live feed

### 2.1 Transport

`src/services/traccar-socket.ts` owns a single module-level socket shared by the
whole app.

- **Reconnects** with exponential backoff, `1s → 30s` cap
  (`RECONNECT_BASE_MS`, `RECONNECT_MAX_MS`)
- **Reconnects immediately** on `visibilitychange → visible` and on `online`.
  These are the two events that matter on a phone: Android suspends a
  backgrounded WebView and kills its socket outright.
- **Silence watchdog.** A socket can sit in `readyState: OPEN` and deliver
  nothing — the server stops pushing, or a middlebox holds a dead connection.
  Nothing about the socket reveals this, so silence is timed: no message for
  `SILENCE_TIMEOUT_MS` (60 s), checked every `SILENCE_CHECK_MS` (15 s), and the
  feed is declared down and the socket closed so the reconnect path replaces it.

  *Justification:* measured message spacing is a median of 120 ms with a largest
  observed gap of 2.4 s. Sixty seconds is ~25× anything normal.

`isSocketConnected()` therefore means **open and delivering**, not merely open.

### 2.2 Fallback

`use-device-position.ts` polls `/gps/positstions` **only while the socket
reports down**:

- `FALLBACK_POLL_MS` = 12 s — just above the measured 9.8 s median reporting
  interval, so falling back costs at most one skipped report
- `POLL_JITTER_MS` = up to 5 s, fixed once per session. A feed outage is
  simultaneous for every client; without jitter every rider's app would poll the
  same endpoint on the same beat against a backend already in trouble.

With the socket healthy, polling is off entirely and adds no load.

### 2.3 Applying updates

`src/hooks/use-live-positions.ts` — one subscription, shared by both marker
layers.

**Cache writes are functional** (`setQueryData(key, (current) => …)`), never
built from values captured at render time. This is not stylistic: measured
against the live feed, **50 of 253 position messages arrived within 30 ms of the
previous one** — closer together than React can re-render. A handler closing
over `positions.data` rebuilt the array from stale data and silently discarded
the update before it. Replaying real message timings, that lost **13% of updates
at an 8 ms render and 22% at 50 ms**.

A stable callback also means the listener is registered **once for the session**
rather than being torn down and re-added on every message (253 times per 150 s
before).

**Whole positions are merged, not just coordinates.** Copying only
`latitude`/`longitude`/`course` left `fixTime` frozen at whatever the initial
HTTP snapshot said. Nothing else refreshes it while the socket is healthy, so
every vehicle aged into "stale" at five minutes and stopped being drawn at
thirty — while reporting normally throughout. Replaying a 150 s capture:
apparent fix age **157 s and climbing** one-for-one with session length, against
**13 s** once the whole position is merged.

**Device events are applied too.** They are ~55% of socket traffic and were
previously parsed and dropped. They carry tracker status and any vehicle absent
from the initial snapshot. They arrive at ~2/s and almost always differ only in
`lastUpdate`, which nothing on the map reads, so the cache is replaced **only
when a field the UI actually uses has changed** (`status`, `name`, `category`,
`uniqueId`, `disabled`) — otherwise every marker would re-render twice a second
for no visible difference.

---

## 3. Measured feed characteristics

From `scripts/gps-probe.mjs`, 150 s captures against live tenants.

### Reporting cadence

| | min | p10 | median | p90 | max |
|---|---|---|---|---|---|
| **GPS travel time** between fixes | 9.0 s | 10.0 s | **10.0 s** | 10.0 s | 35 s |
| **arrival gap** at the client | 0.08 s | 5.9 s | 9.8 s | 11.6 s | 31.8 s |

Trackers report on a **flat 10-second beat**. Arrival gaps are pure network
jitter and must never be used to measure travel.

### Latency decomposition

| stage | median | p90 |
|---|---|---|
| `fixTime` → `deviceTime` (device buffering) | **0.00 s** | 0.00 s |
| `deviceTime` → `serverTime` (GSM uplink) | 2.35 s | 5.42 s |
| `serverTime` → arrival (Traccar + internet) | 3.84 s | 6.48 s |
| **total** | **6.19 s** | 12.55 s |

Corrected for ~1.1 s of local clock skew (both servers agreed), the real total
is **~5 s**, of which roughly **2.4 s is spent inside Traccar** — round-trip to
that host is only 0.47 s, so it is not network. Traccar decodes, persists, then
broadcasts; that is usually database write latency. **It is the only part of the
chain you control.** Device buffering is already zero.

### What the rider sees

With a 10 s cadence and ~5 s latency, the newest *arrived* fix was taken 5–15 s
ago. Interpolation then shows the vehicle travelling between the last two fixes,
so the drawn position averages **~15 s behind reality** — roughly 125 m at
30 km/h. Without interpolation it would be ~10 s / ~83 m, but it would teleport.

### Field availability

| field | populated | note |
|---|---|---|
| `fixTime`, `deviceTime`, `serverTime` | always | authoritative, GPS-derived |
| `speed`, `course`, `valid` | always | speed is in **knots** |
| `accuracy` | always **`0`** | Traccar publishes no accuracy — a quantitative uncertainty circle is impossible |
| `outdated` | **never sent** | the check on it is a harmless no-op |

---

## 4. Vehicles

### 4.1 Freshness

`busFreshness()` in `helpers.ts` grades each vehicle from
`fixTime` → `deviceTime` → `device.lastUpdate` (in that order — `lastUpdate`
lags the real fix by ~154 s, so it must never be preferred).

| age | treatment |
|---|---|
| < `BUS_STALE_AFTER_MS` (5 min) | normal black marker |
| 5–30 min | grey, semi-transparent, popup shows "last seen *n* min ago" |
| > `BUS_OFFLINE_AFTER_MS` (30 min) | **not drawn at all** |

The last row is the point. Traccar serves a device's last known fix forever, so
a bus parked since last night was being drawn as if running. A 30-minute-old
position is not stale information, it is *wrong* information — the vehicle could
be kilometres away.

> ⚠️ **Consequence:** if Traccar goes down entirely, vehicles vanish one by one
> as they cross 30 minutes and the map looks broken rather than degraded. There
> is no "live data unavailable" state. This is the largest known gap.

### 4.2 Marker geometry

The vehicle icon is a 37 × 46 SVG whose disc is centred at (18.5, 27.5).
`iconAnchor` **must** be that disc centre.

It was previously `[w/2, h × 1.2]` = `[18.5, 55.2]` — below the artwork
entirely — drawing every bus **27.7 px north** of its real position. Because
that is a *pixel* offset, its ground error scales with zoom:

| zoom | error |
|---|---|
| z13 | 427 m |
| **z15** (default) | **107 m** |
| z17 | 27 m |
| z19 | 7 m |

That is why buses appeared on top of houses and drifted back toward the road as
you zoomed in. The rotation also pivots on the disc centre
(`transform-origin: 18.5px 27.5px`), not the box centre, or a bus appears to
shift position as it turns.

### 4.3 Movement — the road-following walk

**`src/services/route-path.ts`**

1. **`snap(path, point)`** — projects a fix onto every segment of a route
   polyline (263–1,591 points per line), keeping the nearest. Returns not just a
   distance but a *location along the route*: segment index plus fraction.
   Geometry is done in a flat local frame (longitude scaled by `cos(lat)`);
   over a few hundred metres the error is far below GPS accuracy, and it is
   cheap enough to run per vehicle per update.

2. **`pathBetween(path, from, to, opts)`** — snaps both ends and returns the
   polyline vertices between them, capped by the two snapped points:
   `[snapped A, vertex 215, … vertex 219, snapped B]`. Handles reverse travel.
   Returns `null` when the road cannot honestly account for the movement.

3. **`chooseRoute(...)`** — prefers the vehicle's assigned line; falls back to
   the **nearest** line otherwise. The assignment is admin data and some tenants
   have none of it (Constantine and M'sila both return `buses: []` on every
   line), which left every vehicle there interpolating in a straight line and
   cutting corners through buildings. The aim is to know which *road* the
   vehicle is on, not which *service* it runs — where two lines share a road
   they describe the same tarmac. `remembered` is checked first so the full scan
   only runs when a vehicle actually leaves its road. A guessed match is held to
   a tighter tolerance than an assigned one — see §4.6.

4. **`measure()` / `pointAt(route, distance)`** — precomputes cumulative
   distance, then samples position **and bearing** at any distance along the
   route. The bearing is why a vehicle rotates through a turn instead of
   snapping.

**`BusMarker.tsx`** runs the animation:

```js
const progress = Math.min(1, (now - startedAt) / duration);
const { point, bearing } = pointAt(route, route.total * progress);
marker.setLatLng(point);
turnTo(bearing);
```

`requestAnimationFrame`, ~60 fps. Driving it in JS rather than with a CSS
transition is what makes a *curved* path possible — CSS can only interpolate
straight between two transforms.

**Four things must hold for that loop to survive:**

- **Duration comes from the smoothed cadence**, not from one packet's arrival
  gap. Using raw arrival gaps made 7% of hops change pace by more than 3×, worst
  case 303×. An 80 ms slide across 10 s of travel is a teleport.
- **Plausibility is judged from `fixTime` deltas.** Two packets landing together
  made ordinary travel look like 1000 km/h and snap.
- **The stretch resumes from where the vehicle visibly is**
  (`marker.getLatLng()`, which mid-walk holds the interpolated position). **36%
  of updates arrive before the previous stretch finishes**; restarting from the
  last fix threw the marker forward to a point it had not reached.
- **Nothing else may touch the marker.** `react-leaflet` compares `position` by
  reference, so the tuple is memoised and `BusMarker` is `memo`'d — otherwise it
  called `setLatLng` on every re-render of the layer, a median of **37 times per
  slide**, 14,025 spurious calls in 150 s.

**And no CSS transition may sit on the element.** A blanket
`.leaflet-marker-icon { transition: transform 220ms }` used to win on source
order, so every one of the 60 `setLatLng` calls per second started a fresh
220 ms eased transition and the element permanently chased a stale target. The
vehicle rule is now qualified `.leaflet-marker-icon.bus-icon` so no bare-class
rule can take it again, and `MarkerMotionGuard` suppresses it during zoom (where
Leaflet repositions every marker at once).

Measured on the running app, sampling computed transforms at 10 Hz for 40 s:

| | before | after |
|---|---|---|
| frames with motion | 12 of 393 | **263 of 394** |
| largest single step | 38.2 px | **0.7 px** |
| steps > 8 px across all markers | up to 5 each | **0** |

**Honesty guards.** Falls back to a straight slide when a fix is more than
`MAX_OFF_ROUTE_M` (60 m) off the line, or the route is more than
`MAX_DETOUR_RATIO` (3×) the direct line — usually two fixes snapped to opposite
arms of a loop. Snaps outright above `MAX_PLAUSIBLE_SPEED_MS` (33 m/s ≈
120 km/h) or a `MAX_TRAVEL_GAP_MS` (60 s) gap. The endpoints are always
positions the vehicle really reported; only the path between them is
reconstructed.

Measured on live Constantine data: **93% of moving hops follow a road**, and the
straight lines they replace were straying a median of **6.0 m** from it, p90
14.8 m, worst 45.6 m.

### 4.6 When the route data is missing or wrong

**Following a road moves the marker onto that road**, by up to the match
tolerance. With the right road that is a *correction* — GPS noise exceeds the
snap, so map-matching improves accuracy (measured: 2.2 m displacement against a
correct line). With the wrong road it is an *error* of the same size. So the
tolerance is not just a filter, it is the **worst displacement the system can
introduce**.

Because of that, a guess is held to a tighter bound than an assignment:

| how the road was matched | tolerance | worst displacement |
|---|---|---|
| the vehicle's **assigned** line | `MAX_OFF_ROUTE_M` — 60 m | 60 m |
| **nearest line**, no assignment | `MAX_GUESSED_OFF_ROUTE_M` — 25 m | 25 m |

An assignment is evidence and earns the looser bound; proximity alone does not.
Measured on live Constantine data, where every match is a guess, tightening
60 m → 25 m cost **two percentage points of coverage** (93% → 91% of moving
hops) and **halved the worst displacement, 47 m → 21 m**.

**Missing or degenerate polylines are all handled and never throw.** Every case
below returns `null`, and the vehicle falls back to a straight-line slide:

| input | result |
|---|---|
| `waypoints` absent, `null`, or `[]` | line not offered as a route |
| fewer than 2 readable points | line not offered as a route |
| two identical points | `pathBetween` returns `null` |
| unreadable points (M'sila's flat `[lat, lng]`) | dropped when paths are built |
| no line in the tenant has usable geometry | `chooseRoute` returns `null` |

A line with no usable geometry is also skipped by `LineMarkers`, so it is not
drawn either — it simply does not exist on the map.

**A wrong-but-plausible polyline is the one real risk.** A parallel street
within tolerance will be chosen and followed, displacing the vehicle onto it.
Verified behaviour with no assignment (25 m bound):

| parallel road offset | outcome |
|---|---|
| 15 m | followed — marker displaced ~15 m |
| 24 m and beyond | rejected → straight line |

With an assignment the bound is 60 m, so a 45 m-offset assigned line is still
followed. That is deliberate: if the admin says a bus runs that line, a 45 m
discrepancy is more likely bad survey data on a real road than a wrong match.

**If a tenant's polylines are systematically offset**, every vehicle on them
rides the offset. The tell is `gps-probe.mjs` reporting a consistent non-zero
off-route distance for vehicles that are visibly in service. Fix the geometry,
or drop `MAX_OFF_ROUTE_M` below the offset so the app stops trusting it.

### 4.7 "Awaiting fix" ring

A ring pulses on a vehicle once its next fix is overdue. This animates
**confidence, not position** — carrying the vehicle forward on its last heading
would look convincing and would be a guess presented as a reading (a bus at a
red light would keep rolling down the street).

Threshold is `max(smoothed cadence × AWAITING_GRACE, MIN_AWAITING_MS)`:

- the cadence is an EMA (`GAP_SMOOTHING` 0.3) ignoring gaps under
  `MIN_MEANINGFUL_GAP_MS` (1 s), so Traccar's back-to-back duplicates cannot
  collapse the estimate
- `MIN_AWAITING_MS` (20 s) is a floor so the ring means *overdue* — about two
  missed reports — not "slightly irregular"

Without the floor, `1.5 ×` the previous single gap fired on **20% of intervals**
— about a fifth of the fleet ringing at any moment. With it: **3.9%**.

Driven by `classList` and CSS, so waiting costs no re-renders. Stops once a
vehicle goes stale, since grey already says it has gone quiet.

### 4.8 Names

Labels are placed **greedily in screen space**: sort, place each label that does
not land within `LABEL_CLEARANCE_PX` (52 px) of one already placed, skip the
rest. A crowd yields one label rather than a pile. Ordering is focused-first
then by device id — deliberately stable, so a label does not flicker between
neighbours as they move.

- nothing below `LABEL_MIN_ZOOM` (16); tap for the popup instead
- `FOCUS_LABEL_MIN_ZOOM` (14) for a focused line's vehicles, which also claim
  space first

Against real fleet positions: at the depot (25 vehicles inside 90 m) **0 labels
at z15**, 1 at z16, 4 at z17 — never a pile. With vehicles spread along their
routes, **22 of 25 at z16**, all by z17.

Text is carried in a `--bus-label` custom property read by CSS `content`, so one
cached icon is shared by every vehicle and showing or hiding a label is one
`classList` call. Names are tidied on the way in — tenant data carries stray
spacing such as `"23 / AADL  NUIT"`.

---

## 5. Stops and lines

**Stops** are coloured by their line — a disc in the line's colour, ringed in a
darker shade of the same hue, haloed in white. Interchanges (2+ lines) are a
neutral white disc with a dark ring: they belong to several lines, so picking
one would be a lie. All rings are `box-shadow`, so they cost no layout size.

Minor stops are gated below `MINOR_STOP_MIN_ZOOM` (15) — the map opens at 15, so
only zooming *out* is affected. A focused line's own stops bypass the gate.

Colours arrive from the tenant API and are hex-validated before reaching a
`style` attribute.

**Lines** are drawn as three strokes: an invisible 22 px hit stroke (a 4 px line
is untappable with a thumb), a darkened casing, and the coloured core. The
casing exists because tenant colours include `#FFFF00` at **1.07 : 1** contrast
on a light basemap — invisible. The casing takes that to 3.12 : 1 without
altering the line's identity colour.

Cost: 3,848 polyline points across 7 lines becomes 11,544 in 21 paths. If
panning feels heavy on a low-end device, `preferCanvas` on the `MapContainer`
moves polylines to canvas and leaves markers on DOM — which is exactly the split
this needs.

**Focus mode** (`use-focus-store.ts`): tap a line and it comes forward while
everything else drops to 16%. Lines set `bubblingMouseEvents: false` so a tap on
a line does not also reach the map's clear-focus handler; the focused line is
sorted last so Leaflet paints it on top; a dismissable pill names it, because
focus is a state you can enter by accident.

---

## 6. Diagnostics

Two scripts, both read-only.

### `scripts/gps-probe.mjs`

```bash
node scripts/gps-probe.mjs --seconds=150
```

Authenticates, subscribes to the socket, and reports reporting cadence, fleet
staleness, distance from route lines, jump sizes and implied speeds, and which
Traccar fields are actually populated. Credentials come from `.env` and are
never printed. Every number in this document came from it.

### `scripts/observe-markers.mjs`

```bash
npm run dev
node scripts/observe-markers.mjs          # needs: npx playwright install chromium
```

Drives the running app in a headless browser and samples rendered marker
transforms at 10 Hz, reporting whether vehicles actually animate.

**Healthy** is motion on most frames with sub-pixel steps and zero jumps. A
dozen frames with 38 px steps is what a broken animation looks like.

This exists because three rounds of reasoning about the animation all missed a
CSS override that one measurement of the rendered pixels found immediately.
**When movement looks wrong, run this before theorising.**

---

## 7. Constants reference

| constant | value | file | why |
|---|---|---|---|
| `BUS_STALE_AFTER_MS` | 5 min | `helpers.ts` | 30 missed reports at a 10 s cadence |
| `BUS_OFFLINE_AFTER_MS` | 30 min | `helpers.ts` | beyond this the position is wrong, not old |
| `MIN_SLIDE_MS` | 900 ms | `BusMarker.tsx` | shorter looks like a twitch |
| `MAX_SLIDE_MS` | 20 s | `BusMarker.tsx` | longer looks like drift |
| `MAX_TRAVEL_GAP_MS` | 60 s | `BusMarker.tsx` | beyond this it stopped reporting, it did not travel |
| `MAX_PLAUSIBLE_SPEED_MS` | 33 m/s | `BusMarker.tsx` | ≈120 km/h — a dropped feed, not a bus |
| `MAX_OFF_ROUTE_M` | 60 m | `BusMarker.tsx` | assigned line: GPS error + road width + waypoint simplification |
| `MAX_GUESSED_OFF_ROUTE_M` | 25 m | `BusMarker.tsx` | nearest-line guess: also the worst displacement it can introduce |
| `MAX_DETOUR_RATIO` | 3 | `BusMarker.tsx` | catches opposite arms of a loop |
| `GAP_SMOOTHING` | 0.3 | `BusMarker.tsx` | EMA weight on the newest interval |
| `MIN_MEANINGFUL_GAP_MS` | 1 s | `BusMarker.tsx` | excludes Traccar's duplicates from the estimate |
| `AWAITING_GRACE` | 1.5 | `BusMarker.tsx` | multiple of expected cadence before "overdue" |
| `MIN_AWAITING_MS` | 20 s | `BusMarker.tsx` | floor: ring must mean overdue, not irregular |
| `LABEL_MIN_ZOOM` | 16 | `bus-labels.ts` | anonymity below this |
| `FOCUS_LABEL_MIN_ZOOM` | 14 | `bus-labels.ts` | a focused line is the point |
| `LABEL_CLEARANCE_PX` | 52 | `bus-labels.ts` | roughly a label's own width |
| `MINOR_STOP_MIN_ZOOM` | 15 | `icons.ts` | map opens at 15 |
| `RECONNECT_BASE_MS` / `MAX` | 1 s / 30 s | `traccar-socket.ts` | backoff bounds |
| `SILENCE_TIMEOUT_MS` | 60 s | `traccar-socket.ts` | ~25× the largest observed message gap |
| `FALLBACK_POLL_MS` | 12 s | `use-device-position.ts` | just above the 9.8 s median interval |
| `POLL_JITTER_MS` | 0–5 s | `use-device-position.ts` | avoids a synchronised load spike |

---

## 8. Known data problems, by tenant

These are **admin data issues**, not code. Each degrades a real feature.

### Chlef
- 4 device ids on buses do not exist in Traccar
  (`863844052244099`, `357962507516904`, `350805650179912`, `357962507507036`) —
  those buses can never appear
- 7 devices are online and reporting but attached to no line
- duplicate stops `Administration Etuc` / `etus chlef`, **3.8 m apart**
- one stop has no line attached
- `radar` line has zero buses; `radar` (`#FFFF00`) and `712 Logements`
  (`#00f0ff`) are near-invisible colours on a light basemap

### Constantine
- **all 12 lines return `buses: []`** — nothing is linked to a line. Affects
  line filtering, focus mode and "line only" bus mode. Route-following now works
  anyway via nearest-line matching, but the rest does not.

### M'sila
- **`ligne 18` has a malformed `waypoints`**: a single flat `[lat, lng]` pair
  where a list of pairs belongs. The line is undrawable and is skipped. This
  previously took down the entire application.
- all 6 lines return `buses: []`, same as Constantine

---

## 9. Known gaps

| gap | impact |
|---|---|
| **No "feed down" state** | If Traccar goes dark, vehicles vanish one by one past 30 min and the map looks broken rather than degraded. Largest remaining hole. |
| **No error boundary** | Any throw in any marker, from any tenant's data, blanks the whole screen. This has already happened once. |
| **Depot cluster** | Overnight the whole fleet parks inside ~90 m, 4–6 km outside every route line — a meaningless blob. Labels no longer pile up there, but the blob remains. |
| **Bundle size** | 668 kB / 214 kB gzip in one chunk, loaded in a WebView on mobile data. Nothing is lazy. |
| **Dead layer** | `SearchBar.tsx`, `RouteDisplay.tsx`, `data.json`, unused hooks and ~1,400 lines of CSS that no component references. Why `App.css` is 3,200 lines. |
| **`.env` is committed** | It contains live Traccar tokens. Rotate and untrack. |
| **Route-following unverified in dense traffic** | Verified on constructed geometry and on live Constantine data, but not on a tenant where vehicles and lines are both dense. |

---

## 10. Debugging checklist

**Vehicles jump or move wrong**
1. Run `scripts/observe-markers.mjs`. Sub-pixel steps on most frames = healthy.
2. If steps are large and rare, something is overriding, interrupting or
   restarting the animation. Check for a CSS `transition` on
   `.leaflet-marker-icon`, and that `position` is still memoised.

**Vehicles cut corners**
- They are not following a road. Check `/lines` returns non-empty `waypoints`,
  and that vehicles are within `MAX_OFF_ROUTE_M` of some line
  (`gps-probe.mjs` reports this).

**Vehicles frozen, then jump a long way**
- The socket is dead. Check the watchdog and reconnect; `gps-probe.mjs` confirms
  whether the server side is delivering.

**Whole map blank**
- A throw during render. Open the app in a browser and read the console — there
  is no error boundary, so any exception unmounts everything. Malformed tenant
  geometry is the usual cause.

**Vehicles missing**
- Check freshness first: anything past 30 minutes is deliberately not drawn.
  `gps-probe.mjs` prints fleet staleness buckets.
