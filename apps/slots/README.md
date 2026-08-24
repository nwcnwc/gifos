# Slots

Pull the lever. Five reels, toy credits, no cash. Invite and the meeting sees the same spin.

An unofficial port of **[html5-slot-machine](https://github.com/johakr/html5-slot-machine)** by johakr (MIT). Upstream is a Web Animations proof of concept with a photo background, a bootstrap reboot CDN, and a Star Wars–style icon pack (KPD Media; redistribution of that pack is not allowed). **The pack stays behind.** This copy draws fruit-machine symbols, runs offline, and saves the credit pile in the file.

```
index.html          shell: jackpot, five reels, spin, autoplay
style.css           dark felt, gold payline
symbols.js          fruit SVGs as data URLs
slot.js             Reel / Symbol / Slot — Web Animations, destacked
app.js              credits, payline, private save
mp.js               room: the same reels, on own rows
icon.mjs            procedural lever icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/slots/slots.gif
vendor/COPYING-slots.txt
vendor/UPSTREAM.txt
```

## What you can play

- **On this device** — pull, autoplay, toy credits. The pile comes back with the file.
- **With friends** — send the invite (top bar; that button is OS chrome). Anyone can pull. Everyone watches the same reels. Credits stay on this device.

## capabilities

| capability | why |
|---|---|
| `db` | Credits (`save`, private) and the live spin (`room`, read-write). |
| `multiplayer` | The room. The invite is the room. |

No `wasm`. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/slots/build.mjs
```

Writes `site/apps/slots/slots.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

html5-slot-machine — MIT, Copyright (c) 2017 Johannes Kronmüller. See
[`vendor/COPYING-slots.txt`](vendor/COPYING-slots.txt). The notice rides
**inside the GIF** as well.
