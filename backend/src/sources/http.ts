import { config } from "../config.js";

/** Credit-relevant counters, exposed on /health. */
export const usage = { calls: 0, tweets: 0, rateLimited: 0, since: Date.now() };

const recentCalls: number[] = [];

export class BudgetError extends Error {}

/** Hard cap on upstream calls per rolling hour (MAX_CALLS_PER_HOUR), across all sources. */
function takeBudget(): void {
  const now = Date.now();
  while (recentCalls.length && now - recentCalls[0] > 3600_000) recentCalls.shift();
  if (recentCalls.length >= config.maxCallsPerHour) {
    throw new BudgetError(`call budget reached (${config.maxCallsPerHour}/h, MAX_CALLS_PER_HOUR)`);
  }
  recentCalls.push(now);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON with retry on 429 / 5xx. Waits for the provider's reset hint (Retry-After or
 * x-rate-limit-reset), capped at RATE_LIMIT_MAX_WAIT_MS, up to RATE_LIMIT_RETRIES times.
 * On final failure it throws; the response cache then serves the last good copy.
 */
export async function getJson<T>(url: URL, headers: Record<string, string>, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    takeBudget();
    usage.calls++;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return (await res.json()) as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (res.status === 429) usage.rateLimited++;
    if (!retryable || attempt >= config.rateLimit.retries) {
      throw new Error(`${label} HTTP ${res.status}`);
    }
    const wait = Math.min(waitHintMs(res) ?? 1000 * 2 ** attempt, config.rateLimit.maxWaitMs);
    console.warn(`[${label}] HTTP ${res.status}, retry ${attempt + 1}/${config.rateLimit.retries} in ${wait}ms`);
    await sleep(wait);
  }
}

function waitHintMs(res: Response): number | null {
  const ra = res.headers.get("retry-after");
  if (ra && Number.isFinite(Number(ra))) return Number(ra) * 1000;
  const reset = res.headers.get("x-rate-limit-reset"); // unix seconds (X API)
  if (reset && Number.isFinite(Number(reset))) return Math.max(0, Number(reset) * 1000 - Date.now());
  return null;
}

export function logFetch(label: string, calls: number, tweets: number): void {
  usage.tweets += tweets;
  console.log(`[${label}] ${calls} call(s), ${tweets} tweets | since start: ${usage.calls} calls, ${usage.tweets} tweets`);
}
