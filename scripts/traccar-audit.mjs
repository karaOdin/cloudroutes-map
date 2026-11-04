#!/usr/bin/env node
/**
 * Reports which tenants' Traccar servers can serve a browser WebSocket, and
 * which need work.
 *
 * Traccar 5+ accepts `?token=` on the socket, so a browser connects directly
 * and nothing is needed. Traccar 4 accepts only a session cookie, and returns
 * that cookie without a SameSite attribute, so no browser will keep it
 * cross-site — those tenants need either a proxy that holds the session
 * server-side, or `proxy_cookie_flags ~ secure samesite=none;` on the Traccar
 * host. See docs/LIVE-MAP.md.
 *
 * Read-only: one unauthenticated GET and one socket handshake per host.
 *
 * In production each tenant's endpoints come from your backend and are injected
 * as `window.env`, not from any file here, so the real list lives there. Feed
 * it in however you have it:
 *
 *   node scripts/traccar-audit.mjs https://a.example https://b.example
 *   node scripts/traccar-audit.mjs < hosts.txt        # one host per line
 *   curl -s <your-backend>/tenants | jq -r '.[].traccar_url' | node scripts/traccar-audit.mjs
 *
 * With no input it falls back to scanning .env* files, which only covers the
 * tenants you happen to have configured locally.
 *
 * Hosts may be given with or without a trailing /api.
 */

import { readdirSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { request } from "node:https";
import { URL } from "node:url";

function fromEnvFiles() {
  const found = new Map();

  for (const file of readdirSync(process.cwd()).filter((f) => f.startsWith(".env"))) {
    let body;

    try {
      body = readFileSync(file, "utf8");
    } catch {
      continue;
    }

    const url = /^VITE_TRACCAR_URL=(.+)$/m.exec(body)?.[1]?.trim();
    const token = /^VITE_TRACCAR_TOKEN=(.+)$/m.exec(body)?.[1]?.trim();

    // A relative URL means that env already routes through a proxy.
    if (!url || !/^https?:\/\//i.test(url)) continue;

    const origin = new URL(url).origin;

    if (!found.has(origin)) found.set(origin, { origin, token, seenIn: [] });

    found.get(origin).seenIn.push(file);
  }

  return [...found.values()];
}

function fromArgs(args) {
  return args.map((a) => ({
    origin: new URL(a).origin,
    token: undefined,
    seenIn: ["(argument)"],
  }));
}

async function version(origin) {
  try {
    const res = await fetch(`${origin}/api/server`, { signal: AbortSignal.timeout(15000) });

    if (!res.ok) return null;

    return (await res.json()).version ?? null;
  } catch {
    return null;
  }
}

/** Attempt the handshake a browser would make, with the token in the query. */
function handshake(origin, token) {
  return new Promise((resolve) => {
    const url = new URL(`${origin}/api/socket`);

    if (token) url.searchParams.set("token", token);

    const req = request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        },
        timeout: 15000,
      },
      (res) => {
        resolve(res.statusCode);
        res.destroy();
      }
    );

    req.on("upgrade", (res) => {
      resolve(res.statusCode ?? 101);
      req.destroy();
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function fromStdin() {
  if (process.stdin.isTTY) return [];

  let body = "";

  for await (const chunk of process.stdin) body += chunk;

  return fromArgs(
    body
      .split(/\s+/)
      .map((l) => l.trim())
      .filter((l) => /^https?:\/\//i.test(l))
  );
}

const piped = await fromStdin();
const targets =
  process.argv.length > 2
    ? fromArgs(process.argv.slice(2))
    : piped.length > 0
      ? piped
      : fromEnvFiles();

if (targets.length === 0) {
  console.error(
    "No Traccar hosts found. Pass them as arguments, pipe them in one per line,\n" +
      "or run from a directory with .env files. In production the real list comes\n" +
      "from your backend, not from this repo."
  );
  process.exit(1);
}

console.log(`\nAuditing ${targets.length} Traccar host(s)\n`);
console.log(
  `  ${"host".padEnd(30)}${"version".padEnd(10)}${"socket".padEnd(10)}verdict`
);
console.log("  " + "-".repeat(84));

let needWork = 0;

for (const t of targets) {
  const v = await version(t.origin);
  const code = await handshake(t.origin, t.token);
  const major = Number(String(v ?? "").split(".")[0]);

  let verdict;

  if (!v) verdict = "unreachable — check the URL";
  else if (code === 101) verdict = "OK — browser connects directly";
  else if (major >= 5 && !t.token)
    verdict = `OK on version — ${major}.x takes ?token=, none supplied to prove it`;
  else if (major >= 5)
    verdict = `handshake ${code} — the version is fine, check the token`;
  else {
    verdict = "NEEDS a proxy, or SameSite=None on this host";
    needWork += 1;
  }

  const host = new URL(t.origin).hostname;

  console.log(
    `  ${host.padEnd(30)}${String(v ?? "?").padEnd(10)}${String(code ?? "fail").padEnd(10)}${verdict}`
  );
  if (t.seenIn.length) console.log(`  ${"".padEnd(30)}used by: ${t.seenIn.join(", ")}`);
}

console.log(
  `\n${needWork} host(s) need work. One fix per HOST, not per tenant — tenants sharing a host are fixed together.\n`
);
console.log("See docs/LIVE-MAP.md, section 2.4, for both options.\n");
