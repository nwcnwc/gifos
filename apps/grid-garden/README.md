# Grid Garden

A game for learning CSS grid. Solo it is Thomas Park's
[Grid Garden](https://cssgridgarden.com). Progress sits in the GIF. Send the
invite and a friend lands on the same plot.

Upstream is **[thomaspark/gridgarden](https://github.com/thomaspark/gridgarden)**
(MIT, art CC BY 3.0), pinned at `0e262f7`. This directory is the GifOS port:
English levels and the original garden SVGs vendored under `vendor/`, no
jQuery, no webfonts, no analytics.

```
index.html           sidebar + 5×5 garden
style.css            original look, system fonts, phone stack
vendor/levels.js     28 English levels + the harvest
vendor/docs.js       property tooltips (English)
vendor/messages.js   chrome strings (English)
vendor/game.js       the game, vanilla
vendor/images/       carrots, weeds, dirt, water, poison, froggy
net.js               shared plot — level + CSS
boot.js              gifos.db save, Back, launch.level
icon.mjs             watering a carrot, and the 1200×720 cover
build.mjs            packs site/apps/grid-garden/grid-garden.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Private `save` (level, answers, solved). Shared `garden` plot and `players` rows. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/grid-garden/build.mjs   # -> site/apps/grid-garden/grid-garden.gif
```

## Licence

Code MIT, Thomas Park. Art CC BY 3.0, Thomas Park. Both notices ride
**inside the GIF** (`COPYING.txt`, `COPYING-images.txt`).
