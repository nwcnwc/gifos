# QR Scan

Read a code from a photo. Nothing is uploaded.

An unofficial port of **[jsQR](https://github.com/cozmo/jsQR)** by cozmo
(Apache-2.0). Decode from `gifos.takePhoto` or a dropped image — never a live
camera stream.

```
index.html              shell: take / drop, result, history
style.css               dark tool UI
app.js                  brokered capture + jsQR, private history
icon.mjs                procedural sticker and the 1200×720 cover
build.mjs               packs the GIF into site/apps/qr-scan/qr-scan.gif
vendor/jsQR.js          cozmo/jsQR dist, Apache-2.0, pinned
```

## Why this can run as a GifOS app

The sandbox never hands an app a live camera stream. Upstream's demo page
does — that path is stripped. A still arrives from **brokered** capture
(`gifos.takePhoto`) or a file drop, then jsQR reads the pixels. History lives
in a **private** collection.

## capabilities

| capability | why |
|---|---|
| `db` | History in a `private` collection. |
| `camera` | `gifos.takePhoto` (OS chrome, finished bytes). |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/qr-scan/build.mjs   # -> site/apps/qr-scan/qr-scan.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

The notice is packed **inside the GIF** as well as living here:

- jsQR — Apache-2.0 (`vendor/COPYING-jsqr.txt`)
