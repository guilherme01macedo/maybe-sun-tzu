import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const passages = JSON.parse(readFileSync(new URL("../data/passages.json", import.meta.url), "utf8"));

// The last verse number of each chapter in the Giles translation.
const LAST_VERSE = [26, 20, 18, 20, 23, 34, 37, 14, 45, 31, 68, 22, 27];

test("every verse of every chapter is present once", () => {
  LAST_VERSE.forEach((last, i) => {
    const numbers = passages
      .filter((p) => p.chapter === i + 1)
      .flatMap((p) => p.verse.split(", ").map(Number));
    const expected = Array.from({ length: last }, (_, k) => k + 1);
    assert.deepEqual(numbers, expected, `chapter ${i + 1}`);
  });
});

test("Giles's commentary is not in the passages", () => {
  for (const p of passages) {
    assert.doesNotMatch(p.text, /[[\]]|Tu Mu|Ts’ao Kung|Chang Yü|Mei Yao-ch’en|Li Ch’üan/, p.id);
  }
});

test("passages have unique ids and chapter titles", () => {
  assert.equal(new Set(passages.map((p) => p.id)).size, passages.length);
  for (const p of passages) assert.ok(p.chapterTitle && p.text, p.id);
});
