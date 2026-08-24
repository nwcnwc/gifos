# Vintage Poker

Texas Hold'em. Host is the dealer. Invite is the seats. Toy chips, no cash.

An unofficial port of
**[Vintage Poker](https://github.com/Pobermeier/vintage-poker)**
by Patrick Obermeier (MIT). Upstream is a MERN site: React, Node, Express,
Mongo, JWT, socket.io. **The server is gone.** The host's browser deals.
Cards are CSS glyphs.

```
index.html
style.css
poker.js            52-card shoe, best-five-of-seven, table
app.js              solo bots + friend seats
icon.mjs
build.mjs
vendor/COPYING-vintage-poker.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | Chip pile (`save`, private) and the table (`room`, read-write). |
| `multiplayer` | Seats. Invite is OS chrome. |

No `network`. `minBuild` is **947**.

## Building

```bash
node apps/vintage-poker/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
