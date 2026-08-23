# InvaderZ

Space invaders, except the invaders change shape as you play. Solo it is
Victor Ribeiro's InvaderZ. Send the invite and extra cannons appear on the
same ground.

The engine is **[InvaderZ](https://github.com/victorqribeiro/invaderz)** by
victorqribeiro — MIT. This directory is the GifOS port: a classic-script
shell around it, thumb buttons, and the extra cannons. Upstream has no
networking.

```
index.html              canvas, HUD, scoreboard, touch markup
style.css               overlay chrome
vendor/Invader.js       UNMODIFIED upstream class
vendor/Player.js        UNMODIFIED upstream class
vendor/Genetics.js      UNMODIFIED upstream class
vendor/main.js          original loop, kept for the record, not loaded
game.js                 the GifOS loop (original main.js registered a SW)
net.js                  extra cannons — presence, hit claims, the scoreboard
touch.js                LEFT / RIGHT / FIRE, written into the Player
boot.js                 mount, prefs, wiring
icon.mjs                procedural invaders + cannon icon and the 1200×720 cover
build.mjs               packs site/apps/invaderz/invaderz.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, three classes, and keyboard / on-screen buttons. No
images, no sounds, no fetch. `connect-src 'none'` then costs it nothing.
Original `main.js` is not loaded: it registered a service worker and an
appcache, and it owns a single cannon.

## capabilities

| capability | why |
|---|---|
| `db` | Best generation in a `private` collection; cannons in a `read-write` one; the swarm in a `read-only` one the host writes. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Extra cannons

Each player owns one row and only ever writes that row. The host simulates
the swarm and publishes it on `world`. A guest who shoots a body claims the
hit on their own row; the host applies it.

## Building

```bash
node apps/invaderz/vendor.mjs   # only when moving the upstream pin (needs net)
node apps/invaderz/build.mjs    # -> site/apps/invaderz/invaderz.gif
```

## Licence

MIT, Victor Ribeiro. The notice is packed **inside the GIF** as
`COPYING-invaderz.txt` as well as living here, because a copy of this app
that someone was handed is a distribution of that work.
