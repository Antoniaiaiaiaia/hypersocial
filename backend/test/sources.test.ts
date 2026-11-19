import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { pickSource } from "../src/sources/index.js";
import { mapXResponse, XApiSource, type XSearchResponse } from "../src/sources/xapi.js";
import { mapTwitterApiTweet } from "../src/sources/twitterapi.js";
import { parseDotEnv } from "../src/env.js";
import { coverageLabel } from "../src/signals.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("pickSource: explicit, auto, errors", () => {
  assert.deepEqual(pickSource({ TWITTERAPI_KEY: "a" }), { name: "twitterapi" });
  assert.deepEqual(pickSource({ X_BEARER_TOKEN: "b" }), { name: "xapi" });
  assert.deepEqual(pickSource({ TWITTERAPI_KEY: "a", X_BEARER_TOKEN: "b" }), { name: "twitterapi" });
  assert.deepEqual(pickSource({ TWEET_SOURCE: "xapi", TWITTERAPI_KEY: "a", X_BEARER_TOKEN: "b" }), { name: "xapi" });
  assert.match((pickSource({ TWEET_SOURCE: "xapi", TWITTERAPI_KEY: "a" }) as { error: string }).error, /X_BEARER_TOKEN/);
  assert.match((pickSource({ TWEET_SOURCE: "nitter" }) as { error: string }).error, /TWEET_SOURCE/);
  assert.match((pickSource({}) as { error: string }).error, /TWITTERAPI_KEY or X_BEARER_TOKEN/);
});

const X_PAGE: XSearchResponse = {
  data: [
    {
      id: "100", text: "Longed $HYPE at 60", author_id: "u1", created_at: "2026-01-01T10:00:00.000Z",
      public_metrics: { like_count: 12 }, attachments: { media_keys: ["m1"] },
    },
    {
      id: "101", text: "@x short $HYPE", author_id: "u2", created_at: "2026-01-01T11:00:00.000Z",
      referenced_tweets: [{ type: "replied_to", id: "99" }],
    },
    { id: "102", text: "orphan", author_id: "missing", created_at: "2026-01-01T12:00:00.000Z" },
  ],
  includes: {
    users: [
      { id: "u1", name: "Alpha", username: "alpha", profile_image_url: "https://img/a_normal.jpg",
        created_at: "2020-01-01T00:00:00.000Z", public_metrics: { followers_count: 5000, following_count: 100 } },
      { id: "u2", name: "Beta", username: "beta", public_metrics: { followers_count: 10 } },
    ],
    media: [{ media_key: "m1", type: "photo", url: "https://img/m1.jpg" }],
  },
  meta: { result_count: 3 },
};

test("mapXResponse: maps users, media, replies; drops tweets without author", () => {
  const out = mapXResponse(X_PAGE);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    id: "100", url: "https://x.com/alpha/status/100", text: "Longed $HYPE at 60",
    ts: Date.parse("2026-01-01T10:00:00.000Z"), likes: 12, isReply: false, isRetweet: false,
    media: ["https://img/m1.jpg"],
    author: { name: "Alpha", handle: "alpha", avatar: "https://img/a_bigger.jpg", followers: 5000, following: 100,
      createdAt: Date.parse("2020-01-01T00:00:00.000Z") },
  });
  assert.equal(out[1].isReply, true);
  assert.equal(out[1].author.following, 0);
  assert.equal(out[1].author.createdAt, undefined);
});

test("XApiSource: paginates, retries 429, caps 30d at 7d coverage", async () => {
  const urls: URL[] = [];
  let n = 0;
  const now = Date.now();
  const page = (id: string, ageMs: number, next?: string): XSearchResponse => ({
    data: [{ id, text: "$HYPE", author_id: "u1", created_at: new Date(now - ageMs).toISOString() }],
    includes: { users: [{ id: "u1", name: "A", username: "a", public_metrics: { followers_count: 5000 } }] },
    meta: next ? { next_token: next } : {},
  });
  globalThis.fetch = (async (input: URL, init?: RequestInit) => {
    urls.push(new URL(input));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer tok");
    n++;
    if (n === 1) return new Response("{}", { status: 429, headers: { "retry-after": "0" } });
    if (n === 2) return Response.json(page("1", 3600_000, "next1"));
    return Response.json(page("2", 2 * 86400_000));
  }) as typeof fetch;

  const src = new XApiSource("tok");
  const res = await src.search("HYPE", 30 * 86400_000, 60_000);
  assert.deepEqual(res.tweets.map((t) => t.id), ["1", "2"]);
  assert.equal(n, 3); // 429 retried once, then two pages
  assert.equal(urls[2].searchParams.get("next_token"), "next1");
  assert.equal(urls[1].searchParams.get("query"), "$HYPE -is:retweet -is:reply");
  const start = Date.parse(urls[1].searchParams.get("start_time")!);
  assert.ok(now - start < 7 * 86400_000 && now - start > 6.9 * 86400_000, "start_time inside 7d");
  assert.equal(coverageLabel(Date.now() - res.coveredFrom), "7d");

  // 7d and 30d share one cached search: no new calls
  await src.search("HYPE", 7 * 86400_000, 60_000);
  assert.equal(n, 3);
});

test("mapTwitterApiTweet + parseDotEnv", () => {
  const t = mapTwitterApiTweet({
    id: "1", url: "u", text: "$HYPE", createdAt: "Thu Nov 19 14:30:00 +0000 2026", isReply: false,
    author: { userName: "h", name: "N", profilePicture: "p_normal.jpg", followers: 2000, following: 10 },
  });
  assert.equal(t.author.avatar, "p_bigger.jpg");
  assert.equal(t.ts, Date.parse("2026-11-19T14:30:00Z"));
  assert.deepEqual(parseDotEnv("# c\nA=1\nexport B=\"x y\"\nC=z # note\nD=\nE=\"{cashtag} -is:reply\"   # c\n"),
    { A: "1", B: "x y", C: "z", D: "", E: "{cashtag} -is:reply" });
});
