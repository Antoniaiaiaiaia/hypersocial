import type { Call, SignalsResult, SignalWindow } from '../types';
import { h, svg } from './dom';
import { avatarEl } from './avatar';
import { price, pct } from './format';
import { C } from './styles';

/** Trade call with a known entry price. */
type Priced = Call & { entryPrice: number; pnlPct: number | null };
const priced = (c: Call): c is Priced => c.entryPrice != null;
const pnl0 = (c: Call) => c.pnlPct ?? -Infinity; // ranking only: null never wins "best"
function avgNonNull(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

interface Side { n: number; avg: number; pnl: number; inProfit: number }

function sideStats(calls: Priced[], mid: number | null, dir: 1 | -1): Side {
  if (!calls.length) return { n: 0, avg: 0, pnl: 0, inProfit: 0 };
  const avg = calls.reduce((s, c) => s + c.entryPrice, 0) / calls.length;
  const pnlOf = (c: Priced) => (mid ? (dir * (mid - c.entryPrice)) / c.entryPrice * 100 : c.pnlPct ?? 0);
  return {
    n: calls.length,
    avg,
    pnl: mid ? (dir * (mid - avg)) / avg * 100 : avgNonNull(calls.map((c) => c.pnlPct)),
    inProfit: calls.filter((c) => pnlOf(c) > 0).length,
  };
}

export function renderAnalytics(res: SignalsResult | null, coin: string, window: SignalWindow, mid: number | null): HTMLElement {
  const d = res?.data;
  if (!d) return h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'Loading…');
  const longs = d.calls.filter(priced).filter((c) => c.side === 'long');
  const shorts = d.calls.filter(priced).filter((c) => c.side === 'short');
  const { pctLong } = d.summary;
  const bear = shorts.length > longs.length;
  const L = sideStats(longs, mid, 1), S = sideStats(shorts, mid, -1);

  // narrative: newest 7 shorts or longs underwater
  const recentShorts = shorts.slice(0, 7);
  const shortsUnder = recentShorts.filter((c) => (mid ? mid > c.entryPrice : c.pnlPct != null && c.pnlPct < 0)).length;
  const recentLongs = longs.slice(0, 7);
  const longsUnder = recentLongs.filter((c) => (mid ? mid < c.entryPrice : c.pnlPct != null && c.pnlPct < 0)).length;
  const note = recentShorts.length && shortsUnder / recentShorts.length >= longsUnder / Math.max(1, recentLongs.length)
    ? `${shortsUnder} of the last ${recentShorts.length} shorts are underwater.`
    : recentLongs.length ? `${longsUnder} of the last ${recentLongs.length} longs are underwater.` : 'No trade calls yet.';

  // top callers
  const by = new Map<string, { a: Call['author']; calls: Call[] }>();
  for (const c of d.calls) {
    if (c.side === 'view') continue;
    const e = by.get(c.author.handle) ?? { a: c.author, calls: [] };
    e.calls.push(c); by.set(c.author.handle, e);
  }
  const top = [...by.values()]
    .map((e) => ({ ...e, best: e.calls.reduce((b, c) => (pnl0(c) > pnl0(b) ? c : b)) }))
    .sort((a, b) => b.a.followers - a.a.followers)
    .slice(0, 5);

  return h('div', { style: 'display:contents' },
    h('section', {},
      h('h4', {}, `Calls on ${coin} · ${window.toUpperCase()}`),
      h('div', { class: `big${bear ? ' bear' : ''}` }, bear ? `${100 - pctLong}% short` : `${pctLong}% long`,
        h('small', {}, `${d.summary.long} long · ${d.summary.short} short`)),
      h('div', { class: 'bar' }, h('i', { style: `width:${pctLong}%` })),
      h('div', { class: 'note' }, note),
    ),
    h('section', {},
      h('h4', {}, 'Where calls were entered',
        h('span', { class: 'legend' }, h('span', {}, h('i', { style: `background:${C.long}` }), 'Longs'), h('span', {}, h('i', { style: `background:${C.short}` }), 'Shorts'))),
      histogram(d.byPrice, mid),
    ),
    h('section', {},
      h('h4', {}, `Open PnL at ${mid ? price(mid) : 'last'}`),
      pnlRow('Longs', L, 'long'),
      pnlRow('Shorts', S, 'short'),
    ),
    h('section', {},
      h('h4', {}, `Top callers`, h('span', { class: 'sp' }), h('span', { style: 'text-transform:none' }, `${by.size} traders`)),
      top.length ? top.map((t) => h('a', { class: 'tr', href: t.best.url, target: '_blank', rel: 'noopener noreferrer' },
        avatarEl(t.a),
        h('div', {}, h('div', { class: 'nm' }, t.a.name), h('div', { class: 'hd' }, '@' + t.a.handle)),
        h('div', { class: 'r' },
          h('div', { class: t.best.side }, `${t.best.side === 'long' ? 'L' : 'S'} ${price(t.best.entryPrice)}`),
          h('div', { class: (t.best.pnlPct ?? 0) >= 0 ? 'long' : 'short', style: 'font-size:11px' }, pct(t.best.pnlPct))),
      )) : h('div', { class: 'sub' }, 'No traders yet'),
    ),
  );
}

function pnlRow(label: string, s: Side, cls: 'long' | 'short'): HTMLElement {
  const frac = s.n ? s.inProfit / s.n : 0;
  return h('div', { style: 'margin-bottom:12px' },
    h('div', { class: 'kv' }, h('span', { class: cls }, label), h('span', { class: `pnl ${s.pnl >= 0 ? 'long' : 'short'}` }, s.n ? pct(s.pnl) : '—')),
    h('div', { class: 'sub' }, h('span', {}, s.n ? `Avg entry ${price(s.avg)}` : 'No calls'), h('span', {}, s.n ? `${s.inProfit} of ${s.n} in profit` : '')),
    h('div', { class: 'bar', style: `background:${C.line}` }, h('i', { style: `width:${frac * 100}%;background:${cls === 'long' ? C.long : C.short}` })),
  );
}

function histogram(b: SignalsResult['data']['byPrice'], mid: number | null): Node {
  const W = 420, H = 118, top = 14, base = 64, bot = H - 2;
  if (!b.length) return h('div', { class: 'sub' }, 'No entries yet');
  const maxL = Math.max(1, ...b.map((x) => Math.max(x.longs, x.shorts))), maxS = maxL; // one scale
  const lo = b[0].lo, hi = b[b.length - 1].hi;
  const bw = W / b.length;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', preserveAspectRatio: 'none', style: 'display:block;max-height:130px' });
  b.forEach((x, i) => {
    const cx = i * bw;
    if (x.longs) {
      const hh = ((base - top) * x.longs) / maxL;
      s.append(svg('rect', { x: cx + 2, y: base - hh, width: bw - 4, height: hh, fill: C.long, rx: 1 }));
      s.append(Object.assign(svg('text', { x: cx + bw / 2, y: base - hh - 3, 'text-anchor': 'middle' }), { textContent: String(x.longs) }));
    }
    if (x.shorts) {
      const hh = ((bot - 18 - base) * x.shorts) / maxS;
      if (hh > 0) s.append(Object.assign(svg('text', { x: cx + bw / 2, y: base + hh + 11, 'text-anchor': 'middle' }), { textContent: String(x.shorts) }));
      s.append(svg('rect', { x: cx + 2, y: base + 1, width: bw - 4, height: hh, fill: C.short, rx: 1 }));
    }
    if (b.length <= 14 || i % Math.ceil(b.length / 10) === 0)
      s.append(Object.assign(svg('text', { x: cx + bw / 2, y: H - 2, 'text-anchor': 'middle' }), { textContent: price(x.lo) }));
  });
  s.append(svg('line', { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5, stroke: C.line }));
  if (mid && mid >= lo && mid <= hi) {
    const mx = ((mid - lo) / (hi - lo)) * W;
    s.append(svg('line', { x1: mx, x2: mx, y1: 10, y2: bot - 4, stroke: C.text2, 'stroke-dasharray': '3 3' }));
    s.append(Object.assign(svg('text', { x: Math.min(W - 24, Math.max(24, mx)), y: 9, 'text-anchor': 'middle', style: `fill:${C.long}` }), { textContent: price(mid) }));
  }
  return s;
}
