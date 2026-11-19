// Service worker: the only place that talks to the hypersocial backend (no keys in the extension).
import { KEY, type FetchMeta, type SignalsResponse, type SignalsResult, type SignalWindow, type TestResult } from './types';
import { getBackend, isLocal, normalizeUrl } from './config';
import { mockSignals, midPrice } from './mock';

async function fromBackend(base: string, coin: string, window: SignalWindow, fresh: boolean): Promise<{ data: SignalsResponse; src?: 'live' | 'fixture'; coverage?: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45_000); // cold 30d builds can take a while
  try {
    // fresh: revalidate instead of using the HTTP cache (backend sends max-age); the refreshed copy
    // then replaces the cached one, so the tabs' normal fetches see it too
    const r = await fetch(`${base}/v1/signals?coin=${encodeURIComponent(coin)}&window=${window}`, { signal: ctl.signal, cache: fresh ? 'no-cache' : 'default' });
    if (!r.ok) throw new Error(`backend ${r.status}`);
    const src = r.headers.get('x-hypersocial-source');
    return { data: (await r.json()) as SignalsResponse, src: src === 'live' || src === 'fixture' ? src : undefined, coverage: r.headers.get('x-hypersocial-coverage') ?? undefined };
  } finally { clearTimeout(t); }
}

async function getSignals(coin: string, window: SignalWindow, fresh = false): Promise<SignalsResult> {
  let res: SignalsResult;
  const base = await getBackend();
  try {
    const { data, src, coverage } = await fromBackend(base, coin, window, fresh);
    res = { data, source: 'backend', backendSource: src, coverage };
  } catch (e) {
    // mock only when the backend is not reachable at all (fetch throws TypeError); show real errors
    if (!(e instanceof TypeError)) {
      await saveMeta({ at: Date.now(), coin, window, backend: base, source: 'error', error: String((e as Error).message ?? e) });
      throw e;
    }
    res = { data: await mockSignals(coin, window), source: 'mock', error: String(e.message) };
  }
  await saveMeta({
    at: Date.now(), coin, window, backend: base, coverage: res.coverage,
    source: res.source === 'mock' ? 'mock' : res.backendSource ?? 'live',
    updatedAt: res.data.updatedAt, calls: res.data.calls.length, summary: res.data.summary, error: res.error,
  });
  return res;
}

const saveMeta = (m: FetchMeta) => chrome.storage.local.set({ [KEY.lastFetch]: m }).catch(() => {});

/** Popup "Test connection": /health + one /v1/signals call, classified for a readable message. */
async function testBackend(raw: string): Promise<TestResult> {
  const url = normalizeUrl(raw);
  if (!url) return { ok: false, url: raw, kind: 'shape', error: 'Not an http(s) URL' };
  if (!isLocal(url) && !(await chrome.permissions.contains({ origins: [new URL(url).origin + '/*'] })))
    return { ok: false, url, kind: 'permission', error: 'Permission for this host was not granted' };
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45_000);
  try {
    const r = await fetch(`${url}/v1/signals?coin=HYPE&window=30d`, { cache: 'no-cache', signal: ctl.signal });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ok: false, url, ms, kind: 'http', error: `HTTP ${r.status}` };
    const j = (await r.json().catch(() => null)) as SignalsResponse | null;
    if (!j || !Array.isArray(j.calls) || !j.summary) return { ok: false, url, ms, kind: 'shape', error: 'Reply is not a /v1/signals response' };
    return { ok: true, url, ms, source: r.headers.get('x-hypersocial-source') ?? undefined, coverage: r.headers.get('x-hypersocial-coverage') ?? undefined, calls: j.calls.length };
  } catch (e) {
    return { ok: false, url, kind: 'unreachable', error: (e as Error).name === 'AbortError' ? 'Timed out after 45 s' : 'Could not reach the backend' };
  } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'test') {
    testBackend(msg.url).then(reply);
    return true;
  }
  if (msg?.type === 'signals') {
    getSignals(msg.coin, msg.window, !!msg.fresh).then(reply, (e) => reply({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'mid') {
    midPrice(msg.coin).then(reply);
    return true;
  }
  return false;
});
