# Finger Pool

Flick a ball with your finger. Fifteen colours in a triangle, six pockets.
Solo is the original free-for-all. Send the invite and a friend takes the
next turn, on their own phone or computer. There is no game server.

The bounce and the flick are **[fingerPool](https://github.com/victorqribeiro/fingerPool)**
by victorqribeiro — MIT, a canvas table using his sphere-collision code.
GifOS inlines classic scripts and drops `type=module`; these files already
are. This directory is the port: a 2:1 letterboxed table, touch, take-turns
over a meeting, and a score for whose balls went in. Upstream had no rules
and no networking.

```
index.html          shell: table canvas, score, menu
style.css           felt-green overlay, letterboxed table
vendor/Vec2.js      UPSTREAM. 2-D vector.
vendor/Sphere.js    UPSTREAM. Bounce, pockets, the 3-D paint.
game.js             rack, the flick formula, pack for the room
mp.js               take turns; each score lives on its own row
boot.js             menu, Web Audio, the finger, wiring
icon.mjs            procedural table icon and the 1200×720 cover
build.mjs           packs all of the above into site/apps/finger-pool/finger-pool.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Sound pref in a `private` collection; each score in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two devices, no game server

Players take turns, one flick at a time. Whose turn it is is derived from
the live rows: fewest finished shots flicks next, and a player who has
started a shot finishes it. Each person writes **only their own score** on
**their own row**. Nobody writes anybody else's. The table rides on the
shooter's row so the other person can watch.

A friend joining starts a fresh rack; they leave and the menu comes back.

## Touch

Upstream: click or touch a ball, drag, let go. Faster movement is a harder
flick. `boot.js` keeps that on a pointer: grab a ball, flick in the
direction you want it to go. The formula is the original
`l = -max(distance / dt * 12, 7)`.

## Building

```bash
node apps/finger-pool/build.mjs   # -> site/apps/finger-pool/finger-pool.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

fingerPool is MIT, Copyright (c) 2021 Victor Ribeiro. The notice is packed
**inside the GIF** as well as living here (`vendor/COPYING-fingerpool.txt`),
because a copy of this app that someone was handed is a distribution of
that work.
