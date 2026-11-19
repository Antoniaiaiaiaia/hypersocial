import { TwitterApiSource } from "./twitterapi.js";
import { XApiSource } from "./xapi.js";
import type { SourceName, TweetSource } from "./types.js";

export type { Tweet, TweetSource, SourceName, SourceResult } from "./types.js";

type Env = Record<string, string | undefined>;

/**
 * Which tweet source to use. TWEET_SOURCE wins; otherwise the first key that is set
 * (TWITTERAPI_KEY, then X_BEARER_TOKEN). Returns an error string instead of throwing.
 */
export function pickSource(env: Env): { name: SourceName } | { error: string } {
  const explicit = env.TWEET_SOURCE?.trim().toLowerCase();
  const has = { twitterapi: !!env.TWITTERAPI_KEY, xapi: !!env.X_BEARER_TOKEN };
  const keyVar = { twitterapi: "TWITTERAPI_KEY", xapi: "X_BEARER_TOKEN" } as const;

  if (explicit) {
    if (explicit !== "twitterapi" && explicit !== "xapi") {
      return { error: `TWEET_SOURCE must be "twitterapi" or "xapi", got "${env.TWEET_SOURCE}"` };
    }
    return has[explicit] ? { name: explicit } : { error: `TWEET_SOURCE=${explicit} but ${keyVar[explicit]} is not set` };
  }
  if (has.twitterapi) return { name: "twitterapi" };
  if (has.xapi) return { name: "xapi" };
  return { error: "no tweet source key: set TWITTERAPI_KEY or X_BEARER_TOKEN in backend/.env (or run with FIXTURE=1)" };
}

export function createSource(name: SourceName, env: Env): TweetSource {
  return name === "twitterapi" ? new TwitterApiSource(env.TWITTERAPI_KEY!) : new XApiSource(env.X_BEARER_TOKEN!);
}
