// Copied from backend/API.md (v0, main 75d5c73). Source of truth is that file.
// Do not import from backend/.

export type Side = 'long' | 'short' | 'view';
export type SignalWindow = '15m' | '7d' | '30d';

export interface Author {
  name: string;
  handle: string;
  avatar: string;
  followers: number;
}

export interface Call {
  id: string;
  url: string;
  /** ms UTC */
  ts: number;
  author: Author;
  text: string;
  side: Side;
  /** HL price at ts; null if unknown */
  entryPrice: number | null;
  /** null for side=view */
  pnlPct: number | null;
  media?: string[];
}

export interface PriceBucket {
  lo: number;
  hi: number;
  longs: number;
  shorts: number;
}

export interface SignalsResponse {
  coin: string;
  window: SignalWindow;
  /** ms UTC */
  updatedAt: number;
  summary: { long: number; short: number; view: number; pctLong: number };
  calls: Call[];
  byPrice: PriceBucket[];
}

/** Extension-internal: background -> content. */
export interface SignalsResult {
  data: SignalsResponse;
  source: 'backend' | 'mock';
  /** backend X-Hypersocial-Source header */
  backendSource?: 'live' | 'fixture';
  /** raw X-Hypersocial-Coverage header, e.g. "7d" */
  coverage?: string;
  error?: string;
}

/** Extension-internal: last fetch, kept in chrome.storage.local `lastFetch` for the popup. */
export interface FetchMeta {
  at: number;
  coin: string;
  window: SignalWindow;
  /** live / fixture = backend; mock = backend unreachable; error = backend replied with an error */
  source: 'live' | 'fixture' | 'mock' | 'error';
  updatedAt?: number;
  calls?: number;
  summary?: SignalsResponse['summary'];
  coverage?: string;
  backend?: string;
  error?: string;
}

/** Extension-internal: popup "Test connection" result. */
export interface TestResult {
  ok: boolean;
  url: string;
  ms?: number;
  source?: string;
  coverage?: string;
  calls?: number;
  /** unreachable | permission | http | shape */
  kind?: 'unreachable' | 'permission' | 'http' | 'shape';
  error?: string;
}

/** chrome.storage.local keys shared by popup / content / background */
export const KEY = { enabled: 'enabled', lastFetch: 'lastFetch', refreshReq: 'refreshReq', lastCoin: 'lastCoin', window: 'window', backendUrl: 'backendUrl' } as const;

/** Extension-internal: MAIN-world chart geometry, posted to the content script. */
export interface ChartGeo {
  ok: true;
  symbol: string;
  /** seconds per bar */
  resSec: number;
  /** px per bar */
  barSpacing: number;
  /** a reference bar time (sec) and its center x, relative to pane left */
  tRef: number;
  xRef: number;
  /** main pane rect in top-document viewport coords */
  pane: { x: number; y: number; w: number; h: number };
  pFrom: number;
  pTo: number;
  /** 0 normal, 1 log, 2 percent, 3 indexed-to-100 */
  mode: number;
  /** visible time range, sec */
  vFrom: number;
  vTo: number;
  /** how we got the chart API */
  source: 'hook' | 'iframe';
}
