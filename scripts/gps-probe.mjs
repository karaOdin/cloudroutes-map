#!/usr/bin/env node
/**
 * GPS probe — observes the live Traccar feed and reports on what it actually
 * delivers, so the map's timing constants can be set from measurement instead
 * of assumption.
 *
 * Read-only: one Traccar session call, a few GETs, and a WebSocket subscribe.
 * Credentials come from .env and are never printed.
 *
 *   node scripts/gps-probe.mjs --seconds=180
 *   node scripts/gps-probe.mjs --seconds=600 --out=probe.jsonl
 *
 * It answers, with numbers:
 *   - how often each vehicle actually reports        -> slide duration, thresholds
 *   - how stale the fleet is at any moment           -> BUS_STALE / BUS_OFFLINE
 *   - how far vehicles sit from their own route line -> MAX_OFF_ROUTE_M
 *   - how big and how fast the jumps between fixes are -> MAX_PLAUSIBLE_SPEED
 *   - which Traccar fields are populated at all       -> accuracy, outdated, valid
 */

import { readFileSync, appendFileSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);

const SECONDS = Number(args.seconds ?? 120);
const OUT = args.out ?? "gps-probe.jsonl";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const API = env.VITE_API_URL;
const TRACCAR = env.VITE_TRACCAR_URL;
const WS = env.VITE_TRACCAR_WS_URL;
const TOKEN = env.VITE_TRACCAR_TOKEN;

if (!API || !TRACCAR || !WS || !TOKEN) {
  console.error("Missing one of VITE_API_URL / VITE_TRACCAR_URL / VITE_TRACCAR_WS_URL / VITE_TRACCAR_TOKEN in .env");
  process.exit(1);
}

/* ---------------------------------------------------------------- geometry */

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Metres from a point to a polyline, via local planar projection. */
function distanceToPath(point, path) {
  if (!path || path.length < 2) return null;
  const k = Math.cos(rad(point.lat));
  const px = point.lng * k;
  const py = point.lat;
  let best = Infinity;

  for (let i = 0; i < path.length - 1; i += 1) {
    const ax = path[i].lng * k;
    const ay = path[i].lat;
    const bx = path[i + 1].lng * k;
    const by = path[i + 1].lat;
    const abx = bx - ax;
    const aby = by - ay;
    const den = abx * abx + aby * aby;
    const t = den === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby) / den));
    const d = haversine(point, { lat: ay + t * aby, lng: (ax + t * abx) / k });
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------- stats */

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

function summarise(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0] ?? null,
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    max: s[s.length - 1] ?? null,
  };
}

const fmt = (v, unit = "", digits = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}${unit}`;

function table(label, s, unit, digits = 0) {
  console.log(
    `  ${label.padEnd(26)} n=${String(s.n).padStart(5)}  ` +
      `min ${fmt(s.min, unit, digits).padStart(9)}  ` +
      `p25 ${fmt(s.p25, unit, digits).padStart(9)}  ` +
      `med ${fmt(s.median, unit, digits).padStart(9)}  ` +
      `p75 ${fmt(s.p75, unit, digits).padStart(9)}  ` +
      `p90 ${fmt(s.p90, unit, digits).padStart(9)}  ` +
      `max ${fmt(s.max, unit, digits).padStart(9)}`
  );
}

/* -------------------------------------------------------------------- main */

/**
 * Traccar authenticates the token once at /session and then expects the
 * JSESSIONID cookie the browser would keep. node's fetch has no cookie jar,
 * so hold it here or every later call 401s.
 */
let cookieJar = "";

async function getJson(url, label) {
  const started = Date.now();
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(cookieJar ? { Cookie: cookieJar } : {}) },
  });
  const ms = Date.now() - started;

  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) {
    cookieJar = set.map((c) => c.split(";")[0]).join("; ");
  }
  if (!res.ok) {
    console.log(`  ${label.padEnd(22)} HTTP ${res.status} in ${ms}ms`);
    return { data: null, cookie: null, status: res.status };
  }
  const data = await res.json();
  const size = Array.isArray(data) ? `${data.length} rows` : "object";
  console.log(`  ${label.padEnd(22)} HTTP ${res.status} in ${String(ms).padStart(5)}ms  ${size}`);
  return { data, cookie: res.headers.get("set-cookie"), status: res.status };
}

const t = (path) => `${TRACCAR}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(TOKEN)}`;

console.log(`\n=== GPS PROBE — ${new Date().toISOString()} — ${SECONDS}s capture ===\n`);
console.log("Endpoints");
console.log(`  api      ${API}`);
console.log(`  traccar  ${TRACCAR}`);
console.log(`  socket   ${WS}\n`);

console.log("Fetching baseline");
const server = (await getJson(`${TRACCAR}/server`, "traccar /server")).data;
const session = await getJson(t("/session"), "traccar /session");

// Traccar 4 rejects the Bearer header the app sends (400) and authenticates
// its socket by session cookie only, which browsers will not send cross-site.
// Those tenants can only ever run on the HTTP fallback, so say so plainly.
if (server?.version) {
  const major = Number(String(server.version).split(".")[0]);
  console.log(`  traccar version        ${server.version}${major < 5 ? "   <-- v4: no browser socket, HTTP fallback only" : ""}`);
}
const devices = (await getJson(t("/devices"), "traccar /devices")).data ?? [];
const tPositions = (await getJson(t("/positions"), "traccar /positions")).data ?? [];
const lines = (await getJson(`${API}/lines`, "api /lines")).data ?? [];
const stops = (await getJson(`${API}/stops`, "api /stops")).data ?? [];
const appPositions = (await getJson(`${API}/gps/positstions`, "api /gps/positstions")).data ?? [];

/* line waypoints keyed by traccar device uniqueId, as the app builds them */
const pathByUniqueId = new Map();
const lineByUniqueId = new Map();
for (const line of lines) {
  const path = (line.waypoints || []).map((w) =>
    Array.isArray(w) ? { lat: +w[0], lng: +w[1] } : { lat: +w.lat, lng: +w.lng }
  ).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  for (const bus of line.buses || []) {
    if (bus.traccar_device_id) {
      pathByUniqueId.set(String(bus.traccar_device_id), path);
      lineByUniqueId.set(String(bus.traccar_device_id), line.name);
    }
  }
}

const deviceById = new Map(devices.map((d) => [d.id, d]));

writeFileSync(OUT, "");
const record = (o) => appendFileSync(OUT, JSON.stringify(o) + "\n");
record({ kind: "baseline", at: Date.now(), devices, lines: lines.map((l) => ({ name: l.name, color: l.color, waypoints: (l.waypoints||[]).length, buses: (l.buses||[]).length })), stops: stops.length, tPositions, appPositions });

/* --------------------------------------------------------------- websocket */

console.log(`\nConnecting to the socket for ${SECONDS}s…`);
const seen = new Map(); // deviceId -> [{at, lat, lng, ...}]
let events = 0;
let firstEventAt = null;
const openedAt = Date.now();
let opened = false;

const cookie = session.cookie;
const ws = new WebSocket(`${WS}?token=${encodeURIComponent(TOKEN)}`, cookie ? { headers: { Cookie: cookie } } : undefined);

ws.addEventListener("open", () => {
  opened = true;
  console.log(`  socket open after ${Date.now() - openedAt}ms`);
});
ws.addEventListener("error", (e) => console.log(`  socket error: ${e.message ?? "unknown"}`));
ws.addEventListener("close", (e) => console.log(`  socket closed (code ${e.code})`));
ws.addEventListener("message", (e) => {
  const at = Date.now();
  events += 1;
  firstEventAt ??= at;
  let payload;
  try { payload = JSON.parse(e.data); } catch { return; }
  record({ kind: "ws", at, payload });

  for (const p of payload.positions ?? []) {
    const list = seen.get(p.deviceId) ?? [];
    list.push({ at, lat: p.latitude, lng: p.longitude, speed: p.speed, course: p.course,
                fixTime: p.fixTime, accuracy: p.accuracy, valid: p.valid, outdated: p.outdated });
    seen.set(p.deviceId, list);
  }
});

await new Promise((r) => setTimeout(r, SECONDS * 1000));
try { ws.close(); } catch { /* already closed */ }

/* ------------------------------------------------------------------ report */

console.log(`\n=== RESULTS ===\n`);

console.log("Feed");
console.log(`  socket opened            ${opened ? "yes" : "NO"}`);
console.log(`  messages received        ${events}`);
console.log(`  first message after      ${firstEventAt ? `${firstEventAt - openedAt}ms` : "never"}`);
console.log(`  devices seen moving      ${seen.size} of ${devices.length}`);

/* staleness of the whole fleet at baseline */
const now = Date.now();
const ages = [];
for (const d of devices) {
  const stamp = d.lastUpdate ? Date.parse(d.lastUpdate) : NaN;
  if (!Number.isNaN(stamp)) ages.push((now - stamp) / 1000);
}
console.log(`\nFleet staleness at connect (seconds since each device's lastUpdate)`);
table("age", summarise(ages), "s");
const bucket = (lo, hi) => ages.filter((a) => a >= lo && a < hi).length;
console.log(`  under 5 min ${bucket(0, 300)}   5-30 min ${bucket(300, 1800)}   over 30 min ${ages.filter((a) => a >= 1800).length}   no timestamp ${devices.length - ages.length}`);
console.log(`  traccar status: ` + Object.entries(devices.reduce((m, d) => ((m[d.status ?? "null"] = (m[d.status ?? "null"] || 0) + 1), m), {})).map(([k, v]) => `${k}=${v}`).join("  "));

/* reporting cadence and jumps, from the live capture */
const gaps = [], hops = [], speeds = [];
for (const [, list] of seen) {
  for (let i = 1; i < list.length; i += 1) {
    const gap = (list[i].at - list[i - 1].at) / 1000;
    if (gap <= 0) continue;
    const moved = haversine(list[i - 1], list[i]);
    gaps.push(gap);
    hops.push(moved);
    speeds.push((moved / gap) * 3.6);
  }
}
console.log(`\nObserved during capture`);
table("interval between fixes", summarise(gaps), "s", 1);
table("distance per fix", summarise(hops), "m", 1);
table("implied speed", summarise(speeds), "km/h", 1);

/* moving vs parked, because cadence means different things for each */
let moving = 0, parked = 0;
const perDevice = [];
for (const [id, list] of seen) {
  const travelled = list.slice(1).reduce((sum, p, i) => sum + haversine(list[i], p), 0);
  const g = [];
  for (let i = 1; i < list.length; i += 1) {
    const gap = (list[i].at - list[i - 1].at) / 1000;
    if (gap > 0) g.push(gap);
  }
  const d = deviceById.get(id);
  perDevice.push({
    id,
    name: d?.name ?? `#${id}`,
    line: d ? lineByUniqueId.get(String(d.uniqueId)) ?? "—" : "—",
    updates: list.length,
    median: quantile([...g].sort((a, b) => a - b), 0.5),
    travelled,
  });
  if (travelled > 25) moving += 1; else parked += 1;
}
console.log(`  vehicles that moved >25m during the capture: ${moving}; effectively stationary: ${parked}`);

console.log(`\nPer vehicle`);
console.log(`  ${"vehicle".padEnd(14)}${"line".padEnd(22)}${"updates".padStart(8)}${"median gap".padStart(12)}${"travelled".padStart(11)}`);
for (const d of perDevice.sort((a, b) => b.travelled - a.travelled)) {
  console.log(
    `  ${String(d.name).slice(0, 13).padEnd(14)}${String(d.line).slice(0, 21).padEnd(22)}` +
      `${String(d.updates).padStart(8)}${fmt(d.median, "s", 1).padStart(12)}${fmt(d.travelled, "m", 0).padStart(11)}`
  );
}

/* how far vehicles sit from their own line */
const offRoute = [];
const source = tPositions.length ? tPositions : appPositions;
for (const p of source) {
  const d = deviceById.get(p.deviceId);
  const path = d ? pathByUniqueId.get(String(d.uniqueId)) : null;
  const off = path ? distanceToPath({ lat: p.latitude, lng: p.longitude }, path) : null;
  if (off !== null) offRoute.push(off);
}
console.log(`\nDistance from the vehicle's own route line (${offRoute.length} positions matched to a line)`);
table("off-route", summarise(offRoute), "m", 1);
const within = (m) => offRoute.filter((d) => d <= m).length;
if (offRoute.length) console.log(`  within 20m ${within(20)}   within 60m ${within(60)}   within 150m ${within(150)}   beyond 150m ${offRoute.filter((d) => d > 150).length}`);

/* which fields Traccar actually populates */
const sample = [...seen.values()].flat();
const populated = (key) => sample.filter((p) => p[key] !== undefined && p[key] !== null).length;
console.log(`\nField availability across ${sample.length} live position updates`);
for (const key of ["accuracy", "valid", "outdated", "speed", "course", "fixTime"]) {
  const n = populated(key);
  const values = [...new Set(sample.map((p) => p[key]).filter((v) => v !== undefined))].slice(0, 4);
  console.log(`  ${key.padEnd(10)} ${String(n).padStart(5)}/${sample.length}   e.g. ${JSON.stringify(values)}`);
}

console.log(`\nRaw capture written to ${OUT}`);
console.log(`Lines: ${lines.length}   Stops: ${stops.length}   Devices: ${devices.length}   Buses mapped to a line: ${pathByUniqueId.size}\n`);
process.exit(0);
