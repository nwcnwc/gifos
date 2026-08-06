# Anyroad

Drive any road on Earth, in a GifOS app. The world is not authored — it is
fetched: OpenStreetMap geometry for the roads and buildings, terrain-RGB tiles
for the elevation, streamed in around the car as it moves.

Finished GIF: [`site/apps/anyroad/anyroad.gif`](../../site/apps/anyroad/anyroad.gif) (~160 KB).
Rebuild it with `node apps/anyroad/build.mjs`, then refresh the catalog with
`node scripts/build-app-catalog.mjs`.

## What it uses from GifOS

| Capability | Why |
|---|---|
| `network` | Elevation tiles, Overpass, and Nominatim. Every host is declared in the manifest and the player sees and can revoke each one. |
| `db` | Player prefs and the road cache (both **private**), plus the shared `players` and `race` collections that make multiplayer work. |
| `multiplayer` | Racing: the invite link IS the room. |
| `api` (`maptiler`) | The optional satellite drape. Declared but **not required** — the app is fully playable with no key, and the key never enters the sandbox. |

It needs **binary `gifos.fetch`**. Terrain arrives as a PNG whose pixels are
metres; before 2026-08 the bridge ran every response through a UTF-8 decoder and
this app could not have existed.

## Layout

```
host.js      gifos-or-dev, so nothing else branches on which host it is running under
geo.js       lat/lon <-> local metres <-> Web Mercator tiles
sources.js   the swappable source registry + the player's choice
net.js       per-host queueing, de-duplication, and backoff
terrain.js   terrarium PNG -> heightfield -> mesh, and the height the car stands on
roads.js     Overpass -> road ribbons, extruded buildings, water
render.js    hand-rolled WebGL: terrain, roads, buildings, water, cars, sky
car.js       arcade vehicle physics + keyboard/touch controls
mp.js        presence, ghost cars, races
ui.js        HUD, search, settings, race panel
app.js       the world streamer and the loop
```

## Things that are the way they are for a reason

**Two tile grids, not one.** Elevation is cheap and wants to reach the horizon
(z14, ~2.4 km tiles, 3 km radius). Roads are expensive — one Overpass query each
— and only matter nearby (z15, ~1.2 km, 1.2 km radius). Tiles load nearest-first
so the ground under the car arrives before the scenery.

**Road meshes are gated on their terrain.** Building one before its elevation
has landed lays the tarmac at sea level, and there is no way to notice that
except by driving into it.

**Positions are published as lat/lon, never as world metres.** Each player's
frame is pinned at their own hop point, so metres mean different things in
different tabs. Geographic coordinates are the only thing that survives the trip.

**The road cache is `private` and capped.** Private because the relay is a
control-plane pipe with a hard bandwidth budget — syncing a map cache through it
would sink multiplayer. Capped because a GifOS app's `db` is baked into its GIF
when you save, and an uncapped cache is a hundred-megabyte app.

**Sources are data, not constants.** Every request a GifOS app makes leaves from
the `gifos.app` origin, so all players share one `Referer`: distributed IPs do
not help, and a single rule at a provider blocks everyone at once. Being able to
switch source from inside the app is the insurance. It is also why the satellite
drape runs on the player's own key rather than a shared endpoint — the free
imagery services that answer are not licensed to be a game's ground texture.

**No `User-Agent`.** It is a forbidden header in `fetch`, so a browser app
cannot identify itself that way. Nominatim accepts a `Referer` instead, which is
why it is in and raster OSM tiles are out (their policy also forbids the
prefetching a driving game does by definition).

## Data

- Elevation — Tilezen / AWS Open Data terrain tiles (SRTM, ASTER and others)
- Roads, buildings, water — © OpenStreetMap contributors, ODbL
- Search — Nominatim / OpenStreetMap
- Imagery (optional, player's own key) — © MapTiler © OpenStreetMap contributors

Attribution is shown in the app on both the landing sheet and Settings.

## Developing

The app runs outside GifOS against a plain static server, which is much faster
than repacking a GIF for every change:

```bash
python3 -m http.server 8110 -d apps/anyroad
```

`host.js` detects the missing `window.gifos` and falls back to `window.fetch`
plus a `localStorage`-backed stand-in for `gifos.db`. That persistence is not a
nicety: without it every reload re-asks Overpass for tiles it already had.
