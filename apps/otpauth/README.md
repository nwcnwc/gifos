# OTP Auth

Authenticator codes that live in this file. Paste an `otpauth://` link or a
secret; codes refresh every 30 seconds; tap to copy. Nothing is uploaded, and
an invite does not share a secret.

The generator is **[OTPAuth](https://github.com/hectorm/otpauth)** 9.4.1 by
Héctor Molinero Fernández (MIT). This directory is the GifOS authenticator
around it: a private account list, Aegis JSON import/export, and a backup QR
per account (qrcodejs). KeeWeb is passwords; this is only the login codes.

```
index.html      list, add/edit sheet, backup QR, ask dialog
style.css       dark teal authenticator
app.js          TOTP/HOTP, private gifos.db, import/export
icon.mjs        ring that empties, digits that flip; 1200×720 cover
build.mjs       packs site/apps/otpauth/otpauth.gif
vendor/otpauth.umd.min.js   OTPAuth 9.4.1 UMD. Never fetch.
vendor/qrcode.js            backup QR only. Never fetch.
```

## Why this can run as a GifOS app

OTPAuth is already a browser library. The sandbox never needs the network:
secrets are typed or pasted, HMAC is noble-hashes inside the UMD, and the
account list is `gifos.db('accounts')` with visibility **private**. Multiplayer
is omitted on purpose — a shared collection of secrets would be a defect.

The GIF is the save. A copy of the file is a copy of the authenticator.

## capabilities

| capability | why |
|---|---|
| `db` | Accounts and prefs, both `private`. Needs nothing newer than the App Store, so `minBuild` is **947**. |

No `network`, no `multiplayer`, no camera. Add is paste / type / import, not a live scan.

## Building

```bash
node apps/otpauth/build.mjs   # -> site/apps/otpauth/otpauth.gif
```

## Licences

Notices packed **inside the GIF** as well as living here:

- OTPAuth — MIT (`vendor/COPYING-otpauth.txt`)
- @noble/hashes — MIT (`vendor/COPYING-noble-hashes.txt`)
- qrcodejs — MIT (`vendor/COPYING-qrcodejs.txt`)
- QRCode for JavaScript (Kazuhiko Arase) — MIT (`vendor/COPYING-qrcode-generator.txt`)
