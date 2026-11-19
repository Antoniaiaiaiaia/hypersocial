# AGENTS.md: hypersocial

Instructions for coding agents (Claude Code, Codex, Cursor, …) that set up, run or change this repo. Humans: see `README.md`.

## What this is

- `backend/`: a Node 20 + TypeScript HTTP server. `GET /v1/signals?coin=HYPE&window=15m|7d|30d` returns X posts about the coin as long / short / view calls, with the Hyperliquid price at post time. The contract is `backend/API.md`: it is the single source of truth.
- `frontend/`: a Chrome MV3 extension for `https://app.hyperliquid.xyz/trade*`. It pins calls on Hyperliquid's own TradingView chart and adds a Signals tab, a Trader Analytics tab and a toolbar popup. It only talks to the backend and to `api.hyperliquid.xyz`.

Each module has its own detail file: `backend/AGENTS.md` (sources, env, cache, tests) and `frontend/AGENTS.md` (chart hook, permissions, screenshots). Read the one for the part you change.

## Set it up for a user

1. **Ask the user which data source they have.** Don't guess and don't sign them up for anything.
   - twitterapi.io key → `TWITTERAPI_KEY`
   - official X API bearer token → `X_BEARER_TOKEN` (recent search, 7 days back; 30d is capped at 7d)
   - neither → run with `FIXTURE=1` (synthetic data) and tell them what they'd need for live data.
2. `cd backend && cp .env.example .env`, then have the user paste the key into `.env` themselves, or write it there if they give it to you. **Never print the key, echo it into logs, commit it or put it in the extension.**
3. `npm ci && npm test && npm start`. Check it:
   `curl -s 'localhost:8787/v1/signals?coin=HYPE&window=7d' | head -c 400` should return JSON with `summary` and `calls`. `curl -s localhost:8787/health` shows which source is active and how many upstream calls were made.
4. `cd ../frontend && npm ci && npm run build`. Tell the user to load `frontend/dist` via `chrome://extensions` → Developer mode → Load unpacked. You can't click that for them.
5. If the backend isn't on `localhost:8787`, the user sets the URL in the toolbar popup; Chrome asks them to allow that host.

### Cost and rate limits

- twitterapi.io bills per request. The server caches responses (15m: 60 s; 7d / 30d: 10 min; past days of the 30d window: 12 h). Don't add loops, backfills or tests that hit the live API repeatedly. Use `FIXTURE=1` or mocks.
- X API: recent search has tight per-15-minute limits on low tiers. The server backs off on 429 and serves stale cache.

## Changing the code

- Run `npm test` in `backend/` and `npm run build` in `frontend/` before you say something works. For UI changes, take a screenshot on the real Hyperliquid page (`frontend/scripts/shots.mjs`).
- **Contract first.** Changing the response shape means editing `backend/API.md` and `frontend/src/types.ts` in the same change. The frontend never imports backend code.
- **New data source:** add it under `backend/src/sources/`, behind the same interface, choose it with `TWEET_SOURCE`, and add a mocked test of its response mapping. Downstream filters and the classifier must not change per source.
- **Classifier:** `backend/src/classify.ts` `classifySide()` is the one swap point (keyword based today). An LLM classifier needs its own env key and must be opt-in.
- **Fixtures stay synthetic.** Never commit real post text, real handles, real post IDs or real profile images.
- Extension permissions: keep the required `host_permissions` to `api.hyperliquid.xyz` + localhost. Any other host goes through `optional_host_permissions` at runtime.
- Secrets live only in `backend/.env` (gitignored). Never put credentials in code, fixtures, screenshots or commit messages.
- Don't leave dev servers running when you're done.

## Not in scope

No trading or order placement from the extension, no wallet access, and no scraping X without an API.
