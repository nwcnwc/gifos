# Flexbox Froggy

An unofficial port of **[Flexbox Froggy](https://github.com/thomaspark/flexboxfroggy)**
(Thomas Park, MIT; frog and lilypad art CC BY 3.0). Write CSS flexbox to hop
frogs onto lilypads. Twenty-four levels. Progress lives in the file. Send the
invite and a friend lands in the same pond — you share the CSS, the frogs hop
on both screens.

```
index.html          sidebar editor + pond
style.css           original greens, system fonts, phone stack
vendor/levels.js    English extract of the 24 levels + docs
vendor/images/      frog and lilypad SVGs
game.js             vanilla port of the original game.js
net.js              shared pond — own-row seq, presence frogs
boot.js             gifos.db save + wiring
icon.mjs            hopping-frog sticker + 1200×720 cover
build.mjs           packs site/apps/flexbox-froggy/flexbox-froggy.gif
```

jQuery, animate.css, Google Fonts, ads, and analytics are not shipped.
Fifty locale strings were dropped (they were 640 KB); the puzzles are
the English originals.

## capabilities

| capability | why |
|---|---|
| `db` | Level, answers, solved, settings in a private `save`. Pond-mates in `players`. |
| `multiplayer` | The room. Invite is OS chrome. |

`minBuild` is **947**.

## Building

```bash
node apps/flexbox-froggy/build.mjs
```

## Licence

Code MIT, Thomas Park. Images CC BY 3.0, Thomas Park. Both notices ride
inside the GIF as `COPYING-flexboxfroggy.txt` and `COPYING-images.txt`.
