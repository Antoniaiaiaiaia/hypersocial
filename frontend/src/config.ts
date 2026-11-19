export const DEFAULT_BACKEND = 'http://localhost:8787';
export const HL_INFO = 'https://api.hyperliquid.xyz/info';
export const REFRESH_MS = 60_000;

/** Backend URL from the popup settings (chrome.storage.local `backendUrl`), default localhost. */
export async function getBackend(): Promise<string> {
  try {
    const v = await chrome.storage.local.get('backendUrl');
    return normalizeUrl(v.backendUrl as string) ?? DEFAULT_BACKEND;
  } catch { return DEFAULT_BACKEND; }
}

/** "https://x.y/z/" -> "https://x.y/z"; null if not http(s). */
export function normalizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch { return null; }
}

/** Hosts covered by the manifest's required host_permissions (no prompt needed). */
export const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);

const DUR: Record<string, number> = { m: 60e3, h: 3600e3, d: 864e5 };
export const spanMs = (w: string) => { const m = /^(\d+)([mhd])$/.exec(w); return m ? +m[1] * DUR[m[2]] : NaN; };

/**
 * X-Hypersocial-Coverage: the span the data source really covers (e.g. "7d" for the X API search).
 * Returns e.g. "7d" when that is shorter than the requested window, else null.
 */
export function coverageLimit(header: string | null | undefined, window: string): string | null {
  if (!header) return null;
  const durs = header.match(/\d+[mhd]\b/g);
  const covered = durs?.at(-1);
  if (!covered) return null;
  return spanMs(covered) < spanMs(window) ? covered : null;
}
