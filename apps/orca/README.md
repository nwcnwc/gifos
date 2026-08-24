# Orca

A livecoding sequencer. Each letter is an operator. The grid is the save.

An unofficial port of **[Orca](https://github.com/hundredrabbits/Orca)** by
Hundredrabbits (MIT). The browser PWA, wrapped: same operators, same canvas.
UDP/OSC stay silent. MIDI is optional — without a device, notes play here as
square waves. First boot loads a tiny `D4` / `:04C` program so a stranger hears
a C without reading the manual.

```
index.html          shell
style.css           Invite line on top of upstream CSS
shim.js             require() stub + localStorage stand-in
boot.js             start the client, save the grid
icon.mjs            procedural icon and the 1200×720 cover
build.mjs           packs the GIF into site/apps/orca/orca.gif
vendor/             unmodified Orca sources + one clock.js patch
```

## Why this can run as a GifOS app

Upstream is already classic scripts. The GifOS port remaps `localStorage` and
the `.orca` file onto a **private** collection, and runs the clock on the main
thread (no blob worker). Press **Invite** (OS chrome) to look together.

## capabilities

| capability | why |
|---|---|
| `db` | The grid in a `private` collection. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/orca/build.mjs   # -> site/apps/orca/orca.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

The MIT notice is packed **inside the GIF** as well as living here:

- Orca — MIT (`vendor/COPYING-orca.txt`)
