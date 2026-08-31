# HexGL

Thibaut Despoulain's futuristic WebGL racer, running as an ordinary
sandboxed GifOS app. Solo it is HexGL on the Cityscape track. Send the
invite and extra ships appear as ghosts on the same line.

The engine is **[HexGL](https://github.com/BKcore/HexGL)** by BKcore —
MIT, Three.js r50dev. This directory is the GifOS port: a classic-script
shell around the vendored pin, thumb steering, best times in `gifos.db`,
and the ghost race. Upstream fetches textures over HTTP and stores
records in `localStorage`.

```
index.html      menu, race, finish, touch markup
style.css       overlay chrome (no webfont, no remote CSS)
vendor/         HexGL + Three.js r50dev + LOW textures/geoms/audio
assets-index.js generated map of packed .assets/ paths
patch.js        blob-URL loader, buffer audio, no XHR
net.js          live ghosts — presence + best times
touch.js        analog pad + GO / BRAKE
boot.js         mount, prefs, wiring
icon.mjs        procedural ship on a hex track, and the 1200×720 cover
build.mjs       packs site/apps/hexgl/hexgl.gif
```

## Why this can run as a GifOS app

Upstream's `bkcore.threejs.Loader` XHRs JSON geometries and image URLs.
The sandbox has no network and no `document.baseURI` to fetch off, so
textures, collision maps, geometries and audio ride the GIF as raw
`.assets/` files and enter the sandbox at boot through `gifos.assets()`
as `blob:` URLs / parsed JSON. `connect-src 'none'` then costs it
nothing. Quality is clamped to the LOW texture set (diffuse + skybox +
HUD) so a phone can run it; Mid is the same textures at full resolution.

## capabilities

| capability | why |
|---|---|
| `db` | Best time / ghost replay / mute / quality in a `private` collection; pilots in a `read-write` one. |
| `multiplayer` | The room. Invite is OS chrome — this app never draws that button. |
| `fullscreen` | Phone landscape lock during a race. |

`minBuild` is **1314** (`capabilities.fullscreen`; packed `.assets/` already needed 1206). Needs
nothing newer.

## Ghosts

Each pilot owns one row and only ever writes that row (pose + best).
Nobody writes anybody else's ship. A subscriber re-downloads the whole
collection on every change, so publish is 8 Hz with interpolation.

## Building

```bash
node apps/hexgl/vendor.mjs   # only when the pin moves (needs the network)
node apps/hexgl/build.mjs    # -> site/apps/hexgl/hexgl.gif
```

## Licence

MIT, Thibaut Despoulain. Audio samples are CC-BY 3.0 / public domain
(COPYING-audio.txt). three.js r50dev is MIT (COPYING-three.txt). The
notices are packed **inside the GIF**.
