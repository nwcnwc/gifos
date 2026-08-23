# TOSIOS

A top-down IO shooter that runs as an ordinary sandboxed GifOS app. Solo, bats
patrol a dungeon; send the invite and the same dungeon becomes a deathmatch.

Upstream is **[TOSIOS](https://github.com/halftheopposite/TOSIOS)** by
halftheopposite — MIT, PIXI.js + React on the client, and a **Colyseus
GameRoom on a Node server** (plus a Docker image) that *is* the room. This
directory is a faithful thin rewrite of the gameplay: arena, bullets, three
hearts, red bottles, names over heads. **This copy has no game server.** The
Colyseus room, the Docker image, and every socket path stay behind. The GifOS
meeting is the room.

```
index.html          canvas, touch markup, scoreboard
style.css           touch sticks and scores
net.js              transport — presence, hit claims, shot ring, flasks taken
app.js              dungeon, fighters, bullets, bats, touch, the loop
icon.mjs            procedural top-down-shooter icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/tosios/tosios.gif
COPYING-tosios.txt  upstream MIT notice (also packed inside the GIF)
```

## Why this is a rewrite, not a vendor of the Pixi stack

Upstream is TypeScript modules: a React HUD, PIXI for the stage, Colyseus.js
for the wire, TMX maps, a spritesheet. GifOS's runtime inlines `<script src>`
and **drops `type="module"`**, so that graph cannot run in a GIF as-is, and
the Node server cannot come along at all (`connect-src` is `'none'`; the
manifest declares **no `network` capability**). The playable thing — a round
fighter in a dungeon, a staff, hearts, bottles, bats — is small enough to
draw in one classic IIFE. Constants (tile 32, player 32, three lives, fire
rate 800 ms, bullet speed 4) are upstream's.

## capabilities

| capability | why |
|---|---|
| `db` | Player state in a `read-write` collection; unused `prefs` reserved private. |
| `multiplayer` | The room. |

No `network`. No `wasm`. No `pointer` (it is top-down; the mouse aims without
a lock). `minBuild` is **947**, the App Store itself — the only OS feature
this needs is `gifos.db`, which is older than the store.

The invite button is **OS chrome**. This app never draws one.

## Damage

Nobody writes anybody else's row (fps-simple's rule). The shooter decides
what it hit, locally, against the bodies it can see; claims ride on its own
row. The target applies the wound to itself and publishes its own lives. A
claim is deduped on `(shooter, sequence)`.

Publish is 6 Hz with interpolation, the rate the platform actually wants: a
subscriber re-downloads the whole collection on every change.

## Honest limits

- **6 Hz.** Remote fighters are drawn ~166 ms in the past so they glide.
  Deathmatch with friends over a link, not competitive netcode.
- **Trusting clients.** A target applies its own damage, so a modified
  client could decline to die. The room is people you sent a link to.
- **Solo or deathmatch, not both.** Bats are generated locally. In a shared
  room two players would each see private bats in different places, so they
  scatter the moment a second person is present.
- **No team mode, no 90-second round.** Upstream's lobby/timer/team colours
  lived on the Colyseus room. Here a life lost respawns you; the scoreboard
  is kills and deaths.

## Building

```bash
node apps/tosios/build.mjs       # -> site/apps/tosios/tosios.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

TOSIOS is MIT (Aymeric Chauvin, 2022). The notice is packed **inside the
GIF** as well as living here, because a copy of this app that someone was
handed is a distribution of that work: `COPYING-tosios.txt`.
