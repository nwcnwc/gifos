# Mykonos

White houses, a blue dome, a windmill, and the sea. Walk the cobbles. Drag
to turn the island around you. Send the invite and extra people appear on
the same paths.

An unofficial port of **[Mykonos Island Voxels](https://github.com/boona13/mykonos-island-voxels)**
by boona13 — MIT, an isometric island builder. GifOS inlines classic scripts
and drops `type=module`, and a sandboxed app cannot fetch the picture pack,
so that editor cannot ride in. This directory is the walk: the same village,
drawn from the original voxel builders, with orbit and extra people.

```
index.html          canvas, the gate, touch markup
style.css           Mediterranean overlay, letterboxed island
world.js            palette, voxel helpers, the starter village
game.js             walk, orbit camera, cached paint
mp.js               extra people; each pose lives on its own row
touch.js            left stick walks, right drag orbits
boot.js             the gate, Web Audio, wiring
icon.mjs            procedural island icon and the 1200×720 cover
build.mjs           packs all of the above into site/apps/mykonos/mykonos.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Sound pref in a `private` collection; each walker in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Two devices, no game server

Each person writes **only their own pose** on **their own row**. Nobody
writes anybody else's. Remote walkers are drawn a publish interval in the
past so they glide. Playing alone is just the island.

## Touch

Left thumb walks. Right thumb drags to orbit. Pinch zooms. A laptop with a
touchscreen keeps the keyboard until a real finger shows up.

## Building

```bash
node apps/mykonos/build.mjs   # -> site/apps/mykonos/mykonos.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Mykonos Island Voxels is MIT, Copyright (c) 2026 boona13. The notice is packed
**inside the GIF** as well as living here (`vendor/COPYING-mykonos.txt`),
because a copy of this app that someone was handed is a distribution of that
work.
