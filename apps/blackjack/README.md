# Blackjack

Beat the dealer to 21. Invite is extra seats.

An unofficial port of **[blackjack](https://github.com/hanhaechi/blackjack)** by hanhaechi (MIT). Upstream is vanilla JS plus jQuery, Bootstrap, a PNG deck, and AJAX to a sample API. **The server is gone.** The dealer runs in the host browser. Cards are CSS. Your chips live in the file.

```
index.html          felt, dealer, seats, deal / hit / stand / double / split
style.css           dark felt, CSS cards
bj.js               shoe, totals, S17, 3:2, double, split, seating helpers
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
