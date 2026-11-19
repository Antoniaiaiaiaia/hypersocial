import { config } from "./config.js";
import { classifySide } from "./classify.js";
import { getCandles, getMid, priceAt } from "./hyperliquid.js";
import type { Tweet, TweetSource } from "./sources/index.js";
import type { Call, PriceBucket, SignalsResponse, Window } from "./types.js";

const DAY = 86400_000;

/** Why a tweet was dropped, or null to keep it. Thresholds live in config.filter. */
export function rejectReason(t: Tweet, coin: string, now = Date.now()): string | null {
  const f = config.filter;
  const a = t.author;
  if (t.isReply) return "reply";
  if (t.isRetweet) return "retweet";
  if (!new RegExp(`\\$${coin}(?![a-z0-9_])`, "i").test(t.text)) return "no-cashtag"; // e.g. $HYPER only
  if (a.followers < f.minFollowers) return "followers";
  const cashtags = new Set((t.text.match(/\$[a-z][a-z0-9_]{1,9}\b/gi) ?? []).map((s) => s.toUpperCase()));
  if (cashtags.size > f.maxCashtags) return "cashtag-spam";
  if (a.followers > 0 && a.following / a.followers > f.maxFollowingRatio) return "follow-farm";
  if (a.createdAt !== undefined && (now - a.createdAt) / DAY < f.minAccountAgeDays) return "new-account";
  const lower = t.text.toLowerCase();
  if (f.spamWords.some((w) => lower.includes(w))) return "spam-words";
  return null;
}

export function toCall(t: Tweet, coin: string): Omit<Call, "entryPrice" | "pnlPct"> {
  return {
    id: t.id,
    url: t.url,
    ts: t.ts,
    author: { name: t.author.name, handle: t.author.handle, avatar: t.author.avatar, followers: t.author.followers },
    text: decodeEntities(t.text),
    side: classifySide(t.text, coin),
    ...(t.media.length ? { media: t.media } : {}),
  };
}

export function pnl(side: Call["side"], entry: number | null, mid: number): number | null {
  if (entry == null || side === "view") return null;
  const r = ((mid - entry) / entry) * 100 * (side === "short" ? -1 : 1);
  return Math.round(r * 100) / 100;
}

export function summarize(calls: Call[]): SignalsResponse["summary"] {
  const long = calls.filter((c) => c.side === "long").length;
  const short = calls.filter((c) => c.side === "short").length;
  const view = calls.length - long - short;
  const pctLong = long + short ? Math.round((long / (long + short)) * 100) : 0;
  return { long, short, view, pctLong };
}

/** Contiguous buckets of `width` covering all long/short entry prices. */
export function bucketize(calls: Call[], width = config.bucketWidth): PriceBucket[] {
  const priced = calls.filter((c) => c.side !== "view" && c.entryPrice != null);
  if (!priced.length) return [];
  const idx = (p: number) => Math.floor(p / width);
  const ps = priced.map((c) => c.entryPrice as number);
  const lo = idx(Math.min(...ps));
  const hi = idx(Math.max(...ps));
  const out: PriceBucket[] = [];
  for (let i = lo; i <= hi; i++) out.push({ lo: i * width, hi: (i + 1) * width, longs: 0, shorts: 0 });
  for (const c of priced) {
    const b = out[idx(c.entryPrice as number) - lo];
    if (c.side === "long") b.longs++; else b.shorts++;
  }
  return out;
}

/** "15m" / "7d" / "30d" label for a lookback in ms. */
export function coverageLabel(ms: number): string {
  return ms >= DAY ? `${Math.round(ms / DAY)}d` : `${Math.max(1, Math.round(ms / 60_000))}m`;
}

/** Calls from provider-neutral tweets: filter, dedupe, cap per author, classify, price. */
export function buildCalls(raw: Tweet[], coin: string, candles: Parameters<typeof priceAt>[0], mid: number, now = Date.now()) {
  const seen = new Set<string>();
  const drops: Record<string, number> = {};
  const kept: Tweet[] = [];
  for (const t of raw) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const r = rejectReason(t, coin, now);
    if (r) drops[r] = (drops[r] ?? 0) + 1;
    else kept.push(t);
  }
  kept.sort((a, b) => b.ts - a.ts);
  const perAuthor = new Map<string, number>();
  const calls: Call[] = [];
  for (const t of kept) {
    const n = perAuthor.get(t.author.handle) ?? 0;
    if (n >= config.filter.maxPerAuthor) { drops["per-author"] = (drops["per-author"] ?? 0) + 1; continue; }
    perAuthor.set(t.author.handle, n + 1);
    const base = toCall(t, coin);
    const entryPrice = priceAt(candles, base.ts);
    calls.push({ ...base, entryPrice, pnlPct: pnl(base.side, entryPrice, mid) });
  }
  return { calls, drops };
}

export async function buildSignals(source: TweetSource, coin: string, window: Window): Promise<SignalsResponse> {
  const now = Date.now();
  const windowMs = config.windowMs[window];
  const [res, mid, candles] = await Promise.all([
    source.search(coin, windowMs, config.cacheTtlMs[window]),
    getMid(coin),
    getCandles(coin, config.candleInterval[window], now - windowMs - 3600_000, now),
  ]);
  const { calls, drops } = buildCalls(res.tweets, coin, candles, mid, now);
  const covered = now - res.coveredFrom;
  const coverage = covered >= windowMs - 5 * 60_000 ? window : coverageLabel(covered);
  console.log(`[signals] ${source.name} ${coin} ${window} (coverage ${coverage}): ${res.tweets.length} raw -> ${calls.length} calls; dropped ${JSON.stringify(drops)}`);
  return { coin, window, updatedAt: now, coverage, summary: summarize(calls), calls, byPrice: bucketize(calls) };
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
