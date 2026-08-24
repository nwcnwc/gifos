# Worldview — NASA's daily Earth, in a GIF

An independent port of [NASA Worldview](https://worldview.earthdata.nasa.gov)
(the browser for NASA's [Global Imagery Browse
Services](https://gibs.earthdata.nasa.gov)) to GifOS. Not endorsed by NASA;
all imagery is NASA's, most of it public domain.

The whole app — code, catalogue, coastlines, gazetteer and a Blue Marble base
map — rides inside one 1 MB GIF. It opens with no connection, and the imagery
it has already shown you stays inside the file.

## What it does

- **74 GIBS layers** in the same shape NASA groups them: corrected reflectance
  from Terra, Aqua and the three VIIRS platforms, fires and thermal anomalies,
  sea surface temperature and anomalies, aerosols, dust, night lights, snow
  cover, sea ice, precipitation, vegetation indices, land cover, population,
  geostationary GeoColor, and the reference coastlines and labels.
- **A timeline that is a ruler**, not a slider: day/month/year scales, a
  playhead with the date written on it, and a calendar that greys out the days
  the visible layer does not publish.
- **A/B compare** with a draggable split.
- **Animation** over any date range — and **GIF export encoded on the device**,
  frames stamped with their dates (`wv-gif.js`: median cut, ordered dither,
  LZW).
- **Offline**: a packed Blue Marble under everything, vector coastlines and
  borders, 1,240 searchable places, a tile cache inside `gifos.db`, and
  "pin this view" for a flight.
- **Co-view**: one invite and the room is on the same map, live, with cursors.
- **Launch links**: `?go.at=`, `go.date=`, `go.layers=`, `go.tour=`.

## The source

| file | what it is |
| --- | --- |
| `index.html`, `style.css` | the shell and the whole design system (three layouts: docked panel, floating panel, bottom sheet) |
| `wv-util.js` | dates (UTC everywhere — a browser in Sydney asking for its own "today" asks the archive for a day that does not exist yet), formatting, base64 |
| `wv-data.js` | decodes the packed assets; place search; layer lookup; coverage |
| `wv-tiles.js` | the GIBS WMTS address, the request queue, the memory cache and the byte cache in `gifos.db` |
| `wv-map.js` | the plate-carrée renderer and every gesture |
| `wv-gif.js` | the animated-GIF encoder |
| `wv-anim.js` | playback and export |
| `wv-ui.js` | the panels, the layer stack, the timeline, the inspector |
| `wv-sheets.js` | the dialogs — and most of the app's honesty lives in their words |
| `wv-mp.js` | two shared collections: the room's view, and one cursor per person |
| `app.js` | state, persistence, launch links, wiring |
| `tours.json` | the 14 Explore scenes (coordinates and dates taken from NASA's own curated stories) |
| `assets/` | generated, committed — see below |
| `icon.mjs` | the App GIF's animation: a rotating Earth under a fixed imaging swath |
| `build.mjs` | packs the GIF into `site/apps/worldview/worldview.gif` |

### Generated assets (committed)

```bash
# base.jpg, world.bin, places.json, landmask.bin
python3 apps/worldview/tools/make-assets.py --src <dir with the three upstreams>

# catalog.json — every layer id CHECKED against NASA's own configuration
git clone --depth 1 https://github.com/nasa-gibs/worldview /tmp/wv
node apps/worldview/tools/make-catalog.mjs --wv /tmp/wv
node apps/worldview/tools/make-catalog.mjs --wv /tmp/wv --check   # drift gate
```

Upstreams, all public domain or permissive: NASA Blue Marble (via three.js's
copy of the Visible Earth texture), world-atlas (Natural Earth 50m) for
coastlines and borders, Natural Earth populated places for the gazetteer, and
NASA's Worldview configuration for the layer set, its grouping and its
descriptions.

### Building

```bash
node apps/worldview/build.mjs                 # -> site/apps/worldview/worldview.gif
node apps/worldview/tools/shoot.js            # -> screenshot.png (the store master)
node scripts/build-app-catalog.mjs            # -> site/apps/*
```

## `gifos.*` it uses

`gifos.db` (prefs, views, tiles, tilecache, legends, session, cursors),
`gifos.fetch` (binary, to `gibs.earthdata.nasa.gov` only, with room pooling),
`gifos.me` / `gifos.info` (who is driving), `gifos.launch`, `gifos.onBack`,
`gifos.storage`, and `gifos.library.put` when you save a picture or an
animation. No AI, no capture, no WASM, no GPU.

## Tests

- `test/unit/worldview-catalog.js` — the data: ids, matrix sets, formats,
  dates, reachability of every layer through a category, every tour opening on
  a day its layers have, every `gifos.db` collection declared, and that the app
  loads nothing from the network at mount.
- `test/browser/e2e-worldview.js` — the real packed GIF in the real runtime,
  with a hermetic GIBS (`test/lib/gibs-fixtures.js`). Guards the WMTS URL shape,
  binary `gifos.fetch` all the way to pixels ON THE RIGHT TILE, "no data" being
  said rather than shown, the legend coming from NASA's colormap, the GIF
  export, and the offline reopen.

## Known gaps

- **The catalogue is curated, not fetched.** Every layer id is checked against
  NASA's configuration, but the tile matrix set, format and cadence for a few
  of the newer layers (the geostationary feeds especially) are inferred from
  NASA's own descriptions rather than from a live GetCapabilities.
  `tools/verify-catalog.mjs` hits GIBS for one tile per layer and reports what
  does not answer — run it on a machine that can reach
  `gibs.earthdata.nasa.gov`.
- **Geographic projection only.** NASA Worldview also offers the two polar
  stereographic projections, which is how you look at sea ice properly. Plate
  carrée stretches the poles badly.
- **No Events tab.** Worldview lists live natural events (EONET) you can jump
  to. Explore (baked, offline) covers some of the same ground, but not "what is
  happening today".
- **The store cover is the offline base**, not live imagery — see
  `tools/shoot.js` and `GAUNTLET.md`.
