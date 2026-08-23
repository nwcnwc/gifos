# CyberChef

An unofficial GifOS port of [CyberChef](https://github.com/gchq/CyberChef) by GCHQ
— the Cyber Swiss Army Knife. Encode, decode, encrypt, hash, compress, parse.
Hundreds of operations, chained as a recipe, entirely on this device.

GCHQ did not endorse this listing. The Apache-2.0 licence and Crown Copyright
notice travel **inside the GIF** (`LICENSE`, `NOTICE`) as well as here, because
a copy of this app that someone was handed is a distribution of CyberChef.

```
boot.js           GifOS shell: localStorage → gifos.db, ChefWorker module load,
                  gifos.assets() inflate of the gzipped engine
icon.mjs          procedural app icon
names.js          generated at pack time: the module bundle list
index.html        generated at pack time from the vendored production HTML
vendor/           GENERATED. The pinned CyberChef production build. Never edit.
vendor.mjs        rebuilds vendor/ from the pin. The only step needing net.
build.mjs         packs all of the above into site/apps/cyberchef/cyberchef.gif
LICENSE           Apache-2.0 (CyberChef's)
NOTICE            Crown Copyright + unofficial-port addendum
```

## capabilities

| capability | why |
|---|---|
| `db` | Favourites, options and saved recipes. CyberChef wrote these to `localStorage`, which the opaque-origin sandbox refuses. `boot.js` presents a Storage-shaped object and flushes it into `gifos.db('prefs')`. |
| `wasm` | ChefWorker / DishWorker / InputWorker are webpack `worker-loader` blob workers, and several operations (Argon2, jq, YARA, …) instantiate WebAssembly. The wasm hatch is `worker-src blob:` + `'wasm-unsafe-eval'` + `connect-src blob: data:`. The network stays unreachable. |

`minBuild` is **1178**, the install-time asset tier: the engine is too big to
inline into the srcdoc (uncompressed main.js + modules is ~39 MB; the GIF
decoder's inflate ceiling is 64 MB, and a 50 MB+ srcdoc kills the tab), so it
rides gzipped under `.assets/` and `gifos.assets()` serves it. No `manifest.assets`
pins — nothing is downloaded. `connect-src` is still `blob: data:` only.

## The port

CyberChef's production build is already a self-contained web app: `index.html` +
`assets/main.js` + lazy `modules/*.js`. Three seams had to be sewn for the sandbox:

**Payload.** `build.mjs` does not inline the JS. Gzipped `main.js` and each
module bundle are packed at `.assets/…`. `boot.js` is the only `<script src>`
the runtime inlines; it inflates the rest and injects `main.js` as an inline
script once the DOM is up.

**Storage.** `localStorage` throws in an opaque-origin srcdoc frame. `boot.js`
installs a Proxy that speaks both `localStorage.favourites` and
`localStorage.setItem`, and persists the map in `gifos.db`. Dark theme is the
default so the first paint matches GifOS.

**Modules.** ChefWorker loads extra operation modules with
`importScripts(docURL + '/modules/' + name + '.js')`. `docURL` here is
`about:srcdoc`, and `importScripts` of a `blob:` URL is blocked by `script-src`
(the wasm hatch does not add `blob:` there). So `boot.js` wraps `Blob`: when
webpack's worker-loader mints the ChefWorker source (it contains
`loadRequiredModules`), every vendored module bundle is appended. They run as
part of the worker script itself — which `worker-src blob:` allows — and
`OpModules` is populated before the first bake. `importScripts` is never
reached. Image.js's bitmap fonts are rewritten to `data:` URLs at pack time
(the worker would otherwise `fetch('assets/fonts/…')` against `about:srcdoc`).

Google Analytics is stripped at pack time. Tesseract/OCR is not vendored: it
fetches a language model, which `connect-src` cannot. HTTP request /
DNS-over-HTTPS / "show on map" fail the same way and say so.

## Building

```bash
node apps/cyberchef/vendor.mjs      # only when moving the upstream pin (needs net)
node --max-old-space-size=8192 apps/cyberchef/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this tree — the catalog is
owned elsewhere. This build writes `site/apps/cyberchef/{cyberchef.gif,cover.jpg,app.json}`
only.

## Licences

Apache-2.0, Crown Copyright 2016–2026. `LICENSE` and `NOTICE` are packed inside
the GIF. Third-party notices from the production bundles (`assets/main.js.LICENSE.txt`,
`modules/*.js.LICENSE.txt`) are concatenated into the packed NOTICE.
