# Bowling

Ten pins at the end of the lane. Slide the ball to aim, flick up the lane to
throw. Solo is a full ten-frame game. Send the invite and a friend takes the
next turn, on their own phone or computer. There is no game server.

The alley numbers and the throw are **[bowling](https://github.com/tincoats/bowling)**
by tincoats — MIT, a Babylon.js + Havok demo. GifOS inlines classic scripts
and drops `type=module`, so that engine cannot ride in. This directory is the
port: a canvas alley, a real score sheet, touch, and take-turns over a meeting.
Upstream has no scoring and no networking — it reloaded the page after a throw.

```
index.html          shell: lane canvas, score sheet, menu
style.css           dark alley overlay, letterboxed lane
vendor/layout.js    pin triangle, ball start, the flick formula
game.js             physics, ten-pin scoring, perspective paint
mp.js               take turns; each score lives on its own row
boot.js             menu, Web Audio, the finger, wiring
icon.mjs            procedural alley icon and the 1200×720 cover
build.mjs           packs all of the above into site/apps/bowling/bowling.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Sound pref in a `private` collection; each scorecard in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two devices, no game server

Players take turns, one frame at a time. Whose turn it is is derived from the
live rows: fewest finished frames bowls next, and a player who has started a
frame finishes it. Each person writes **only their own score** on **their own
row**. Nobody writes anybody else's.

A friend joining starts a fresh game; they leave and the menu comes back.

## Touch

Upstream moved the ball left and right, then flicked up the lane to throw.
`boot.js` keeps that: drag sideways to aim, flick toward the pins, let go.
Power is the original `min(40, 20 + dy/8)` impulse.

## Building

```bash
node apps/bowling/build.mjs   # -> site/apps/bowling/bowling.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

bowling is MIT, Copyright (c) 2026 scotty888. The notice is packed **inside
the GIF** as well as living here (`vendor/COPYING-bowling.txt`), because a
copy of this app that someone was handed is a distribution of that work.
