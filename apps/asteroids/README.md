# Asteroids

The original triangle-versus-rocks, running as an ordinary sandboxed GifOS
app. Solo it is Doug McInnes's HTML5 Asteroids. Send the invite and extra
ships appear in the same field.

The engine is **[HTML5 Asteroids](https://github.com/dmcinnes/HTML5-Asteroids)**
by dmcinnes — MIT, a canvas port of the arcade game. This directory is the
GifOS port: a classic-script shell around it, thumb buttons, and the extra
ships. Upstream has no networking.

```
index.html      canvas, HUD, scoreboard, touch markup
style.css       overlay chrome
vendor/game.js  the original game, vanilla. Never fetch it at runtime.
net.js          extra ships — presence, rock claims, the scoreboard
touch.js        THRUST / LEFT / RIGHT / FIRE, written into KEY_STATUS
boot.js         mount, prefs, wiring
icon.mjs        procedural ship shooting a rock, and the 1200×720 cover
build.mjs       packs site/apps/asteroids/asteroids.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, keyboard state, and two WAV files. The sandbox cannot
fetch those WAVs, so shots and explosions are Web Audio tones. jQuery 1.4 and
the Vector Battle typeface are not shipped — the game never needed them once
the HUD is `fillText`. `connect-src 'none'` then costs it nothing.

## capabilities

| capability | why |
|---|---|
| `db` | High score / mute in a `private` collection; pilots in a `read-write` one; rocks in a `read-only` one the host writes. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Extra ships

Each pilot owns one row and only ever writes that row. The host simulates the
rocks (and the saucer) and publishes them on `world`. A guest who shoots a
rock claims the hit on their own row; the host applies it. Friendly fire is
off unless the host turns it on — then the target still decides its own
death.

## Building

```bash
node apps/asteroids/build.mjs   # -> site/apps/asteroids/asteroids.gif
```

## Licence

MIT, Doug McInnes. The notice is packed **inside the GIF** as
`COPYING-html5-asteroids.txt` as well as living here, because a copy of this
app that someone was handed is a distribution of that work. Original used
two Freesound samples; this copy synthesises the beeps instead.
