# Agent notes: frontend (hypersocial extension)

For coding agents working in `frontend/`. Read [README.md](README.md) first.

## Loop
1. `npm ci`
2. Edit `src/`.
3. `npm run build` (runs `tsc --noEmit`, then bundles each entry as an IIFE into `dist/`; content scripts cannot be ES modules).
4. Check in a real page: `HS_CHANNEL=chrome npm run shots -- shots-chrome` (or `npm run shots` for Chromium). It prints pin counts for first load, reload, zoom and the D/30d chart; any 0 there is a regression. Popup work: `node scripts/popup-shots.mjs`, `node scripts/settings-shots.mjs`.
5. Look at the screenshots. Shot folders are gitignored; don't commit them.

## Rules
- No API keys or tokens in the extension. Only the backend holds them.
- Only `src/background.ts` calls the backend. Content scripts and the popup go through `chrome.runtime.sendMessage`.
- Don't add required host permissions. Remote backends go through `optional_host_permissions` + `chrome.permissions.request` (must run inside the click handler, before any `await`).
- The API contract is `../backend/API.md`. Copy types into `src/types.ts`; don't import backend code. `entryPrice` and `pnlPct` can be `null`.
- Don't put Hyperliquid's own logic or trading actions in the extension (no orders, no wallet access).
- Mock data (`src/mock.ts`) stays synthetic: made-up names with a `_mock` suffix, made-up text, no real links.
- UI follows Hyperliquid's dark theme (`src/content/styles.ts`); brand it hypersocial, never third-party brands.
- When you touch the chart mapping (`src/main-world.ts`, `src/content/pins.ts`), verify in a real page after zoom, pan and a timeframe switch.
