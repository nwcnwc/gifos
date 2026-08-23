# WiFi Card

Print a card with your WiFi name and password. Nothing is uploaded.

An unofficial port of **[wifi-card](https://github.com/bndw/wifi-card)** by bndw
(MIT). Same `WIFI:` payload, so a phone that can scan wificard.io scans this.

```
index.html              shell: the card, settings, print
style.css               light print-card UI
app.js                  WIFI: payload, QR paint, private last card
mp.js                   optional meeting: the same card, on own rows
icon.mjs                procedural icon and the 1200×720 cover
build.mjs               packs the GIF into site/apps/wifi-card/wifi-card.gif
vendor/qrcode.js        kazuhikoarase/qrcode-generator, MIT, pinned
```

## Why this can run as a GifOS app

Upstream is a public website that never sends the details. The GifOS port keeps
that: `connect-src` stays `'none'`. The last card is stored in a **private**
collection. Press **Invite** (OS chrome) to show the same card in a meeting —
each person writes only their own row; the live host's card is the one shown.

English only. Upstream's translation table is not shipped.

## capabilities

| capability | why |
|---|---|
| `db` | Last card in a `private` collection; the meeting card in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws a share button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/wifi-card/build.mjs   # -> site/apps/wifi-card/wifi-card.gif
```

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licences

Both notices are packed **inside the GIF** as well as living here:

- wifi-card — MIT (`vendor/COPYING-wifi-card.txt`)
- qrcode-generator — MIT (`vendor/COPYING-qrcode.txt`)
