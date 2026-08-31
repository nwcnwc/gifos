# Hextris

An unofficial local port of **[Hextris](https://github.com/Hextris/hextris)**
by Logan Engstrom, Garrett Finucane, Noah Moroze and Michael Yang (GPL-3.0).
Rotate a hex, match three of a colour. Playing alone is that game. Press
**Play a friend**, then **Invite**, and it becomes a race from the same
sequence of falling blocks — each of you on your own hex.

```
index.html      canvas, HUD, friend-mode strip, phone pad
style.css       original light field + race chrome
jq.js           tiny $ shim (no jQuery, no webfonts, no CDN)
vendor/         pinned Hextris classic scripts. Never fetch at runtime.
net.js          the race: shared seed, own rows, live scores, ghost hex
touch.js        LEFT / RIGHT / FAST, same rotate/rush the keys use
boot.js         gifos.db high scores, wiring
icon.mjs        a hex piece landing, and the 1200×720 cover
build.mjs       packs site/apps/hextris/hextris.gif
```

## Why this can run as a GifOS app

Upstream is one canvas, keyboard + tap, and a pile of CDNs (Google Fonts,
analytics, an ads script, a score phone-home). The sandbox has no network
and no localStorage, so this copy vendors the game, drops the remote calls,
keeps high scores in `gifos.db`, and synthesises the play-icon that used
to be FontAwesome.

## capabilities

| capability | why |
|---|---|
| `db` | Top-three scores in a `private` collection; race rows in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |

Needs nothing newer than the App Store itself, so `minBuild` is **947**.

## Building

```bash
node apps/hextris/build.mjs   # -> site/apps/hextris/hextris.gif
```

## Licence

GPL-3.0-or-later, Logan Engstrom et al. The notice is packed **inside the
GIF** as `COPYING.txt` (and `COPYING-hextris.txt`) because a copy of this
app that someone was handed is a distribution of that work.
