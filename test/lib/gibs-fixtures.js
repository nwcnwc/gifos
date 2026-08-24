/*
 * gibs-fixtures.js — a fake NASA GIBS, so the Worldview suite never touches the
 * real one.
 *
 * HERMETIC BY CONSTRUCTION, for the same two reasons anyroad's fixtures are:
 * a suite that depends on gibs.earthdata.nasa.gov goes red when NASA has a bad
 * afternoon, and a gate that re-queries a public science archive on every run
 * is exactly the traffic that archive does not want. It also lets the suite
 * assert things the real service could never guarantee — that THIS tile, with
 * THIS row and column, arrived and was drawn at THAT place on the map.
 *
 * THE TILE IS ITS OWN LABEL. Every fixture tile is a solid colour computed
 * from its level, row and column, so a pixel read back off the canvas says
 * which tile it came from. A renderer that draws the right number of tiles in
 * the wrong places passes a request-count assertion and fails this one.
 *
 * The app asks for .jpg for base imagery. These are PNGs served as image/png —
 * the app reads the response's own content-type, which is the behaviour worth
 * guarding: a decoder handed the wrong type paints nothing and says nothing.
 */
const zlib = require('zlib');

const HOST = 'gibs.earthdata.nasa.gov';

// /wmts/epsg4326/best/{layer}/default/{time}/{set}/{level}/{row}/{col}.{ext}
const TILE_RE = /^\/wmts\/epsg4326\/best\/([^/]+)\/default\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.(jpg|png)$/;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function solidPng(size, r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;                    // 8-bit, truecolour
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/*
 * The colour of the tile at (level, row, col). Deliberately spread out so two
 * neighbouring tiles are obviously different to a pixel assertion, and never
 * near black (which is what an empty canvas looks like).
 */
function tileColour(level, row, col) {
  return {
    r: 60 + ((col * 53 + level * 17) % 180),
    g: 60 + ((row * 89 + level * 31) % 180),
    b: 150 + ((row + col) % 100),
  };
}

const tileCache = new Map();
function tileBytes(level, row, col) {
  const key = level + '/' + row + '/' + col;
  if (!tileCache.has(key)) {
    const c = tileColour(level, row, col);
    // 64px instead of 512: the app scales tiles to fit anyway, and a suite that
    // encodes 60 half-megabyte PNGs spends its budget on zlib.
    tileCache.set(key, solidPng(64, c.r, c.g, c.b));
  }
  return tileCache.get(key);
}

/*
 * routeGibs(context, opts) — intercept every request to GIBS.
 *
 *   opts.has(layerId)  -> false to answer 404 for that layer (a day with no
 *                         data, which is a normal GIBS answer, not a failure)
 *   opts.legend        -> XML served for /colormaps/v1.3/<layer>.xml. Either a
 *                         string for every layer, or a function of the layer
 *                         id returning XML (or null for NASA's own 404, which
 *                         is what a layer with no colour scale answers).
 *
 * Returns a live log: { tiles: [...], byLayer: {id: n}, colormaps: n, dead }
 * `dead` flips the whole host to "no connection", the way airplane mode does.
 */
async function routeGibs(context, opts) {
  const o = opts || {};
  const log = {
    tiles: [], byLayer: {}, colormaps: 0, colormapsFor: [], dead: false, bad: [],
    setDead(v) { log.dead = v !== false; },
    reset() { log.tiles.length = 0; log.byLayer = {}; log.colormaps = 0; log.colormapsFor.length = 0; log.bad.length = 0; },
    layersAsked() { return Object.keys(log.byLayer); },
    forLayer(id) { return log.tiles.filter((t) => t.layer === id); },
  };

  await context.route('**://' + HOST + '/**', async (route) => {
    if (log.dead) return route.abort('internetdisconnected');
    const u = new URL(route.request().url());
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

    if (u.pathname.indexOf('/colormaps/') === 0) {
      log.colormaps++;
      /*
       * GIBS publishes a colour map for the layers that MEASURE something and
       * none at all for the ones that are photographs — a 404 there is an
       * answer, not a failure, and the app has to say two different things.
       * So `legend` may be a function of the layer id, not just one string.
       */
      const lid = decodeURIComponent(u.pathname.split('/').pop().replace(/\.xml$/, ''));
      log.colormapsFor.push(lid);
      const xml = typeof o.legend === 'function' ? o.legend(lid) : o.legend;
      if (!xml) return route.fulfill({ status: 404, headers: cors, body: 'no colormap' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'text/xml', body: xml });
    }

    const m = TILE_RE.exec(u.pathname);
    if (!m) {
      // A malformed tile URL is the failure this fixture exists to catch: in
      // production it is indistinguishable from "no imagery today".
      log.bad.push(u.pathname);
      return route.fulfill({ status: 404, headers: cors, body: 'not a tile' });
    }
    const t = {
      layer: m[1], time: m[2], set: m[3],
      level: +m[4], row: +m[5], col: +m[6], ext: m[7],
      path: u.pathname,
    };
    log.tiles.push(t);
    log.byLayer[t.layer] = (log.byLayer[t.layer] || 0) + 1;

    if (o.has && !o.has(t.layer)) {
      return route.fulfill({ status: 404, headers: cors, body: 'no data' });
    }
    await route.fulfill({
      status: 200, headers: cors, contentType: 'image/png',
      body: tileBytes(t.level, t.row, t.col),
    });
  });

  return log;
}

// The tile a point falls in, by the same arithmetic the app uses. The suite
// computes this independently so it is checking the app, not echoing it.
const RES0 = 0.5625, TILE = 512;
function tileAt(level, lon, lat) {
  const span = RES0 * TILE / Math.pow(2, level);
  return { col: Math.floor((lon + 180) / span), row: Math.floor((90 - lat) / span), span };
}

const LEGEND_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ColorMaps>
  <ColorMap title="Fixture" units="K">
    <Entries>
      <ColorMapEntry rgb="0,0,255" value="[250,260)"/>
    </Entries>
    <Legend type="continuous">
      <LegendEntry rgb="0,0,255" label="250 K" id="1"/>
      <LegendEntry rgb="0,255,0" id="2"/>
      <LegendEntry rgb="255,0,0" label="320 K" id="3"/>
    </Legend>
  </ColorMap>
</ColorMaps>`;

module.exports = { HOST, routeGibs, tileColour, tileAt, solidPng, LEGEND_XML, TILE_RE };
