# Hanzi Writer

An unofficial port of **[Hanzi Writer](https://github.com/chanind/hanzi-writer)**
by David Chanin (MIT). Chinese character stroke-order tracing: a square, your
finger, the strokes in order. HSK 1–3 ride inside the GIF. Close it, come back —
progress is still there. Invite traces the **same** character.

Upstream loads each glyph from a CDN. GifOS has nowhere to fetch from, so
`vendor/chars.js` is the 618 HSK 2.0 unique characters (plus 永) packed as a
classic script, and `charDataLoader` never leaves the file. The library is
`vendor/hanzi-writer.min.js` 3.7.2, canvas renderer (SVG clip-path would
resolve against `about:srcdoc`).

```
index.html          home / lobby / quiz / done
style.css           dark #0a0a0f, 米 grid, huge trace square
app.js              quiz + gifos.db + same-character race
icon.mjs            永 written stroke by stroke + 1200×720 cover
build.mjs           packs site/apps/hanzi-writer/hanzi-writer.gif
vendor/hanzi-writer.min.js
vendor/chars.js     HANZI_DATA / HANZI_LEX / HANZI_LEVELS
vendor/COPYING-hanzi-writer.txt
vendor/ARPHICPL.TXT
```

## Drill

- HSK 1 (178), HSK 2 (168), HSK 3 (272), or Review.
- Outline on/off. Pinyin before or after.
- Watch, Retry, Skip. A miss waits in Review.
- Jump to a character, or a link `go.char=好`.

## Versus

Invite is **OS chrome**. Play a friend opens a lobby. When a second person
opens the link, both trace the **same** shuffled deck, the **same** current
character. Each person writes **only their own** `players` row. First to ten
clean traces wins.

## capabilities

| capability | why |
|---|---|
| `db` | Solo progress, private, inside the icon. |
| `multiplayer` | Shared match + per-player stroke rows. `minBuild` **947**. |

No `network`. The characters are in the GIF. No `wasm`, no `pointer`.

## Building

```bash
node apps/hanzi-writer/build.mjs
```

Writes `site/apps/hanzi-writer/hanzi-writer.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change.

## Licence

MIT, David Chanin — packed as `COPYING-hanzi-writer.txt`. Stroke data is
Arphic Public License — `ARPHICPL.TXT` unaltered inside the GIF.
