# Radius Raid

A space-themed twin-stick shooter that runs as an ordinary sandboxed GifOS app.
Solo is the original game. Send the link and extra ships drop into the same arena.

The engine is **[Radius Raid](https://github.com/jackrugile/radius-raid-js13k)** by
jackrugile — MIT, the 2013 js13kGames entry, 13 KB. This directory is the GifOS
port: the shell around it, the virtual sticks a phone needs, and the extra ships,
none of which upstream has.

```
index.html          the shell: original canvases plus the twin-stick overlay
style.css           scale-to-fit wrap, stick HUD
boot.js             localStorage stand-in over gifos.db('prefs')
touch.js            left stick move, right stick aim+fire
net.js              pose publish, host-sim enemies, hit claims
wrap.js             hangs the above on the original prototypes
icon.mjs            procedural Geometry Wars-style icon + 1200×720 cover
vendor/js/          UNMODIFIED upstream scripts. Never edit.
vendor.mjs          copies vendor/js from the pin. The only step needing net.
build.mjs           packs all of the above into site/apps/radius-raid/radius-raid.gif
```

## capabilities

| capability | why |
|---|---|
| `db` | Career stats and mute/autofire in a `private` collection; player pose in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome. |

No `network`, no `wasm`, no `pointer` (the original aims with an un-locked mouse).
Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## The port, in three parts

**Touch.** Upstream is WASD and the mouse. On a phone it renders and you cannot
move or aim. `touch.js` adds a twin-stick overlay without forking anything: the
left pad writes analog velocity into the hero, the right pad aims `$.mouse` and
fires while the stick is held out. Shown only after a real finger has touched
the screen during play.

**The shared arena.** Each player publishes pose on their own row — nobody
writes anybody else's. The first ship in play is the sim host and carries the
enemy list on that same row; a guest fires locally and rides hit claims on
*their* row, which the host applies. Score is the host's, so it is shared.
Homing enemies chase the nearest living ship.

**Persistence.** Upstream stored career stats in `localStorage`, which a
sandboxed frame does not have. `boot.js` hangs a Storage-shaped object on
window and flushes the same blob into `gifos.db('prefs')`.

## Honest limits

- **6 Hz.** A subscriber re-downloads the whole collection on every change.
  Remote ships are interpolated. This is coop with friends over a link, not
  competitive netcode.
- **Trusting clients.** A guest applies its own damage and a host applies
  claimed hits, so a modified client could decline to die or invent kills. The
  room is people you sent a link to.
- **One sim host.** If the host leaves mid-wave, remaining ships keep firing at
  a frozen swarm until someone starts a new round.

## Building

```bash
node apps/radius-raid/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/radius-raid/build.mjs       # -> site/apps/radius-raid/radius-raid.gif
```

## Licence

MIT, and the notice is packed **inside** the GIF as well as living here:
`vendor/COPYING-radius-raid.txt`. A copy of this app that someone was handed is
a distribution of jackrugile's work and has to carry the notice with it.
