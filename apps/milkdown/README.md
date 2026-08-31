# Milkdown

WYSIWYG markdown as a GifOS app. Type the marks, see the page. The
document lives in the file. Invite is the same page.

The engine is **[Milkdown](https://github.com/Milkdown/milkdown)** by
Mirone (MIT), vendored as `@milkdown/kit` 7.22.1 — commonmark + GFM +
history/clipboard/cursor. Crepe’s Vue / CodeMirror / KaTeX tree is not
shipped: no webfonts, no eval, no network.

```
index.html           thin hud, Write / Source, toolbar, ⋯, link sheet
style.css            the paper is the window, system fonts
app.js               last document, toolbar, source toggle, ⋯ menu
mp.js                invite shares the live page (last write wins)
vendor/milkdown.js   kit IIFE, global Milkdown
vendor/milkdown.css  ProseMirror + table + gapcursor
build.mjs            packs site/apps/milkdown/milkdown.gif
vendor.mjs           rebuilds the pin (network, not part of build)
```

## capabilities

| capability | why |
|---|---|
| `db` | Last document in a `private` collection; the live room in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/milkdown/vendor.mjs   # only to move the pin
node apps/milkdown/build.mjs    # -> site/apps/milkdown/milkdown.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

MIT, Milkdown. The notice is packed **inside the GIF** as
`COPYING-milkdown.txt`.
