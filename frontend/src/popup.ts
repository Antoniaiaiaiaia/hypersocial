// Toolbar popup: on/off switch + refresh. Talks to tabs only through chrome.storage (no tabs permission).
import { KEY, type FetchMeta, type SignalWindow, type TestResult } from './types';
import { DEFAULT_BACKEND, coverageLimit, isLocal, normalizeUrl } from './config';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const on = $<HTMLInputElement>('on');
const btn = $<HTMLButtonElement>('refresh');
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;
const urlIn = $<HTMLInputElement>('url');
const res = $('res');
const say = (text: string, cls: '' | 'ok' | 'bad' = '') => { res.textContent = text; res.className = `res ${cls}`; };

const SRC: Record<FetchMeta['source'], string> = { live: 'Live', fixture: 'Fixture', mock: 'Mock', error: 'Error' };

function ago(ms?: number) {
  if (!ms) return '—';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

let meta: FetchMeta | undefined;
let busy = false;

function render() {
  document.body.classList.toggle('off', !on.checked);
  const src = $('src');
  const msg = $('msg');
  if (!meta) {
    src.textContent = '—'; src.className = 'badge';
    msg.textContent = 'No data yet. Open a Hyperliquid trade page or press Refresh.'; msg.className = 'msg';
  } else {
    src.textContent = SRC[meta.source]; src.className = `badge ${meta.source}`;
    const s = meta.summary;
    $('calls').textContent = meta.calls == null ? '—' : `${meta.calls}${s ? ` · ${s.long} long · ${s.short} short · ${s.view} view` : ''}`;
    $('cw').textContent = `${meta.coin} · ${meta.window}`;
    $('upd').textContent = ago(meta.updatedAt);
    $('upd').title = meta.updatedAt ? new Date(meta.updatedAt).toString() : '';
    $('fetched').textContent = ago(meta.at);
    if (meta.source === 'mock') { msg.textContent = 'Backend unreachable. Showing MOCK calls on real candles.'; msg.className = 'msg bad'; }
    else if (meta.source === 'error') { msg.textContent = `Backend error: ${meta.error ?? 'unknown'}`; msg.className = 'msg bad'; }
    else if (meta.backend && meta.backend !== savedUrl) { msg.textContent = 'Fetched from a previous backend. Press Refresh.'; msg.className = 'msg'; }
    else if (meta.updatedAt && Date.now() - meta.updatedAt > 90_000) {
      msg.textContent = 'The backend rebuilds 15m every minute and 7d / 30d every 10 minutes, so data can be older than the fetch.'; msg.className = 'msg';
    } else { msg.textContent = ''; msg.className = 'msg'; }
  }
  const lim = meta ? coverageLimit(meta.coverage, meta.window) : null;
  const cov = $('cov');
  cov.hidden = !lim;
  cov.textContent = lim ? `${meta!.window} limited to ${lim} by source` : '';
  btn.disabled = busy;
  btn.textContent = busy ? 'Refreshing…' : 'Refresh data';
}

async function refresh() {
  if (busy) return;
  busy = true; render();
  const v = await chrome.storage.local.get([KEY.lastCoin, KEY.window]);
  const coin = (v[KEY.lastCoin] as string) || meta?.coin || 'HYPE';
  const window = ((v[KEY.window] as SignalWindow) || meta?.window || '7d');
  try {
    // background re-fetches (revalidating the HTTP cache) and writes lastFetch; open HL tabs follow via refreshReq
    await chrome.runtime.sendMessage({ type: 'signals', coin, window, fresh: true });
  } catch { /* lastFetch carries the error */ }
  await chrome.storage.local.set({ [KEY.refreshReq]: Date.now() });
  busy = false; render();
}

let savedUrl = DEFAULT_BACKEND;

function describe(r: TestResult): [string, '' | 'ok' | 'bad'] {
  if (r.ok) {
    const lim = coverageLimit(r.coverage, '30d');
    return [`Connected in ${r.ms} ms · ${r.source ?? 'unknown'} source · ${r.calls} calls in 30d${lim ? ` · 30d limited to ${lim} by source` : ''}`, 'ok'];
  }
  switch (r.kind) {
    case 'permission': return ['No permission for this host yet. Press Save to grant it.', 'bad'];
    case 'unreachable': return [`${r.error}. Is the backend running at ${r.url}?`, 'bad'];
    case 'http': return [`Backend replied ${r.error}.`, 'bad'];
    default: return [r.error ?? 'Failed', 'bad'];
  }
}

async function test(url: string) {
  say('Testing…');
  const r = (await chrome.runtime.sendMessage({ type: 'test', url })) as TestResult;
  say(...describe(r));
}

// Save: chrome.permissions.request must run inside the click, before any await.
$('save').addEventListener('click', () => {
  const url = normalizeUrl(urlIn.value || DEFAULT_BACKEND);
  if (!url) { say('Enter an http(s) URL, e.g. http://localhost:8787', 'bad'); return; }
  const granted = isLocal(url) ? Promise.resolve(true) : chrome.permissions.request({ origins: [new URL(url).origin + '/*'] });
  granted.then(async (ok) => {
    if (!ok) { say('Permission denied: the extension cannot reach this host.', 'bad'); return; }
    await chrome.storage.local.set({ [KEY.backendUrl]: url });
    savedUrl = url; urlIn.value = url;
    await test(url);
    await chrome.storage.local.set({ [KEY.refreshReq]: Date.now() }); // open HL tabs refetch from the new backend
  }, (e) => say(String(e?.message ?? e), 'bad'));
});
$('test').addEventListener('click', () => {
  const url = normalizeUrl(urlIn.value || DEFAULT_BACKEND);
  if (!url) { say('Enter an http(s) URL, e.g. http://localhost:8787', 'bad'); return; }
  test(url);
});

on.addEventListener('change', () => { chrome.storage.local.set({ [KEY.enabled]: on.checked }); render(); });
btn.addEventListener('click', refresh);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && KEY.lastFetch in ch) { meta = ch[KEY.lastFetch].newValue as FetchMeta; render(); }
});

chrome.storage.local.get([KEY.enabled, KEY.lastFetch, KEY.backendUrl]).then((v) => {
  on.checked = v[KEY.enabled] !== false;
  savedUrl = normalizeUrl(v[KEY.backendUrl] as string) ?? DEFAULT_BACKEND;
  urlIn.value = savedUrl;
  meta = v[KEY.lastFetch] as FetchMeta | undefined;
  render();
});
setInterval(render, 1000);
