# BIP39

Recovery words on this device. They never leave.

An unofficial port of **[bip39](https://github.com/iancoleman/bip39)** by
iancoleman (MIT, v0.5.6). Same tool: generate recovery words, type existing
ones, pick a coin, see the addresses. Word lists ride inside the GIF.

```
index.html                 shell: iancoleman UI, no external URLs
style.css                  original app.css plus the privacy line
icon.mjs                   procedural paper-card icon and the 1200×720 cover
build.mjs                  packs the GIF into site/apps/bip39/bip39.gif
vendor/                    classic scripts, including every wordlist
```

## Why this can run as a GifOS app

Upstream is already an offline page. The GifOS port keeps that: nothing is
fetched, there is no account, and recovery words are not stored. Close the app
and they are gone.

## capabilities

None. Needs nothing newer than the App Store itself, so `minBuild` is **947**.

No `network`. No `wasm`. No `db`.

## Building

```bash
node apps/bip39/build.mjs   # -> site/apps/bip39/bip39.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Notices are packed **inside the GIF** as well as living here:

- iancoleman/bip39 — MIT (`vendor/COPYING-bip39.txt`)
- jsbip39 — MIT (`vendor/COPYING-jsbip39.txt`)
- others — `vendor/NOTICE.txt`
