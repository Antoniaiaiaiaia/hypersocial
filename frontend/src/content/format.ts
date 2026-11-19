import type { Call } from '../types';

export const price = (p: number | null) =>
  p == null ? '—' : '$' + (p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 }) : p >= 10 ? p.toFixed(1) : p.toPrecision(3));

export const pct = (p: number | null, digits?: number) => {
  if (p == null) return '—';
  const d = digits ?? (Math.abs(p) < 10 ? 1 : 0);
  const v = Math.abs(p).toFixed(d);
  return `${+v === 0 ? '' : p > 0 ? '+' : '−'}${v}%`;
};

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const sideLabel = (c: Call) => (c.side === 'long' ? 'Long' : c.side === 'short' ? 'Short' : 'View');

export function initials(name: string) {
  return name.split(/\s+/).map((s) => s[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function compact(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
}
