# hypersocial

See what X (Twitter) said about a coin, right on the Hyperliquid chart.

hypersocial is a Chrome extension plus a small local server. The server pulls recent posts about `$HYPE`, sorts them into long / short / view calls, and records the Hyperliquid price at the time of each post. The extension pins those calls onto the candles at app.hyperliquid.xyz and adds a **Signals** tab and a **Trader Analytics** tab.

- Windows: last 15 minutes, 7 days, 30 days
- Pins sit on Hyperliquid's own chart and follow pan, zoom and timeframe changes
- Bring your own data source: a [twitterapi.io](https://twitterapi.io) key **or** an official X API bearer token
- Your key stays on your machine, in the server. The extension never sees it.

Not financial advice. Calls are what people posted, sorted by a simple keyword classifier.

## Quick start

Needs Node 20+ and Chrome.

```bash
git clone <this repo> hypersocial && cd hypersocial

# 1. server
cd backend
cp .env.example .env        # add TWITTERAPI_KEY or X_BEARER_TOKEN
npm ci && npm start         # http://localhost:8787

# 2. extension (new terminal)
cd ../frontend
npm ci && npm run build     # -> frontend/dist
```

Then in Chrome: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick `frontend/dist`. Open `https://app.hyperliquid.xyz/trade` with HYPE selected.

No key yet? Start the server with `FIXTURE=1 npm start` to see it work on synthetic sample data.

## Data sources

| Source | Env var | Covers | Notes |
|---|---|---|---|
| twitterapi.io | `TWITTERAPI_KEY` | 15m / 7d / 30d | Pay per use. Responses are cached to keep credit use low. |
| X API v2 (official) | `X_BEARER_TOKEN` | 15m / 7d | Recent search only reaches back 7 days, so 30d is capped at 7d and the extension says so. |

Set `TWEET_SOURCE=twitterapi` or `xapi` to choose when both keys are set. Every option is listed in `backend/.env.example` and `backend/README.md`.

## Using it

- Click the hypersocial icon in the Chrome toolbar to turn the overlay on or off, refresh data, or point the extension at a server that isn't on localhost.
- The Signals panel shows a status line (for example `Chart pins on: 31 in view`). When pins can't attach, it says why.

## Repo layout

```
backend/    Node 20 + TypeScript server: GET /v1/signals (contract in backend/API.md)
frontend/   Chrome MV3 extension (TypeScript + Vite)
AGENTS.md   instructions for coding agents setting this up or changing it
```

## Using an AI agent

Point your coding agent (Claude Code, Codex, Cursor, …) at this repo and ask it to set hypersocial up. `AGENTS.md` tells it how: which key to ask you for, where to put it, how to run and check everything, and what not to touch.

## License

MIT
