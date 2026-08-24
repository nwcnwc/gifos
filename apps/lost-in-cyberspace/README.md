# Lost in Cyberspace

Two seats, one maze. Access codes are the map. No jam server.

An unofficial port of
**[Lost in CYBERSPACE](https://github.com/bartaz/lost-in-cyberspace)** by
Bartek Szopka and Zofia Korcz (MIT, js13kGames 2017). Upstream’s HACKER
view is an A-Frame VR scene that loads `aframe.io` from a CDN. **That
stack stays behind.** The maze generator and the NAVIGATOR terminal are
the original. The HACKER view is a canvas rewrite of the same 8×8
network. Invite is the room.

```
index.html          home / hacker / navigator
style.css           CRT green on black
vendor/network.js   maze + access-code generator (pinned)
maze.js             doors, sectors, timer, win/lose
app.js              seats, Invite room, both views
icon.mjs            procedural icon + 1200×720 cover
build.mjs           packs the GIF into site/apps/lost-in-cyberspace/
vendor/COPYING-lost-in-cyberspace.txt
vendor/UPSTREAM.txt
```

## What you can play

- **Play on this device** — pick HACKER or NAVIGATOR, then switch seats
  without losing the maze. Codes you have already read are waiting on
  the navigator.
- **Play with a friend** — send the invite (top bar; that button is OS
  chrome). One person is the hacker, the other the navigator. The hacker
  can send a code they found; the navigator’s `nmap` fills in **all**
  received codes, not one layer at a time.

## capabilities

| capability | why |
|---|---|
| `db` | Top scores (`save`, private) and the public room (`room`, read-write). |
| `multiplayer` | The room. The invite is the room. |

No `wasm`. No `network`. No WebRTC. `minBuild` is **947**.

## Building

```bash
node apps/lost-in-cyberspace/build.mjs
```

Writes `site/apps/lost-in-cyberspace/lost-in-cyberspace.gif`. The MIT
notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change.

## Licence

Lost in CYBERSPACE — MIT, Copyright (c) 2017 Bartek Szopka & Zofia Korcz.
See [`vendor/COPYING-lost-in-cyberspace.txt`](vendor/COPYING-lost-in-cyberspace.txt).
