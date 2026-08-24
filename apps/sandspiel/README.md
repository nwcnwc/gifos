# Sandspiel

An unofficial local port of
**[Sandspiel](https://github.com/MaxBittker/sandspiel)** by Max Bittker
(MIT). Pour sand, water, fire, plants. Playing alone is that toy.
Boards you keep stay in the file. Press **Play together**, then
**Invite**, and a meeting room is a wall of saved boards — lean cards,
full grids loaded on tap. No account, no public gallery.

![screenshot](screenshot.png)

```
index.html                 shell: the world, palette, brush, saves, wall
style.css                  warm dark sand, gold accent, friend chrome
species.js                 classic rewrite of crate/src/species.rs + tick
app.js                     paint, pause, undo, private last + named boards
wall.js                    room cards + presence; boards loaded with get()
icon.mjs                   hourglass of sand/water/fire/plant + 1200×720 cover
build.mjs                  packs the GIF into site/apps/sandspiel/sandspiel.gif
vendor/COPYING-sandspiel.txt  Max Bittker MIT notice, packed inside the GIF
vendor/UPSTREAM.txt        pin + what stayed behind
```

## What stayed behind

Upstream is React + webpack. The live loop fetches a hashed
`.module.wasm` from the Rust crate, plus a WebGL fluid / wind field.
Saves and the public gallery went through Firebase. Sentry, ads, and a
service worker sat around that. **None of that ships here.** This copy
is a classic-script rewrite of `species.rs` + the `Universe` tick, with
wind skipped. Grid is 180×120 (the crate’s 300×300 is too heavy in JS).

## capabilities

| capability | why |
|---|---|
| `db` | Last board + named boards (`save`, private). Lean wall cards + presence (`room`, read-write, subscribed). Full packed grids (`boards`, read-write, **not** subscribed — loaded with `get`). |
| `multiplayer` | The wall is a meeting room. Invite is OS chrome — this app never draws its own share sheet. |

No `network`, no `wasm`, no `fullscreen`, no `camera`. `minBuild` is **947**.

## Building

```bash
node apps/sandspiel/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Sandspiel is MIT, Max Bittker, 2018. The notice is packed
**inside the GIF** as `COPYING-sandspiel.txt` as well as living at
`vendor/COPYING-sandspiel.txt`.
