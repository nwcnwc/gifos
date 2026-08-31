# Breakout

Jake Gordon's canvas Breakout, running as an ordinary sandboxed GifOS app.
Solo it is the original: orange paddle, colourful bricks, three lives. Send
the invite and a second paddle appears on the same wall.

The engine is **[JavaScript Breakout](https://github.com/jakesgordon/javascript-breakout)**
by Jake Gordon — MIT. This directory is the GifOS port: a classic-script
shell around it, a paddle you can drag, a high score in the file, and the
extra paddle. Upstream has no networking.

```
index.html            shell: names/sound off the court, on-screen arrows below it
style.css             dark cabinet, letterboxed 4:3, chrome in the letterbox
vendor/game.js        UPSTREAM. Jake Gordon's runner. Never edit.
vendor/breakout.js    UPSTREAM. Court, paddle, ball, bricks. Never edit.
vendor/levels.js      UPSTREAM. The walls. Never edit.
net.js                extra paddle — presence, shared brick field, the host ball
touch.js              drag + ◀ ▶, written onto the same paddle the keys move
boot.js               mount, prefs, Web Audio, wiring
icon.mjs              procedural paddle-hits-brick icon, and the 1200×720 cover
vendor.mjs            rebuilds vendor/* from the pin. The only step needing net.
build.mjs             packs site/apps/breakout/breakout.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, keyboard state, and soundmanager MP3s. The sandbox
cannot fetch those files (and they are CC-BY-ND, so we would not ship them),
so hits are Web Audio tones. The paving.jpg background and the up/down PNGs
are not shipped — the cabinet is CSS. `connect-src 'none'` then costs it
nothing.

## capabilities

| capability | why |
|---|---|
| `db` | High score / mute / last level in a `private` collection; paddles in a `read-write` one; the ball and brick field in a `read-only` one the host writes. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Extra paddle

Each player owns one row and only ever writes that row. The host simulates
the ball and the bricks and publishes them on `world`. A guest writes only
their paddle `x`; the host puts that paddle in the ball's hit list. Lives
and score are shared. A delayed guest paddle can look like it hit a ball
the host already called a miss — friends on a link, not a tournament.

## Building

```bash
node apps/breakout/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/breakout/build.mjs    # -> site/apps/breakout/breakout.gif
```

## Licence

MIT, Jake Gordon. The notice is packed **inside the GIF** as
`COPYING-javascript-breakout.txt` as well as living here, because a copy of
this app that someone was handed is a distribution of that work. Original
used Freesound samples under CC-BY-ND; this copy synthesises the beeps
instead and does not ship those files.
