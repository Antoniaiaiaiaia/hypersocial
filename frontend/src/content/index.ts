// Isolated-world content script: owns all hypersocial UI on app.hyperliquid.xyz/trade.
import { KEY, type Call, type ChartGeo, type SignalsResult, type SignalWindow } from '../types';
import { REFRESH_MS } from '../config';
import { h, findTabBar, findLeaf, coinFromPage, coinFromSymbol } from './dom';
import { CSS, C } from './styles';
import { renderPins, tipEl } from './pins';
import { renderPanel, applyFilter, type Filter, type PanelState } from './panel';
import { renderAnalytics } from './analytics';

const GEO_MSG = '__hypersocial_geo';
const bootAt = Date.now();

// ---------- shadow root ----------
const host = h('div', { 'data-hypersocial': '', style: 'position:fixed;inset:0;pointer-events:none;z-index:40' });
const shadow = host.attachShadow({ mode: 'open' });
shadow.append(h('style', {}, CSS));
const root = h('div', { class: 'root' });
const pinsLayer = h('div', { class: 'pins' });
const tipLayer = h('div', {});
const panelEl = h('div', { class: 'panel', style: 'display:none' });
const anaEl = h('div', { class: 'ana', style: 'display:none' });
root.append(pinsLayer, panelEl, anaEl, tipLayer);
shadow.append(root);
(document.body ?? document.documentElement).append(host);

// ---------- state ----------
const st: PanelState & { geo: ChartGeo | null; geoAt: number; mid: number | null; panelOpen: boolean; anaOpen: boolean; pinCount: number } = {
  coin: coinFromPage() ?? 'HYPE', pinCount: 0, window: '7d', filter: 'all', res: null, loading: false, error: null, highlight: null,
  geo: null, geoAt: 0, mid: null, panelOpen: false, anaOpen: false,
};

/** Popup on/off switch (chrome.storage.local `enabled`, default on). */
let enabled = false; // set from storage at boot, so tabs never flash when the switch is off

chrome.storage?.local.get(['window', 'filter', KEY.enabled]).then((v) => {
  if (v.window) st.window = v.window as SignalWindow;
  if (v.filter) st.filter = v.filter as Filter;
  setEnabled(v[KEY.enabled] !== false);
});

chrome.storage?.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (KEY.enabled in ch) setEnabled(ch[KEY.enabled].newValue !== false);
  if (KEY.refreshReq in ch && enabled) load(true);
});

// ---------- data ----------
let reqSeq = 0;
async function load(fresh = false) {
  if (!enabled) return;
  const seq = ++reqSeq;
  st.loading = true; renderAll();
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'signals', coin: st.coin, window: st.window, fresh })) as SignalsResult & { error?: string };
    if (seq !== reqSeq) return;
    if (!r?.data) throw new Error(r?.error || 'no data'); // e.g. backend 502 upstream failed
    st.res = r; st.error = null;
  } catch (e) {
    if (seq !== reqSeq) return;
    st.error = `Could not load calls: ${(e as Error).message}`;
  } finally {
    if (seq === reqSeq) { st.loading = false; renderAll(); }
  }
}
async function loadMid() {
  if (!enabled) return;
  try { st.mid = (await chrome.runtime.sendMessage({ type: 'mid', coin: st.coin })) as number | null; if (st.anaOpen) renderAna(); } catch { /* ignore */ }
}
setInterval(() => load(), REFRESH_MS);
setInterval(loadMid, 15_000);
loadMid();

// coin on screen: tab title / path, else the chart's own symbol (HL's bare /trade shows the last-used coin)
const currentCoin = () => coinFromPage() ?? (st.geo ? coinFromSymbol(st.geo.symbol) : null) ?? st.coin;
setInterval(() => {
  const c = currentCoin();
  if (c !== st.coin) { st.coin = c; st.res = null; st.highlight = null; load(); loadMid(); }
  if (enabled && c !== lastCoinSaved) { lastCoinSaved = c; chrome.storage?.local.set({ [KEY.lastCoin]: c }); }
}, 1000);
let lastCoinSaved = '';

// ---------- chart geometry from MAIN world ----------
addEventListener('message', (e) => {
  if (e.source !== window || e.data?.type !== GEO_MSG) return;
  st.geo = e.data.geo as ChartGeo; st.geoAt = Date.now();
  renderPinsNow();
});

const chartMatchesCoin = (g: ChartGeo) => coinFromSymbol(g.symbol) === st.coin;

/** One-line pin status for the Signals panel, so a silent failure is visible. */
function pinStatus(): { text: string; bad: boolean } {
  const g = st.geo;
  if (!g) return Date.now() - bootAt > 8000
    ? { text: 'Chart pins off: chart not found on this page', bad: true }
    : { text: 'Chart pins: attaching…', bad: false };
  if (!chartMatchesCoin(g)) return { text: `Chart pins off: chart shows ${coinFromSymbol(g.symbol)}, signals are for ${st.coin}`, bad: true };
  if (g.mode !== 0 && g.mode !== 1) return { text: 'Chart pins off: set the price scale to normal or log', bad: true };
  if (!st.res) return { text: 'Chart pins: waiting for calls…', bad: false };
  return st.pinCount
    ? { text: `Chart pins on: ${st.pinCount} in view`, bad: false }
    : { text: 'Chart pins on: none in view (zoom out or switch window)', bad: false };
}
let lastStatus = '';
function updateStatus() {
  const el = panelEl.querySelector<HTMLElement>('.pstat');
  const s = pinStatus();
  const key = s.text + s.bad;
  if (!el || (key === lastStatus && el.textContent)) return;
  lastStatus = key;
  el.textContent = s.text;
  el.style.color = s.bad ? C.short : C.muted;
}
setInterval(updateStatus, 1000);

function renderPinsNow() {
  if (!enabled) { pinsLayer.textContent = ''; tipLayer.textContent = ''; return; }
  const g = st.geo;
  if (!g || !st.res || !chartMatchesCoin(g)) { pinsLayer.textContent = ''; st.pinCount = 0; updateStatus(); return; }
  // chart shows trade calls; views only when the Views filter is on (78 of 117 fixture calls are views)
  const onChart = st.filter === 'views' ? applyFilter(st.res.data.calls, 'views') : applyFilter(st.res.data.calls, st.filter).filter((c) => c.side !== 'view');
  st.pinCount = renderPins(pinsLayer, g, onChart, {
    highlight: st.highlight,
    onClick: (c) => { openPanel(); focus(c, true); },
    onHover: (cs, at) => { tipLayer.textContent = ''; if (cs && at) tipLayer.append(tipEl(cs, at)); },
  });
  updateStatus();
}

// ---------- panel ----------
function focus(c: Call, scroll = false) {
  st.highlight = st.highlight === c.id && !scroll ? null : c.id;
  renderAll();
  if (scroll) panelEl.querySelector(`[data-id="${CSS_escape(c.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
const CSS_escape = (s: string) => (globalThis.CSS?.escape ? globalThis.CSS.escape(s) : s.replace(/"/g, '\\"'));

function renderPanelNow() {
  if (!st.panelOpen) return;
  const scroll = panelEl.querySelector('.list')?.scrollTop ?? 0;
  panelEl.textContent = '';
  const body = renderPanel(st, {
    setWindow: (w) => { st.window = w; st.res = null; chrome.storage?.local.set({ window: w }); load(); },
    setFilter: (f) => { st.filter = f; chrome.storage?.local.set({ filter: f }); renderAll(); },
    focus: (c) => focus(c),
  });
  body.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:6px';
  body.firstElementChild?.append(h('div', { class: 'pstat' }));
  panelEl.append(body);
  lastStatus = '';
  updateStatus();
  const l = panelEl.querySelector('.list'); if (l) l.scrollTop = scroll;
}
function renderAna() {
  if (!st.anaOpen) return;
  anaEl.textContent = '';
  anaEl.append(renderAnalytics(st.res, st.coin, st.window, st.mid));
}
function renderAll() { renderPinsNow(); renderPanelNow(); renderAna(); }

// ---------- tab injection into HL's own tab bars ----------
interface Tab { el: HTMLElement; bar: HTMLElement; region: HTMLElement; barStyle: { gtc: string; width: string }; dimmed?: { el: Element; cls: string } }
let sigTab: Tab | null = null, anaTab: Tab | null = null;

function makeTab(label: string, a: string, b: string, pickRegion: (bar: HTMLElement) => HTMLElement | null, onOpen: () => void): Tab | null {
  const tb = findTabBar(a, b);
  if (!tb) return null;
  const proto = [...tb.bar.children].find((c) => c.textContent?.trim() === b) as HTMLElement | undefined;
  if (!proto) return null;
  const el = proto.cloneNode(true) as HTMLElement;
  el.setAttribute('data-hypersocial', label);
  const leaf = findLeaf(b, el) ?? el;
  leaf.textContent = '';
  leaf.append(h('span', { style: `display:inline-block;width:6px;height:6px;border-radius:50%;background:${C.long};margin-right:6px;vertical-align:1px` }), label);
  el.style.whiteSpace = 'nowrap';
  el.style.paddingLeft = el.style.paddingRight = '10px';
  el.addEventListener('click', (e) => { e.stopPropagation(); onOpen(); });
  // insert after the last real tab (keep trailing icon menus at the end)
  const tabs = [...tb.bar.children].filter((c) => c.textContent?.trim());
  const barStyle = { gtc: tb.bar.style.gridTemplateColumns, width: tb.bar.style.width };
  tabs[tabs.length - 1].after(el);
  fitBar(tb.bar);
  const region = pickRegion(tb.bar);
  if (!region) { el.remove(); Object.assign(tb.bar.style, { gridTemplateColumns: barStyle.gtc, width: barStyle.width }); return null; }
  return { el, bar: tb.bar, region, barStyle };
}

/** HL tab bars are CSS grids with one fixed column per tab: add a column for ours. */
function fitBar(bar: HTMLElement) {
  const cs = getComputedStyle(bar);
  if (cs.display !== 'grid') return;
  const n = [...bar.children].filter((c) => c.textContent?.trim()).length; // skip HL's absolute underline element
  const cols = cs.gridTemplateColumns.split(' ').filter(Boolean);
  const equal = cols.every((c) => c === cols[0]);
  bar.style.gridTemplateColumns = equal ? `repeat(${n}, minmax(0, 1fr))` : [...cols.slice(0, n - 1), 'max-content'].join(' ');
  if (equal) bar.style.width = '100%';
}

function setActive(t: Tab, on: boolean) {
  t.el.style.color = on ? C.text : '';
  t.el.style.boxShadow = on ? `inset 0 -1px 0 ${C.text}` : '';
  // dim HL's active tab while ours is open by borrowing an inactive sibling's class
  if (on && !t.dimmed) {
    const sibs = [...t.bar.children].filter((c) => c !== t.el && !c.hasAttribute('data-hypersocial') && c.textContent?.trim());
    const counts = new Map<string, number>();
    sibs.forEach((c) => counts.set(c.className, (counts.get(c.className) ?? 0) + 1));
    const common = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const active = sibs.find((c) => c.className !== common);
    if (active && common !== undefined) { t.dimmed = { el: active, cls: active.className }; active.className = common; }
  } else if (!on && t.dimmed) {
    t.dimmed.el.className = t.dimmed.cls; t.dimmed = undefined;
  }
  for (const c of t.bar.children) if (!c.textContent?.trim()) (c as HTMLElement).style.visibility = on ? 'hidden' : '';
}

function regionBelowTabs(levels: number) {
  return (bar: HTMLElement) => {
    const pc = bar.closest('.panel-content') as HTMLElement | null;
    if (pc) return pc;
    let n: HTMLElement | null = bar;
    for (let i = 0; i < levels && n?.parentElement; i++) n = n.parentElement;
    return n;
  };
}

function openPanel() { st.panelOpen = true; if (sigTab) setActive(sigTab, true); panelEl.style.display = ''; renderPanelNow(); place(); }
function closePanel() { st.panelOpen = false; if (sigTab) setActive(sigTab, false); panelEl.style.display = 'none'; }
function openAna() { st.anaOpen = true; if (anaTab) setActive(anaTab, true); anaEl.style.display = ''; renderAna(); place(); }
function closeAna() { st.anaOpen = false; if (anaTab) setActive(anaTab, false); anaEl.style.display = 'none'; }

/** Take our tab out of HL's bar and put HL's styles back exactly as they were. */
function removeTab(t: Tab | null) {
  if (!t) return;
  setActive(t, false);
  t.el.remove();
  Object.assign(t.bar.style, { gridTemplateColumns: t.barStyle.gtc, width: t.barStyle.width });
}

function setEnabled(on: boolean) {
  const was = enabled;
  enabled = on;
  if (!on) {
    closePanel(); closeAna();
    removeTab(sigTab); removeTab(anaTab); sigTab = anaTab = null;
    pinsLayer.textContent = ''; tipLayer.textContent = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  ensureTabs();
  if (!was || !st.res) load(); else renderAll();
}

function ensureTabs() {
  if (!enabled) return;
  if (!sigTab || !sigTab.el.isConnected) {
    sigTab = makeTab('Signals', 'Order Book', 'Trades', regionBelowTabs(3), () => openPanel());
    if (sigTab) {
      sigTab.bar.addEventListener('click', (e) => { if (!(e.target as Element).closest('[data-hypersocial]')) closePanel(); }, true);
      if (st.panelOpen) setActive(sigTab, true);
    }
  }
  if (!anaTab || !anaTab.el.isConnected) {
    anaTab = makeTab('Trader Analytics', 'Balances', 'Positions', bottomRegion, () => openAna());
    if (anaTab) {
      anaTab.bar.addEventListener('click', (e) => { if (!(e.target as Element).closest('[data-hypersocial]')) closeAna(); }, true);
      if (st.anaOpen) setActive(anaTab, true);
    }
  }
}
function bottomRegion(bar: HTMLElement): HTMLElement | null {
  // climb until the element is clearly taller than the tab row (the bottom panel body)
  let n: HTMLElement | null = bar;
  const bh = bar.getBoundingClientRect().height;
  while (n && n.parentElement && n.getBoundingClientRect().height < bh + 80) n = n.parentElement;
  return n;
}

// ---------- layout loop for overlays ----------
function place() {
  for (const [open, t, el] of [[st.panelOpen, sigTab, panelEl], [st.anaOpen, anaTab, anaEl]] as const) {
    if (!open || !t) continue;
    const r = t.region.getBoundingClientRect();
    const barR = t.bar.getBoundingClientRect();
    const top = barR.bottom;
    const bottom = Math.min(r.bottom, innerHeight);
    Object.assign(el.style, { left: `${r.left}px`, top: `${top}px`, width: `${r.width}px`, height: `${Math.max(0, bottom - top)}px` });
  }
}
function loop() { place(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);

ensureTabs();
setInterval(ensureTabs, 1000);
// geo goes stale if the widget was torn down
setInterval(() => { if (st.geo && Date.now() - st.geoAt > 4000 && !document.querySelector('iframe[id^="tradingview_"]')) { st.geo = null; pinsLayer.textContent = ''; } }, 2000);
