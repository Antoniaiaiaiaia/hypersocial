# AGENTS.md — hypersocial backend

Read this before you set up, run or change this backend. Humans: see `README.md`.

## What it is
A Node 20 + TypeScript HTTP server (`node:http`, no framework). `GET /v1/signals?coin=HYPE&window=15m|7d|30d` returns X posts about a coin as long / short / view calls, priced with Hyperliquid candles. The contract is `API.md`; don't rename or remove fields.

## Set it up for your user
1. `cd backend && npm ci`
2. Ask your user which tweet source they have, then write **their** key into `backend/.env` (copy `.env.example`):
   - twitterapi.io → `TWITTERAPI_KEY=…`
   - official X API v2 → `X_BEARER_TOKEN=…` (recent search: 7 days max, so 30d comes back as `coverage: "7d"`)
3. `npm run build && npm start` (port 8787, `PORT` to change).
4. Check: `curl -s 'localhost:8787/v1/signals?coin=HYPE&window=7d'` returns JSON with `calls`, and `curl -s localhost:8787/health` names the source.
5. No key? `FIXTURE=1 npm start` serves synthetic data with zero upstream calls.

## Rules
- **Keys live only in `backend/.env` or real env vars.** Never commit them, print them, log them, or put them in the extension or frontend code. `.env` is gitignored.
- **Mind your user's credits.** Every live request can cost money (twitterapi.io) or rate limit (X API). Don't loop or backfill. `MAX_CALLS_PER_HOUR` (default 120) is a hard cap; lower it rather than raise it unless the user asks. Use `FIXTURE=1` for UI work.
- Don't commit real tweets, handles or avatars. `fixtures/` must stay synthetic: regenerate with `npm run fixtures` (offline, deterministic).
- Run `npm test` before you hand back a change. Tests mock `fetch` and need no key.

## Where to change things
| want to… | edit |
|---|---|
| add a tweet provider | new `src/sources/<name>.ts` implementing `TweetSource` (`types.ts`), register it in `src/sources/index.ts` (`pickSource`, `createSource`), add its env vars to `.env.example`, add a mapping test with a mocked response |
| change what counts as a call | env first (`MIN_FOLLOWERS`, `SPAM_WORDS`, …); code in `rejectReason()` in `src/signals.ts` |
| better long/short detection | replace the body of `classifySide(text, coin)` in `src/classify.ts` (e.g. an LLM call; keep the signature and add caching, since it runs per tweet) |
| support another coin | `COINS=HYPE,BTC` (Hyperliquid coin names) |
| change the response | `API.md` first, then `src/types.ts`, then tell the frontend |

## Provider notes
- twitterapi.io: header `X-API-Key`, `GET /twitter/tweet/advanced_search`, 20 tweets/page, billed per tweet. 7d and 30d use per-UTC-day "Top" slices, and closed days are cached.
- X API v2: header `Authorization: Bearer …`, `GET /2/tweets/search/recent` with `expansions=author_id,attachments.media_keys`, `user.fields=public_metrics,profile_image_url,created_at`. `start_time` must be inside the last 7 days. 429 → waits for `x-rate-limit-reset`, then serves the cache. If the tier rejects `$cashtag`, set `X_QUERY="{coin} -is:retweet -is:reply"`.
