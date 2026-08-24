# Duck Hunt

The zapper game as a GifOS app. Click/tap ducks. The file is the save.

An unofficial port of **[DuckHunt-JS](https://github.com/MattSurabian/DuckHunt-JS)**
by MattSurabian (MIT). The committed dist (Pixi / Howler / GSAP) is vendored
and hash-pinned. Looks like the 1984 duck-shooting game — unofficial, same
class as floppy-bird / battle-city. Do not ship a trademarked name, logo, or
original console CHR; the sprites are the MIT port's.

`minBuild` is **947**. No wasm, no network. Fetch of the spritesheet is
intercepted and served from inlined bytes. Best score is hooked out of the
vendored `score` setter; replay returns to the gate instead of assigning
`window.location`. Invite writes a pond board of bests (`room`, read-write).

```bash
DUCKHUNT_SRC=/path/to/DuckHunt-JS node apps/duck-hunt/vendor.mjs   # only to move the pin
node apps/duck-hunt/build.mjs
```
