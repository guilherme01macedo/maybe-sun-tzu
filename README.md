# Did Sun Tzu Say That?

Paste a phrase. The app tells you if Sun Tzu actually said it in *The Art of War*.

The app compares the phrase with the 1910 English translation by Lionel Giles. It gives one of three verdicts:

| Verdict | Meaning |
| --- | --- |
| **Sun Tzu said this.** | The phrase is in the text, word for word or with small typos. |
| **Close enough.** | The phrase is a paraphrase of a real passage. The card shows the real text and the chapter. |
| **Sun Tzu never said that.** | No passage is a good match. The card shows the closest real passage anyway. |

Everything runs in the browser. There is no backend and no API key.

Live site: <https://guilherme01macedo.github.io/maybe-sun-tzu/>

## Examples

| Phrase | Verdict |
| --- | --- |
| If you know the enemy and know yourself, you need not fear the result of a hundred battles. | said this (III.18) |
| Know your enemy and know yourself | close enough (III.18) |
| All warfare is based on deception. | said this (I.18) |
| Keep your friends close and your enemies closer | never said that (it is from *The Godfather Part II*) |

To share a verdict, click **Copy link**. The link opens the app with the phrase already in the box.

## How the matcher works

The matcher is in `matcher.js`. It has no dependencies. First, it removes attributions such as "— Sun Tzu" from the phrase. Then it normalizes case, punctuation, accents, and whitespace. It calculates two scores for each of the 383 passages:

- **Wording.** A word-level alignment finds the best part of the passage for the full phrase. A changed word costs 1, a small typo costs less, and a plural form costs very little. A score of 1 means that the phrase occurs word for word.
- **Meaning.** The matcher compares word stems in a window of the passage. Rare words count for more than common words. A small synonym table maps modern words to the words that Giles uses, for example "foe" to "enemy". Word pairs in the same order give a bonus.

The thresholds are in `THRESHOLDS` at the top of `matcher.js`.

## The source text

`data/source/pg132-giles-1910.txt` is [Project Gutenberg eBook #132](https://www.gutenberg.org/ebooks/132), without changes. It is in the public domain.

`scripts/build-passages.mjs` makes `data/passages.json` from this file. The script keeps only the verses of Sun Tzu. It removes the introduction and the bracketed notes by Giles. Each passage has a chapter number, a chapter title, and a verse number. Some notes in the source have no opening or closing bracket, and the script also removes those.

To make the JSON file again:

```
npm run build:data
```

## Run it locally

The app loads `data/passages.json` with `fetch`, so it needs a web server. A `file://` URL does not work.

```
npm start          # serves the app at http://localhost:8000
npm test           # runs the matcher and data tests
```

Node.js 20 or later is necessary for the tests. The app itself needs no build step.

## Deploy

Every push to `main` starts the workflow in `.github/workflows/pages.yml`. The workflow makes sure that `data/passages.json` is current, runs the tests, and then publishes the site to GitHub Pages.

## Credits

- Text: *The Art of War* by Sun Tzu, translated by Lionel Giles (1910), from Project Gutenberg. Public domain.
- Portrait: *Sun Wu (孫武子)*, from the *Album of Full-length Portraits of Sage Rulers and Worthy Ministers*, National Palace Museum, Taipei. Public domain, from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sun_Wu_(a_general_of_the_State_of_Wu).png). The painting was made many centuries after his life. Nobody knows what he looked like.
- Fonts: IM Fell English and Ma Shan Zheng, from Google Fonts.
