import type { Side } from "./types.js";

/**
 * Classify a tweet's stance on `coin`. v0 = keyword heuristic.
 * This is the single swap point: replace the body with an LLM call later; keep the signature.
 * When both long and short words appear, the one closest to the coin's mention wins
 * ("Long $HYPE / Short $COIN" -> long).
 */
export function classifySide(text: string, coin = "HYPE"): Side {
  const t = normalize(text);
  const tokens = t.split(/\s+/).filter(Boolean);
  const coinRe = new RegExp(`^\\$?${coin.toLowerCase()}$`);
  const coinPos = tokens.flatMap((w, i) => (coinRe.test(w) ? [i] : []));

  const hits: { side: "long" | "short"; i: number }[] = [];
  tokens.forEach((w, i) => {
    const prev = tokens[i - 1] ?? "";
    const next = tokens[i + 1] ?? "";
    if (NEGATORS.has(prev)) return;
    if (w === "long" || w === "short") {
      if (next === "term" || next === "run" || prev === "the" && next === "run") return; // long term / short term
      if (w === "long" && (prev === "how" || prev === "so" || prev === "too" || next === "time" || next === "ago")) return;
    }
    if (LONG_WORDS.has(w)) hits.push({ side: "long", i });
    else if (SHORT_WORDS.has(w)) hits.push({ side: "short", i });
  });
  for (const [phrase, side] of PHRASES) {
    let from = 0;
    let k: number;
    while ((k = t.indexOf(phrase, from)) !== -1) {
      hits.push({ side, i: t.slice(0, k).split(/\s+/).filter(Boolean).length });
      from = k + phrase.length;
    }
  }
  if (hits.length === 0) return "view";

  const sides = new Set(hits.map((h) => h.side));
  if (sides.size === 1) return hits[0].side;
  if (coinPos.length === 0) return "view";
  // A keyword binds to the next cashtag within 4 tokens ("long $HYPE / short $COIN").
  const isTag = (w: string) => /^\$[a-z]/.test(w);
  const bound = hits.filter((h) => {
    for (let j = h.i + 1; j <= h.i + 4 && j < tokens.length; j++) if (isTag(tokens[j]) || coinRe.test(tokens[j])) return coinRe.test(tokens[j]);
    return false;
  });
  const boundSides = new Set(bound.map((h) => h.side));
  if (boundSides.size === 1) return bound[0].side;
  const dist = (i: number) => Math.min(...coinPos.map((p) => Math.abs(p - i)));
  let best = { side: "view" as Side, d: Infinity };
  let tie = false;
  for (const h of hits) {
    const d = dist(h.i);
    if (d < best.d) { best = { side: h.side, d }; tie = false; }
    else if (d === best.d && h.side !== best.side) tie = true;
  }
  return tie ? "view" : best.side;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}$#\s-]/gu, " ")
    .replace(/(^|\s)#/g, "$1$")
    .replace(/-/g, " ");
}

const NEGATORS = new Set(["not", "no", "never", "dont", "didnt", "wont", "stop", "avoid"]);
const LONG_WORDS = new Set([
  "long", "longs", "longed", "longing", "bought", "buy", "buying", "bid", "bidding", "bullish",
  "accumulating", "accumulate", "accumulated", "loaded", "loading", "aped", "added", "adding", "dca",
  "breakout", "bottomed", "moon", "pump", "pumping", "send", "undervalued", "calls",
]);
const SHORT_WORDS = new Set([
  "short", "shorts", "shorted", "shorting", "sold", "sell", "selling", "bearish", "dump", "dumping",
  "breakdown", "fade", "fading", "puts", "overvalued",
]);
const PHRASES: [string, "long" | "short"][] = [
  ["bottom is in", "long"],
  ["higher high", "long"],
  ["going higher", "long"],
  ["top is in", "short"],
  ["lower low", "short"],
  ["going lower", "short"],
  ["support broke", "short"],
  ["support just gave way", "short"],
  ["not looking great", "short"],
];
