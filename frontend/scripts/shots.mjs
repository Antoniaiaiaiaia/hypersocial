// Loads dist/ into Chromium, opens the live HL HYPE trade page and saves screenshots.
// Usage: npm run build && npm run shots [-- <outDir>]   (default: ./shots)
// Env: HS_CHANNEL=chromium|chrome (chrome = installed Google Chrome), HS_URL (default the bare /trade page, which shows the last-used coin)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const out = resolve(process.argv[2] ?? 'shots');
mkdirSync(out, { recursive: true });
const channel = process.env.HS_CHANNEL ?? 'chromium';
const url = process.env.HS_URL ?? 'https://app.hyperliquid.xyz/trade';
// Chromium: --load-extension. Branded Chrome (>=137) ignores that flag, so load via CDP Extensions.loadUnpacked.
const branded = channel === 'chrome';
const ctx = await chromium.launchPersistentContext('', {
  channel, headless: true, viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: branded ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
if (branded) console.log('loaded', await (await ctx.browser().newBrowserCDPSession()).send('Extensions.loadUnpacked', { path: dist }));
console.log('channel', channel, 'url', url);
const p = ctx.pages()[0] ?? (await ctx.newPage());
const shot = async (name, clip) => { await p.screenshot({ path: `${out}/${name}.png`, clip }); console.log('saved', name); };
const pinCount = () => p.evaluate(() => document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0);
const chartClip = async () => {
  const r = await p.evaluate(() => { const i = document.querySelector('iframe[id^="tradingview_"]').getBoundingClientRect(); return { x: i.x, y: i.y, width: i.width, height: i.height }; });
  return r;
};

const waitPins = () => p.waitForFunction(() => (document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0) > 0, null, { timeout: 60000 });
await p.goto(url, { waitUntil: 'domcontentloaded' });
await waitPins();
console.log('pins first load:', await pinCount());
await shot('00a-first-load');
await p.reload({ waitUntil: 'domcontentloaded' }); // warm cache
await waitPins();
console.log('pins after reload:', await pinCount());
await shot('00b-reload');
// dismiss the announcements popover if present
await p.getByText('Announcements').locator('..').locator('svg, button').first().click({ timeout: 2000 }).catch(() => {});
await p.waitForTimeout(1500);
console.log('pins 1h/7d:', await pinCount());
await shot('01-page-pins-1h');
await shot('01b-chart-pins-1h', await chartClip());

// hover a pin -> tooltip
const pin = p.locator('div[data-hypersocial=""] .pin').first();
await pin.hover().catch(() => {});
await p.waitForTimeout(300);
await shot('02-pin-hover', await chartClip());

// Signals tab
await p.locator('[data-hypersocial="Signals"]').click();
await p.waitForTimeout(600);
await shot('03-signals-panel');

// Trader Analytics tab
await p.locator('[data-hypersocial="Trader Analytics"]').click();
await p.waitForTimeout(800);
await shot('04-trader-analytics');

// zoom in on the chart (wheel) -> pins re-layout
const c = await chartClip();
await p.mouse.move(c.x + c.width * 0.6, c.y + c.height * 0.35);
for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -240); await p.waitForTimeout(120); }
await p.waitForTimeout(600);
console.log('pins after zoom:', await pinCount());
await shot('05-zoomed', c);

// pan (drag left)
await p.mouse.down(); await p.mouse.move(c.x + c.width * 0.85, c.y + c.height * 0.35, { steps: 12 }); await p.mouse.up();
await p.waitForTimeout(600);
await shot('06-panned', c);

// switch window to 30d + timeframe to D
await p.locator('[data-hypersocial="Signals"]').click();
await p.waitForTimeout(300);
await p.locator('div[data-hypersocial=""]').evaluate((hst) => { [...hst.shadowRoot.querySelectorAll('.seg button')].find((b) => b.textContent === '30d').click(); });
const fr = p.frameLocator('iframe[id^="tradingview_"]');
await fr.locator('text="D" >> visible=true').first().click().catch((e) => console.log('tf click failed', e.message));
await waitPins().catch(() => console.log('no pins after 30d switch'));
await p.waitForTimeout(1500);
console.log('pins D/30d:', await pinCount());
await shot('07-daily-30d');
await shot('07b-chart-daily-30d', await chartClip());

await ctx.close();
