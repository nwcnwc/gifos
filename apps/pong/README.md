# Pong

The original canvas Pong, as an ordinary sandboxed GifOS app. Solo, you play a
simple computer paddle. Send the invite and a friend takes the other side, on
their own phone or computer. There is no game server.

The engine is **[JavaScript Pong](https://github.com/jakesgordon/javascript-pong)**
by Jake Gordon — MIT, a 640×480 canvas court with a predictive CPU and first
to nine. This directory is the GifOS port: touch, two-device play, and the
packing. Upstream has no networking and no mobile input.

```
index.html          shell: names/sound off the court, on-screen arrows below it
style.css           black court, letterboxed 4:3, chrome in the letterbox
boot.js             our entry: Web Audio, touch, juice, the netplay system
icon.mjs            procedural CRT-green icon and the 1200×720 cover
vendor/game.js      UPSTREAM. Jake Gordon's runner. Never edit.
vendor/pong.js      UPSTREAM. The court, paddles, ball, CPU. Never edit.
vendor.mjs          rebuilds vendor/* from the pin. The only step needing net.
build.mjs           packs all of the above into site/apps/pong/pong.gif
```

## Why this app can exist at all

Upstream is already a self-contained canvas game: no `localStorage`, no
network, no modules. GifOS's runtime inlines `<script src>` as classic
scripts, and these two files already are. The GifOS work is persistence
through `gifos.db`, the invite room, and making a finger on glass move a
paddle.

## capabilities

| capability | why |
|---|---|
| `db` | Sound pref in a `private` collection; paddle/ball state in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two devices, no game server

The host (the person who opened the app) simulates the ball and writes it on
**their own row**, along with the score. The guest writes only their paddle
`y`. Nobody writes anybody else's row — anyroad's rule, and the one that lets
this work with no authority to arbitrate.

A subscriber re-downloads the whole collection on every change, so traffic is
O(players²) even for two people. The publish rate is 20 Hz of a handful of
numbers, not a stream of frames. The guest dead-reckons the ball between
host snapshots so it does not stutter.

When nobody else is in the room the right paddle is the original CPU, which
aims with a reaction delay and an error that grows as it pulls ahead. A
friend joining turns that paddle into theirs and resets the score; they
leave and the CPU takes it back.

## Touch

Upstream is keys only (Q/A left, P/L right) and its own README says there is
no mobile support. A drag on the court sets paddle `y` and carries english
from the swipe, the way a moving paddle does on keys. On a coarse pointer,
hold-to-move arrows sit in the letterbox *below* the court — never on it —
so a phone is playable without covering the rally. Wins against the computer
live in `gifos.db`, so they are still there when you come back.

## Honest limits

- **Host is the physics.** A delayed guest paddle can look like it hit a ball
  the host already called a miss. This is table tennis with a friend over a
  link, not a tournament.
- **Two seats.** A third person who opens the link can watch; they do not get
  a paddle.
- **No original wavs or menu PNGs.** Beeps are square waves; the menu is
  drawn. The court, the CPU and the first-to-nine are upstream's.

## Building

```bash
node apps/pong/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/pong/build.mjs       # -> site/apps/pong/pong.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

JavaScript Pong is MIT. The notice is packed **inside the GIF** as well as
living here (`vendor/COPYING-javascript-pong.txt`), because a copy of this
app that someone was handed is a distribution of that work.
