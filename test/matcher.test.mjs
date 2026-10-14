import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMatcher, stripAttribution, VERDICT } from "../matcher.js";

const passages = JSON.parse(readFileSync(new URL("../data/passages.json", import.meta.url), "utf8"));
const { match } = createMatcher(passages);

function check(phrase, verdict, passageId) {
  const r = match(phrase);
  assert.equal(r.verdict, verdict, `"${phrase}" gave ${r.verdict} (${r.passage.id}, wording ${r.wording}, meaning ${r.meaning})`);
  if (passageId) assert.equal(r.passage.id, passageId, `"${phrase}" matched ${r.passage.id}`);
  return r;
}

test("required phrases from the brief", () => {
  check("If you know the enemy and know yourself, you need not fear the result of a hundred battles.", VERDICT.SAID, "III.18");
  check("Know your enemy and know yourself", VERDICT.CLOSE, "III.18");
  check("All warfare is based on deception.", VERDICT.SAID, "I.18");
  check("Keep your friends close and your enemies closer", VERDICT.NEVER);
});

test("real quotes, with typos and attributions", () => {
  check("Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.", VERDICT.SAID, "VII.19");
  check("Rapidity is the essence of war", VERDICT.SAID, "XI.19");
  check("When you surround an army, leave an outlet free", VERDICT.SAID, "VII.36");
  check("all warfare is based on decepton", VERDICT.SAID, "I.18");
  check("ALL WARFARE IS BASED ON DECEPTION!!!", VERDICT.SAID, "I.18");
  check("“All warfare is based on deception.” — Sun Tzu, The Art of War", VERDICT.SAID, "I.18");
  check("Sun Tzu said: all warfare is based on deception", VERDICT.SAID, "I.18");
});

test("paraphrases and other translations are close enough", () => {
  check("Speed is the essence of war", VERDICT.CLOSE, "XI.19");
  check("Know thy enemy and know thyself", VERDICT.CLOSE, "III.18");
  check("The supreme art of war is to subdue the enemy without fighting", VERDICT.CLOSE, "III.2");
  check("Treat your men as you would your own beloved sons. And they will follow you into the deepest valley.", VERDICT.CLOSE, "X.25");
  check("Attack where they are unprepared, appear where you are not expected", VERDICT.CLOSE, "I.24");
});

test("famous quotes that Sun Tzu never said", () => {
  for (const phrase of [
    "If you wait by the river long enough, the bodies of your enemies will float by",
    "Never interrupt your enemy when he is making a mistake",
    "Life is like a box of chocolates",
    "The best defense is a good offense",
    "Winter is coming",
    "Be like water my friend",
    "To be or not to be, that is the question",
    "The enemy of my enemy is my friend",
    "I came, I saw, I conquered",
  ]) {
    const r = check(phrase, VERDICT.NEVER);
    assert.ok(r.passage.text.length > 0, "a closest passage is always shown");
    assert.equal(r.highlight, null);
  }
});

test("the highlight covers the matched words", () => {
  const r = match("know yourself but not the enemy");
  const [a, b] = r.highlight;
  assert.equal(r.passage.text.slice(a, b), "know yourself but not the enemy");
});

test("empty input gives no result", () => {
  assert.equal(match(""), null);
  assert.equal(match("  ?! "), null);
});

test("stripAttribution", () => {
  assert.equal(stripAttribution('"Hello." - Sun Tzu'), '"Hello."');
  assert.equal(stripAttribution("As Sun Tzu once said, hello"), "hello");
  assert.equal(stripAttribution("hello, said Sun Tzu."), "hello");
  assert.equal(stripAttribution("Sun Tzu's army"), "Sun Tzu's army");
});
