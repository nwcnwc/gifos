# Pool

Classic 8-ball, as an ordinary sandboxed GifOS app. Solo, you play a computer
that tries a handful of shots and picks the best. Two of you can pass the same
screen. Send the invite and a friend takes the other turn, on their own phone
or computer. There is no game server.

The engine is **[Classic Pool Game](https://github.com/henshmi/Classic-Pool-Game)**
by henshmi (Chen Shmilovich) — MIT, a 1500×825 canvas table with red/yellow
8-ball, cushion physics, and a short evolutionary AI. This directory is the
GifOS port: touch pull-back aim, two-device turns, and the packing. Upstream
has no networking and no mobile input.

```
index.html          shell: table canvas, menu, hidden sprite <img>s
style.css           felt-green overlay, letterboxed table
globals.js          `sprites` / `sounds` bags the engine expects
menu-stub.js        Game.js constructs a Menu; we never show it
boot.js             our entry: Web Audio, touch, the netplay system
icon.mjs            procedural table icon and the 1200×720 cover
vendor/*.js         UPSTREAM. Physics, rules, stick, AI. Never edit.
vendor/sprites/     UPSTREAM table (jpeg) + balls + stick
vendor.mjs          rebuilds vendor/* from the pin. The only step needing net.
build.mjs           packs all of the above into site/apps/pool/pool.gif
```

## Why this app can exist at all

Upstream is already a self-contained canvas game: no `localStorage`, no
network, no modules. GifOS's runtime inlines `<script src>` as classic
scripts, and these files already are. The GifOS work is the invite room,
a ghost on the aim line, a table that fills a phone, a finger aiming the
stick, and not shipping the 9 MB jazz track or the menu PNGs.

## capabilities

| capability | why |
|---|---|
| `db` | Sound pref in a `private` collection; shots and the table in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two devices, no game server

The host (the person who opened the app) simulates the balls and writes the
table on **their own row**. The guest writes only a shot — power and angle —
and, after a foul, where they put the white. Nobody writes anybody else's
row.

A subscriber re-downloads the whole collection on every change, so traffic is
O(players²) even for two people. The publish rate is 20 Hz of a handful of
numbers while the balls are moving, not a stream of frames.

When nobody else is in the room the other side is the original computer, or
a second player on this screen. A friend joining starts a fresh game; they
leave and the menu comes back.

## Touch

Upstream is mouse-aim + W/S power + click to shoot, and has no mobile
support. `boot.js` maps a pull-back on the table onto stick rotation and
power: the ball goes the way you pulled away from. A ghost shows the first
ball you will hit. After a foul, drag the white and let go to place it. On
a tall phone the table turns so the long side fills the screen — you stand
at the white, the rack is up the felt.

## Honest limits

- **Host is the physics.** The guest paints what the host published. A delayed
  shot still lands; it just lands a moment later.
- **Two seats.** A third person who opens the link can watch; they do not get
  a stick.
- **No original wavs, menu PNGs, or jazz.** Clicks are oscillators; the menu
  is HTML. The table, the balls, the stick, the 8-ball rules and the computer
  are upstream's.

## Building

```bash
node apps/pool/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/pool/build.mjs       # -> site/apps/pool/pool.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Classic Pool Game is MIT, Copyright (c) 2018 Chen Shmilovich. The notice is
packed **inside the GIF** as well as living here
(`vendor/COPYING-classic-pool-game.txt`), because a copy of this app that
someone was handed is a distribution of that work.
