// Runs in the page's MAIN world at document_start.
// HL builds its chart with `new TradingView.widget(...)` (Charting Library v28.5, same-origin iframe).
// We wrap the constructor to keep a reference, then stream pane geometry to the content script.
import type { ChartGeo } from './types';

type Any = any; // TradingView API is untyped here on purpose (we only use a few stable methods)

const MSG = '__hypersocial_geo';
let widget: Any = null;
let ready = false;

function wrap(W: Any): Any {
  if (typeof W !== 'function' || W.__hs) return W;
  const F: Any = function (this: Any, ...args: Any[]) {
    const w = new W(...args);
    widget = w;
    ready = false;
    try { w.onChartReady(() => { if (widget === w) ready = true; }); } catch { /* ignore */ }
    return w;
  };
  F.prototype = W.prototype;
  F.__hs = true;
  return F;
}

function hookTV() {
  let tv: Any = (window as Any).TradingView;
  const install = (v: Any) => {
    if (!v || typeof v !== 'object' || v.__hsHooked) return;
    let wd = wrap(v.widget);
    try {
      Object.defineProperty(v, 'widget', {
        configurable: true, enumerable: true,
        get: () => wd, set: (x) => { wd = wrap(x); },
      });
      Object.defineProperty(v, '__hsHooked', { value: true });
    } catch { /* frozen */ }
  };
  if (tv) install(tv);
  try {
    Object.defineProperty(window, 'TradingView', {
      configurable: true,
      get: () => tv,
      set: (v) => { tv = v; install(v); },
    });
  } catch { /* already non-configurable */ }
}

function resToSec(r: string): number {
  const m = /^(\d*)([SDWM]?)$/i.exec(String(r));
  if (!m) return 3600;
  const n = Number(m[1] || 1);
  switch (m[2].toUpperCase()) {
    case 'S': return n;
    case 'D': return n * 86400;
    case 'W': return n * 604800;
    case 'M': return n * 2592000;
    default: return n * 60;
  }
}

const tvFrame = () => document.querySelector<HTMLIFrameElement>('iframe[id^="tradingview_"]');

/**
 * Chart API. Preferred: the widget we caught in its constructor. Fallback: the Charting Library
 * iframe exposes `tradingViewApi` (what widget.activeChart() delegates to), so we can attach
 * after the fact (hook missed, extension loaded late, widget rebuilt).
 */
function activeChart(): { chart: Any; source: 'hook' | 'iframe' } | null {
  try { if (widget && ready) return { chart: widget.activeChart(), source: 'hook' }; } catch { /* fall through */ }
  try {
    const api = (tvFrame()?.contentWindow as Any)?.tradingViewApi;
    const chart = api?.activeChart?.();
    if (chart && chart.getPanes().length) return { chart, source: 'iframe' };
  } catch { /* not ready yet */ }
  return null;
}

function paneEl(): Element | null {
  const ifr = tvFrame();
  const d = ifr?.contentDocument;
  if (!d) return null;
  // first .chart-gui-wrapper inside the markup table = main price pane
  return d.querySelector('.chart-markup-table .chart-gui-wrapper');
}

let calib = { key: '', tRef: 0, xRef: 0 };

/** Find the center x of a bar near the left of the pane via coordinateToTime boundaries. */
function calibrate(ts: Any, w: number, resSec: number, bs: number, key: string) {
  if (calib.key === key) return calib;
  const probeX = Math.max(1, Math.min(w - 1, w * 0.3));
  const tA = ts.coordinateToTime(probeX);
  if (tA == null) return null;
  const tRef = tA + resSec; // next bar, whose left boundary is right of probeX
  let lo = probeX, hi = Math.min(w, probeX + bs * 2 + 2);
  const t = (x: number) => ts.coordinateToTime(x);
  if (!(t(hi) >= tRef)) { calib = { key, tRef: tA, xRef: probeX }; return calib; }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (t(mid) >= tRef) hi = mid; else lo = mid;
  }
  calib = { key, tRef, xRef: hi + bs / 2 };
  return calib;
}

let lastSig = '';

function tick() {
  try {
    const ac = activeChart();
    if (ac) {
      const { chart, source } = ac;
      const ts = chart.getTimeScale();
      const pane = chart.getPanes()[0];
      const ps = pane.getMainSourcePriceScale();
      const el = paneEl();
      const ifr = tvFrame();
      if (el && ifr) {
        const ir = ifr.getBoundingClientRect();
        const pr = el.getBoundingClientRect();
        const vr = chart.getVisibleRange();
        const prng = ps.getVisiblePriceRange();
        const resSec = resToSec(chart.resolution());
        const bs = ts.barSpacing();
        const ro = ts.rightOffset();
        const w = ts.width?.() ?? pr.width;
        const key = [vr.from, vr.to, bs, ro, w, resSec].join('|');
        const c = calibrate(ts, w, resSec, bs, key);
        if (c && prng) {
          const geo: ChartGeo = {
            ok: true,
            symbol: chart.symbol(),
            resSec,
            barSpacing: bs,
            tRef: c.tRef,
            xRef: c.xRef,
            pane: { x: ir.x + pr.x, y: ir.y + pr.y, w: pr.width, h: pr.height },
            pFrom: prng.from,
            pTo: prng.to,
            mode: ps.getMode(),
            vFrom: vr.from,
            vTo: vr.to,
            source,
          };
          const sig = JSON.stringify(geo);
          if (sig !== lastSig) {
            lastSig = sig;
            window.postMessage({ type: MSG, geo }, location.origin);
          }
        }
      }
    }
  } catch {
    // chart mid-rebuild; try next frame
  }
  requestAnimationFrame(tick);
}

hookTV();
requestAnimationFrame(tick);
