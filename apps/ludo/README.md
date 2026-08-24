# Ludo

Four-seat Ludo as a GifOS app. Invite is the room. The file is the save.

An unofficial port of **[ludo-game](https://github.com/chukwumaijem/ludo-game)**
by chukwumaijem (MIT). Upstream is React + Electron with a lobby. This
directory is a classic-script rewrite of the race (six to leave, 56 steps
home, capture, extra turn on six). Generic Ludo, not a branded product.

Guests publish presence on join. The host assigns Red, Green, Yellow, Blue
so two people never sit the same colour. Empty seats are skipped.

`minBuild` is **947**. No wasm, no network.

```bash
node apps/ludo/build.mjs
```
