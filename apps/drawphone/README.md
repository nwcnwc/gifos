# Drawphone

Draw a word. Pass it on. Guess what they drew.

An unofficial port of **[Drawphone](https://github.com/tannerkrewson/drawphone)**
by Tanner Krewson (MIT). Upstream is a party game that **needs a Node room** —
Express + socket.io hold the table, shuffle the chains, and store the drawings.
**This copy has no game server.** The Node process, the socket.io room, fabric.js,
and every `localhost:3000` path stay behind. The GifOS meeting is the room.

```
index.html          setup / pass this device / play with friends
style.css           cream paper on dark wood
words.js            Simple words pack, vendored from upstream
game.js             chains, rotation, host applies intents
draw.js             touch pad (finger or mouse), stroke model
app.js              lobby, turns, results
icon.mjs            procedural cat-on-paper icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/drawphone/drawphone.gif
vendor/COPYING-drawphone.txt   upstream MIT notice (also packed inside the GIF)
```

## What you can play

- **Pass this device** — add names, start, hand the phone to whoever is up.
  A splash hides the last turn so the next person does not peek.
- **Play with friends** — send the invite (top bar; that button is OS chrome).
  Everyone who opens it sits at the same table. Two or more to start. Each
  person writes only their own row. The host of the table (lowest live id)
  is the only writer of the board row: a player publishes a word or a
  drawing, the host advances the chain when everyone has sent.
- **Rounds in the file** — a finished chain is saved in `gifos.db('save')`.
  Open the GIF later and the last rounds are still there. Sharing the file
  shares the jokes.

Each chain starts with a simple word (or one you write). Then draw, guess,
draw, guess, until it has been around the table, always ending on a word.
There is no score. The fun is how far it drifted.

Draw with a finger or a mouse. Colours, thickness, undo, clear.

## Why the server is gone

Upstream `server/` *is* the room (codes, host, bots, AWS archive, latin-square
rotation). A sandboxed GifOS app has `connect-src 'none'` and declares **no
`network` capability**, so that process cannot come along. The playable thing
— telephone with pictures — is small enough to run as classic scripts on a
shared collection. Fabric.js / jQuery / socket.io-client stay behind; the pad
is a few pointer events.

The invite button is **OS chrome**. This app never draws one.

## capabilities

| capability | why |
|---|---|
| `db` | The shared table, and a private save slot. |
| `multiplayer` | The room. |

No `wasm`. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/drawphone/build.mjs
```

Writes `site/apps/drawphone/drawphone.gif`. The MIT notice rides inside the
GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Drawphone — MIT, Copyright (c) 2016 Tanner Krewson. See
[`vendor/COPYING-drawphone.txt`](vendor/COPYING-drawphone.txt).
