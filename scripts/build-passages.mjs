// Builds data/passages.json from the bundled Project Gutenberg text (#132,
// Lionel Giles, 1910). Keeps only the words of Sun Tzu: Giles's bracketed
// commentary and the introduction are removed.
//
// Usage: node scripts/build-passages.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "data/source/pg132-giles-1910.txt"), "utf8");

const start = src.indexOf("\nChapter I. LAYING PLANS");
const end = src.indexOf("*** END OF THE PROJECT GUTENBERG EBOOK");
if (start < 0 || end < 0) throw new Error("Cannot find the start or end of the text.");

const body = src
  .slice(start, end)
  .replace(/\r\n/g, "\n")
  // Some notes end with stray "]" lines that run straight into the next verse.
  .replace(/\](\n\])*\n(?=\d+(?:, \d+)*\. )/g, "]\n\n");
const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"];
const titleCase = (s) =>
  s.toLowerCase().replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase())
    .replace(/\b(Of|By|And|The|On)\b/g, (w, _x, i) => (i === 0 ? w : w.toLowerCase()));

const passages = [];
let chapter = null;
let current = null;
let inCommentary = false;

const count = (s, ch) => s.split(ch).length - 1;
const VERSE_START =/^(\d+(?:, \d+)*)\.? (?=[A-Z_(“"])/;
const HEADING = /^Chapter ([IVX]+)\. (.+)$/;

for (const p of paragraphs) {
  // Giles's notes start with "[" and can run over several paragraphs. Some
  // notes and footnotes ("[1] ...") have no closing "]", so a verse number or
  // a chapter heading also ends a note.
  const startsVerse = VERSE_START.test(p) || HEADING.test(p);
  // A few notes have lost their opening "[" but still end with "]".
  const unbalancedNote = !startsVerse && /\]\W*$/.test(p) && count(p, "]") > count(p, "[");
  if (p.startsWith("[") || unbalancedNote || (inCommentary && !startsVerse)) {
    inCommentary = !/\]\W*$/.test(p) && !/^\[\d+\]/.test(p);
    continue;
  }
  inCommentary = false;

  const heading = p.match(HEADING);
  if (heading) {
    chapter = {
      number: ROMAN.indexOf(heading[1]) + 1,
      roman: heading[1],
      title: titleCase(heading[2]),
    };
    current = null;
    continue;
  }

  const text = p.replace(/\s+/g, " ");
  // A verse starts with its number, e.g. "18." or "5, 6.". One verse in the
  // source lacks the period ("9 There are not more...").
  const verse = text.match(VERSE_START);
  if (verse) {
    current = {
      id: `${chapter.roman}.${verse[1].replace(/, /g, "-")}`,
      chapter: chapter.number,
      chapterRoman: chapter.roman,
      chapterTitle: chapter.title,
      verse: verse[1],
      text: text.slice(verse[0].length),
    };
    passages.push(current);
  } else if (current) {
    // The verse continues after a block of commentary.
    current.text += " " + text;
  } else {
    throw new Error(`Text outside a verse: ${text.slice(0, 80)}`);
  }
}

for (const p of passages) {
  p.text = p.text.replace(/^Sun Tzŭ said: /, "").trim();
}

writeFileSync(join(root, "data/passages.json"), JSON.stringify(passages, null, 1) + "\n");

const perChapter = {};
for (const p of passages) perChapter[p.chapterRoman] = (perChapter[p.chapterRoman] || 0) + 1;
console.log(`Wrote ${passages.length} passages.`, perChapter);
