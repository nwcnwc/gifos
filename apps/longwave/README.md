# Longwave

A needle on a spectrum. One of you hints. The other finds the mark.

An unofficial port of **[Longwave](https://github.com/cynicaloptimist/longwave)**
by cynicaloptimist / Evan Bailey (MIT). Upstream is a React app that **needs a
Firebase game server**. **This copy has no game server.** The React graph, the
Firebase room, and every socket path stay behind. The GifOS meeting is the room.

```
index.html     setup / two here / play a friend
style.css      dark spectrum, poles, needle
cards.js       the original basic + advanced spectrum cards
rules.js       21-tick line, 4-3-2-0 scoring, seeded deck
app.js         hotseat + psychic/guesser seats
icon.mjs       procedural needle icon + 1200×720 cover
build.mjs      packs the GIF into site/apps/longwave/longwave.gif
COPYING.txt    upstream MIT notice (also packed inside the GIF)
```

## How it is played

- **Two here** — pass the device. Psychic sees the mark, gives a clue, hands
  the device over. Guesser places the needle. Then you swap.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Two seats: psychic and guesser. Each person writes only their own row. The
  host of the board (lowest id) is the only writer of the board row: a player
  publishes an intent (clue, needle, lock, next), the host applies it if it
  is legal.

Seven cards. Dead-on is four points (counted as three, and you keep the card).
Close is three or two. A miss is nothing. The psychic seat passes after each
card.

The invite button is **OS chrome**. This app never draws one.

## Why this is a rewrite, not a vendor of the React stack

Upstream is TypeScript modules: React, Firebase, rc-slider, i18next, color-scheme.
GifOS's runtime inlines `<script src>` and **drops `type="module"`**, so that
graph cannot run in a GIF as-is, and the Firebase server cannot come along
(`connect-src` is `'none'`; the manifest declares **no `network` capability**).
The playable thing — a 21-tick spectrum, a clue, a needle, 4-3-2-0 — is small
enough to draw in classic scripts.

## capabilities

| capability | why |
|---|---|
| `db` | Saved best score, and the shared board. |
| `multiplayer` | The room. |

No `wasm`. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/longwave/build.mjs
```

Writes `site/apps/longwave/longwave.gif`. Do not run
`scripts/build-app-catalog.mjs` from this change — `index.json` is owned
elsewhere.

## Licence

Longwave — MIT, Copyright (c) 2020 Evan Bailey. See
[`COPYING.txt`](COPYING.txt). The notice rides **inside the GIF** as well,
because a copy of this app that someone was handed is a distribution of
that work.
