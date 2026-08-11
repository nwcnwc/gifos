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

**Every sound is SYNTHESISED, and that is not a stylistic choice.** The app is a
GIF. One minute of even badly compressed audio is several times the size of the
entire game, so there are no samples — there are oscillators, one noise buffer
made at boot, and envelopes. The engine is detuned saws through a lowpass that
opens with load, pitched by a five-speed gearbox (a single note rising with
speed is a milk float; the drop at each change is what the ear reads as a car).
Tyres are that noise buffer through a bandpass that climbs with speed and
changes character with the `surface` under them. Animals are pitch envelopes
with formants, panned to where they actually are.

**There is no music, deliberately.** A tune would compete with the one sound
carrying information about what the car is doing.

**Traffic gets three voices, not one per car.** Thirty cars is thirty oscillator
chains for no gain — you cannot pick four engines out of a crowd. The pool is
reassigned each tick to the three nearest, with the Doppler done by hand from
the closing rate (a `PannerNode` with real Doppler is both deprecated and far
more machinery than a pitch offset).

**The audio graph is built ONCE and ramped, and runs at 20 Hz.** Creating
oscillators per frame is what makes Web Audio crackle; and every parameter here
is a ramp with a ~100 ms time constant, so updating at sixty frames a second
schedules four ramps for every one the ear can resolve.

**Traffic has no pathfinding, no junction logic and no road graph.** Each car is
given a WAY — the polyline the tile builder already computed in world metres for
the ribbon — and drives it in its own lane. When it runs out of way, or gets far
enough behind you, it leaves. That sounds like a cheat and it is exactly what
you can see from a car: you never watch a specific vehicle negotiate a junction
two hundred metres away. Everything the player CAN check is real — they stay on
the carriageway, they keep to one side, they slow for what is in front of them,
and they never appear closer than 70 m.

**How far right the traffic sits is load-bearing.** The player is dropped on the
centreline and mostly drives there, so at half a carriageway every oncoming car
passed within a car's width and clipped them — traffic that hits you for driving
normally is a minefield, not traffic. They keep as far over as the road allows,
and the contact test is two axes (across the heading, then along it) rather than
a radius: centre to centre, two cars in adjacent lanes are about two metres
apart, which any circle big enough to cover a car's length also covers.

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

**OSM says what KIND of building it is, and we used to throw that away.** The
parser tested `tags.building` for truthiness and kept only the height, so
`building=house`, `building=retail` and `building=warehouse` were the same grey
extrusion. `classify()` maps the tag (plus `shop`/`office`/`amenity`/`tourism`
on the same way) into eight classes, which drive the facade, the roof, the
window module and the default height when nobody tagged one — that last matters
more than it sounds, because `building=yes` with no height used to be 8 m for
everything, so a suburb of bungalows and a business park had identical skylines.
`building=yes` is by far the commonest value and says nothing, so it is resolved
by FOOTPRINT: 90 m² and two storeys is a house, 4000 m² and two storeys is a
shed. A tile cached before classes existed simply has no third element in its
`bld` tuple — that reads as UNKNOWN and the size heuristic picks it up, so old
caches upgrade themselves.

**A pitched roof is what makes a house a house.** No amount of facade shading
substitutes for it — a flat-topped box reads as a block of flats at any size.
The roof is built over a RIDGE, not an apex: an apex over the centroid gives
every house a pyramid and a street of pyramids is a street of tents. The ridge
runs along the footprint's long axis, hipped or gabled by the building's own
seed, and collapses to the old pyramid for a square plan. Then eaves that
oversail by a third of a metre, and a chimney — four square metres of geometry
and the second loudest "this is a house" signal there is.

**`surface` and `lanes` were sitting unread in the same response.** A
`highway=track` through a field was drawn as asphalt with a painted centre line
down it, and a six-lane motorway came out exactly as wide as a B road, because
the parser kept only the highway class. Surfaces resolve to sealed / gravel /
dirt / stone — loose surfaces get coarse aggregate, wheel ruts and NO markings,
since nobody paints a dashed line down a farm track. Lanes set the width
(`max(class × 0.6, lanes × 3.3)`) and paint lane dividers above three lanes.
Untagged is not a gap: a `track` is unsealed whatever nobody said about it, and
`tracktype=grade1` is gravel rather than dirt.

**A shadow lifted 0.14 m is UNDER the road.** Road ribbons are laid at
terrain + 0.18 so they do not z-fight with the ground, so the first shadows —
lifted 0.14 above the *terrain* — were four centimetres beneath the tarmac, the
depth test hid them, and every shadow stopped dead at the kerb. They sit at 0.30
now, and the guard checks the lift against the terrain rather than merely
checking the shadow exists.

**Shadows are BAKED, because the sun never moves.** A shadow map is the honest
way and the wrong trade here: a depth pass over the whole world every frame, on
a phone, for a static sun. Instead `buildShadows()` computes them once per tile
as flat dark polygons lying on the ground — zero per-frame cost beyond the fill,
measured at about 5% of frame time. The shape of a shadow is the Minkowski sum
of the footprint and the segment the sun sweeps it along, which for a convex
footprint is the convex hull of the footprint and its translated copy. That is
not aesthetics: overlapping translucent polygons DOUBLE-DARKEN, so a shadow
drawn as "footprint plus swept quads" gets a black seam down its middle. One
hull per building has no self-overlap; overlap *between* buildings is why the
alpha is 0.20 and not the 0.34 it started at.

**The sun's elevation is the whole character of the lighting.** It sits at about
24°, and each of the three reasons is load-bearing: overhead, every shadow is a
puddle under its own building and the picture is flat; a low sun models the
sides of things rather than their tops; and the chase camera only sees about 25°
above the horizon, so a sun at 40° is a sun nobody ever sees. Tree and building
shadows live in separate meshes so the tree ones can be dropped at exactly the
same distance as the trees — a shadow with nothing standing in it is worse than
no shadow.

**Trees are solid.** The trunks go into the same wall index the buildings use,
so the car collides with a tree through exactly the same path it collides with a
building — one collision system, not two. That is the point of putting them
beside a road: leaving the road should cost something.

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

**A link can open the app somewhere, and the app can mint one.** The manifest
declares `at`, `fly` and `label` (see [`apps/README.md`](../README.md)), so
`gifos.app/?run=anyroad&go.at=36.0640,-112.1400&go.fly=1` drops a first-time
visitor into the Grand Canyon with the wings out — `at` goes through the same
Nominatim call as the search box, `fly` is the ▲ button, and both are performed
only after GifOS has shown the person what the link asked for. Take-off waits
for the 3.2 s arrival descent to finish (gated on `hopAnim`, deliberately not on
`spawnChecked` — that flag only ever fires for the session's first arrival), and
because a hop nobody tapped for cannot start an audio graph, the first touch the
player does make unlocks the engine.

Settings → **Copy a link to here** mints one from where you actually are,
flying included. It always writes `https://gifos.app/…`: an app runs on an
opaque origin and genuinely cannot know whether it is on gifos.app, a numbered
computer or a laptop, and the public computer is the right target in all three.
The link is left in a selectable box under the button because a sandboxed app
cannot count on reaching the clipboard — the async Clipboard API needs a
permission an opaque origin is not granted, `execCommand` is deprecated but
still works there, and a "Copied!" that silently did not is the outcome worth
engineering against.

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
