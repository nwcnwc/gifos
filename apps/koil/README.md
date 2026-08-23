# Koil

Old-school raycasting in a small tiled hall: a checkerboard floor that
brightens as it recedes, mint walls with dark windows, a line of keys and a
bomb on the ground. Walk, pick them up, throw the bomb. Send the invite and
other people appear down the same corridor.

An unofficial port of **[Koil](https://github.com/tsoding/koil)** by tsoding
(Alexey Kutepov), MIT. Upstream is a WASM client talking to a C WebSocket
server. This directory is the GifOS port: the same world, in classic scripts,
with the server removed.

```
index.html      canvas, the gate, touch markup, packed textures and sounds
style.css       gate / HUD / touch
game.js         raycaster, map, items, bombs, particles — from client.c + common.c
net.js          gifos.db presence, item claims, thrown bombs
touch.js        left stick walks, right drag looks, Throw
boot.js         the gate, the loop, audio
icon.mjs        procedural corridor icon + 1200×720 cover
build.mjs       packs site/apps/koil/koil.gif
assets/         wall / player / bomb / key / particle, and the four sounds
COPYING.txt     upstream MIT notice (packed inside the GIF)
```

## The server was removed

Upstream's multiplayer is a dedicated process. `serve.js` starts
`./build/server` (C, `src/server.c`) and an `http-server` on port 6969; the
browser opens a WebSocket to port 6970 (`SERVER_PORT` in `common.h` /
`client.mts`). GitHub Pages cannot run that server, so the public demo
(`tsoding.github.io/koil`) immediately closes the socket and walks the map
alone.

That whole path is gone here. There is no listen, no `WebSocket`, no
localhost:6969/6970. Solo still walks the map — the original offline mode,
the one the Pages demo already used. A room is the GifOS invite: each player
writes their own row in `gifos.db('players')` (pose, the items they picked
up, bombs they threw). Nobody writes anybody else's row. A bomb on someone
else's row is spawned locally and simulated here; an item they claim is
killed locally. First claim this client sees wins.

The invite itself is OS chrome. This app never draws a share button.

## capabilities

| capability | why |
|---|---|
| `db` | Private prefs; the shared `players` collection. |
| `multiplayer` | The room. |

No `network`. The original game's only network was the game server, and that
server is not here. No `pointer` (minBuild 947 — pointer lock arrived later,
and this game turns with keys / a thumb, not a locked mouse). No `wasm`:
the renderer is the C raycaster rewritten as a classic script.

## Controls

- Computer: **WASD** or **arrows** to walk and turn, **Space** to throw.
- Phone: left thumb walks (forward/back and strafe), right thumb looks, **Throw**.

Upstream had a TODO for mobile controls and never shipped them.

## Honest limits

- **6 Hz.** A subscriber re-downloads the whole collection on every change, so
  traffic is O(players²). Remote players are drawn a publish interval in the
  past so they glide. Comfortable with a handful of people in the hall.
- **Trusting clients.** Item pickups and bomb throws are claims on your own
  row. A modified client could ignore them. The room is people you sent a
  link to.
- **The map is tiny**, because upstream's map is tiny: a 7×7 block of walls,
  six items, bombs that bounce and burst. Keys do not unlock anything.
  That is the game as published.
- Software rendering on a 2D canvas, as upstream intended — no GPU. On a
  slow phone the backbuffer shrinks so the corridor still moves.

## Building

```bash
node apps/koil/build.mjs       # -> site/apps/koil/koil.gif
```

## Licences

Upstream MIT (`COPYING.txt`) and the sound credits (`COPYING-sounds.txt`)
are packed **inside** the GIF as well as living here. A copy of this app
that someone was handed is a distribution of that work.
