// Regenerate backend/fixtures/ with fully SYNTHETIC data: invented texts, fake handles,
// default avatar, synthetic price path. No network, no API key. Deterministic (seeded).
// Runs the same pipeline as live data (filters, classifier, pricing, buckets).
// Usage: npm run fixtures
import { writeFile } from "node:fs/promises";
import { buildCalls, bucketize, summarize } from "../src/signals.js";
import type { Candle } from "../src/hyperliquid.js";
import type { Tweet } from "../src/sources/index.js";
import type { SignalsResponse, Window } from "../src/types.js";

const COIN = "HYPE";
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed; the server shifts timestamps to "now" when serving
const OUT = new URL("../../fixtures/", import.meta.url);
const AVATAR = "https://abs.twimg.com/sticky/default_profile_images/default_profile_bigger.png";
const MEDIA = "https://placehold.co/600x340/png?text=chart";
const MIN = 60_000, DAY = 86400_000;

// mulberry32
let seed = 0x5eed;
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

// Synthetic 1-minute price path over 31 days: slow waves (~60..80) plus mean-reverting noise.
const STEP = MIN;
const N = Math.ceil((31 * DAY) / STEP);
const path: number[] = new Array(N);
let noise = 0;
for (let i = 0; i < N; i++) {
  noise = noise * 0.995 + (rand() - 0.5) * 0.12;
  const wave = 7 * Math.sin((2 * Math.PI * i) / (9 * 1440)) + 3 * Math.sin((2 * Math.PI * i) / (2 * 1440));
  path[i] = Math.round((70 + wave + noise) * 1000) / 1000;
}
const t0 = NOW - (N - 1) * STEP;
const priceAtTs = (ts: number) => path[Math.min(N - 1, Math.max(0, Math.round((ts - t0) / STEP)))];
const candles = (interval: number, from: number): Candle[] => {
  const out: Candle[] = [];
  for (let t = Math.floor(from / interval) * interval; t <= NOW; t += interval) {
    out.push({ t, T: t + interval - 1, o: priceAtTs(t), c: priceAtTs(t + interval - 1) });
  }
  return out;
};
const mid = path[N - 1];

const TEMPLATES = {
  long: [
    "Longed {coin} at {p}. Invalidation below {lo}.",
    "Bought more {coin} on this dip, {p} looks like solid support.",
    "{coin} breakout above {p} confirmed, adding here.",
    "Loading {coin} spot with a patient bid at {p}.",
    "{coin} bottom is in. First target {hi}.",
    "DCA filled on {coin} at {p}, holding for {hi}.",
  ],
  short: [
    "Shorted {coin} at {p}, stop at {hi}.",
    "{coin} looks heavy here, opened a short at {p}.",
    "Fading this {coin} bounce, short from {p}.",
    "{coin} support broke. Expecting lower lows, short {p}.",
    "Bearish on {coin} below {p}, sold my spot bag.",
  ],
  view: [
    "Watching {coin} around {p}, no position yet.",
    "{coin} volume is picking up today.",
    "Interesting chart on {coin}, {p} is the level to watch.",
    "What is everyone's plan for {coin} this week?",
    "{coin} ecosystem keeps shipping. Noted.",
    "{coin} chopping between {lo} and {hi}.",
  ],
};

const AUTHORS = Array.from({ length: 90 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  const followers = Math.round(1000 * Math.exp(rand() * 6)); // ~1k .. ~400k
  return {
    name: `Demo Trader ${n}`,
    handle: `hs_demo_${n}`,
    avatar: AVATAR,
    followers,
    following: Math.round(followers * rand() * 0.8),
    createdAt: NOW - (200 + Math.floor(rand() * 2000)) * DAY,
  };
});

function tweets(window: Window, count: number, spanMs: number): Tweet[] {
  return Array.from({ length: count }, (_, i) => {
    const ts = NOW - Math.floor(rand() * spanMs);
    const p = priceAtTs(ts);
    const r = rand();
    const side = r < 0.5 ? "long" : r < 0.72 ? "short" : "view";
    const fmt = (x: number) => x.toFixed(2);
    const text = pick(TEMPLATES[side])
      .replaceAll("{coin}", `$${COIN}`)
      .replaceAll("{p}", fmt(p))
      .replaceAll("{lo}", fmt(p * 0.94))
      .replaceAll("{hi}", fmt(p * 1.08));
    const id = `demo-${window}-${String(i + 1).padStart(3, "0")}`;
    return {
      id,
      url: `https://example.com/hypersocial/demo/${id}`,
      text,
      ts,
      likes: Math.floor(rand() * 300),
      isReply: false,
      isRetweet: false,
      media: side !== "view" && i % 7 === 0 ? [MEDIA] : [],
      author: pick(AUTHORS),
    };
  });
}

const plan: [Window, number, number, number][] = [
  ["15m", 6, 15 * MIN, MIN],
  ["7d", 90, 7 * DAY, 5 * MIN],
  ["30d", 260, 30 * DAY, 15 * MIN],
];
for (const [window, count, span, interval] of plan) {
  const { calls } = buildCalls(tweets(window, count, span), COIN, candles(interval, NOW - span - 3600_000), mid, NOW);
  const data: SignalsResponse = {
    coin: COIN, window, updatedAt: NOW, coverage: window,
    summary: summarize(calls), calls, byPrice: bucketize(calls),
  };
  await writeFile(new URL(`signals-${COIN}-${window}.json`, OUT), JSON.stringify(data, null, 2) + "\n");
  console.log(`fixture ${window}: ${calls.length} calls, ${JSON.stringify(data.summary)}`);
}
