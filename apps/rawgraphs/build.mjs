// Pack apps/rawgraphs/ into site/apps/rawgraphs/rawgraphs.gif.
import { rawgraphsIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
        }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'csv.js', 'charts.js', 'sample.js', 'app.js', 'mp.js', 'style.css',
  'index.html', 'help.md', 'COPYING.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947 || manifest.appId !== 'rawgraphs') throw new Error('manifest');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('must declare capabilities.db');
if (!manifest.capabilities.multiplayer) throw new Error('must declare capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('rawgraphs has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/rawgraphs/rawgraphs-app') {
  throw new Error('basedOn.url must be rawgraphs/rawgraphs-app');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (listing.releaseDate !== '2026-08-30') throw new Error('listing.releaseDate');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/rawgraphs') throw new Error('homepage');
if (!listing.description.includes('unofficial port')) throw new Error('listing must say unofficial port');
if (!listing.description.includes('offline') && !listing.description.toLowerCase().includes('this device')) {
  throw new Error('listing must sell offline / this device');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'CDN', 'IIFE']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['sample.js', 'csv.js', 'charts.js', 'app.js', 'mp.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sample.js': read('sample.js'),
  'csv.js': read('csv.js'),
  'charts.js': read('charts.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING.txt': read('COPYING.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load CSS');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last table privately');
}
if (!files['app.js'].includes('onBack')) throw new Error('app.js must handle Back');
if (!files['mp.js'].includes('Invite') || !files['mp.js'].includes("db('room')")) {
  throw new Error('mp.js must mention Invite and use room');
}
if (!files['charts.js'].includes('alluvial') || !files['charts.js'].includes('treemap')) {
  throw new Error('charts.js must include alluvial and treemap');
}
if (!files['csv.js'].includes('parseCsv') || !files['csv.js'].includes('looksSpreadsheet')) {
  throw new Error('csv.js must export parseCsv and looksSpreadsheet');
}
if (!files['sample.js'].includes('RAW_SAMPLE_CSV')) throw new Error('sample.js must export RAW_SAMPLE_CSV');
if (!html.includes('id="gallery"') || !html.includes('id="mapping"') || !html.includes('id="copyBtn"')) {
  throw new Error('index.html must have gallery, mapping, copy');
}
if (!files['COPYING.txt'].includes('DensityDesign') || !files['COPYING.txt'].includes('Apache')) {
  throw new Error('COPYING.txt is not the Apache-2.0 RAWGraphs notice');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const ctx = { window: {} };
ctx.globalThis = ctx.window;
vm.runInNewContext(files['sample.js'] + '\n' + files['csv.js'] + '\n' + files['charts.js'], ctx);
const w = ctx.window;
const csvApi = w.RawCsv;
const chartsApi = w.RawCharts;
const sample = w.RAW_SAMPLE_CSV;
if (!csvApi || !chartsApi || !sample) throw new Error('vm: globals missing');
const parsed = csvApi.parseCsv(sample);
if (!parsed.data || parsed.rows < 20) throw new Error('sample parse failed');
const types = csvApi.inferTypes(parsed.data, parsed.fields);
if (types.box !== 'number' || types.studio !== 'string') throw new Error('inferTypes missed box/studio');
const xls = csvApi.looksSpreadsheet('budget.xlsx');
if (!xls) throw new Error('must refuse Excel by name');
const drawn = chartsApi.drawChart('alluvial', parsed.data, chartsApi.sampleMapping('alluvial'), { w: 640, h: 360 });
if (!drawn.ok || !drawn.svg || !drawn.svg.includes('<path')) {
  throw new Error('alluvial did not draw: ' + (drawn.message || 'empty'));
}
const bar = chartsApi.drawChart('barchart', parsed.data, chartsApi.sampleMapping('barchart'), { w: 640, h: 360 });
if (!bar.ok || !bar.svg.includes('<rect')) throw new Error('bar did not draw');
const tree = chartsApi.drawChart('treemap', parsed.data, chartsApi.sampleMapping('treemap'), { w: 640, h: 360 });
if (!tree.ok || !tree.svg.includes('<rect')) throw new Error('treemap did not draw');
const ids = chartsApi.CHARTS.map((c) => c.id);
for (const need of ['alluvial', 'barchart', 'treemap', 'bumpchart', 'beeswarm', 'sunburst']) {
  if (ids.indexOf(need) < 0) throw new Error('missing chart ' + need);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: rawgraphsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'rawgraphs', 'rawgraphs.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/rawgraphs/rawgraphs.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
