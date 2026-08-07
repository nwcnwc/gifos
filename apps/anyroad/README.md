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
animals.js   the wildlife: spawning, wandering, and what hitting one costs
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

**Reverse is a gear you ask for, and it has a ceiling.** It used to be
whatever fell out of "brake past zero": hold the brake at a standstill and the
car accelerated backwards, bounded only by the -14 m/s clamp, while the read-out
showed `|speed|`. Three seconds on the pedal put you 20 m back up the road at
what the HUD called 36 km/h forwards. The auto-cruise made it unrecoverable —
it compared `|speed|` to its target, so a car reversing at 8 m/s read as
*already up to speed* and the cruise cut the power that would have pulled it
forward. Now the brake arms reverse only after a beat at a stop, `REV_MAX` is a
hard floor whatever put you there (rebound, hill, mis-set stick), the cruise
compares SIGNED speed, and the speedo says `R`.

**A panel parks the car.** The race sheet is full-screen and the world used to
keep running behind it with the cruise throttle open: you read the panel, the
car drove itself into a building unattended, and closing it handed you back a
wreck. `UI.panelOpen()` → `controls.setPark()` → the car hears nothing and
stops. Reverse does NOT arm while parked, or you would come back to a car
quietly backing down the street.

**Being stuck is detected, not endured.** Some footprints are a horseshoe or a
courtyard with one gap, and the wall-slide plus the cruise can hold a car in one
for ever. `car.stillT` counts seconds of full power going nowhere; past 2.5 s
the rescue button appears (or press R), and `App.unstick()` puts the car on the
nearest carriageway from the same road index the car asks "am I on tarmac" with,
facing whichever way along it needs less of a turn.

**The wildlife is not multiplayer.** Every peer would need the same herd in the
same place, which means an authority (there is none — see mp.js) or a shared
seed plus lockstep. What everyone would actually get is a different animal in a
different place, which is worse than each player having their own. Damage is
yours; the road is shared.

**Animals spawn ahead of you and never on the tarmac.** A hazard you cannot see
coming is not a hazard, it is a tax. They are placed 60–165 m out in a forward
cone, pushed onto the verge if the site lands on a carriageway, and they walk
into the road on their own — which is the whole game of it.

**The sky had never been drawn.** Its full-screen triangle is wound
counter-clockwise, `init()` sets `frontFace(CW)` to compensate for the mirrored
view, and so the sky was a back face and was culled — every "sky" pixel was the
`glClear` colour, which is why it was one flat band that no gradient ever showed
up in. It is drawn now, and drawn LAST at z=1 with `LEQUAL`: it shades only the
pixels the world did not reach, which is under half the frame on a road scene
and is what pays for the clouds.

**`smoothstep(hi, lo, x)` is UNDEFINED, not reversed.** GLSL says results are
undefined when `edge0 >= edge1`. Three places were relying on it — the sky's
horizon band, the road kerb, and the contact shadow — and on the gate's
rasteriser the sky one returned 1.0 for every pixel, flattening the entire sky.
Ascending edges, then subtract.

**Trees are grown, not fetched.** OSM knows where the woods are, but asking for
them is another layer in every Overpass query, on donated infrastructure, for
scenery. Instead `roads.js scatter()` plants a deterministic hash-driven scatter
per tile, rejecting anything near a road, a building, water or a cliff — one
static mesh per tile, because 240 trees as 240 draw calls would cost more than
the rest of the frame. Deterministic matters: the hash is over world position,
so a tile rebuilt after a re-pin grows the same wood in the same place.

**Detail is three rungs, and it is the honest lever.** Measured on the gate's
software rasteriser — a CPU, so the pessimistic end of the phone range — the
whole visual pass went 14.1 → 8.1 fps, of which the scenery is 1.2. Trees also
have their own 1.1 km draw distance (roads and buildings are what you navigate
by and must reach the horizon; trees at a kilometre are fill inside the fog
band). Per-pixel detail in the terrain and the tarmac is distance-gated, which
is a quality win too: at range that noise is finer than a pixel, so it is not
detail, it is shimmer.

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
