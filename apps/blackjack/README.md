# Blackjack

Beat the dealer to 21. Invite is extra seats. No cash.

An unofficial port of **[blackjack](https://github.com/hanhaechi/blackjack)** by hanhaechi (MIT). Upstream is vanilla JS plus jQuery, Bootstrap, a PNG deck, and AJAX to a sample API. **The server is gone.** The dealer runs in the host browser. Cards are CSS.

```
index.html          felt, dealer, seats, deal / hit / stand
style.css           dark felt, CSS cards
casino.js           destack of the 52-card shoe
blackjack.js        destack of Game (deal, hit, stand, aces)
app.js              solo table + extra seats, private chips
icon.mjs            procedural 21 icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/blackjack/blackjack.gif
vendor/COPYING-blackjack.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Chips (`save`, private) and the table (`room`, read-write). |
| `multiplayer` | Extra seats. Invite is OS chrome. |

No `wasm`. No `network`. `minBuild` is **947**.

## Building

```bash
node apps/blackjack/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

blackjack — MIT, Copyright (c) 2018 - Modesta Naciute. See
[`vendor/COPYING-blackjack.txt`](vendor/COPYING-blackjack.txt).
