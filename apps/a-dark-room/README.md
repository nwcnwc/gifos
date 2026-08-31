# A Dark Room

The famous text incremental, running as an ordinary sandboxed GifOS app.
Solo it is Michael Townsend's A Dark Room. The fire lives in the file.
Send the invite and a friend sits at the same fire.

The engine is **[A Dark Room](https://github.com/doublespeakgames/adarkroom)**
by doublespeak games — MPL-2.0. This directory is the GifOS port: a
classic-script shell, `gifos.db` for the save, packed FLAC, phone layout,
and a shared fire.

```
index.html      shell
style.css       phone reflow + tap targets
vendor/         pinned upstream (script, css, lib, audio)
shim.js         memory localStorage; hydrate from gifos.db
patch.js        soft reload, no window.open, guest timers
net.js          shared fire (host simulates, guests stoke)
touch.js        D-pad for the map and the ship
boot.js         save, audio assets, Engine.init
icon.mjs        fire growing in a dark room
build.mjs       packs site/apps/a-dark-room/a-dark-room.gif
```

## Why this can run as a GifOS app

Upstream is jQuery, a JSON save in localStorage, and `fetch()` of FLAC.
The sandbox has no localStorage and no network. The shim is a memory store
seeded from `gifos.db('save')`; audio rides `.assets/audio/*.flac` and is
decoded by Web Audio. `$SM` used `eval` to walk `State` — rewritten as a
plain walk, because the app CSP has no `unsafe-eval`. The original sent
phones to an app-store splash; this copy plays.

## capabilities

| capability | why |
|---|---|
| `db` | The fire is a `private` save; the host publishes it `read-only` on `fire`; guests propose clicks on `actions`. |
| `multiplayer` | The room. Invite is OS chrome. |

`minBuild` is **1206** (0.9.6) — packed `.assets/` must be served into the
sandbox. Needs nothing newer.

## Building

```bash
node apps/a-dark-room/build.mjs   # -> site/apps/a-dark-room/a-dark-room.gif
```

## Licence

MPL-2.0, Michael Townsend and contributors. The notice is packed **inside
the GIF** as `COPYING-adarkroom.txt`. jQuery 1.10.1 is MIT
(`COPYING-jquery.txt`).
