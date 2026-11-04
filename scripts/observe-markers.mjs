#!/usr/bin/env node
/**
 * Watches the running dev server and reports whether vehicle markers actually
 * animate, by sampling their computed transform ten times a second.
 *
 * This exists because three rounds of reasoning about the animation code all
 * missed the real cause — a blanket `.leaflet-marker-icon` transition later in
 * App.css overriding the vehicle rule on source order, so every hop was
 * crossed in 220ms whatever the code asked for. Nothing in the JS was wrong.
 * Measuring the rendered pixels found it immediately.
 *
 * Needs a browser: npx playwright install chromium
 *
 *   npm run dev
 *   node scripts/observe-markers.mjs [url] [seconds]
 *
 * Healthy output is motion on most frames with sub-pixel steps and no jumps.
 * Motion on a handful of frames, or steps of tens of pixels, means the
 * animation is being overridden, interrupted or restarted.
 */

import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:5173/";
const SECONDS = Number(process.argv[3] ?? 40);
const JUMP_PX = 8;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
const problems = [];

page.on("pageerror", (e) => problems.push("page error: " + e.message));

await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForSelector(".bus-icon", { timeout: 60_000 });

console.log(`\nvehicles on the map: ${await page.locator(".bus-icon").count()}`);

const css = await page.evaluate(() => {
  const style = getComputedStyle(document.querySelector(".bus-icon"));

  return {
    "transition-property": style.transitionProperty,
    "transition-duration": style.transitionDuration,
    "timing-function": style.transitionTimingFunction,
  };
});

console.log("\nwhat the browser actually computed for a vehicle marker:");
for (const [key, value] of Object.entries(css)) {
  console.log(`  ${key.padEnd(20)} ${value}`);
}

console.log(`\nsampling transforms for ${SECONDS}s...`);

const samples = await page.evaluate(async (seconds) => {
  const readXY = (transform) => {
    const match = /matrix3d\(([^)]+)\)|matrix\(([^)]+)\)/.exec(transform || "");

    if (!match) return null;

    const parts = (match[1] || match[2]).split(",").map(Number);

    return match[1] ? [parts[12], parts[13]] : [parts[4], parts[5]];
  };

  const out = [];
  const startedAt = performance.now();

  while (performance.now() - startedAt < seconds * 1000) {
    const frame = {};

    for (const el of document.querySelectorAll(".bus-icon")) {
      const xy = readXY(getComputedStyle(el).transform);

      if (xy) frame[el.getAttribute("title") ?? "?"] = xy;
    }

    out.push(frame);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return out;
}, SECONDS);

const names = [...new Set(samples.flatMap(Object.keys))];

console.log(`tracked ${names.length} vehicles over ${samples.length} samples\n`);

let jumpy = 0;

for (const name of names) {
  const series = samples.map((s) => s[name]).filter(Boolean);
  const steps = [];

  for (let i = 1; i < series.length; i += 1) {
    const step = Math.hypot(
      series[i][0] - series[i - 1][0],
      series[i][1] - series[i - 1][1]
    );

    if (step > 0) steps.push(step);
  }

  if (steps.length === 0) continue;

  steps.sort((a, b) => a - b);

  const jumps = steps.filter((s) => s > JUMP_PX).length;

  if (jumps > 0) jumpy += 1;

  console.log(
    `  ${name.padEnd(16)} moving on ${String(steps.length).padStart(3)}/${series.length} frames` +
      `  median step ${steps[Math.floor(steps.length / 2)].toFixed(2)}px` +
      `  max ${steps[steps.length - 1].toFixed(1)}px` +
      `  jumps>${JUMP_PX}px: ${jumps}`
  );
}

console.log(
  jumpy === 0
    ? "\nNo jumps. Vehicles are travelling rather than teleporting."
    : `\n${jumpy} vehicle(s) jumped — something is overriding or restarting the animation.`
);

if (problems.length) console.log("\n" + problems.join("\n"));

await browser.close();
