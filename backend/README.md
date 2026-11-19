# hypersocial backend

A small HTTP API that turns X (Twitter) posts about a coin ($HYPE by default) into trading signals: who called long or short, at what price, and how that call is doing now. It feeds the hypersocial Chrome extension, which pins the calls on Hyperliquid's candle chart.

- Tweets come from **your own** key: [twitterapi.io](https://twitterapi.io) or the official **X API v2**.
- Prices come from Hyperliquid's public info API (no key).
- Contract: [`API.md`](API.md). Guide for coding agents: [`AGENTS.md`](AGENTS.md).

## Setup

Needs Node 20+.

```bash
cd backend
npm ci
cp .env.example .env      # then put ONE key in .env (see below)
npm run build && npm start
curl -s 'localhost:8787/v1/signals?coin=HYPE&window=7d' | head -c 400
```

No key yet? Run on the synthetic sample data:

```bash
FIXTURE=1 npm start
```

Without a key and without `FIXTURE=1`, the server stops at startup and tells you what to set.

### Option A: twitterapi.io

1. Create a key at https://twitterapi.io.
2. In `.env`: `TWITTERAPI_KEY=...`

Covers 15m, 7d and 30d in full. It bills per tweet returned. 7d and 30d are fetched as one "Top" query per UTC day (20 tweets). Past days are cached for 12 h and shared between 7d and 30d, so once warm a refresh costs about 1 call. Cold start: 7d is about 8 calls (~160 tweets), 30d about 31 calls (~620 tweets).

### Option B: official X API v2

1. Create an app at https://developer.x.com and copy its **Bearer token**.
2. In `.env`: `X_BEARER_TOKEN=...`

Uses recent search (`GET /2/tweets/search/recent`), with the author expansion for follower counts and avatars.

- **Only the last 7 days are searchable.** `window=30d` returns the 7 days available and says so: `coverage: "7d"` in the body and the `X-Hypersocial-Coverage: 7d` header (sent only when coverage is truncated).
- 7d and 30d share one search (up to `X_PAGES_7D` × 100 tweets). 15m is one page.
- Your tier sets the rate limit and the monthly read cap. On a 429 the server waits for the reset hint, retries up to `RATE_LIMIT_RETRIES` times, then serves the last cached copy.
- Some tiers don't support the `$cashtag` operator. If your searches fail with a query error, set `X_QUERY="{coin} -is:retweet -is:reply"`. Results are still filtered to the real cashtag locally.

If both keys are set, twitterapi.io wins. Force one with `TWEET_SOURCE=twitterapi|xapi`.

## Config

Every variable is listed with comments in [`.env.example`](.env.example). The main ones:

| var | default | what |
|---|---|---|
| `TWEET_SOURCE` | auto | `twitterapi` or `xapi` |
| `TWITTERAPI_KEY` / `X_BEARER_TOKEN` | — | one is required unless `FIXTURE=1` |
| `PORT` | 8787 | |
| `FIXTURE` | — | `1` = serve `fixtures/`, no upstream calls |
| `COINS` | HYPE | coins `/v1/signals` accepts |
| `MIN_FOLLOWERS` | 1000 | a call = cashtag tweet from an author at or above this |
| `MAX_CASHTAGS`, `MIN_ACCOUNT_AGE_DAYS`, `MAX_FOLLOWING_RATIO`, `SPAM_WORDS`, `MAX_PER_AUTHOR` | 4, 30, 5, …, 3 | spam and bot filters |
| `MAX_CALLS_PER_HOUR` | 120 | hard cap on upstream search calls (cost guard) |
| `TTL_15M_MS` / `TTL_7D_MS` / `TTL_30D_MS` | 60 s / 10 min / 10 min | response cache |
| `TW_PAGES_15M`, `TW_PAGES_PER_DAY`, `TW_MIN_FAVES_DAY` | 2, 1, 5 | twitterapi.io fetch plan |
| `X_PAGES_15M`, `X_PAGES_7D`, `X_MAX_RESULTS`, `X_QUERY` | 1, 3, 100, `{cashtag} -is:retweet -is:reply` | X API fetch plan |

`GET /health` shows the active source and call / tweet / 429 counters since start.

## How it works

```
src/server.ts           HTTP, CORS, per-window cache, fixture mode
src/sources/            one TweetSource interface, two implementations
  types.ts              provider-neutral Tweet
  twitterapi.ts         twitterapi.io advanced search
  xapi.ts               X API v2 recent search
  http.ts               GET with 429/5xx backoff, hourly call budget
  index.ts              pickSource() / createSource()
src/signals.ts          filters, dedupe, per-author cap, pricing, summary, $5 buckets
src/classify.ts         classifySide(): keyword heuristic, the one place to plug in an LLM
src/hyperliquid.ts      allMids (current price) + candleSnapshot (price at tweet time)
```

To add another source, implement `TweetSource` in `src/sources/` and register it in `index.ts`. Everything downstream stays the same.

## Fixtures

`fixtures/signals-HYPE-{15m,7d,30d}.json` are **fully synthetic**: invented texts, `hs_demo_NN` handles, default avatar, a made-up price path and `example.com` links. They run through the same filters and classifier as live data. Regenerate them with `npm run fixtures` (deterministic, offline, no key).

## Tests

```bash
npm test     # build, then the classifier, pnl/bucket, source selection and X API mapping tests (fetch is mocked)
```

## In this repo (contributors)

This folder is the `backend` module: work on `backend/<topic>` branches and change files only under `backend/` (git hooks enforce it). Change the contract in `API.md` first and flag it for the frontend.
