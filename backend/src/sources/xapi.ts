import { config } from "../config.js";
import { TtlCache } from "../cache.js";
import { getJson, logFetch } from "./http.js";
import type { SourceResult, Tweet, TweetSource } from "./types.js";

/** Subset of an X API v2 /2/tweets/search/recent response. */
export interface XSearchResponse {
  data?: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics?: { like_count?: number };
    referenced_tweets?: { type: "retweeted" | "quoted" | "replied_to"; id: string }[];
    attachments?: { media_keys?: string[] };
  }[];
  includes?: {
    users?: {
      id: string;
      name: string;
      username: string;
      profile_image_url?: string;
      created_at?: string;
      public_metrics?: { followers_count?: number; following_count?: number };
    }[];
    media?: { media_key: string; type: string; url?: string; preview_image_url?: string }[];
  };
  meta?: { result_count?: number; next_token?: string };
}

/** Map one search page to provider-neutral tweets. Tweets whose author is missing are dropped. */
export function mapXResponse(body: XSearchResponse): Tweet[] {
  const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u]));
  const media = new Map((body.includes?.media ?? []).map((m) => [m.media_key, m]));
  const out: Tweet[] = [];
  for (const t of body.data ?? []) {
    const u = users.get(t.author_id);
    if (!u) continue;
    const created = u.created_at ? Date.parse(u.created_at) : NaN;
    const refs = t.referenced_tweets ?? [];
    out.push({
      id: t.id,
      url: `https://x.com/${u.username}/status/${t.id}`,
      text: t.text,
      ts: Date.parse(t.created_at),
      likes: t.public_metrics?.like_count ?? 0,
      isReply: refs.some((r) => r.type === "replied_to"),
      isRetweet: refs.some((r) => r.type === "retweeted"),
      media: (t.attachments?.media_keys ?? [])
        .map((k) => media.get(k))
        .map((m) => m?.url ?? m?.preview_image_url)
        .filter((x): x is string => !!x),
      author: {
        name: u.name,
        handle: u.username,
        avatar: (u.profile_image_url ?? "").replace("_normal.", "_bigger."),
        followers: u.public_metrics?.followers_count ?? 0,
        following: u.public_metrics?.following_count ?? 0,
        ...(Number.isFinite(created) ? { createdAt: created } : {}),
      },
    });
  }
  return out;
}

const RECENT_LOOKBACK_MS = 7 * 86400_000;
const SAFETY_MS = 60_000; // X rejects start_time older than 7d; stay just inside

/**
 * Official X API v2 recent search (Bearer token). Only the last 7 days are searchable, so a
 * 30d window returns 7d of data and the response says `coverage: "7d"`.
 * Longer windows share one cached result (the 7d search) to save rate limit.
 */
export class XApiSource implements TweetSource {
  readonly name = "xapi" as const;
  readonly maxLookbackMs = RECENT_LOOKBACK_MS;
  private recent = new TtlCache<Tweet[]>();

  constructor(private token: string) {}

  async search(coin: string, windowMs: number, freshTtlMs: number): Promise<SourceResult> {
    const now = Date.now();
    const lookback = Math.min(windowMs, RECENT_LOOKBACK_MS - SAFETY_MS);
    const start = now - lookback;
    const short = windowMs < 86400_000;
    const pages = short ? config.xapi.pagesShort : config.xapi.pagesLong;
    const run = () => this.query(coin, start, pages);
    const tweets = short ? await run() : await this.recent.get(`${coin}:long`, freshTtlMs, run);
    const from = now - windowMs;
    return { tweets: tweets.filter((t) => t.ts >= from), coveredFrom: Math.max(from, start) };
  }

  private async query(coin: string, startMs: number, maxPages: number): Promise<Tweet[]> {
    const out: Tweet[] = [];
    let next = "";
    let calls = 0;
    while (calls < maxPages) {
      const u = new URL("/2/tweets/search/recent", config.xapi.base);
      u.searchParams.set("query", config.xapi.query.replaceAll("{cashtag}", "$" + coin).replaceAll("{coin}", coin));
      u.searchParams.set("start_time", new Date(startMs).toISOString());
      u.searchParams.set("max_results", String(config.xapi.maxResults));
      u.searchParams.set("tweet.fields", "created_at,public_metrics,referenced_tweets,attachments,author_id");
      u.searchParams.set("expansions", "author_id,attachments.media_keys");
      u.searchParams.set("user.fields", "public_metrics,profile_image_url,created_at,username,name");
      u.searchParams.set("media.fields", "url,preview_image_url,type");
      if (next) u.searchParams.set("next_token", next);
      const body = await getJson<XSearchResponse>(u, { Authorization: `Bearer ${this.token}` }, "xapi");
      calls++;
      out.push(...mapXResponse(body));
      next = body.meta?.next_token ?? "";
      if (!next) break;
    }
    logFetch(`xapi ${coin}`, calls, out.length);
    return out;
  }
}
