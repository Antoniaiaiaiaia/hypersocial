import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySide } from "../src/classify.js";
import { bucketize, pnl } from "../src/signals.js";

test("classifySide: basic stances", () => {
  assert.equal(classifySide("I bought hype."), "long");
  assert.equal(classifySide("Longed $HYPE at 63, stop below 60"), "long");
  assert.equal(classifySide("generational short on $HYPE here"), "short");
  assert.equal(classifySide("$HYPE not looking great for bulls here. Local support just gave way."), "short");
  assert.equal(classifySide("$HYPE bottom is in"), "long");
  assert.equal(classifySide("Who saw the snipe on HYPE for the portfolio"), "view");
});

test("classifySide: nearest keyword to the coin wins", () => {
  assert.equal(classifySide("Long $HYPE / Short $COIN is an interesting pairing"), "long");
  assert.equal(classifySide("Long $BTC, short $HYPE"), "short");
});

test("classifySide: ignores long-term / short-term and negations", () => {
  assert.equal(classifySide("$HYPE is one to hold long term"), "view");
  assert.equal(classifySide("short-term chop on $HYPE"), "view");
  assert.equal(classifySide("I would not short $HYPE"), "view");
});

test("pnl and buckets", () => {
  assert.equal(pnl("long", 60, 66), 10);
  assert.equal(pnl("short", 60, 66), -10);
  assert.equal(pnl("view", 60, 66), null);
  const base = { id: "", url: "", ts: 0, text: "", author: { name: "", handle: "", avatar: "", followers: 0 }, pnlPct: null };
  const b = bucketize([
    { ...base, side: "long", entryPrice: 61 },
    { ...base, side: "short", entryPrice: 72 },
    { ...base, side: "view", entryPrice: 90 },
  ]);
  assert.deepEqual(b.map((x) => [x.lo, x.hi, x.longs, x.shorts]), [[60, 65, 1, 0], [65, 70, 0, 0], [70, 75, 0, 1]]);
});
