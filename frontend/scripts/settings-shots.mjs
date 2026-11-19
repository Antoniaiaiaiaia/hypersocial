// Real Google Chrome: popup backend settings + Test connection states, and pins vs a local backend.
// Usage: npm run build && node scripts/settings-shots.mjs [outDir]
// Needs a backend on http://localhost:8787. Optional: a second one on another port that sends X-Hypersocial-Coverage.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const out = resolve(process.argv[2] ?? 'shots-settings');
mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext('', {
  channel: process.env.HS_CHANNEL ?? 'chrome', headless: true, viewport: { width: 1600, height: 950 }, deviceScaleFactor: 2,
  ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'],
});
const { id } = await (await ctx.browser().newBrowserCDPSession()).send('Extensions.loadUnpacked', { path: dist });

const pop = ctx.pages()[0] ?? (await ctx.newPage());
await pop.setViewportSize({ width: 320, height: 560 });
await pop.goto(`chrome-extension://${id}/popup.html`);
await pop.waitForTimeout(500);
const res = () => pop.locator('#res').textContent();
const step = async (name, url, button) => {
  await pop.fill('#url', url);
  await pop.click(button);
  await pop.waitForFunction(() => !/Testing/.test(document.getElementById('res').textContent), null, { timeout: 60000 });
  await pop.waitForTimeout(300);
  console.log(name, '->', await res());
  await pop.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
await pop.screenshot({ path: `${out}/01-settings-default.png`, fullPage: true });
await step('02-test-ok', 'http://localhost:8787', '#test');
await step('03-test-unreachable', 'http://localhost:9', '#test');
await step('04-test-remote-no-permission', 'https://example.com', '#test');
if (process.env.HS_COVERAGE_URL) {
  await step('05-save-coverage-7d', process.env.HS_COVERAGE_URL, '#save');
  // pins + panel note from the coverage-limited backend, 30d window
}

// pins against the saved backend
const hl = await ctx.newPage();
await hl.goto('https://app.hyperliquid.xyz/trade', { waitUntil: 'domcontentloaded' });
await hl.waitForFunction(() => (document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.pin').length ?? 0) > 0, null, { timeout: 60000 });
await hl.locator('[data-hypersocial="Signals"]').click();
await hl.locator('div[data-hypersocial=""]').evaluate((h) => [...h.shadowRoot.querySelectorAll('.seg button')].find((b) => b.textContent === '30d').click());
await hl.waitForFunction(() => (document.querySelector('div[data-hypersocial=""]')?.shadowRoot?.querySelectorAll('.card').length ?? 0) > 0, null, { timeout: 60000 });
await hl.waitForTimeout(1500);
console.log('pins:', await hl.evaluate(() => document.querySelector('div[data-hypersocial=""]').shadowRoot.querySelectorAll('.pin').length),
  '| panel note:', await hl.evaluate(() => document.querySelector('div[data-hypersocial=""]').shadowRoot.querySelector('.covnote')?.textContent ?? 'none'));
await hl.screenshot({ path: `${out}/06-hl-pins-30d.png` });
await pop.reload(); await pop.waitForTimeout(800);
await pop.screenshot({ path: `${out}/07-popup-after.png`, fullPage: true });
console.log('popup cov:', await pop.locator('#cov').textContent());
await ctx.close();
