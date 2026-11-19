# hypersocial extension

A Chrome extension (MV3) for [Hyperliquid](https://app.hyperliquid.xyz/trade). It puts calls from X (long / short / view posts about a coin) on Hyperliquid's own candle chart and adds two tabs to the trade page:

- **Pins on the chart**: avatar pins at each call's time and entry price (green long, red short). Nearby calls merge into one pin with a count. Pins follow pan, zoom, resize and timeframe changes.
- **Signals tab** (next to Order Book / Trades): % long, 15m / 7d / 30d window, All / Trades / Views / Longs / Shorts filters, call cards with entry, PnL and a link to the post.
- **Trader Analytics tab** (bottom panel): positioning, where calls were entered, open PnL for longs vs shorts, top callers.
- **Toolbar popup**: turn the effect on or off, refresh data, set and test your backend.

The extension holds no API keys. Posts come from a backend you run yourself (with your own twitterapi.io key or X API token); prices come from Hyperliquid's public API.

## Build

Node 20+.

```bash
cd frontend
npm ci
npm run build        # type-check + bundle into dist/
```

## Load it in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked** → pick `frontend/dist`.
3. Open https://app.hyperliquid.xyz/trade (reload the tab if it was already open).

After a rebuild, press the reload icon on the extension card, then reload the Hyperliquid tab.

## Point it at your backend

The backend contract is in [`../backend/API.md`](../backend/API.md) (`GET /v1/signals?coin=HYPE&window=15m|7d|30d`). Run the backend in `../backend/` or your own implementation of the same contract.

1. Click the hypersocial icon in the toolbar.
2. Enter the **Backend URL** (default `http://localhost:8787`) and press **Save**.
   - `localhost` / `127.0.0.1` on any port works without a prompt.
   - Any other host asks for permission to reach that host when you press Save (optional host permission). Nothing else gets access.
3. Press **Test connection**. It calls `/v1/signals?window=30d` and shows latency, source and call count, or why it failed.

If the backend sends `X-Hypersocial-Coverage` (e.g. `7d`, because the X API recent search only covers 7 days), the popup and the Signals tab say "30d limited to 7d by source".

If the backend cannot be reached at all, the extension shows **mock** calls placed on real Hyperliquid candles, so you can try the UI. Mock calls are synthetic (made-up `*_mock` handles, no links). The popup and the Signals tab mark them as Mock.

## Permissions

| Permission | Why |
|---|---|
| `storage` | on/off switch, backend URL, window/filter choice, last fetch status |
| `https://api.hyperliquid.xyz/*` | public prices (mid price, candles for mock data) |
| `http://localhost/*`, `http://127.0.0.1/*` | a backend on your machine |
| optional `http(s)://*/*` | requested for one host only, when you save a remote backend URL |
| content scripts on `https://app.hyperliquid.xyz/trade*` | draw pins and tabs |

## Troubleshooting

Open the **Signals** tab: the line under the filters says what the pins are doing.

| Status line | What to do |
|---|---|
| Chart pins on: N in view | working |
| Chart pins on: none in view | no calls in the visible range: zoom out or pick a longer window |
| Chart pins: attaching… / waiting for calls… | wait a few seconds; a cold 30d request can take a while |
| Chart pins off: chart not found on this page | Hyperliquid's chart did not load, or its chart library changed; reload the tab |
| Chart pins off: chart shows X, signals are for Y | switch the chart and page to the same coin |
| Chart pins off: set the price scale to normal or log | % and indexed price scales are not supported |

Also check:
- The popup's **Data source** badge: Live / Fixture = backend OK, Mock = backend unreachable, Error = backend replied with an error.
- **Test connection** messages: "Could not reach the backend" (not running / wrong URL), "No permission for this host yet" (press Save), "HTTP 4xx/5xx" (backend error).
- After a rebuild, reload both the extension and the tab.

## How it works

- `src/main-world.ts` runs in the page at `document_start`. Hyperliquid builds its chart with the TradingView Charting Library (`new TradingView.widget(...)`, same-origin iframe). The script keeps a reference to the widget (or, if it missed the constructor, uses the chart iframe's `tradingViewApi`). Every frame it reads the visible time range, bar spacing and price range, calibrates one bar's x position, and posts this geometry to the content script when it changes.
- `src/content/` runs isolated in a Shadow DOM: maps time → bar x and price → y (normal or log scale), places and clusters pins, injects the two tabs into Hyperliquid's own tab bars, and draws the panels over those areas.
- `src/background.ts` (service worker) is the only part that calls the backend.
- `src/popup.ts`: toolbar popup. It talks to open tabs only through `chrome.storage` (no `tabs` permission).
- The coin comes from the tab title (`68.695 | HYPE | Hyperliquid`), then the URL, then the chart symbol (Hyperliquid's bare `/trade` shows the last-used coin).

## Dev scripts

Each loads `dist/` into a headless browser and opens the live Hyperliquid page. Install the browser once with `npx playwright install chromium`.

```bash
npm run shots                         # Chromium: pins (first load + reload), hover, Signals, Analytics, zoom, pan, D/30d → ./shots
HS_CHANNEL=chrome npm run shots -- shots-chrome   # same in installed Google Chrome (loads via CDP; recent Chrome ignores --load-extension)
node scripts/popup-shots.mjs          # popup on/off/refresh → ./shots-popup
node scripts/settings-shots.mjs       # backend URL + Test connection states → ./shots-settings
```

These scripts need a backend on `http://localhost:8787` (or they run against mock data). Shot folders are gitignored.

## Limits

- One coin at a time; v0 backends cover `HYPE`.
- Pins need the chart's normal or log price scale.
- The tabs are found by Hyperliquid's visible tab text ("Order Book" / "Trades", "Balances" / "Positions"). If those change, the tabs do not appear; the pins keep working.
- On the chart, only long / short calls get pins by default; views get pins when the Views filter is on.
- Refresh skips the browser cache, not the backend's own cache.

## Contributing

See [AGENTS.md](AGENTS.md) for the build / check loop and the rules for this folder.
