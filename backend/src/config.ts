import type { Window } from "./types.js";

// All knobs are env vars; see .env.example for the full list with comments.
const num = (k: string, d: number) => {
  const v = process.env[k];
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const str = (k: string, d: string) => (process.env[k] ? (process.env[k] as string) : d);

export const config = {
  port: num("PORT", 8787),
  fixtureMode: process.env.FIXTURE === "1",
  supportedCoins: str("COINS", "HYPE").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),

  // Which tweets count as calls: any author with >= MIN_FOLLOWERS, minus obvious spam/bots.
  filter: {
    minFollowers: num("MIN_FOLLOWERS", 1000),
    maxCashtags: num("MAX_CASHTAGS", 4), // more distinct cashtags = "top 10 alts" list spam
    minAccountAgeDays: num("MIN_ACCOUNT_AGE_DAYS", 30),
    maxFollowingRatio: num("MAX_FOLLOWING_RATIO", 5), // following/followers above this = follow-farm
    spamWords: str("SPAM_WORDS",
      "giveaway,airdrop,presale,whitelist,dm me,join my,telegram,t.me/,signals group,vip,CA:,contract address,referral,promo code,use code")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    maxPerAuthor: num("MAX_PER_AUTHOR", 3), // per window
  },

  // Upstream protection (both sources)
  maxCallsPerHour: num("MAX_CALLS_PER_HOUR", 120),
  rateLimit: { retries: num("RATE_LIMIT_RETRIES", 2), maxWaitMs: num("RATE_LIMIT_MAX_WAIT_MS", 15_000) },

  twitterapi: {
    base: str("TWITTERAPI_BASE", "https://api.twitterapi.io"),
    pages15m: num("TW_PAGES_15M", 2), // 20 tweets/page
    pagesPerDay: num("TW_PAGES_PER_DAY", 1),
    minFavesDay: num("TW_MIN_FAVES_DAY", 5),
    closedDayTtlMs: num("TW_CLOSED_DAY_TTL_MS", 12 * 3600_000),
  },

  xapi: {
    base: str("X_API_BASE", "https://api.x.com"),
    // Placeholders: {cashtag} -> "$HYPE", {coin} -> "HYPE". The cashtag operator needs an X API tier
    // that supports it; if yours doesn't, use X_QUERY="{coin} -is:retweet -is:reply"
    // (results are still filtered to the $HYPE cashtag locally).
    query: str("X_QUERY", "{cashtag} -is:retweet -is:reply"),
    maxResults: Math.min(100, Math.max(10, num("X_MAX_RESULTS", 100))),
    pagesShort: num("X_PAGES_15M", 1),
    pagesLong: num("X_PAGES_7D", 3),
  },

  cacheTtlMs: {
    "15m": num("TTL_15M_MS", 60_000),
    "7d": num("TTL_7D_MS", 600_000),
    "30d": num("TTL_30D_MS", 600_000),
  } as Record<Window, number>,

  windowMs: { "15m": 15 * 60_000, "7d": 7 * 86400_000, "30d": 30 * 86400_000 } as Record<Window, number>,
  // Hyperliquid candle interval used to price entries per window (stays under HL's 5000-candle limit)
  candleInterval: { "15m": "1m", "7d": "5m", "30d": "15m" } as Record<Window, string>,
  bucketWidth: num("BUCKET_WIDTH", 5),
};
