// Anyroad's offline world, shared by every suite that drives the app.
//
// HERMETIC BY CONSTRUCTION. Every outbound host Anyroad may reach is served
// from here instead, for two reasons. The obvious one is that a suite depending
// on overpass-api.de goes red when a donated server has a bad day. The
// load-bearing one is that those services are rate-limited per IP as a matter
// of policy, and a gate that re-queries them on every run is precisely the
// abuse that policy exists to stop.
//
// This lives in test/lib/ rather than inside one suite because there are now
// two of them — the single-player battery and the multiplayer one — and a
// fixture that exists twice is a fixture that drifts. The multiplayer suite
// asserts that three players' road queries are IDENTICAL so the runtime's
// download pool can collapse them, which is only meaningful if all three are
// answered from one definition of the world.
'use strict';

const zlib = require('zlib');

// The Paris preset the suites hop to.
const HOP = { lat: 48.8698, lon: 2.3078 };

// ---- fixture: a terrarium elevation tile ------------------------------------
// terrarium packs metres as height = R*256 + G + B/256 - 32768. We encode a
// constant, deliberately awkward height so a UTF-8 round-trip could not
// possibly reproduce it by luck.
const FIXTURE_HEIGHT = 412.5;
function terrariumPixel(h) {
  const v = Math.round((h + 32768) * 256);       // in 1/256 m units
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function terrariumTile(size, h) {
  const [r, g, b] = terrariumPixel(h);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;                      // 8-bit truecolour RGB
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const TILE_PNG = terrariumTile(64, FIXTURE_HEIGHT);

// Rolling hills — the terrain that CAUGHT the two-surfaces bug. A constant
// tile can never disagree with itself: the drawn mesh and the sampled
// heightfield only part company where ground CURVES inside a lattice cell, so
// a flat fixture certifies a renderer that buries every residential street on
// a real hillside. h = base + amp·sin(x/λ)·cos(y/λ), amplitude in metres.
function terrariumHills(size, base, amp, wavelengthPx) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const h = base + amp * Math.sin(x / wavelengthPx * 2 * Math.PI) * Math.cos(y / wavelengthPx * 2 * Math.PI);
      const [r, g, b] = terrariumPixel(h);
      row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
// 64px tile, ±9 m swells about 8 lattice cells wide: honest countryside.
const HILLS_PNG = terrariumHills(64, FIXTURE_HEIGHT, 9, 21);

// A CANYON — the terrain that catches WATER ON A SLOPE, which neither of the
// tiles above can. Both of them are effectively level (flat, or ±9 m swells),
// so a water ring laid on them has almost no ground spread, and every water
// assertion in the suite has only ever exercised the FLAT branch of
// waterMesh(). That is how a river drawn as ONE sheet at the 20th percentile of
// its whole ring — buried inside the hillside for most of its length, reading
// as land, with fish standing on it — reached a user before it reached a test.
// Rim to floor across one tile, the Grand Canyon's own numbers.
function terrariumCanyon(size, rim, floor) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      // A valley running north-south: high at both edges, dropping to the
      // floor in the middle, so a ring laid across it spans the whole descent.
      const t = Math.abs((x / (size - 1)) - 0.5) * 2;   // 1 at the edges, 0 mid
      const h = floor + (rim - floor) * Math.pow(t, 1.6);
      const [r, g, b] = terrariumPixel(h);
      row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const CANYON_PNG = terrariumCanyon(64, 2118, 763);

// A street with KNOWN building types on it. OSM carries `building=house`,
// `building=retail`, `building=warehouse` and the rest, and until 2026-08 the
// parser tested the tag for truthiness and threw the value away — so this
// fixture exists to hold the classifier to what the data actually said.
// Houses down one side, a parade of shops, an office and a shed down the other.
function mixedStreet(center) {
  const C = center || HOP;
  const out = [];
  let id = 100;
  const box = (tags, lat, lon, dlat, dlon) => ({
    type: 'way', id: id++, tags,
    geometry: [
      { lat, lon }, { lat, lon: lon + dlon },
      { lat: lat + dlat, lon: lon + dlon }, { lat: lat + dlat, lon },
      { lat, lon },
    ],
  });
  const KINDS = [
    { building: 'retail' },
    { building: 'commercial', 'building:levels': '5' },
    { building: 'warehouse' },
    { building: 'church' },
  ];
  for (let i = -6; i < 6; i++) {
    const lat = C.lat + i * 0.00036, lon = C.lon + i * 0.00012;
    out.push(box({ building: 'house' }, lat, lon - 0.00035, 0.00009, 0.00013));
    out.push(box(KINDS[((i % 4) + 4) % 4], lat, lon + 0.00022, 0.00011, 0.00020));
  }
  return out;
}

// ---- fixture: an Overpass answer --------------------------------------------
// One long residential way through the drop point, plus a building, in the
// `out geom` shape the app parses. Built around the preset it hops to.
//
// TWO MODES, and the difference is the whole reason the label cache went
// unproven for a week. By DEFAULT the world is built around HOP — the Paris
// preset — and every suite that asserts on "Fixture Street" depends on exactly
// that. But `hop()` re-origins the world (Geo.frame) and drops the car at
// (0,0), so a fixture pinned to HOP lands hundreds of km away the moment a
// suite goes anywhere else: no road is within LABEL_RANGE, `labelFor()` is
// never called, and no amount of renaming ways changes a thing. (That is why
// an earlier attempt to vary names through a route override "didn't take" —
// the names were never asked for.) Pass `center` and the world follows the
// REQUESTED tile instead, and `tag` makes each tile's street names distinct —
// which is what actually exercises the LRU.
function overpassBody(opts) {
  const C = (opts && opts.center) || HOP;
  const tag = (opts && opts.tag) || '';
  const nm = (s) => s + tag;
  const geom = [];
  for (let i = -60; i <= 60; i++) geom.push({ lat: C.lat + i * 0.00012, lon: C.lon + i * 0.00004 });
  return JSON.stringify({
    elements: [
      { type: 'way', id: 1, tags: { highway: 'residential', name: nm('Fixture Street') }, geometry: geom },
      { type: 'way', id: 2, tags: { highway: 'primary', name: nm('Grand Boulevard') },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0009 })) },
      // A six-lane motorway and a dirt track, far enough out not to be what the
      // car lands on. OSM tags `surface` and `lanes` on the way and the parser
      // never looked at either, so a farm track was drawn as asphalt with a
      // painted centre line and a motorway was as wide as a B road.
      { type: 'way', id: 4, tags: { highway: 'motorway', lanes: '6', name: nm('A1') },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0018 })) },
      { type: 'way', id: 5, tags: { highway: 'track', surface: 'dirt' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0015 })) },
      { type: 'way', id: 6, tags: { highway: 'unclassified', surface: 'gravel' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0021 })) },
      { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '4' }, geometry: [
        { lat: C.lat + 0.0004, lon: C.lon + 0.0004 },
        { lat: C.lat + 0.0004, lon: C.lon + 0.0007 },
        { lat: C.lat + 0.0007, lon: C.lon + 0.0007 },
        { lat: C.lat + 0.0007, lon: C.lon + 0.0004 },
        { lat: C.lat + 0.0004, lon: C.lon + 0.0004 },
      ] },
      { type: 'way', id: 7, tags: { highway: 'residential', name: nm('Crossing Lane') }, geometry: [
        { lat: C.lat, lon: C.lon - 0.0006 }, { lat: C.lat, lon: C.lon + 0.0006 },
      ] },
      // WATER — a river and a lake, the render path that had NO fixture at
      // all until "water in rivers and oceans shows as white and is super
      // glitchy, flashing constantly" was reported from the road. Placed
      // SOUTH of the drop point and clear of the carriageways: it must be
      // drawable without being drivable, or every other test in this suite
      // starts drowning. natural=water is the tag; a pool is leisure=* and
      // is a different colour and a different rule (see way 9).
      { type: 'way', id: 10, tags: { natural: 'water', name: nm('Fixture River') }, geometry: [
        { lat: C.lat - 0.0060, lon: C.lon - 0.0040 },
        { lat: C.lat - 0.0058, lon: C.lon + 0.0040 },
        { lat: C.lat - 0.0052, lon: C.lon + 0.0040 },
        { lat: C.lat - 0.0054, lon: C.lon - 0.0040 },
        { lat: C.lat - 0.0060, lon: C.lon - 0.0040 },
      ] },
      { type: 'way', id: 11, tags: { natural: 'water', name: nm('Fixture Lake') }, geometry: [
        { lat: C.lat - 0.0090, lon: C.lon - 0.0020 },
        { lat: C.lat - 0.0090, lon: C.lon + 0.0020 },
        { lat: C.lat - 0.0070, lon: C.lon + 0.0020 },
        { lat: C.lat - 0.0070, lon: C.lon - 0.0020 },
        { lat: C.lat - 0.0090, lon: C.lon - 0.0020 },
      ] },
      // A BACKYARD POOL, east of the buildings — the thing that "disappeared
      // a few versions back" when an old-build cache record was served
      // forever. The cache-upgrade e2e refetches a stampless record and must
      // find this in the fresh parse.
      { type: 'way', id: 9, tags: { leisure: 'swimming_pool' }, geometry: [
        { lat: C.lat + 0.0002, lon: C.lon + 0.0024 },
        { lat: C.lat + 0.0002, lon: C.lon + 0.0025 },
        { lat: C.lat + 0.00028, lon: C.lon + 0.0025 },
        { lat: C.lat + 0.00028, lon: C.lon + 0.0024 },
        { lat: C.lat + 0.0002, lon: C.lon + 0.0024 },
      ] },
      // A TAGGED WOOD, west of everything, clear of every road. natural=wood
      // is the tag that must come out as closed canopy — the e2e counts the
      // trees inside this exact ring, because "forest rendered as parkland"
      // is a bug that no road or building assertion will ever notice.
      { type: 'way', id: 8, tags: { natural: 'wood', leaf_type: 'broadleaved' }, geometry: [
        { lat: C.lat - 0.0012, lon: C.lon - 0.0044 },
        { lat: C.lat - 0.0012, lon: C.lon - 0.0030 },
        { lat: C.lat + 0.0012, lon: C.lon - 0.0030 },
        { lat: C.lat + 0.0012, lon: C.lon - 0.0044 },
        { lat: C.lat - 0.0012, lon: C.lon - 0.0044 },
      ] },
      ...mixedStreet(C),
      ...((opts && opts.bbox) ? streetGrid(opts.bbox, tag) : []),
    ],
  });
}

// The per-tile world, as ONE call, so the body and the ledger of names it
// contains cannot drift apart — a soak that judges an LRU against a name list
// assembled separately from the world it served is judging its own bookkeeping.
function perTileWorld(bb) {
  const tag = tileTag(bb);
  const center = { lat: (bb.south + bb.north) / 2, lon: (bb.west + bb.east) / 2 };
  const body = overpassBody({ center, tag, bbox: bb });
  const names = JSON.parse(body).elements
    .filter((e) => e.tags && e.tags.name && e.tags.highway)   // only roads carry a plate
    .map((e) => e.tags.name);
  return { body, names };
}

// The tile a road query is asking about. roads.js writes every clause as
// `way[...](south,west,north,east);` and sends the whole query PERCENT-ENCODED
// IN THE URL (`?data=...`, a GET — not a POST body), so the quad arrives as
// %28…%2C…%29 and a raw regex over the request finds nothing at all. Decode
// first; that one detail is the difference between this returning a tile and
// returning null on every single request.
function bboxFromQuery(text) {
  let s = text || '';
  if (s.indexOf('%') >= 0) { try { s = decodeURIComponent(s); } catch (e) { /* keep raw */ } }
  const m = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/.exec(s);
  if (!m) return null;
  return { south: +m[1], west: +m[2], north: +m[3], east: +m[4] };
}

// A STREET GRID across the whole tile, and it has to be a grid rather than the
// single way the default world uses. Labels only exist within LABEL_RANGE
// (170 m) of the car, and a road through the tile CENTRE is up to a kilometre
// from wherever the car actually is — so a per-tile world built as one street
// serves plenty of distinct names and still produces zero label plates. Rows
// and avenues every GRID_SPACING metres mean there is always one within range.
const GRID_SPACING = 220;   // metres
function streetGrid(bb, tag) {
  const midLat = (bb.south + bb.north) / 2;
  const dLat = GRID_SPACING / 111320;
  const dLon = GRID_SPACING / (111320 * Math.max(0.15, Math.cos(midLat * Math.PI / 180)));
  const out = [];
  let id = 5000;
  let n = 0;
  for (let lat = bb.south; lat <= bb.north && n < 24; lat += dLat, n++) {
    out.push({ type: 'way', id: id++, tags: { highway: 'residential', name: 'Row ' + n + tag },
      geometry: [{ lat, lon: bb.west }, { lat, lon: bb.east }] });
  }
  n = 0;
  for (let lon = bb.west; lon <= bb.east && n < 24; lon += dLon, n++) {
    out.push({ type: 'way', id: id++, tags: { highway: 'residential', name: 'Avenue ' + n + tag },
      geometry: [{ lat: bb.south, lon }, { lat: bb.north, lon }] });
  }
  return out;
}

// A street-name suffix that is STABLE per tile and different between tiles.
// Stable matters: revisiting a place must not mint fresh names, or the cache
// could never plateau and "it grew" would prove nothing. Word-plus-number
// rather than a bare number so plate WIDTHS vary too — a label texture is
// sized from the rasterised string, so a fixture of identical-length names
// would exercise the LRU with an unrealistically uniform texture footprint.
const TAG_WORDS = ['Alder', 'Birch', 'Cedar', 'Dover', 'Elm', 'Fenwick', 'Granby',
                   'Harrow', 'Ilford', 'Juniper', 'Kingsway', 'Laurel', 'Marlow',
                   'Newbury', 'Oakfield', 'Pentonville'];
function tileTag(bb) {
  const a = Math.round(bb.south * 1e5), b = Math.round(bb.west * 1e5);
  const h = Math.abs((a * 31 + b * 131) | 0);
  return ' ' + TAG_WORDS[h % TAG_WORDS.length] + '-' + (h % 997);
}

// Intercept every external host the app is allowed to reach. Anything NOT
// matched here is aborted by Playwright's default, so an unnoticed new
// dependency fails loudly rather than quietly reaching the open internet.
//
// Returns the per-context hit ledger. It is per CONTEXT on purpose: with the
// download pool engaged, a URL fetched by one player is never requested by the
// others, so summing these across contexts counts REAL upstream requests.
async function routeWorld(context, opts) {
  const terrainBody = (opts && opts.canyon) ? CANYON_PNG
    : (opts && opts.hills) ? HILLS_PNG : TILE_PNG;
  // `names` is the ledger the label-cache soak reads: every DISTINCT street
  // name this fixture has ever served. A cache proves it is capped only
  // against the number of names it was actually offered.
  const hits = { terrain: 0, overpass: 0, nominatim: 0, urls: [], names: new Set() };
  await context.route('**://s3.amazonaws.com/**', async (route) => {
    hits.terrain++;
    await route.fulfill({ status: 200, contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: terrainBody });
  });
  await context.route(/overpass/, async (route) => {
    hits.overpass++; hits.urls.push(route.request().url());
    // `perTile` builds the world around the tile that was ASKED FOR, with
    // names unique to it. Off by default: every assertion in the batteries is
    // written against the one Paris world, and three players' queries have to
    // stay byte-identical for the download pool to collapse them.
    let body;
    if (opts && opts.perTile) {
      const req = route.request();
      const bb = bboxFromQuery(req.postData() || req.url());
      if (bb) {
        const w = perTileWorld(bb);
        for (const n of w.names) hits.names.add(n);
        body = w.body;
      } else {
        body = overpassBody();
      }
    } else {
      body = overpassBody();
    }
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  await context.route('**://nominatim.openstreetmap.org/**', async (route) => {
    hits.nominatim++;
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify([{ lat: String(HOP.lat), lon: String(HOP.lon), display_name: 'Fixture Street, Paris' }]) });
  });
  return hits;
}

// A solid-colour PNG — the satellite-imagery fixture. Dark green reads as
// closed canopy to the app's tree-cover classifier (app.js treeCoverOf);
// anything grey or bright does not. Solid on purpose: the classifier's
// thresholds are the app's business, and a fixture that straddles them would
// test the fixture.
function solidTile(size, r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { HOP, FIXTURE_HEIGHT, TILE_PNG, HILLS_PNG, CANYON_PNG, terrariumCanyon, terrariumTile, terrariumHills, overpassBody, mixedStreet, routeWorld, solidTile, bboxFromQuery, tileTag, streetGrid, perTileWorld };
