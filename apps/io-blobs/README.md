# IO Blobs

A blob-eat-blob arena that runs as an ordinary sandboxed GifOS app. Solo, a
few wandering blobs drift the field; send the invite and the same arena
becomes a room of people. Food respawns. Spiked balls knock a chunk off a
blob that has grown too big. Space (or Boost on a phone) spends a little
size for a burst of speed.

Upstream is **[example-.io-game](https://github.com/vzhou842/example-.io-game)**
by vzhou842 — MIT, an HTML5 Canvas client talking to a **Socket.IO game
server on Node** that *is* the room (ships, auto-fired bullets, a 60 Hz
tick). This directory is a thin rewrite of the arena as coloured blobs:
pose, size, swallow the smaller ones. **This copy has no game server.**
The Socket.IO room, the Node process, and every socket path stay behind.
The GifOS meeting is the room.

```
index.html      canvas, touch stick, scoreboard
style.css       touch stick and scores
net.js          transport — presence, size, eat claims, food taken
app.js          arena, blobs, food, spikes, wanderers, boost, joystick, the loop
icon.mjs        procedural blob-arena icon + 1200×720 cover
build.mjs       packs the GIF into site/apps/io-blobs/io-blobs.gif
COPYING.txt     upstream MIT notice (also packed inside the GIF)
```

## Why this is a rewrite, not a vendor of the webpack stack

Upstream is ES modules: a webpack client, SVG ships, and `socket.io-client`
against a Node server that owns every body. GifOS's runtime inlines
`<script src>` and **drops `type="module"`**, so that graph cannot run in a
GIF as-is, and the Node server cannot come along at all (`connect-src` is
`'none'`; the manifest declares **no `network` capability**). The playable
thing — a body in an open field that grows when it swallows — is small
enough to draw in one classic IIFE. The arena size (3000) and starting
radius (20) are upstream's; ships and bullets stay behind.

## capabilities

| capability | why |
|---|---|
| `db` | Player pose and size in a `read-write` collection; unused `prefs` reserved private. |
| `multiplayer` | The room. |

No `network`. No `wasm`. No `pointer` (it is top-down; the mouse steers
without a lock). `minBuild` is **947**, the App Store itself — the only OS
feature this needs is `gifos.db`, which is older than the store.

The invite button is **OS chrome**. This app never draws one.

## Eating

Nobody writes anybody else's row (fps-simple's rule). Each player publishes
pose and size on their own `gifos.db` row. The eater decides what it
swallowed, locally, against the bodies it can see; claims ride on its own
row. The target applies the swallow to itself and publishes its own size. A
claim is deduped on `(eater, sequence)`.

Food pellets are generated from one seed so every client sees the same
dots. A pellet you swallow is listed on your row, so it vanishes for
everyone. Publish is 6 Hz with interpolation, the rate the platform
actually wants: a subscriber re-downloads the whole collection on every
change.

## Honest limits

- **6 Hz.** Remote blobs are drawn ~166 ms in the past so they glide. A
  room of friends over a link, not competitive netcode.
- **Trusting clients.** A target applies its own swallow, so a modified
  client could decline to be eaten. The room is people you sent a link to.
- **Solo or people, not both.** Wanderers are generated locally. In a
  shared room two players would each see private wanderers in different
  places, so they scatter the moment a second person is present.

## Building

```bash
node apps/io-blobs/build.mjs       # -> site/apps/io-blobs/io-blobs.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

example-.io-game is MIT (Victor Zhou, 2019). The notice is packed **inside
the GIF** as well as living here, because a copy of this app that someone
was handed is a distribution of that work: `COPYING.txt`.
