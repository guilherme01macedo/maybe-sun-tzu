// Decides whether Sun Tzu said a phrase, by comparison with the Giles
// translation. Runs in the browser and in Node. It has no dependencies.
//
// Two scores are calculated for each passage:
//   wording - word-level alignment of the whole query against any part of the
//             passage. 1 means the query occurs word for word in the passage.
//   meaning - IDF-weighted overlap of word stems in a window of the passage,
//             with a bonus for word pairs in the same order. It finds
//             paraphrases.

export const VERDICT = {
  SAID: "said",
  CLOSE: "close",
  NEVER: "never",
};

export const THRESHOLDS = {
  said: 0.88, // minimum wording score for "Sun Tzu said this"
  closeWording: 0.6, // minimum wording score for "Close enough"...
  closeWordingMeaning: 0.5, // ...if the meaning score is also at least this
  closeMeaning: 0.58, // minimum meaning score for "Close enough"
  minWords: 3, // shorter phrases cannot be "said this"
};

const STOPWORDS = new Set(
  ("a an the and or but nor so yet if then than that this these those there here " +
    "of to in on at by for from with without into onto upon over under as is are " +
    "was were be been being am do does did done have has had having will would " +
    "shall should can could may might must it its it's he him his she her hers " +
    "they them their theirs we us our ours you your yours i me my mine who whom " +
    "whose which what when where why how all any each every some such no not only " +
    "own same too very just also thus hence therefore one let")
    .split(" "),
);
// "without" carries meaning in this text ("without fighting").
STOPWORDS.delete("without");

// Words that modern quotes use in place of Giles's words.
const SYNONYMS = {
  foe: "enemy", opponent: "enemy", adversary: "enemy", rival: "enemy",
  warfare: "war", combat: "fight", battl: "fight", conflict: "war",
  victory: "victory", win: "victory", victoriou: "victory", triumph: "victory", conquer: "victory",
  los: "defeat", lose: "defeat",
  deceiv: "deception", deceit: "deception", trick: "deception",
  troop: "soldier", men: "soldier", warrior: "soldier",
  forc: "army",
  strong: "strength", weak: "weakness",
  speed: "rapidity", swift: "rapidity", quick: "rapidity", fast: "rapidity",
  leader: "general", command: "general", commander: "general",
  thyself: "yourself", thy: "your", thee: "you",
  knowledg: "know", knew: "know",
  strategy: "plan", schem: "plan",
  subdu: "break", crush: "break",
  greatest: "supreme", highest: "supreme", best: "supreme",
};

/** Lowercases, removes accents and apostrophes, and splits into words. */
export function tokenize(text) {
  const words = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  for (const m of text.matchAll(re)) {
    words.push({
      word: foldWord(m[0]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return words;
}

function foldWord(w) {
  return w
    .replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").replace(/Æ/g, "Ae")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "");
}

/** A small suffix stemmer. It is enough to match "enemies" with "enemy". */
export function stem(w) {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith("ed")) s = s.slice(0, -2);
  if (s.length > 4 && s.endsWith("ly")) s = s.slice(0, -2);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/** The stem, with modern words replaced by the words that Giles uses. */
export function sense(w) {
  return SYNONYMS[w] || SYNONYMS[stem(w)] || stem(w);
}

/**
 * Removes attributions that people paste with a quote, for example
 * '"All warfare is based on deception." — Sun Tzu, The Art of War'.
 */
export function stripAttribution(text) {
  return text
    .replace(/\s*[-–—~―]+\s*(sun\s*tz[uŭ]|sunzi|sun\s*wu)\b.*$/is, "")
    .replace(/^\s*(as\s+)?(sun\s*tz[uŭ]|sunzi|sun\s*wu)(\s+(once|famously))?\s+(said|says|wrote)\s*[:,]?\s*/i, "")
    .replace(/,?\s*(said|says|wrote)\s+(sun\s*tz[uŭ]|sunzi)\.?\s*$/i, "")
    .trim();
}

function annotate(w) {
  w.stem = stem(w.word);
  w.sense = sense(w.word);
  w.content = !STOPWORDS.has(w.word);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// The cost to replace one word with another, from 0 to 1.
function substitutionCost(q, t) {
  if (q.word === t.word) return 0;
  if (q.stem === t.stem) return 0.2;
  if (q.sense === t.sense) return 0.9; // a synonym is a paraphrase, not a quote
  const longest = Math.max(q.word.length, t.word.length);
  if (longest >= 4 && 1 - levenshtein(q.word, t.word) / longest >= 0.75) return 0.35;
  return 1;
}

// Aligns all query words against the best part of the passage. Returns the
// score and the span of passage words that matched.
function alignWording(qWords, pWords) {
  const m = qWords.length;
  const n = pWords.length;
  // cost[i][j]: the cheapest way to align query words 0..i-1 so that they end
  // at passage word j-1. A start anywhere in the passage is free.
  let prev = new Float64Array(n + 1);
  let prevStart = new Int32Array(n + 1);
  for (let j = 0; j <= n; j++) prevStart[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Float64Array(n + 1);
    const curStart = new Int32Array(n + 1);
    cur[0] = i;
    curStart[0] = 0;
    for (let j = 1; j <= n; j++) {
      const sub = prev[j - 1] + substitutionCost(qWords[i - 1], pWords[j - 1]);
      const skipQuery = prev[j] + 1;
      const skipPassage = cur[j - 1] + 1;
      if (sub <= skipQuery && sub <= skipPassage) {
        cur[j] = sub;
        curStart[j] = prevStart[j - 1];
      } else if (skipQuery <= skipPassage) {
        cur[j] = skipQuery;
        curStart[j] = prevStart[j];
      } else {
        cur[j] = skipPassage;
        curStart[j] = curStart[j - 1];
      }
    }
    prev = cur;
    prevStart = curStart;
  }
  let best = Infinity;
  let bestEnd = 0;
  for (let j = 0; j <= n; j++) {
    if (prev[j] < best) {
      best = prev[j];
      bestEnd = j;
    }
  }
  return {
    score: Math.max(0, 1 - best / m),
    from: prevStart[bestEnd],
    to: bestEnd, // exclusive
  };
}

/** Builds a matcher for a list of passages from data/passages.json. */
export function createMatcher(passages) {
  const docs = passages.map((p) => {
    const words = tokenize(p.text);
    for (const w of words) annotate(w);
    return { passage: p, words };
  });

  // Inverse document frequency of each content stem, over all passages.
  const df = new Map();
  for (const d of docs) {
    for (const s of new Set(d.words.filter((w) => w.content).map((w) => w.sense))) {
      df.set(s, (df.get(s) || 0) + 1);
    }
  }
  const N = docs.length;
  const maxIdf = Math.log(1 + N);
  const idf = (s) => (df.has(s) ? Math.log(1 + N / df.get(s)) : maxIdf);

  function meaningScore(qContent, qBigrams, d) {
    const content = d.words.map((w, i) => ({ w, i })).filter((x) => x.w.content);
    if (!content.length || !qContent.length) return { score: 0, from: 0, to: 0, matched: 0 };
    const totalWeight = qContent.reduce((sum, s) => sum + idf(s), 0);
    const qSet = new Set(qContent);
    const size = Math.max(qContent.length + 3, Math.ceil(qContent.length * 1.6));
    let best = { score: 0, from: 0, to: 0, matched: 0 };
    const starts = Math.max(1, content.length - size + 1);
    for (let a = 0; a < starts; a++) {
      const win = content.slice(a, a + size);
      const stems = new Set(win.map((x) => x.w.sense));
      let weight = 0;
      let matched = 0;
      for (const s of qSet) {
        if (stems.has(s)) {
          weight += idf(s) * qContent.filter((q) => q === s).length;
          matched++;
        }
      }
      const recall = weight / totalWeight;
      let pairs = 0;
      if (qBigrams.size) {
        for (let k = 0; k + 1 < win.length; k++) {
          if (qBigrams.has(win[k].w.sense + " " + win[k + 1].w.sense)) pairs++;
        }
      }
      const order = qBigrams.size ? Math.min(1, pairs / qBigrams.size) : recall;
      const score = 0.75 * recall + 0.25 * order;
      if (score > best.score) {
        const hit = win.filter((x) => qSet.has(x.w.sense));
        best = {
          score,
          recall,
          order,
          matched,
          from: hit.length ? hit[0].i : win[0].i,
          to: hit.length ? hit[hit.length - 1].i + 1 : win[win.length - 1].i + 1,
        };
      }
    }
    return best;
  }

  /**
   * Returns { verdict, passage, wording, meaning, highlight, query } for a
   * phrase. "passage" is the best match, also when the verdict is NEVER.
   * "highlight" is the [start, end) character range in passage.text.
   */
  function match(input) {
    const query = stripAttribution(String(input || "")).slice(0, 500);
    const qWords = tokenize(query);
    for (const w of qWords) annotate(w);
    if (!qWords.length) return null;

    const qContent = qWords.filter((w) => w.content).map((w) => w.sense);
    const qBigrams = new Set();
    for (let k = 0; k + 1 < qContent.length; k++) qBigrams.add(qContent[k] + " " + qContent[k + 1]);

    let bestWording = null;
    let bestMeaning = null;
    for (const d of docs) {
      const w = alignWording(qWords, d.words);
      if (!bestWording || w.score > bestWording.score) bestWording = { ...w, d };
      const s = meaningScore(qContent, qBigrams, d);
      if (!bestMeaning || s.score > bestMeaning.score) bestMeaning = { ...s, d };
    }

    // With no good match, the passage closest in meaning is the best joke.
    let verdict = VERDICT.NEVER;
    let pick = bestMeaning.score > 0 ? bestMeaning : bestWording;
    if (bestWording.score >= THRESHOLDS.said && qWords.length >= THRESHOLDS.minWords) {
      verdict = VERDICT.SAID;
      pick = bestWording;
    } else if (
      bestWording.score >= THRESHOLDS.closeWording &&
      bestMeaning.score >= THRESHOLDS.closeWordingMeaning
    ) {
      verdict = VERDICT.CLOSE;
      pick = bestWording;
    } else if (bestMeaning.score >= THRESHOLDS.closeMeaning && bestMeaning.matched >= 2) {
      verdict = VERDICT.CLOSE;
      pick = bestMeaning;
    }

    const words = pick.d.words;
    const highlight =
      verdict !== VERDICT.NEVER && pick.to > pick.from
        ? [words[pick.from].start, words[pick.to - 1].end]
        : null;

    return {
      verdict,
      query,
      passage: pick.d.passage,
      wording: round(bestWording.score),
      meaning: round(bestMeaning.score),
      recall: round(bestMeaning.recall || 0),
      order: round(bestMeaning.order || 0),
      highlight,
    };
  }

  return { match };
}

const round = (x) => Math.round(x * 1000) / 1000;
