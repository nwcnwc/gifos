// Pack apps/worldview/ into the finished, downloadable
// site/apps/worldview/worldview.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/worldview/build.mjs
//
// The one thing worth reading here is assets.js. An app's frame is one srcdoc
// document with no base URL and connect-src 'none' — it cannot fetch its own
// packed files, not even as a data: URL. So the baked assets (the Blue Marble,
// the coastline vectors, the gazetteer, the layer catalog, the tours) are
// emitted as ONE generated script that declares them, and index.html loads it
// like any other file. It is generated at build time rather than committed
// because it is a re-encoding of assets/ that would otherwise be a second,
// drifting copy of the same 500 KB.
import { worldviewIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush.
{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        },
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));

// Order matters: each module attaches itself to window and the ones after it
// read what came before. index.html lists them in the same order.
const SCRIPTS = ['assets.js', 'wv-util.js', 'wv-data.js', 'wv-tiles.js', 'wv-map.js',
                 'wv-gif.js', 'wv-anim.js', 'wv-ui.js', 'wv-sheets.js', 'wv-mp.js', 'app.js'];

// ---- the generated asset module --------------------------------------------
const catalog = JSON.parse(read('assets/catalog.json'));
const places = JSON.parse(read('assets/places.json'));
const tours = JSON.parse(read('tours.json')).tours;

if (!catalog.layers.length) throw new Error('catalog.json has no layers');
if (!places.name.length) throw new Error('places.json has no places');
if (!tours.length) throw new Error('tours.json has no tours');

// Every tour must point at layers this build actually has, or Explore is a row
// of buttons that quietly do nothing.
const known = new Set(catalog.layers.map((l) => l.id));
['wv:base', 'wv:coast', 'wv:borders', 'wv:places', 'wv:grid'].forEach((id) => known.add(id));
/*
 * A tour REPLACES the layer stack, so a tour that reaches for the GIBS
 * reference rasters (Coastlines_15m, Reference_Labels_15m) silently throws
 * away the offline vectors the app boots with. Take one, get on a plane, and
 * the coastlines you had are gone — the one thing this port is FOR. The
 * built-in equivalents are packed in the GIF; a tour uses those.
 */
const NETWORK_FURNITURE = { Coastlines_15m: 'wv:coast', Reference_Labels_15m: 'wv:places' };
for (const t of tours) {
  for (const id of t.layers) {
    if (!known.has(id)) throw new Error('tour ' + t.id + ' wants unknown layer ' + id);
    if (NETWORK_FURNITURE[id]) {
      throw new Error('tour ' + t.id + ' uses the network layer ' + id +
        ' for map furniture — use the built-in ' + NETWORK_FURNITURE[id] +
        ', or taking the tour costs the user their offline basemap');
    }
  }
  if (t.date !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
    throw new Error('tour ' + t.id + ' has a bad date: ' + t.date);
  }
}

const assetsJs = 'window.WV_ASSETS = ' + JSON.stringify({
  base: readBin('assets/base.jpg').toString('base64'),
  world: readBin('assets/world.bin').toString('base64'),
  places: places,
  catalog: catalog,
  tours: tours,
}) + ';\n';

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'assets.js': assetsJs,
};
for (const s of SCRIPTS) {
  if (s === 'assets.js') continue;
  files[s] = read(s);
}

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md is too short');

// The runtime inlines every <script src> it finds by rewriting the tag, so a
// script the HTML never references would travel in the GIF and never run.
// Catching that here is much cheaper than catching it as a blank app.
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

// The network allowlist is the app's whole outside world, and the tile URL is
// built from this host in wv-tiles.js. A manifest that drops it would ship an
// app that can only ever draw the offline base.
const HOST = 'gibs.earthdata.nasa.gov';
if (!(manifest.capabilities.network || []).includes(HOST)) {
  throw new Error('manifest must declare ' + HOST + ' in capabilities.network');
}
if (!files['wv-tiles.js'].includes(HOST)) throw new Error('wv-tiles.js no longer points at ' + HOST);

const bytes = await gif.encode(files, { preview: worldviewIcon(), accent: manifest.accent });
// Into the PUBLISH boundary: site/ is what GitHub Pages serves, so a GIF
// anywhere else is not downloadable (see apps/README.md).
const out = join(dir, '..', '..', 'site', 'apps', 'worldview', 'worldview.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/worldview/worldview.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (' + catalog.layers.length + ' layers, ' +
            places.name.length + ' places, ' + tours.length + ' tours)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
