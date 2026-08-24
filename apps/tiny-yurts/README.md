# Tiny Yurts

An unofficial port of **[Tiny Yurts](https://github.com/burntcustard/tiny-yurts)**
by burntcustard (MIT). js13k 2023, 4th place. Path-drawing between yurts and
farms. Best score in the file.

![screenshot](screenshot.png)

Upstream is Vite ESM + kontra. The jam `dist/index.html` is a Roadroller
`eval` blob, which the sandbox will not run. `vendor/game.js` is an esbuild
IIFE of `src/main.js`, with a small phone-drag patch (touch counts as a
left-drag, pointer capture). `shim.js` stubs `localStorage`. `boot.js`
hydrates `gifos.db` **before** the game runs, then fits the valley on a
portrait phone.

```
index.html      shim, then boot (game loads after hydrate)
style.css       full-bleed, touch-action none
boot.js         save + roster + portrait fit + Back
icon.mjs        yurt + path + 1200×720 cover
build.mjs       packs site/apps/tiny-yurts/tiny-yurts.gif
vendor/         IIFE, MIT notices
```

## Building

```bash
node apps/tiny-yurts/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

John's MIT notice and kontra's MIT notice are packed inside the GIF.
