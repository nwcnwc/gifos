# QR Code

Type a link or any text, get a code. Nothing is uploaded.

An unofficial port of **[qrcodejs](https://github.com/davidshimjs/qrcodejs)** by
davidshimjs (MIT). General maker — wifi-card is Wi-Fi only. Text, URL, phone,
SMS, email, and a vCard contact; last payload + recents in a private collection;
a launch link can open already filled in.

```
index.html              shell: kinds, fields, the code, print / download
style.css               dark chrome around a white code card
app.js                  QRCode.js wrap, encode helpers, private last payload
mp.js                   optional meeting: the same code, read-only
icon.mjs                procedural sticker and the 1200×720 cover
build.mjs               packs the GIF into site/apps/qr-code/qr-code.gif
vendor/qrcode.js        davidshimjs/qrcodejs, MIT, pinned
```

## Why this can run as a GifOS app

Upstream is a library with a demo page. The GifOS port is a complete tool:
`connect-src` stays `'none'`. The last payload is stored in a **private**
collection. Press **Invite** (OS chrome) to show the same code in a meeting —
the room collection is **read-only**, so guests see the host’s code. `launch`
lets a shared URL open the app onto text or a link.

## capabilities

| capability | why |
|---|---|
| `db` | Last payload in a `private` collection; the meeting code in a `read-only` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/qr-code/build.mjs   # -> site/apps/qr-code/qr-code.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Both notices are packed **inside the GIF** as well as living here:

- qrcodejs — MIT (`vendor/COPYING-qrcodejs.txt`)
- QRCode for JavaScript (Kazuhiko Arase) — MIT (`vendor/COPYING-qrcode-generator.txt`)
