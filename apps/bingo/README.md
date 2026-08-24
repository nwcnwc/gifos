# Bingo

Call bingo over a meeting. One invite is the hall. No server.

An unofficial port of **[bingo](https://github.com/mihailgaberov/bingo)** by
mihailgaberov (MIT). Upstream is Bingo Bigul: login, a game server, a React
back office, a blower, a card shop. **The server is gone.** The GifOS invite
is the room. Accounts, coins, and the database stay behind.

```
index.html          home / this device / play with friends
style.css           hall green, cream card, red daubs
deal.js             75-ball cards, the bag, the four patterns
app.js              host calls, each device daubs, bingo claims
icon.mjs            procedural card icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/bingo/bingo.gif
vendor/COPYING-bingo.txt
vendor/UPSTREAM.txt
```

## What you can play

- **Play on this device** — you call, you daub. The card fills the phone.
  A line, a column, a diagonal, or the four corners is bingo.
- **Play with friends** — send the invite (top bar; that button is OS chrome).
  The people who open it are the room. The host calls (a ball and a
  flashboard). Everyone else gets a phone-sized card. Each person writes
  only their own row. Your card and your daubs stay on this device. A bingo
  claim is checked against the card and the calls. Nobody writes anybody
  else's row.

**No hints, like a real hall.** The card never marks or glows a called
number — you listen and find it yourself — and a number that was never
called still daubs (mishearing is part of the game). The **Bingo!** button
wakes only once YOUR daubs cover a pattern; the claim check then requires
the claimed line to be fully called (a stray mis-daub elsewhere does not
spoil an honest line, per `deal.js validClaim`). A verified bingo fires
fireworks on every screen.

Call out loud — in the room, or in a GifOS meeting around the app. Every
device also says each call as it arrives (speech synthesis, where allowed).

## capabilities

| capability | why |
|---|---|
| `db` | Your daubs (`card`, private) and the public room (`room`, read-write). |
| `multiplayer` | The room. The invite is the room. |

No `wasm`. No `network`. `minBuild` is **947**.

Private collections are per-player: the host cannot write your card for you.
Each device derives its own card from the round seed the host published.

## Building

```bash
node apps/bingo/build.mjs
```

Writes `site/apps/bingo/bingo.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Bingo Bigul — MIT, Copyright (c) 2016 - 2020 Mihail Gaberov. See
[`vendor/COPYING-bingo.txt`](vendor/COPYING-bingo.txt). The notice rides
**inside the GIF** as well, because a copy of this app that someone was
handed is a distribution of that work.
