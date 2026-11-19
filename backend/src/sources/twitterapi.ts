import { config } from "../config.js";
import { TtlCache } from "../cache.js";
import { getJson, logFetch } from "./http.js";
import type { SourceResult, Tweet, TweetSource } from "./types.js";

/** Subset of twitterapi.io's tweet object we use. */
export interface TwitterApiTweet {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  likeCount?: number;
  isReply?: boolean;
  retweeted_tweet?: unknown;
  extendedEntities?: { media?: { media_url_https?: string }[] };
  author: {
    userName: string;
    name: string;
    profilePicture?: string;
    followers?: number;
    following?: number;
    createdAt?: string;
  };
}

export function mapTwitterApiTweet(t: TwitterApiTweet): Tweet {
  const created = t.author.createdAt ? Date.parse(t.author.createdAt) : NaN;
  return {
    id: t.id,
    url: t.url,
    text: t.text,
    ts: Date.parse(t.createdAt),
    likes: t.likeCount ?? 0,
    isReply: !!t.isReply,
    isRetweet: !!t.retweeted_tweet,
    media: (t.extendedEntities?.media ?? []).map((m) => m.media_url_https).filter((u): u is string => !!u),
    author: {
      name: t.author.name,
      handle: t.author.userName,
      avatar: (t.author.profilePicture ?? "").replace("_normal.", "_bigger."),
      followers: t.author.followers ?? 0,
      following: t.author.following ?? 0,
      ...(Number.isFinite(created) ? { createdAt: created } : {}),
    },
  };
}

const DAY = 86400_000;

/**
 * twitterapi.io advanced search (https://docs.twitterapi.io), header X-API-Key.
 * < 1 day windows: one "Latest" query. Longer windows: one "Top" query per UTC day; closed days
 * are cached (TW_CLOSED_DAY_TTL_MS) and shared between 7d and 30d, so a warm refresh is ~1 call.
 */
export class TwitterApiSource implements TweetSource {
  readonly name = "twitterapi" as const;
  readonly maxLookbackMs = Infinity;
  private days = new TtlCache<Tweet[]>();

  constructor(private key: string) {}

  async search(coin: string, windowMs: number, freshTtlMs: number): Promise<SourceResult> {
    const c = config.twitterapi;
    const base = `$${coin} -filter:replies -filter:retweets`;
    const now = Date.now();
    const start = now - windowMs;
    const s = (ms: number) => Math.floor(ms / 1000);

    if (windowMs < DAY) {
      const tweets = await this.query(`${base} since_time:${s(start)}`, "Latest", c.pages15m, `${coin} latest`);
      return { tweets, coveredFrom: start };
    }

    const dayStarts: number[] = [];
    for (let d = Math.floor(start / DAY) * DAY; d < now; d += DAY) dayStarts.push(d);
    const out: Tweet[] = [];
    for (let i = 0; i < dayStarts.length; i += 4) {
      const batch = dayStarts.slice(i, i + 4).map((d) => {
        const end = d + DAY;
        const q = `${base} min_faves:${c.minFavesDay} since_time:${s(d)} until_time:${s(end)}`;
        const ttl = end <= now ? c.closedDayTtlMs : freshTtlMs;
        return this.days.get(`${coin}:${d}`, ttl, () =>
          this.query(q, "Top", c.pagesPerDay, `${coin} ${new Date(d).toISOString().slice(0, 10)}`),
        );
      });
      for (const r of await Promise.all(batch)) out.push(...r);
    }
    return { tweets: out.filter((t) => t.ts >= start), coveredFrom: start };
  }

  private async query(query: string, queryType: "Latest" | "Top", maxPages: number, label: string): Promise<Tweet[]> {
    const out: Tweet[] = [];
    let cursor = "";
    let calls = 0;
    while (calls < maxPages) {
      const u = new URL("/twitter/tweet/advanced_search", config.twitterapi.base);
      u.searchParams.set("query", query);
      u.searchParams.set("queryType", queryType);
      if (cursor) u.searchParams.set("cursor", cursor);
      const body = await getJson<{ tweets?: TwitterApiTweet[]; has_next_page?: boolean; next_cursor?: string }>(
        u, { "X-API-Key": this.key }, "twitterapi",
      );
      calls++;
      out.push(...(body.tweets ?? []).map(mapTwitterApiTweet));
      if (!body.has_next_page || !body.next_cursor) break;
      cursor = body.next_cursor;
    }
    logFetch(`twitterapi ${label}`, calls, out.length);
    return out;
  }
}
