// Mirrors backend/API.md (the contract). Frontend copies these, never imports them.
export type Window = "15m" | "7d" | "30d";
export type Side = "long" | "short" | "view";

export interface Author {
  name: string;
  handle: string;
  avatar: string;
  followers: number;
}

export interface Call {
  id: string;
  url: string;
  ts: number; // ms UTC
  author: Author;
  text: string;
  side: Side;
  entryPrice: number | null; // coin price at ts (Hyperliquid candle open); null if unknown
  pnlPct: number | null; // long: (mid-entry)/entry*100, short: inverted, view: null
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
  window: Window;
  updatedAt: number;
  /** Lookback actually covered: equals `window` unless the source can't reach that far (X API recent search = "7d"). */
  coverage: string;
  summary: { long: number; short: number; view: number; pctLong: number };
  calls: Call[];
  byPrice: PriceBucket[];
}
