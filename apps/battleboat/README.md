# Battleboat

Two devices, one link, no game server. Hide a fleet. Sink theirs.

An unofficial port of **[Battleboat](https://github.com/billmei/battleboat)** by
Bill Mei (MIT). The computer is his probability AI, running on this device.
The Google Fonts, image assets, `localStorage`, and `alert`s are rewritten so
nothing is loaded from the network. On a phone the hunt board sits on top and
your fleet shrinks — the original page is desktop-only.

```
index.html                  setup / computer / play a friend
style.css                   navy grids, no webfont, no images
game.js                     10×10, five ships, Bill Mei's AI
net.js                      two fleets over gifos.db (own row only)
app.js                      placement, solo loop, friend wiring
icon.mjs                    procedural icon + 1200×720 cover
build.mjs                   packs the GIF into site/apps/battleboat/battleboat.gif
vendor/COPYING-battleboat.txt
vendor/UPSTREAM.txt
```

## What you can play

- **Computer** — the original hunter. Place the five ships (or scatter them),
  then tap the other map. It fires back at once.
- **Play a friend** — press Invite in the bar above (that button is OS chrome).
  Each person hides a fleet on their own device. Ship positions never leave
  this device. Each person writes only their own shots and the revealed
  cells of their own fleet. Hits and misses show up on both screens.

A game against the computer keeps a win / hit tally on this device.

## capabilities

| capability | why |
|---|---|
| `db` | Stats (private), hidden ships during a friend game (private), player rows (read-write). |
| `multiplayer` | The room. |

No `wasm`, no `network`. `minBuild` is **947**.

## Building

```bash
node apps/battleboat/build.mjs
```

Writes `site/apps/battleboat/battleboat.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json` is
owned elsewhere.

## Licence

Battleboat — MIT, Copyright (c) 2014 Bill Mei. See
[`vendor/COPYING-battleboat.txt`](vendor/COPYING-battleboat.txt).
