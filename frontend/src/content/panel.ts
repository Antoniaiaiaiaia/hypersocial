import type { Call, SignalsResult, SignalWindow } from '../types';
import { h } from './dom';
import { avatarEl } from './avatar';
import { ago, price, pct } from './format';
import { coverageLimit } from '../config';

export type Filter = 'all' | 'trades' | 'views' | 'longs' | 'shorts';
export const FILTERS: [Filter, string][] = [['all', 'All'], ['trades', 'Trades'], ['views', 'Views'], ['longs', 'Longs'], ['shorts', 'Shorts']];
export const WINDOWS: SignalWindow[] = ['15m', '7d', '30d'];

export function applyFilter(calls: Call[], f: Filter): Call[] {
  switch (f) {
    case 'trades': return calls.filter((c) => c.side !== 'view');
    case 'views': return calls.filter((c) => c.side === 'view');
    case 'longs': return calls.filter((c) => c.side === 'long');
    case 'shorts': return calls.filter((c) => c.side === 'short');
    default: return calls;
  }
}

export interface PanelState {
  coin: string;
  window: SignalWindow;
  filter: Filter;
  res: SignalsResult | null;
  loading: boolean;
  error: string | null;
  highlight: string | null;
}

export interface PanelActions {
  setWindow(w: SignalWindow): void;
  setFilter(f: Filter): void;
  focus(c: Call): void;
}

export function renderPanel(s: PanelState, a: PanelActions): HTMLElement {
  const d = s.res?.data;
  const sum = d?.summary;
  const pctLong = sum?.pctLong ?? 0;
  const bear = sum ? sum.short > sum.long : false;
  const calls = d ? applyFilter(d.calls, s.filter) : [];

  const head = h('div', { class: 'ph' },
    h('div', { class: 'row' },
      h('div', { class: 'seg' }, WINDOWS.map((w) =>
        h('button', { class: w === s.window ? 'on' : '', onclick: () => a.setWindow(w) }, w))),
      h('span', { class: 'sp' }),
      s.res?.source === 'mock' && h('span', { class: 'src', title: `Backend not reachable (${s.res.error ?? ''}). Showing mock calls on real candles.` }, 'mock data'),
      s.loading && h('span', { class: 'src' }, '…'),
    ),
    h('div', { class: 'sum' },
      h('div', { class: 'k' }, `${s.coin} trader positioning · ${s.window.toUpperCase()}${sum?.view ? ` · ${sum.view} views` : ''}`),
      sum
        ? h('div', { class: `big${bear ? ' bear' : ''}` }, bear ? `${100 - pctLong}% short` : `${pctLong}% long`,
            h('small', {}, `${sum.long} long · ${sum.short} short`))
        : h('div', { class: 'big' }, '—'),
      h('div', { class: 'bar' }, h('i', { style: `width:${pctLong}%` })),
    ),
    (() => { const lim = coverageLimit(s.res?.coverage, s.window); return lim && h('div', { class: 'covnote' }, `${s.window} limited to ${lim} by source`); })(),
    h('div', { class: 'chips' }, FILTERS.map(([f, label]) =>
      h('button', { class: `chip${f === s.filter ? ' on' : ''}`, onclick: () => a.setFilter(f) }, label))),
  );

  const list = h('div', { class: 'list' });
  if (s.error && !d) list.append(h('div', { class: 'empty err' }, s.error));
  else if (!d) list.append(h('div', { class: 'empty' }, 'Loading calls…'));
  else if (!calls.length) list.append(h('div', { class: 'empty' }, `No ${s.filter === 'all' ? '' : s.filter + ' '}calls on $${s.coin} in the last ${s.window}.`));
  for (const c of calls) list.append(card(c, s, a));

  return h('div', {}, head, list, h('div', { class: 'by' }, 'Signals by ', h('b', {}, 'hypersocial')));
}

function card(c: Call, s: PanelState, a: PanelActions): HTMLElement {
  return h('div', { class: `card${s.highlight === c.id ? ' hi' : ''}`, 'data-id': c.id, onclick: () => a.focus(c) },
    h('div', { class: 'who' },
      avatarEl(c.author),
      h('div', {}, h('div', { class: 'nm' }, c.author.name), h('div', { class: 'hd' }, '@' + c.author.handle)),
      h('span', { class: 't' }, ago(c.ts))),
    h('q', {}, c.text),
    c.media?.[0] && h('img', { class: 'media', src: c.media[0], alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('div', { class: 'foot' },
      h('span', { class: `badge ${c.side}` }, c.side === 'view' ? 'VIEW' : c.side.toUpperCase()),
      c.side === 'view'
        ? h('span', { class: 'px', style: 'opacity:.7' }, 'No position')
        : h('span', { class: 'px' }, `${s.coin} at ${price(c.entryPrice)} `, h('span', { class: (c.pnlPct ?? 0) >= 0 ? 'long' : 'short' }, pct(c.pnlPct))),
      /^https:\/\//.test(c.url) && h('a', { class: 'btn', href: c.url, target: '_blank', rel: 'noopener noreferrer', onclick: (e: Event) => e.stopPropagation() }, 'Post ↗'),
    ),
  );
}
