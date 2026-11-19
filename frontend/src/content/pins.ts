import type { Call, ChartGeo } from '../types';
import { h } from './dom';
import { avatarEl } from './avatar';
import { price, pct, sideLabel, ago } from './format';
import { C } from './styles';

export interface Mapper {
  x(tsMs: number): number;
  y(p: number): number | null;
}

export function mapper(g: ChartGeo): Mapper {
  const { pane, pFrom, pTo, mode, resSec, barSpacing, tRef, xRef } = g;
  return {
    x(ts) {
      const bar = Math.floor(ts / 1000 / resSec) * resSec;
      return pane.x + xRef + ((bar - tRef) / resSec) * barSpacing;
    },
    y(p) {
      if (mode === 1) {
        if (p <= 0 || pFrom <= 0) return null;
        return pane.y + ((Math.log(pTo) - Math.log(p)) / (Math.log(pTo) - Math.log(pFrom))) * pane.h;
      }
      if (mode !== 0) return null; // percent / indexed scales: not mapped in v0
      return pane.y + ((pTo - p) / (pTo - pFrom)) * pane.h;
    },
  };
}

interface Box { x0: number; y0: number; x1: number; y1: number }
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export interface PinOpts {
  onClick(c: Call): void;
  onHover(c: Call[] | null, at?: { x: number; y: number }): void;
  highlight: string | null;
}

interface Pt { c: Call; x: number; y: number }
interface Cluster { x: number; y: number; members: Pt[]; rep: Call }

/** Merge pins whose anchors sit within `r` px of each other (dense windows, zoomed-out charts). */
function cluster(pts: Pt[], r = 20): Cluster[] {
  const out: Cluster[] = [];
  for (const p of pts) {
    const k = out.find((q) => Math.abs(q.x - p.x) < r && Math.abs(q.y - p.y) < r);
    if (k) {
      k.members.push(p);
      if (p.c.author.followers > k.rep.author.followers) k.rep = p.c;
    } else out.push({ x: p.x, y: p.y, members: [p], rep: p.c });
  }
  return out;
}

/** Render pins into `layer`. Returns number of calls drawn. */
export function renderPins(layer: HTMLElement, g: ChartGeo, calls: Call[], o: PinOpts): number {
  layer.textContent = '';
  const { pane } = g;
  layer.style.clipPath = `inset(${pane.y}px ${innerWidth - pane.x - pane.w}px ${innerHeight - pane.y - pane.h}px ${pane.x}px)`;
  const m = mapper(g);
  const pts = calls
    .map((c) => ({ c, x: m.x(c.ts), y: c.entryPrice == null ? null : m.y(c.entryPrice) }))
    .filter((p): p is Pt => p.y != null && p.x >= pane.x - 4 && p.x <= pane.x + pane.w + 4 && p.y >= pane.y - 4 && p.y <= pane.y + pane.h + 4)
    .sort((a, b) => a.x - b.x || b.c.ts - a.c.ts);

  const placed: Box[] = [];
  const AV = 26;
  const colOf = (c: Call) => (c.side === 'long' ? C.long : c.side === 'short' ? C.short : C.view);
  const groups = cluster(pts);
  // dots first: every call keeps its exact anchor
  for (const p of pts) layer.append(h('div', { class: `pin-dot bg-${p.c.side}`, style: `left:${p.x}px;top:${p.y}px` }));

  for (const k of groups) {
    const rep = k.members.find((p) => p.c === k.rep)!;
    const n = k.members.length;
    const nl = k.members.filter((p) => p.c.side === 'long').length;
    const ns = k.members.filter((p) => p.c.side === 'short').length;
    const side = n === 1 ? rep.c.side : nl >= ns ? (nl ? 'long' : 'view') : 'short';
    const col = colOf({ side } as Call);
    const name = n > 1 ? `${rep.c.author.name} +${n - 1}` : rep.c.author.name;
    const nv = n - nl - ns;
    const labTxt = n > 1 ? [nl && `${nl} long`, ns && `${ns} short`, nv && `${nv} view`].filter(Boolean).join(' · ') : rep.c.side === 'view' ? 'View' : `${sideLabel(rep.c)} ${price(rep.c.entryPrice)}`;
    const labW = Math.max(name.length * 6.6, labTxt.length * 6.2) + 16;
    const wantLeft = k.x + AV / 2 + 6 + labW > pane.x + pane.w - 4;
    const offs = [-34, 34, -66, 66, -98, 98];
    let chosen: { cy: number; left: boolean; lab: boolean } | null = null;
    for (const lab of [true, false]) {
      for (const dy of offs) {
        const cy = k.y + dy;
        if (cy - AV / 2 < pane.y || cy + AV / 2 > pane.y + pane.h) continue;
        for (const left of wantLeft ? [true, false] : [false, true]) {
          const w = lab ? AV + 6 + labW : AV;
          const box: Box = left
            ? { x0: k.x + AV / 2 - w, y0: cy - 16, x1: k.x + AV / 2, y1: cy + 16 }
            : { x0: k.x - AV / 2, y0: cy - 16, x1: k.x - AV / 2 + w, y1: cy + 16 };
          if (box.x0 < pane.x || box.x1 > pane.x + pane.w) continue;
          if (!placed.some((b) => hit(b, box))) { placed.push(box); chosen = { cy, left, lab }; break; }
        }
        if (chosen) break;
      }
      if (chosen) break;
    }
    if (!chosen) continue; // no room: the dot alone marks the call

    const top = Math.min(k.y, chosen.cy), len = Math.abs(chosen.cy - k.y);
    layer.append(h('div', { class: 'stem', style: `left:${k.x}px;top:${top}px;height:${len}px;background:${col}88` }));
    const at = { x: k.x, y: chosen.cy };
    const pin = h('div', {
      class: `pin ${side}${chosen.left ? ' left' : ''}${chosen.lab ? '' : ' nolab'}${k.members.some((p) => p.c.id === o.highlight) ? ' hi' : ''}`,
      style: `left:${k.x}px;top:${chosen.cy}px`,
      onclick: () => o.onClick(rep.c),
      onmouseenter: () => o.onHover(k.members.map((p) => p.c), at),
      onmouseleave: () => o.onHover(null),
    },
      h('span', { style: 'position:relative;display:block' },
        avatarEl(rep.c.author),
        n > 1 && h('span', { class: 'cnt', style: `background:${col}` }, String(n))),
      h('div', { class: 'lab' }, h('b', {}, name), h('span', {}, labTxt)),
    );
    layer.append(pin);
  }
  return pts.length;
}

export function tipEl(cs: Call[], at: { x: number; y: number }): HTMLElement {
  const W = 280;
  let x = at.x + 20, y = at.y - 20;
  if (x + W > innerWidth - 8) x = at.x - 20 - W;
  const shown = cs.slice(0, 4);
  const estH = 30 + shown.length * 92;
  if (y + estH > innerHeight - 8) y = innerHeight - 8 - estH;
  return h('div', { class: 'tip', style: `left:${x}px;top:${Math.max(8, y)}px` },
    shown.map((c, i) => h('div', { style: i ? `border-top:1px solid ${C.line};margin-top:8px;padding-top:8px` : '' },
      h('div', { class: 'row' },
        h('b', { style: `color:${C.text};font-weight:500` }, c.author.name),
        h('span', { style: `color:${C.muted}` }, '@' + c.author.handle),
        h('span', { class: 'sp' }),
        h('span', { style: `color:${C.muted}` }, ago(c.ts))),
      h('div', { style: 'margin:6px 0' }, `“${c.text}”`),
      h('div', { class: 'row' },
        h('span', { class: `badge ${c.side}` }, c.side.toUpperCase()),
        c.side === 'view' ? h('span', { style: `color:${C.muted}` }, 'No position') :
          h('span', {}, `at ${price(c.entryPrice)} `, h('span', { class: (c.pnlPct ?? 0) >= 0 ? 'long' : 'short' }, pct(c.pnlPct)))))),
    cs.length > shown.length && h('div', { style: `color:${C.muted};margin-top:6px` }, `+${cs.length - shown.length} more`),
    h('div', { style: `color:${C.muted};margin-top:8px;font-size:11px` }, 'Click for details in the Signals tab'),
  );
}
