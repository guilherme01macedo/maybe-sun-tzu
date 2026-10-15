import { createMatcher, VERDICT } from "./matcher.js";

const $ = (id) => document.getElementById(id);
const form = $("ask");
const input = $("phrase");

const COPY = {
  [VERDICT.SAID]: {
    verdict: "Sun Tzu said this.",
    seal: ["真", "言"], // "true words"
    leads: ["Word for word, more or less:", "The master approves. The source:", "Genuine. It is right here:"],
  },
  [VERDICT.CLOSE]: {
    verdict: "Close enough.",
    seal: ["近", "似"], // "approximately"
    leads: ["A paraphrase. What Giles actually wrote:", "The spirit is there. The words are these:", "Near, but not exact. The real passage:"],
  },
  [VERDICT.NEVER]: {
    verdict: "Sun Tzu never said that.",
    seal: ["偽", "言"], // "false words"
    leads: [
      "He did, however, say this:",
      "The closest thing he actually wrote:",
      "Nice try. The nearest real passage:",
      "Not in the scroll. He was busy saying this:",
    ],
  },
};

// Famous quotes for the "try a famous one" button: real, paraphrased and fake.
const EXAMPLES = [
  "All warfare is based on deception.",
  "Know your enemy and know yourself",
  "Keep your friends close and your enemies closer",
  "If you wait by the river long enough, the bodies of your enemies will float by",
  "The supreme art of war is to subdue the enemy without fighting",
  "Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.",
  "Never interrupt your enemy when he is making a mistake",
  "Speed is the essence of war",
  "Life is like a box of chocolates",
  "When you surround an army, leave an outlet free.",
  "Appear weak when you are strong, and strong when you are weak.",
  "Move fast and break things",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Giles marks italics with underscores. They are removed for display.
const clean = (s) => escapeHtml(s.replace(/_/g, ""));

let matcher = null;
const ready = fetch("data/passages.json")
  .then((r) => {
    if (!r.ok) throw new Error(`Cannot load the passages (HTTP ${r.status}).`);
    return r.json();
  })
  .then((passages) => {
    matcher = createMatcher(passages);
  });

function shareUrl(phrase) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("q", phrase);
  return url.toString();
}

function render(result) {
  const copy = COPY[result.verdict];
  const card = $("card");
  card.dataset.verdict = result.verdict;

  const seal = $("seal");
  seal.children[0].textContent = copy.seal[0];
  seal.children[1].textContent = copy.seal[1];

  $("verdict").textContent = copy.verdict;
  $("asked").textContent = `“${result.query.replace(/^["“”']+|["“”']+$/g, "")}”`;
  $("lead").textContent = pick(copy.leads);

  const { text } = result.passage;
  if (result.highlight) {
    const [a, b] = result.highlight;
    $("passage").innerHTML =
      clean(text.slice(0, a)) + "<mark>" + clean(text.slice(a, b)) + "</mark>" + clean(text.slice(b));
  } else {
    $("passage").innerHTML = clean(text);
  }

  const p = result.passage;
  const verse = p.verse.includes(",") ? `§§ ${p.verse.replace(", ", "–")}` : `§ ${p.verse}`;
  $("cite").innerHTML = `— <cite>The Art of War</cite>, ch. ${p.chapterRoman}, <span class="chapter-title">${escapeHtml(p.chapterTitle)}</span>, ${verse}`;
  $("watermark").textContent = (location.host + location.pathname).replace(/index\.html$/, "").replace(/\/$/, "");

  $("placeholder").hidden = true;
  card.hidden = false;
  $("actions").hidden = false;
  fit();
  // Restart the stamp animation.
  card.classList.remove("stamped");
  void card.offsetWidth;
  card.classList.add("stamped");
}

// Makes the card text smaller until the page fits in the window without a
// scroll bar. Long verses need this, mostly on phones. 11px is the limit.
function fit() {
  const card = $("card");
  if (card.hidden) return;
  card.style.removeProperty("--card-size");
  let size = parseFloat(getComputedStyle(card).fontSize);
  const page = document.documentElement;
  while (page.scrollHeight > window.innerHeight && size > 11) {
    size -= 0.5;
    card.style.setProperty("--card-size", `${size}px`);
  }
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fit, 100);
});
// The web fonts change the text size when they load.
document.fonts?.ready.then(fit);

async function check(phrase, { scroll = true } = {}) {
  phrase = phrase.trim();
  if (!phrase) return;
  try {
    await ready;
  } catch (err) {
    $("placeholder").hidden = false;
    $("placeholder").querySelector("p").textContent = err.message;
    return;
  }
  const result = matcher.match(phrase);
  if (!result) return;
  render(result);
  history.replaceState(null, "", shareUrl(phrase));
  $("copied").textContent = "";
  if (scroll) $("card").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  check(input.value);
});

// Enter checks the phrase. Shift+Enter adds a new line.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});

$("random").addEventListener("click", () => {
  let next;
  do next = pick(EXAMPLES);
  while (next === input.value && EXAMPLES.length > 1);
  input.value = next;
  check(next);
});

$("copy").addEventListener("click", async () => {
  const url = shareUrl(input.value.trim());
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    // Older browsers, or a page that is not served over HTTPS.
    const tmp = document.createElement("textarea");
    tmp.value = url;
    tmp.setAttribute("readonly", "");
    tmp.style.position = "fixed";
    tmp.style.opacity = "0";
    document.body.appendChild(tmp);
    tmp.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    tmp.remove();
  }
  $("copied").textContent = ok ? "Link copied." : url;
});

const initial = new URLSearchParams(location.search).get("q");
if (initial) {
  input.value = initial;
  check(initial, { scroll: false });
}
