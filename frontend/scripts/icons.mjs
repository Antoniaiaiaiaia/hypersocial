// Renders public/icons/{16,48,128}.png from an inline SVG mark (one-off; PNGs are committed).
import { chromium } from 'playwright';
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<rect width="128" height="128" rx="28" fill="#0f1a1f"/>
<path d="M26 92 L50 66 L68 78 L100 40" fill="none" stroke="#50d2c1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="100" cy="40" r="15" fill="#0f1a1f" stroke="#f6fefd" stroke-width="7"/>
<circle cx="50" cy="66" r="8" fill="#ed7088"/>
</svg>`;
const b = await chromium.launch();
const p = await b.newPage();
for (const s of [16, 48, 128]) {
  await p.setViewportSize({ width: s, height: s });
  await p.setContent(`<style>html,body{margin:0;background:transparent}</style><div style="width:${s}px;height:${s}px">${mark.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`);
  await p.screenshot({ path: `public/icons/${s}.png`, omitBackground: true });
}
await b.close();
