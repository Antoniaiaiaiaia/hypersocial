/** Provider-neutral tweet. Every source maps its API response into this shape. */
export interface Tweet {
  id: string;
  url: string;
  text: string;
  ts: number; // ms UTC
  likes: number;
  isReply: boolean;
  isRetweet: boolean;
  media: string[];
  author: {
    name: string;
    handle: string;
    avatar: string;
    followers: number;
    following: number;
    createdAt?: number; // ms UTC, account creation (optional: not all sources give it)
  };
}

export interface SourceResult {
  tweets: Tweet[];
  /** Oldest timestamp (ms) this result can cover. > window start means the window is truncated. */
  coveredFrom: number;
}

export interface TweetSource {
  readonly name: SourceName;
  /** Max lookback this source can search, in ms (Infinity = unlimited). */
  readonly maxLookbackMs: number;
  /**
   * Tweets mentioning $COIN in [now - windowMs, now].
   * `freshTtlMs` = how long a result for the still-open part of the window may be cached.
   */
  search(coin: string, windowMs: number, freshTtlMs: number): Promise<SourceResult>;
}

export type SourceName = "twitterapi" | "xapi";
