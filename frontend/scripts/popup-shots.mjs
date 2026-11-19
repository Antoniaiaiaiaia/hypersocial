// Real Google Chrome: load dist via CDP, open HL + the popup page, flip the switch, refresh, save shots.
// Usage: npm run build && node scripts/popup-shots.mjs [outDir]   (default ./shots-popup)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const out = resolve(process.argv[2] ?? 'shots-popup');
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext('', {
  channel: process.env.HS_CHANNEL ?? 'chrome', headless: true, viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2,
  ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
});
const { id } = await (await ctx.browser().newBrowserCDPSession()).send('Extensions.loadUnpacked', { path: dist });
console.log('extension', id);

const hl = ctx.pages()[0] ?? (await ctx.newPage());
const state = () => hl.evaluate(() => ({
  pins: document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0,
  tabs: [...document.querySelectorAll('[data-hypersocial]')].map((e) => e.getAttribute('data-hypersocial')).filter(Boolean),
}));
await hl.goto('https://app.hyperliquid.xyz/trade', { waitUntil: 'domcontentloaded' });
await hl.waitForFunction(() => (document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0) > 0, null, { timeout: 60000 });
await hl.waitForTimeout(1000);
console.log('on:', JSON.stringify(await state()));
await hl.screenshot({ path: `${out}/01-hl-on.png` });

const pop = await ctx.newPage();
await pop.setViewportSize({ width: 320, height: 400 });
await pop.goto(`chrome-extension://${id}/popup.html`);
await pop.waitForTimeout(800);
const popShot = async (n) => pop.screenshot({ path: `${out}/${n}.png`, fullPage: true });
await popShot('02-popup-on');

await pop.click('.sw');
await hl.waitForTimeout(800);
console.log('off:', JSON.stringify(await state()));
await hl.screenshot({ path: `${out}/03-hl-off.png` });
await popShot('04-popup-off');

await pop.click('.sw');
await hl.waitForFunction(() => (document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0) > 0, null, { timeout: 60000 });
await hl.waitForTimeout(800);
console.log('on again:', JSON.stringify(await state()));
await hl.screenshot({ path: `${out}/05-hl-on-again.png` });

await pop.click('#refresh');
await pop.waitForTimeout(150);
await popShot('06-popup-refreshing');
await pop.waitForFunction(() => !document.getElementById('refresh').disabled, null, { timeout: 60000 });
await pop.waitForTimeout(300);
await popShot('07-popup-refreshed');
console.log('popup:', await pop.evaluate(() => ['src', 'calls', 'cw', 'upd', 'fetched', 'msg'].map((k) => `${k}=${document.getElementById(k).textContent}`).join(' | ')));
await ctx.close();
