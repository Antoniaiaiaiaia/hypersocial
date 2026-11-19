import "./load-env.js"; // must stay first: loads backend/.env before config is read
import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { config } from "./config.js";
import { TtlCache } from "./cache.js";
import { buildSignals } from "./signals.js";
import { createSource, pickSource, type TweetSource } from "./sources/index.js";
import { usage } from "./sources/http.js";
import type { SignalsResponse, Window } from "./types.js";

const WINDOWS: Window[] = ["15m", "7d", "30d"];
const cache = new TtlCache<SignalsResponse>();
const FIXTURES = new URL("../../fixtures/", import.meta.url);

const picked = pickSource(process.env);
let source: TweetSource | null = null;
if ("name" in picked) {
  source = createSource(picked.name, process.env);
} else if (!config.fixtureMode) {
  console.error(`\n[hypersocial] cannot start: ${picked.error}\n  Setup: see backend/README.md ("Setup"). Copy .env.example to .env and add a key.\n`);
  process.exit(1);
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Hypersocial-Source, X-Hypersocial-Provider, X-Hypersocial-Coverage",
    ...extra,
  });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

/** X-Hypersocial-Coverage (a duration like "7d") only when the window is truncated. */
function coverageHeader(data: SignalsResponse, window: Window): Record<string, string> {
  return data.coverage !== window ? { "X-Hypersocial-Coverage": data.coverage } : {};
}

/** Saved synthetic sample, timestamps shifted so the newest call looks recent. */
async function fixture(coin: string, window: Window): Promise<SignalsResponse> {
  const data = JSON.parse(await readFile(new URL(`signals-${coin}-${window}.json`, FIXTURES), "utf8")) as SignalsResponse;
  const shift = Date.now() - data.updatedAt;
  return { ...data, updatedAt: data.updatedAt + shift, calls: data.calls.map((c) => ({ ...c, ts: c.ts + shift })) };
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null);
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { ok: true, fixtureMode: config.fixtureMode, source: source?.name ?? null, usage });
    }
    if (req.method === "GET" && url.pathname === "/v1/signals") {
      const coin = (url.searchParams.get("coin") ?? "HYPE").toUpperCase();
      const window = (url.searchParams.get("window") ?? "7d") as Window;
      if (!config.supportedCoins.includes(coin)) return send(res, 400, { error: `unsupported coin; try ${config.supportedCoins.join(",")}` });
      if (!WINDOWS.includes(window)) return send(res, 400, { error: "window must be 15m|7d|30d" });

      if (config.fixtureMode || url.searchParams.get("fixture") === "1" || !source) {
        const data = await fixture(coin, window);
        return send(res, 200, data, { "X-Hypersocial-Source": "fixture", ...coverageHeader(data, window) });
      }
      const src = source;
      const ttl = config.cacheTtlMs[window];
      const data = await cache.get(`${coin}:${window}`, ttl, () => buildSignals(src, coin, window));
      return send(res, 200, data, {
        "Cache-Control": `public, max-age=${Math.floor(ttl / 1000)}`,
        "X-Hypersocial-Source": "live",
        "X-Hypersocial-Provider": src.name,
        ...coverageHeader(data, window),
      });
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    console.error(`[server] ${url.pathname}: ${(err as Error).message}`);
    send(res, 502, { error: "upstream failed" });
  }
});

server.listen(config.port, () => {
  const mode = config.fixtureMode ? "fixture mode (no upstream calls)" : `source=${source?.name}`;
  console.log(`hypersocial backend on http://localhost:${config.port} — ${mode}`);
});
