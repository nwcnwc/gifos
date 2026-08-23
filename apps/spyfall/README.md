# Spyfall

One of you is the spy. The rest of you are at a place.

An unofficial port of **[Spyfall](https://github.com/tannerkrewson/spyfall)** by
tannerkrewson (MIT). Upstream is a Next.js app whose **Node socket room is the
game**: `server.js` boots Express + Socket.IO, `server/Game.js` deals the spy,
the location and the roles, and the browser is a React client of that socket.
**The server is gone.** The GifOS invite is the room. The Node process, the
socket, and every access code stay behind.

```
index.html          home / pass this phone / play with friends
style.css           dark spy chrome, two-column location list
locations.js        Spyfall 1 pack, English names
deal.js             one spy, a shared place, a first question
app.js              deal, timer, private card, public votes
icon.mjs            spy vs location icon + in-round cover (role hidden)
build.mjs           packs the GIF into site/apps/spyfall/spyfall.gif
vendor/COPYING-spyfall.txt
vendor/UPSTREAM.txt
```

## What you can play

- **Pass this phone** — add three or more names, deal. Each person taps their
  own name, looks at their card, and hides it. Hide never opens the next
  card. Then the location list and the timer sit on this device. Marks on
  the list stay on this phone.
- **Play with friends** — send the invite (top bar; that button is OS chrome).
  The people who open it are the room. The host (lowest live id) deals. Each
  person writes only their own row. Your card is stored privately on this
  device. Location marks stay on this phone — they are not votes and they
  are not published. Nobody writes anybody else's row.

Ask questions out loud — in the room, or in a GifOS meeting around the app.
Tap a place to cross it off on this phone. When the time is up, say who
you think the spy is.

## capabilities

| capability | why |
|---|---|
| `db` | Your card (`role`, private) and the public votes (`votes`, read-write). |
| `multiplayer` | The room. The invite is the room. |

No `wasm`. No `network`. `minBuild` is **947**.

Private collections are per-player: the host cannot write your card for you,
so each device derives its own card from the round the host published and
keeps it in `role`. The seed never names the spy or the place as a field on
a public row.

## Building

```bash
node apps/spyfall/build.mjs
```

Writes `site/apps/spyfall/spyfall.gif`. The MIT notice rides inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Spyfall — MIT, Copyright (c) 2020 Tanner Krewson. See
[`vendor/COPYING-spyfall.txt`](vendor/COPYING-spyfall.txt). The notice rides
**inside the GIF** as well, because a copy of this app that someone was
handed is a distribution of that work. The party game Spyfall was designed
by Alexandr Ushan and published by Hobby World; this is an unofficial
digital dealer of that idea, not their product.
