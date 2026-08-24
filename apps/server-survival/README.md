# Server Survival

An unofficial port of
**[Server Survival](https://github.com/pshenok/server-survival)**
by Kostyantyn Pshenychnyy (MIT). Tower defense that is a cloud-architecture
lesson: build infra, survive traffic, learn scaling.

Upstream is native ESM served raw from GitHub Pages, with three.js r128 and
Tailwind loaded from CDNs, plus ~12 MB of soundtrack. **That stack stays
behind.** This copy is classic scripts, vendored three.js, compiled Tailwind,
and the audio packed in the GIF.

```
index.html                 upstream HUD markup, no CDN, no type=module
style.css                  glass panels, tutorial, warnings
shim.js                    memory localStorage (opaque origin)
app.js                     last run / prefs in gifos.db
icon.mjs                   rack + traffic-spike icon and cover
build.mjs                  packs the GIF
vendor.mjs                 pin → bundle / three / tailwind / audio
vendor/three.min.js        three.js r128
vendor/game.js             esbuild IIFE of the ESM graph
vendor/tailwind.css        compiled utilities
vendor/assets/sounds/      menu + game BGM + clicks
```

## capabilities

`db`. `minBuild` **947**. No network. Solo + private save of progress and
settings. The memory `localStorage` shim is a scratch pad; `gifos.db('save')`
is the real persist. A shared match is extra, not this pass. Phone HUD
collapses stacked panels so a thumb can place and upgrade.

## Building

```bash
node apps/server-survival/vendor.mjs   # network; only when the pin moves
node apps/server-survival/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

Server Survival is MIT, Kostyantyn Pshenychnyy, 2025. three.js is MIT.
Notices ride **inside the GIF**.
