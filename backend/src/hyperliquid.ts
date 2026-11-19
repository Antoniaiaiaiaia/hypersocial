const INFO = "https://api.hyperliquid.xyz/info";

async function info<T>(body: unknown): Promise<T> {
  const res = await fetch(INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`hyperliquid ${res.status}`);
  return (await res.json()) as T;
}

export async function getMid(coin: string): Promise<number> {
  const mids = await info<Record<string, string>>({ type: "allMids" });
  const m = Number(mids[coin]);
  if (!Number.isFinite(m)) throw new Error(`no mid for ${coin}`);
  return m;
}

export interface Candle { t: number; T: number; o: number; c: number }

export async function getCandles(coin: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  const raw = await info<{ t: number; T: number; o: string; c: string }[]>({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
  return raw.map((k) => ({ t: k.t, T: k.T, o: Number(k.o), c: Number(k.c) })).sort((a, b) => a.t - b.t);
}

/** Price at ts: open of the candle containing ts (binary search); nearest edge otherwise. */
export function priceAt(candles: Candle[], ts: number): number | null {
  if (candles.length === 0) return null;
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (candles[mid].t <= ts) lo = mid; else hi = mid - 1;
  }
  const k = candles[lo];
  if (ts < k.t) return k.o;
  if (ts > k.T) return k.c;
  return k.o;
}
