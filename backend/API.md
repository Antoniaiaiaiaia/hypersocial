# hypersocial backend API (v0)

The one source of truth for the backend ↔ frontend contract. The frontend copies the types (see `src/types.ts`) and never imports backend code.
Base URL (local): `http://localhost:8787`. CORS: `Access-Control-Allow-Origin: *`.

## GET /v1/signals

Query:

| param | values | default |
|---|---|---|
| `coin` | `HYPE` (or whatever `COINS` allows) | `HYPE` |
| `window` | `15m` \| `7d` \| `30d` | `7d` |
| `fixture` | `1` = return the synthetic sample from `fixtures/` (timestamps shifted to now) | off |

Response `200`:

```ts
{
  coin: string;              // "HYPE"
  window: "15m" | "7d" | "30d";
  updatedAt: number;         // ms UTC, when this payload was built
  coverage: string;          // lookback actually covered: same as `window`, unless the tweet source
                             // can't reach that far (X API recent search: window=30d → "7d")
  summary: {
    long: number; short: number; view: number;
    pctLong: number;         // round(long / (long + short) * 100); 0 when no long/short
  };
  calls: Call[];             // newest first
  byPrice: { lo: number; hi: number; longs: number; shorts: number }[];
                             // contiguous $5 buckets [lo, hi) over long/short entry prices; [] if none
}

Call = {
  id: string;                // tweet id
  url: string;               // link to the tweet
  ts: number;                // ms UTC, tweet time
  author: { name: string; handle: string; avatar: string; followers: number };
  text: string;              // HTML entities decoded
  side: "long" | "short" | "view";
  entryPrice: number | null; // Hyperliquid price at ts (open of the containing candle); null if unknown
  pnlPct: number | null;     // long: (mid - entry) / entry * 100; short: inverted; view: null. 2 decimals
  media?: string[];          // image URLs, omitted when none
}
```

Errors: `400 {error}` bad coin or window · `404 {error}` · `502 {error:"upstream failed"}` (tweet source or Hyperliquid down and no cached copy).

Headers (all exposed to the browser via `Access-Control-Expose-Headers`):
- `X-Hypersocial-Source: live|fixture`
- `X-Hypersocial-Provider: twitterapi|xapi` (live only)
- `X-Hypersocial-Coverage: <duration>`, e.g. `7d`: **only sent when coverage is truncated** (`coverage !== window`); same value as the body's `coverage`. Absent = full window
- live responses also carry `Cache-Control: public, max-age=<ttl>`

Freshness: the server caches per window: `15m` for 60 s, `7d`/`30d` for 10 min. Poll no faster than that.

Notes for the chart overlay:
- The price unit is Hyperliquid's numeric price (same as candle `o/h/l/c`).
- `entryPrice` resolution: 1m candles (15m window), 5m (7d), 15m (30d).
- `view` calls have an `entryPrice` too (the price at tweet time), so they can be pinned on the chart, but no `pnlPct`.
- When `coverage !== window`, show it (e.g. "last 7d only").

## GET /health

`{ ok, fixtureMode, source: "twitterapi"|"xapi"|null, usage: { calls, tweets, rateLimited, since } }`: upstream counters since the process started.
