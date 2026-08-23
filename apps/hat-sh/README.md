# hat.sh

Encrypt and decrypt files in the tab. Nothing leaves this device.

An unofficial port of **[hat.sh](https://github.com/sh-dv/hat.sh)** by sh-dv
(MIT, v2.3.6). Same v2 file format, so a `.enc` this app writes opens in hat.sh
and the other way around.

```
index.html      shell: encrypt / decrypt / keys
style.css       dark card UI
crypto.js       hat.sh v2: signatures, Argon2id, secretstream, X25519 roles
app.js          drop zone, password / key pair, blob download
icon.mjs        procedural padlock icon
vendor.mjs      rebuilds vendor/sodium.js from the pinned libsodium.js tag
build.mjs       packs the GIF into site/apps/hat-sh/hat-sh.gif
vendor/sodium.js  GENERATED. libsodium.js 0.7.13 browsers-sumo. Never edit.
```

## Why this can run as a GifOS app

hat.sh's crypto is already in-browser (libsodium-wrappers). The GifOS sandbox
refuses WASM by default, so the manifest declares **`wasm`** and the engine
bytes ride **inside the GIF** — `connect-src` stays `'none'`. There is no
network path, which is the whole point of the original.

hat.sh streams the ciphertext through a service worker so a multi-gigabyte file
never sits in RAM. A sandboxed app cannot register a service worker, so this
port uses hat.sh's own Safari path: assemble the blob in memory, then download.
A few-hundred-megabyte file is fine; a multi-gigabyte one may not fit. That
limit is stated in the listing.

## capabilities

| capability | why |
|---|---|
| `wasm` | libsodium's Argon2id / XChaCha20-Poly1305 / X25519 are WASM. Without the declaration the engine cannot instantiate. Needs nothing newer than the App Store itself, so `minBuild` is **947**. |

No `network`, no `db`. Keys live in the tab until you save them.

## Format (hat.sh v2)

Password (symmetric):

```
"zDKO6XYXioc" (11) + salt (16) + secretstream header (24) + chunks
```

Key pair (asymmetric):

```
"hTWKbfoikeg" (11) + secretstream header (24) + chunks
```

Chunks are 64 MiB of plaintext, each sealed with
`crypto_secretstream_xchacha20poly1305` (ABYTES 17). The password becomes a
32-byte key via Argon2id at libsodium's INTERACTIVE ops/mem limits. Sender is
the X25519 *client*, recipient the *server* — same roles as hat.sh's service
worker. v1 (`Encrypted Using Hat.sh`) is detected and refused.

## Building

```bash
node apps/hat-sh/vendor.mjs      # only when moving the libsodium.js pin (needs net)
node apps/hat-sh/build.mjs       # -> site/apps/hat-sh/hat-sh.gif
node scripts/build-app-catalog.mjs
```

## Licences

Both notices are packed **inside the GIF** as well as living here:

- hat.sh — MIT (`vendor/COPYING-hat.sh.txt`)
- libsodium.js — ISC (`vendor/COPYING-libsodium.txt`)
