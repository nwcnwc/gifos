# Piskel

A pixel and sprite editor that runs as an ordinary sandboxed GifOS app.
Draw frames, preview the animation, export an animated GIF. The sprite
auto-saves on this device, inside the app. There is no piskelapp.com.

The engine is **[Piskel](https://github.com/piskelapp/piskel)** by Julian
Descottes — Apache-2.0, the editor behind piskelapp.com. This directory is
the GifOS port: a local-only shell around it. Upstream's gallery save, login
and App Engine endpoints are gone. `connect-src` is `'none'`.

```
index.html          GENERATED. Upstream markup with static script/link tags.
boot.js             localStorage stand-in over gifos.db; starts the editor
icon.mjs            the procedural app icon
vendor/piskel.js    GENERATED. Pinned upstream as one classic script. Never edit.
vendor/piskel.css   GENERATED. CSS with assets as data URLs.
vendor.mjs          rebuilds vendor/ from the pin. The only step needing net.
build.mjs           packs all of the above into site/apps/piskel/piskel.gif
LICENSE             Apache-2.0 (Piskel's)
NOTICE              unofficial-port addendum
```

## Why this app can exist at all

Piskel is already a concat of classic scripts plus CSS. GifOS's runtime
inlines `<script src>` and drops `type="module"`, so that shape rides into a
GIF as-is. The GifOS work is: persistence through `gifos.db` (the sandbox
has no `localStorage` / IndexedDB), GIF encoding on the main thread (the
sandbox has no workers unless you declare `wasm`), and every piskelapp.com
path closed.

## capabilities

| capability | why |
|---|---|
| `db` | The current sprite, browser saves, backups, palettes and settings. Private. |

No `network`. No `wasm`. gif.js and Piskel's hash/colour workers run on the
main thread via a FakeWorker; blob workers are the wasm hatch, and this app
does not need it.

`minBuild` is **947**, the App Store itself. The only OS feature this app
needs is `gifos.db`, which is older than the store.

## What is kept between launches

The current animation (restored from the latest backup snapshot), named
browser saves, palettes, and editor prefs (grid, background, default size,
GIF loop, …) — private collections in `gifos.db`. File > Save as .piskel and
Export as GIF/PNG/ZIP are how you take a copy with you.

## Honest limits

- **Local only.** There is no piskelapp gallery, no login, no public sprite.
  Save in Browser writes to this device. The listing does not claim otherwise.
- **No popup preview window.** `window.open` is not a sandbox thing; the
  in-app preview still plays.
- **GIF export is on the main thread.** Large, many-colour sprites will hitch
  the UI while the encoder runs. Pixel-art sizes are the point of the tool.
- **Desktop (NW.js) file paths are not here.** Save as .piskel uses a
  download, the same as the browser build.

## Building

```bash
node apps/piskel/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/piskel/build.mjs       # -> site/apps/piskel/piskel.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Apache-2.0, Julian Descottes. The notice is packed **inside the GIF** as
`LICENSE` and `NOTICE` as well as living here, because a copy of this app
that someone was handed is a distribution of that work. No upstream PR:
this is an unofficial port.
