# KeeWeb

A local KeePass vault. Open a `.kdbx`, or start a new one; copy a password —
this app never fills another site, and nothing is uploaded.

An unofficial port of **[KeeWeb](https://github.com/keeweb/keeweb)** by Antelle
(MIT). The GifOS surface is a three-pane vault over **kdbxweb** (the same
library KeeWeb uses to read and write `.kdbx`) plus a pure-JS Argon2 from
`@noble/hashes`. KeeWeb's storage plugins and autofill are not here.

```
index.html      lock screen + three-pane vault
style.css       dark KeeWeb-green UI
app.js          groups, entries, copy, generator, TOTP, import/export
icon.mjs        procedural key icon
vendor.mjs      rebuilds vendor/kdbxweb.js + vendor/argon2.js from the pins
build.mjs       packs the GIF into site/apps/keeweb/keeweb.gif
vendor/kdbxweb.js   GENERATED. kdbxweb 2.1.1 UMD. Never edit.
vendor/argon2.js    GENERATED. @noble/hashes Argon2 IIFE. Never edit.
```

## Why this can run as a GifOS app

KeeWeb itself talks to Dropbox, Google Drive, OneDrive, WebDAV, a plugin
gallery, and a browser-autofill channel. A sandboxed GifOS app has
`connect-src 'none'` and must not fill other sites, so those plugins are not
shipped. What remains is the part that already ran locally: a KeePass file,
unlocked with a master password (and an optional key file), edited in this
tab, saved into `gifos.db`.

Argon2 is **pure JS**, not WASM: KDBX4 files unlock without `capabilities.wasm`.
A vault KeePass created with a heavy KDF (tens of MB) will take a few seconds
in JS; new vaults use kdbxweb's 1 MiB / 2-iteration default.

## Plugins stripped

Not in this app, on purpose:

- Dropbox storage
- Google Drive storage
- OneDrive storage
- WebDAV storage
- plugin gallery / remote plugins
- KeePassHTTP and any autofill into other sites

Copy username, password, URL or a TOTP code to the clipboard. That is the
whole hand-off.

## capabilities

| capability | why |
|---|---|
| `db` | encrypted `.kdbx` bytes live in `gifos.db('vault')`, private, inside the icon. Needs nothing newer than the App Store itself, so `minBuild` is **947**. |

No `network`, no `wasm`. The master password is never stored.

## Building

```bash
node apps/keeweb/vendor.mjs      # only when moving the kdbxweb / noble pin (needs net)
node apps/keeweb/tools/make-screenshot.mjs
node apps/keeweb/build.mjs       # -> site/apps/keeweb/keeweb.gif
```

## Licences

All three notices are packed **inside the GIF** as well as living here:

- KeeWeb — MIT (`vendor/COPYING-keeweb.txt`)
- kdbxweb — MIT (`vendor/COPYING-kdbxweb.txt`)
- @noble/hashes — MIT (`vendor/COPYING-noble-hashes.txt`)
