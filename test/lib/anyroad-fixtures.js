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

// A street with KNOWN building types on it. OSM carries `building=house`,
// `building=retail`, `building=warehouse` and the rest, and until 2026-08 the
// parser tested the tag for truthiness and threw the value away — so this
// fixture exists to hold the classifier to what the data actually said.
// Houses down one side, a parade of shops, an office and a shed down the other.
function mixedStreet() {
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
    const lat = HOP.lat + i * 0.00036, lon = HOP.lon + i * 0.00012;
    out.push(box({ building: 'house' }, lat, lon - 0.00035, 0.00009, 0.00013));
    out.push(box(KINDS[((i % 4) + 4) % 4], lat, lon + 0.00022, 0.00011, 0.00020));
  }
  return out;
}

// ---- fixture: an Overpass answer --------------------------------------------
// One long residential way through the drop point, plus a building, in the
// `out geom` shape the app parses. Built around the preset it hops to.
function overpassBody() {
  const geom = [];
  for (let i = -60; i <= 60; i++) geom.push({ lat: HOP.lat + i * 0.00012, lon: HOP.lon + i * 0.00004 });
  return JSON.stringify({
    elements: [
      { type: 'way', id: 1, tags: { highway: 'residential', name: 'Fixture Street' }, geometry: geom },
      { type: 'way', id: 2, tags: { highway: 'primary', name: 'Grand Boulevard' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0009 })) },
      // A six-lane motorway and a dirt track, far enough out not to be what the
      // car lands on. OSM tags `surface` and `lanes` on the way and the parser
      // never looked at either, so a farm track was drawn as asphalt with a
      // painted centre line and a motorway was as wide as a B road.
      { type: 'way', id: 4, tags: { highway: 'motorway', lanes: '6', name: 'A1' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon + 0.0018 })) },
      { type: 'way', id: 5, tags: { highway: 'track', surface: 'dirt' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0015 })) },
      { type: 'way', id: 6, tags: { highway: 'unclassified', surface: 'gravel' },
        geometry: geom.map((p) => ({ lat: p.lat, lon: p.lon - 0.0021 })) },
      { type: 'way', id: 3, tags: { building: 'yes', 'building:levels': '4' }, geometry: [
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0007 },
        { lat: HOP.lat + 0.0007, lon: HOP.lon + 0.0004 },
        { lat: HOP.lat + 0.0004, lon: HOP.lon + 0.0004 },
      ] },
      { type: 'way', id: 7, tags: { highway: 'residential', name: 'Crossing Lane' }, geometry: [
        { lat: HOP.lat, lon: HOP.lon - 0.0006 }, { lat: HOP.lat, lon: HOP.lon + 0.0006 },
      ] },
      // A TAGGED WOOD, west of everything, clear of every road. natural=wood
      // is the tag that must come out as closed canopy — the e2e counts the
      // trees inside this exact ring, because "forest rendered as parkland"
      // is a bug that no road or building assertion will ever notice.
      { type: 'way', id: 8, tags: { natural: 'wood', leaf_type: 'broadleaved' }, geometry: [
        { lat: HOP.lat - 0.0012, lon: HOP.lon - 0.0044 },
        { lat: HOP.lat - 0.0012, lon: HOP.lon - 0.0030 },
        { lat: HOP.lat + 0.0012, lon: HOP.lon - 0.0030 },
        { lat: HOP.lat + 0.0012, lon: HOP.lon - 0.0044 },
        { lat: HOP.lat - 0.0012, lon: HOP.lon - 0.0044 },
      ] },
      ...mixedStreet(),
    ],
  });
}

// Intercept every external host the app is allowed to reach. Anything NOT
// matched here is aborted by Playwright's default, so an unnoticed new
// dependency fails loudly rather than quietly reaching the open internet.
//
// Returns the per-context hit ledger. It is per CONTEXT on purpose: with the
// download pool engaged, a URL fetched by one player is never requested by the
// others, so summing these across contexts counts REAL upstream requests.
async function routeWorld(context, opts) {
  const terrainBody = opts && opts.hills ? HILLS_PNG : TILE_PNG;
  const hits = { terrain: 0, overpass: 0, nominatim: 0, urls: [] };
  await context.route('**://s3.amazonaws.com/**', async (route) => {
    hits.terrain++;
    await route.fulfill({ status: 200, contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: terrainBody });
  });
  await context.route(/overpass/, async (route) => {
    hits.overpass++; hits.urls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: overpassBody() });
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

module.exports = { HOP, FIXTURE_HEIGHT, TILE_PNG, HILLS_PNG, terrariumTile, terrariumHills, overpassBody, mixedStreet, routeWorld, solidTile };
