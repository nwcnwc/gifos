# Yopass

Lock a secret. Invite is the one-time room. No Go, no Redis.

An unofficial port of **[Yopass](https://github.com/jhaals/yopass)** by
Johan Haals (Apache-2.0). Upstream is a Go server + Redis + a React
OpenPGP website. **The server is gone.** Ciphertext lives in `gifos.db`.
Invite is the one-time URL. Optional burn-after-read. Optional
passphrase. No accounts.

```
index.html
style.css
crypto.js           Web Crypto AES-GCM + PBKDF2
app.js              lock / open / room
icon.mjs
build.mjs
vendor/COPYING-yopass.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Ciphertext (`room`, read-write) and a private last-secret (`save`). |
| `multiplayer` | The invite is the room. |

No `network`. No `wasm`. `minBuild` is **947**.

## Building

```bash
node apps/yopass/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

Yopass — Apache-2.0. See
[`vendor/COPYING-yopass.txt`](vendor/COPYING-yopass.txt). The notice
rides inside the GIF.
