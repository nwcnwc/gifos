# SVG-Edit

A vector drawing editor as an ordinary sandboxed GifOS app. The drawing is
real SVG, auto-saved inside the app's GIF. Send Invite and the same SVG is
the shared canvas.

The engine is **[SVG-Edit](https://github.com/SVG-Edit/svgedit)** — MIT, the
long-running in-browser SVG editor. This directory is the GifOS port: a
classic IIFE of the published 7.4.2 editor, image URLs inlined as data, and
persistence / invite over `gifos.db`. Default extensions (shape library,
opensave, storage) stay out; they `import()` files the sandbox cannot fetch.

```
index.html              shell: Open / Save SVG / PNG strip, #container
style.css               dark theme, phone toolbar
boot.js                 localStorage stub, image URL resolver, window.open
app.js                  Editor init, gifos.db, invite, file I/O
icon.mjs                procedural pen-draws-a-star icon + 1200×720 cover
vendor/iife-Editor.js   GENERATED. Pinned svgedit IIFE. Never edit.
vendor/images.js        GENERATED. Toolbar / jgraduate images as data URLs.
vendor.mjs              rebuilds vendor/* from npm. The only net step.
build.mjs               packs site/apps/svg-edit/svg-edit.gif
```

## Why this can run as a GifOS app

SVG-Edit 7 ships an IIFE. GifOS inlines `<script src>` and drops
`type="module"`, so that IIFE is the only shape that survives the trip into
a GIF. Toolbar icons have no directory on `about:srcdoc`; `boot.js` resolves
them from `vendor/images.js`. Upstream's localStorage / File System Access
do not exist in the sandbox — the drawing lives in `gifos.db('doc')`.

## capabilities

| capability | why |
|---|---|
| `db` | The SVG (`doc`, shared) and editor prefs (`prefs`, private). |
| `multiplayer` | Invite is a shared SVG. Guests write the same `doc` row. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/svg-edit/vendor.mjs   # only when moving the pin (needs net)
node apps/svg-edit/build.mjs    # -> site/apps/svg-edit/svg-edit.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

MIT, SVG-Edit authors (see AUTHORS). The notice is packed **inside the GIF**
as `COPYING.txt`. jGraduate / the context menu are Apache-2.0
(`COPYING-Apache-2.0.txt`).
