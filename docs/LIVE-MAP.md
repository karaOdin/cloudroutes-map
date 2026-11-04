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

### Where configuration comes from

**In production, from your backend — not from `.env`.** The host app fetches
each tenant's endpoints and token and injects them into the WebView as
`window.env`, which `src/config/env.ts` reads first:

```ts
TRACCAR_URL: window?.env?.TRACCAR_URL ?? import.meta.env.VITE_TRACCAR_URL
```

The `VITE_*` values are the fallback and exist for local development only.
Nothing in this repo fetches configuration itself.

| key | purpose |
|---|---|
| `API_URL` | tenant API — lines, stops, default map, positions |
| `TRACCAR_URL` | Traccar REST base |
| `TRACCAR_WS_URL` | Traccar socket; a non-absolute value is treated as a path on the app's own origin |
| `TRACCAR_TOKEN` | Traccar token auth — works on 5+ |
| `TRACCAR_USER` / `TRACCAR_PASSWORD` | **only for Traccar 4 tenants**; switches to Basic auth |

So enabling a Traccar 4 tenant is a change to **what your backend returns for
that tenant**, not a redeploy of this app: add `TRACCAR_USER` and
`TRACCAR_PASSWORD`, and point `TRACCAR_WS_URL` at a proxy if one exists. The
client already handles all of it.

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

## 2.4 Traccar version compatibility

Tenants run different Traccar majors and they are **not** interchangeable.
`/api/server` reports `version`; `gps-probe.mjs` prints it and flags v4.

| | Traccar 6.11 | Traccar 4.14 |
|---|---|---|
| `/devices` with `Authorization: Bearer` | ✅ 200 | ❌ **400** — Bearer not understood |
| `/devices` with `?token=` | ❌ 401 | ❌ 401 |
| `/devices` with session cookie | ✅ | ✅ by curl, ❌ **401 from a browser** |
| `/session?token=` | ✅ 200 | ✅ 200 (❌ 400 if Bearer is also sent) |
| WebSocket `?token=` | ✅ 101 | ❌ **503** |
| WebSocket with session cookie | ✅ 101 | ✅ by curl, ❌ **refused from a browser** |

**Traccar 4 needs a login, not a token.** It answers 400 to `Authorization:
Bearer` — it tries to base64-decode the value as Basic credentials — and 401 to
`?token=` on everything except `/session`. Its only usable credential from a
browser is **Basic auth**, which works because it is a header we control and so
survives a cross-origin request where a cookie does not. Verified from a
browser against 4.14: `/devices` 200 with 51 rows, `/positions` 200 with 43.

Set `VITE_TRACCAR_USER` and `VITE_TRACCAR_PASSWORD` for such a tenant and the
client switches to Basic. Left unset, nothing changes and the token is used, so
tenants on 5+ are untouched.

> ⚠️ A password in a client bundle is readable by anyone who opens the app.
> See "Credentials: what must not go in the client" below before using this.

**The WebSocket needs one change on the server.** Traccar 4 authenticates its
socket by session cookie and nothing else — `?token=` answers 503, and so does
Basic auth on the handshake. The cookie comes back as `JSESSIONID=...; Path=/`
with no `SameSite`, and a browser will not store, let alone send, such a cookie
cross-site. Confirmed by capturing the handshake: the cookie is never stored,
no `Cookie` header is sent, and the server answers 503.

Traccar's own dashboard has a live socket because it is served *from* that
host, so its handshake is same-origin.

One nginx directive on the Traccar host fixes it:

```nginx
proxy_cookie_flags ~ secure samesite=none;
```

Proven by injecting exactly that cookie into a browser and loading the app
cross-origin: the socket opened and streamed 46 frames of positions and
devices. The client is already prepared — with `VITE_TRACCAR_USER` set it asks
for a session before connecting and sends credentials — so the socket starts
working the moment the header changes, with no further release.

Until then those tenants run on the HTTP fallback poll, which works on every
version.

### Credentials: what must not go in the client

**Never set `VITE_TRACCAR_USER` / `VITE_TRACCAR_PASSWORD` in a deployed build.**
Vite compiles every `VITE_`-prefixed value into the bundle, so a Traccar login
set that way is readable by anyone who opens the app. Verified: building with
them present puts the literal username and password in `dist/assets/*.js`.

These are not low-privilege accounts. The Djelfa login checked at the time of
writing reports:

```
administrator  false      readonly       false     <- can modify
deviceReadonly false      limitCommands  false     <- can send commands to trackers
userLimit      5          deviceLimit    52
```

`limitCommands: false` means the API can issue device commands, which on many
tracker models includes cutting the engine. A leaked login is not "someone can
read bus positions"; it is control of the fleet's hardware.

The same argument applies, less severely, to `TRACCAR_TOKEN`, which is already
shipped to the client on every tenant.

**Order of preference:**

1. **Proxy Traccar behind your own backend** and send the client nothing. The
   backend already holds tenant config and already talks to Traccar
   server-side, so it can expose `/gps/positstions`, `/gps/devices` and a
   socket without any Traccar credential reaching a browser. This also removes
   the token exposure that exists today, and makes the Traccar version
   invisible to the client — v4 and v6 tenants stop differing at all.
2. **Proxy in the dev server**, which is what `vite.config.ts` does. It reads
   `TRACCAR_USER` / `TRACCAR_PASSWORD` **without** the `VITE_` prefix, so Vite
   keeps them server-side and they never enter the bundle. Verified: the build
   contains neither value.
3. **Basic auth in the client, as a stopgap only.** If a v4 tenant must work
   before a proxy exists, create a Traccar user that is `readonly`,
   `deviceReadonly` and `limitCommands`-limited, with a strong unique password
   used nowhere else, and treat that password as public.

### The fix: put Traccar on the app's own origin

A reverse proxy is the standard answer and the one that needs no cooperation
from the Traccar host. Served from the app's own origin, Traccar's session
cookie is **first-party**, so the SameSite rule never applies and the socket
connects like any other.

The client already supports it: a `VITE_TRACCAR_WS_URL` that is not an absolute
`ws://` or `wss://` URL is treated as a path on the current origin, and no
token is appended — the proxy authenticates instead.

```
VITE_TRACCAR_ORIGIN=https://old.malimspotter.dz   # switches the dev proxy on
VITE_TRACCAR_URL=/traccar
VITE_TRACCAR_WS_URL=/traccar/socket
```

In development `vite.config.ts` proxies `/traccar` → `<origin>/api` with
`ws: true`, opening a Traccar session server-side at startup and attaching its
cookie to every proxied request and upgrade. **Verified end to end: the app
connected to `ws://localhost/traccar/socket` and received 21 frames, with 25
vehicles drawn — on Traccar 4.14, with no change to the Traccar server.**

Production needs the same thing in front of wherever the app is served:

```nginx
location /traccar/ {
    proxy_pass https://old.malimspotter.dz/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       old.malimspotter.dz;
    # a session opened server-side; see traccarSession() in vite.config.ts
    proxy_set_header Cookie     "JSESSIONID=...";
}
```

The session is opened with `POST /api/session` and form-encoded
`email` / `password`. `GET /api/session?token=` is not reliable here — it
answers 404 on this server and hands back an *anonymous* cookie, which then
fails every authenticated call. That is worth knowing: it fails quietly, as a
401 later rather than an error at login.

Nothing changes for tenants without `VITE_TRACCAR_ORIGIN`: no proxy is
configured and the socket is opened directly, as before. Regression checked
against M'sila on 6.11 — direct socket, 97 frames, 22 vehicles.

### Deploying on Vercel

Vercel cannot proxy a WebSocket. Its rewrites ignore a `wss://` destination
outright, and its functions are not a place to park a long-lived upstream
connection. So the dev proxy in `vite.config.ts` has no Vercel equivalent, and
the proxy has to live somewhere else.

It does **not** have to be same-origin. WebSockets are not subject to CORS, and
the only reason a direct connection failed was the cookie — a proxy that holds
the Traccar session server-side removes the need for the browser to have one at
all. So any host you control will do, on any origin:

```
VITE_TRACCAR_WS_URL=wss://djelfa.routes.devcloud.dz/traccar/socket
VITE_TRACCAR_URL=https://djelfa.routes.devcloud.dz/traccar
```

with, on that host:

```nginx
location /traccar/ {
    proxy_pass https://old.malimspotter.dz/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       old.malimspotter.dz;
    proxy_set_header Cookie     "JSESSIONID=...";
}
```

The tenant backend is the natural place: it is already yours, already talks to
Traccar server-side, and already holds credentials.

**The alternative needs no proxy anywhere.** Add to the Traccar host's nginx:

```nginx
proxy_cookie_flags ~ secure samesite=none;
```

Then the browser can keep Traccar's session cookie cross-site and connect
straight to `wss://old.malimspotter.dz/api/socket` from Vercel, with no proxy
in the path. The client already opens the session first when a login is
configured. Proven by injecting exactly that cookie: 46 frames received
cross-origin.

Either way, `vercel.json` rewrites remain useful for the REST calls, which are
ordinary HTTP — but they are not needed, since Basic auth already reaches
Traccar directly from the browser.

### Or let React Native hold the socket

The SameSite rule is a *browser* rule. React Native is not a browser, and its
`WebSocket` takes a third options argument, so native code can send the cookie
the WebView cannot:

```js
// React Native host
const res = await fetch(`${TRACCAR_URL}/session?token=${TOKEN}`);
const cookie = res.headers.get("set-cookie").split(";")[0];  // JSESSIONID=...

const ws = new WebSocket(TRACCAR_WS_URL, undefined, { headers: { Cookie: cookie } });

ws.onmessage = (e) =>
  webviewRef.current.postMessage(
    JSON.stringify({ type: "TRACCAR_MESSAGE", data: e.data })
  );
```

The map accepts that message on `window` and on `document` — Android's WebView
delivers to one, iOS to the other — and feeds it to the same listeners the
socket would have. The first bridged frame closes any socket the page had
opened itself, so the two never compete for the same feed. Verified by pushing
real Traccar frames through the bridge into the running app and watching the
vehicles update.

This also needs no change to the Traccar host, and works on every version.
Traccar's own mobile clients connect this way for the same reason. Prefer the
proxy above for a web deployment; prefer this where the host app already holds
a socket.


**Payload shape also differs.** `/gps/positstions` does not always answer with
an array: when a tenant's backend cannot reach its own Traccar it answers
`{ "message": "GPS server temporarily unavailable", "positions": [] }`.
Djelfa answers that persistently at the time of writing. That envelope used to
reach `positions.data.find(...)` and throw during render, blanking the whole
map. It is now normalised to an array at the fetch, and both cache merges
refuse to map a non-array.

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
| `GIVE_UP_AFTER_FAILURES` | 4 | `traccar-socket.ts` | a socket that never opens is a v4 server, not a bad network |
| `VITE_TRACCAR_USER` / `_PASSWORD` | unset | `.env` | set only for Traccar 4 tenants; switches to Basic auth |
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

### Djelfa
- **Traccar 4.14** — no browser-reachable Traccar; runs on the HTTP fallback
- `/gps/positstions` persistently returns
  `{"message":"GPS server temporarily unavailable","positions":[]}` — the
  tenant backend cannot reach its own Traccar. The client falls back to
  Traccar's own `/positions` for exactly this case, so the map works anyway;
  the backend still wants fixing.
- the Traccar host needs `proxy_cookie_flags ~ secure samesite=none;` before
  the socket can work — see §2.4
- `/stops` returns 0 rows

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
