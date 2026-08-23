# Typing

Practice on this device. History lives in the file. Race a friend from one
link. No account.

An unofficial port of **[Programmer's Typing Practice](https://github.com/climech/typing-practice)**
by climech (MIT). The original is a never-ending stream of random characters
with no WPM. This rewrite is classic scripts so the GifOS runtime (which
drops `type=module`) can boot it, uses a real input so a phone's OS keyboard
opens, and adds passages, lessons, a live result, and a race.

```
index.html          home / practice / lessons / play a friend
style.css           dark #0a0a0f, amber caret
engine.js           WPM (5 chars = 1 word), accuracy, score
passages.js         lessons, English, code, original random-charset drill
app.js              UI, private history, race
icon.mjs            keyboard keys lighting as if typed + 1200×720 cover
build.mjs           packs the GIF into site/apps/typing/typing.gif
vendor/             MIT notice, UPSTREAM pin
```

## What you can type

- **Practice** — a passage, a sliding caret, live net WPM (correct letters
  only) and accuracy, a result at the end. Toggle English / Code. Last 20
  runs stay in the icon (private). On a phone the clock and caret keep the
  current letter above the OS keyboard.
- **Lessons** — home row (left, right, both), then top row, bottom row,
  punctuation, numbers, mixed, and the original random-keys drill.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Same passage seed. Both type. Live WPM. First to finish, or higher WPM if
  both finish. Each person writes **only their own** progress row; the host
  (lowest live id) is the only writer of the shared passage.

On a phone the OS keyboard is the keyboard: a real `<textarea>` sits over the
passage so focus opens it. There is no fake QWERTY.

## capabilities

| capability | why |
|---|---|
| `db` | Private history, and the shared race passage. |
| `multiplayer` | The room. |

No `wasm`, no `network`, no `pointer`. `minBuild` is **947**.

## Building

```bash
node apps/typing/build.mjs
```

Writes `site/apps/typing/typing.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Programmer's Typing Practice — MIT, Copyright 2021 climech. See
[`vendor/COPYING-typing-practice.txt`](vendor/COPYING-typing-practice.txt).
