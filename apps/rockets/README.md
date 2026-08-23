# Rockets

Catch stars in a dark sky. Solo it is you against the clock; send the invite
and a friend lands in the same field.

An unofficial port of **[Rocket Universe](https://github.com/lauthieb/rocket-universe)**
by lauthieb (Laurent Thiebault, MIT). Upstream is a tiny Express + socket.io
demo: a Node process *is* the sky, one star at a time, four arrow keys, 20×20
PNGs redrawn every tick. The GifOS runtime inlines `<script src>` and drops
`type="module"`, and `connect-src` is `'none'`, so that stack cannot come
along. This directory is a rewrite of the playable thing as a polished
classic-script arcade game. **There is no game server.** The host of the
room writes the starfield; each player writes only their own rocket.

```
index.html      canvas, HUD, touch stick, gate
style.css       dark-space chrome
sim.js          pure sky — collect, score, host-only spawn, bumps
net.js          transport — own-row pose/score, host starfield
app.js          loop, stick, WASD, particles, rounds
icon.mjs        procedural rocket-catching-a-star icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/rockets/rockets.gif
vendor/         MIT notice (also packed inside the GIF)
```

## Why this is a rewrite, not a wrap of the demo

Upstream needs Node, Express, socket.io, jQuery, and two Google-font / FA
CDNs, and it plays as a 550×550 box with a single star. Matching that is
losing. Here: a field of stars, a minute on the clock, a high score inside
the icon, a thumb-anywhere stick (or WASD / mouse), combos, gold and comet
stars, and a friend in the same sky from the OS invite. The original's
rule — a rocket overlapping a star collects it, score goes up, the star
is gone — is what `sim.js` keeps, and what the build's vm tests pin.

## capabilities

| capability | why |
|---|---|
| `db` | High score in a `private` collection; rockets in a `read-write` one; the starfield in a `read-only` one the host writes. |
| `multiplayer` | The room. |

No `wasm`. No `network`. No `pointer`. `minBuild` is **947**. The invite
button is **OS chrome** — this app never draws one.

## Who writes what

Nobody writes anybody else's row. Each player publishes pose and score on
their own `gifos.db('players')` record, plus a short ring of star claims.
The host alone writes `gifos.db('sky')` — seed, the live stars (id, x, y,
kind), the round clock, bump resolutions, awards. A guest who reaches a
star claims it on their own row; the host applies the first claim and
refills. Two rockets cannot collect the same star twice. Publish is 8 Hz
with interpolation: a subscriber re-downloads the whole collection on
every change, so the rows stay numbers, never bitmaps.

Bumps: the host resolves overlaps and publishes impulses; each rocket
applies the one aimed at itself. Local bounce covers the gap until that
arrives.

## Honest limits

- **8 Hz.** Remote rockets are drawn a beat in the past so they glide. A
  room of friends over a link, not competitive netcode.
- **Trusting clients.** A guest reports its own pose. The room is people
  you sent a link to.
- **Host is the sky.** If the host leaves, the starfield freezes until
  someone else is the host of a new room.

Opened outside GifOS, it degrades to solo: local sky, a minute, no save.

## Building

```bash
node apps/rockets/build.mjs       # -> site/apps/rockets/rockets.gif
```

`build.mjs` runs vm tests on `sim.js` (collect, score, no double-take,
host-only spawn) before packing. Do not run `scripts/build-app-catalog.mjs`
from this change — `index.json` is owned elsewhere.

## Licence

Rocket Universe is MIT (Laurent Thiebault, 2018). The notice is packed
**inside the GIF** as well as living here, because a copy of this app that
someone was handed is a distribution of that work:
`COPYING-rocket-universe.txt`.
