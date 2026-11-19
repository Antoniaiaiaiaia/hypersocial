// Local mock with the v0 shape, used only when the backend is not reachable.
// Entry prices come from real Hyperliquid candles so pins land on real candles.
import type { Call, SignalsResponse, SignalWindow, Side } from './types';
import { HL_INFO } from './config';

const AUTHORS = [
  ['Delta Fox', 'deltafox_mock', 41200], ['Ana Perps', 'anaperps_mock', 18900],
  ['Kite Capital', 'kitecap_mock', 96400], ['Moss', 'moss_trades_mock', 7300],
  ['Orbit', 'orbit_hl_mock', 52100], ['June Liq', 'juneliq_mock', 12800],
  ['Basis Bob', 'basisbob_mock', 3100], ['Nadia K', 'nadiak_mock', 27500],
] as const;

const LINES: Record<Side, string[]> = {
  long: ['Bought more $HYPE here. Buybacks do not sleep.', 'Long $HYPE, invalidation below the range low.', 'Adding $HYPE on this dip. Clean retest.', '$HYPE reclaim, I am long.'],
  short: ['Shorting $HYPE into resistance, tight stop.', 'Fading this $HYPE pump. Funding is hot.', 'Small $HYPE short, looks heavy here.'],
  view: ['$HYPE chart looks like it wants higher.', 'Watching $HYPE, no position yet.', 'Interesting $HYPE divergence on the 4h.'],
};

const WIN_MS: Record<SignalWindow, number> = { '15m': 15 * 60e3, '7d': 7 * 864e5, '30d': 30 * 864e5 };

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function avatar(name: string, i: number): string {
  const hues = [168, 200, 280, 20, 340, 120, 45, 230];
  const init = name.split(' ').map((s) => s[0]).join('').slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="hsl(${hues[i % hues.length]} 55% 42%)"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="24" font-weight="600" fill="#fff" text-anchor="middle">${init}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

interface Candle { t: number; c: number; h: number; l: number }

async function candles(coin: string, interval: string, startMs: number): Promise<Candle[]> {
  const r = await fetch(HL_INFO, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime: startMs, endTime: Date.now() } }),
  });
  const j = (await r.json()) as { t: number; c: string; h: string; l: string }[];
  return j.map((k) => ({ t: k.t, c: +k.c, h: +k.h, l: +k.l }));
}

export async function mockSignals(coin: string, window: SignalWindow): Promise<SignalsResponse> {
  const now = Date.now();
  const span = WIN_MS[window];
  const interval = window === '15m' ? '1m' : window === '7d' ? '15m' : '1h';
  const ks = await candles(coin, interval, now - span);
  const last = ks.at(-1)?.c ?? 0;
  const rand = rng(Math.floor(now / 3600e3) + span); // stable within the hour
  const n = window === '15m' ? 4 : window === '7d' ? 14 : 26;
  const calls: Call[] = [];
  for (let i = 0; i < n && ks.length; i++) {
    const k = ks[Math.floor(rand() * ks.length)];
    const r = rand();
    const side: Side = r < 0.6 ? 'long' : r < 0.85 ? 'short' : 'view';
    const ai = Math.floor(rand() * AUTHORS.length);
    const [name, handle, followers] = AUTHORS[ai];
    const entry = +(k.l + (k.h - k.l) * rand()).toFixed(3);
    const dir = side === 'short' ? -1 : 1;
    const lines = LINES[side];
    calls.push({
      id: `mock-${window}-${k.t}-${i}`,
      url: '#mock', // synthetic: no link to a real account
      ts: k.t + Math.floor(rand() * 60e3),
      author: { name, handle, avatar: avatar(name, ai), followers },
      text: lines[Math.floor(rand() * lines.length)],
      side,
      entryPrice: entry,
      pnlPct: side === 'view' ? null : +((dir * (last - entry)) / entry * 100).toFixed(2),
    });
  }
  calls.sort((a, b) => b.ts - a.ts);
  const long = calls.filter((c) => c.side === 'long').length;
  const short = calls.filter((c) => c.side === 'short').length;
  const view = calls.length - long - short;
  // byPrice: $5 buckets (API.md); contiguous fill below
  const buckets = new Map<number, { lo: number; hi: number; longs: number; shorts: number }>();
  for (const c of calls) {
    if (c.side === 'view' || c.entryPrice == null) continue;
    const lo = Math.floor(c.entryPrice / 5) * 5;
    const b = buckets.get(lo) ?? { lo, hi: lo + 5, longs: 0, shorts: 0 };
    if (c.side === 'long') b.longs++; else b.shorts++;
    buckets.set(lo, b);
  }
  return {
    coin, window, updatedAt: now,
    summary: { long, short, view, pctLong: long + short ? Math.round((long / (long + short)) * 100) : 0 },
    calls,
    byPrice: contiguous([...buckets.values()].sort((a, b) => a.lo - b.lo)),
  };
}

export async function midPrice(coin: string): Promise<number | null> {
  try {
    const r = await fetch(HL_INFO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) });
    const j = (await r.json()) as Record<string, string>;
    return j[coin] ? +j[coin] : null;
  } catch { return null; }
}

function contiguous(b: { lo: number; hi: number; longs: number; shorts: number }[]) {
  if (!b.length) return b;
  const out = [];
  for (let lo = b[0].lo; lo <= b[b.length - 1].lo; lo += 5) out.push(b.find((x) => x.lo === lo) ?? { lo, hi: lo + 5, longs: 0, shorts: 0 });
  return out;
}
