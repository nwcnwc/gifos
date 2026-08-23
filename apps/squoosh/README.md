# Squoosh

Drop a photo, pick a format, drag the quality — the smaller file comes back
on this device. Unofficial port of
[Squoosh](https://github.com/GoogleChromeLabs/squoosh) (GoogleChromeLabs,
Apache-2.0): the same WASM encoders, sealed in a GIF, with Google Analytics
stripped and no path out to a server. The picture you drop in never leaves
this browser.

Upstream is a website. This is not their UI. We take the codecs (MozJPEG,
libwebp, libavif, libjxl, OxiPNG, QOI) and write our own shell.

## What rides where

| codec | where | bytes |
|---|---|---|
| MozJPEG | **in the GIF** under `.assets/` | 251,948 |
| WebP | **in the GIF** under `.assets/` | 298,327 |
| AVIF | **in the GIF** under `.assets/` | 2,818,173 |
| JPEG XL | **in the GIF** under `.assets/` | 1,345,677 |
| OxiPNG | **in the GIF** under `.assets/` | 147,017 |
| QOI | **in the GIF** under `.assets/` | 16,577 |
| on-demand pins | **none** | — |

None of them meets the 8 MB asset-pin floor (`scripts/build-app-catalog.mjs`,
`docs/providers.md`): the pin tier is for weights in the tens of MB, and
Squoosh's largest encoder (AVIF) is 2.7 MB. They all travel inside the GIF.
`gifos.assets()` serves the bytes as a zero-copy transfer so they never
become a `data:` URL in the srcdoc (pdf-tables-ocr's lesson). Glue is
rewritten onto `window.SQUOOSH_*` because the runtime inlines `<script src>`
as a classic script and the upstream glue is ESM.

The app has no network of its own (`connect-src` is blob/data only, for the
wasm hatch). Images stay in memory for the session; only format / quality /
resize prefs are written to `gifos.db('prefs')`.

## Engine

Vendored from GoogleChromeLabs/squoosh at pin
`e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3` (see
[`vendor/UPSTREAM.txt`](vendor/UPSTREAM.txt)). Single-threaded builds only —
the MT variants spawn pthreads the sandbox would have to host.

Emscripten's embind glue uses `new Function` to mint invokers. The app CSP
has `'wasm-unsafe-eval'` and not `'unsafe-eval'`, so `build.mjs` rewrites
those sites to ordinary functions before packing. A leftover `new Function` /
`eval(` after the rewrite fails the build, and a 2×2 smoke encode of every
codec runs in Node so a broken factory does not ship.

## Build

```bash
node apps/squoosh/vendor.mjs     # only when the codec pin moves (needs net)
node apps/squoosh/build.mjs      # -> site/apps/squoosh/squoosh.gif
```

Do **not** run `scripts/build-app-catalog.mjs` from this work — the catalog
index is shared. `build.mjs` writes
`site/apps/squoosh/{squoosh.gif,app.json,cover.jpg}`.

Not signed in this environment (no private key) — sign via `site/sign.html`
and re-commit the GIF to light the badge.

## capabilities

| capability | why |
|---|---|
| `wasm` | Instantiate the encoders (`'wasm-unsafe-eval'`). |
| `db` | Last format / quality / lossless / resize in `prefs`. Private. |

`minBuild` **1178** — `gifos.assets()` for packed `.assets/` files. An older
runtime has no way to hand the codecs over without inlining them as `data:`
URLs.

## Licences

Apache-2.0 for Squoosh and these codecs. MozJPEG and OxiPNG also carry their
own codec notices. Full text rides **inside** the GIF
(`COPYING-squoosh.txt`, `LICENSE-mozjpeg.md`, `LICENSE-oxipng.md`).
