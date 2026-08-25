// Pack apps/json-crack/ into the finished, downloadable
// site/apps/json-crack/json-crack.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/json-crack/build.mjs
import { jsonCrackIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/COPYING-jsoncrack.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'json-crack') throw new Error('appId must be json-crack');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('json-crack has no network path');
if (manifest.capabilities.wasm) throw new Error('json-crack is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'JSON Crack') throw new Error('basedOn.name must be JSON Crack');
if (listing.basedOn.url !== 'https://github.com/AykutSarac/jsoncrack.com') {
  throw new Error('basedOn.url must be AykutSarac/jsoncrack.com');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Aykut Saraç, never GifOS');
}
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (!listing.categories || listing.categories[0] !== 'Developer') {
  throw new Error('listing.categories must include Developer');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/json-crack') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (!/^Paste JSON/i.test(listing.description)) {
  throw new Error('listing description must lead with paste-and-see');
}
if (/\bif you want\b/i.test(listing.description) || /\bdrop\b/i.test(listing.description)) {
  throw new Error('listing copy forbids "if you want" / "drop"');
}
{
  const help = read('help.md');
  if (/\bInvite\b/.test(help) || /\bSave\b/.test(help)) {
    throw new Error('help.md must not document Invite/Save — the OS appends those');
  }
}

const SCRIPTS = ['graph.js', 'mp.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'graph.js': read('graph.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-jsoncrack.txt': read('vendor/COPYING-jsoncrack.txt'),
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
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last document privately');
}
if (!files['app.js'].includes('pinch') || !files['style.css'].includes('touch-action: none')) {
  throw new Error('phone pan/pinch must be wired (pinch + touch-action: none)');
}
if (!files['app.js'].includes('showEmpty') || !files['graph.js'].includes('parseJson')) {
  throw new Error('empty textarea must be an empty state, not a parse dump');
}
if (!html.includes('tab-text') || !html.includes('tab-graph') || !html.includes('zoom-fit')) {
  throw new Error('phone Text/Graph tabs and Fit zoom must exist');
}
if (!files['app.js'].includes('gifos.onBack')) {
  throw new Error('register gifos.onBack so phone Back leaves Text or resets the view');
}
if (!files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must share the document on own rows');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  try { new vm.Script(s, { filename: n }); } catch (e) {
    throw new Error(n + ' does not parse: ' + (e && e.message));
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-jsoncrack.txt'].includes('Apache License')) {
  throw new Error('COPYING-jsoncrack.txt is not the Apache-2.0 notice');
}

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['graph.js'] + '\n' +
    'this.result = (function () {\n' +
    '  var empty = JsonCrack.parseJson("  \\n");\n' +
    '  if (!empty.empty) throw new Error("empty parse");\n' +
    '  var bad = JsonCrack.parseJson("{");\n' +
    '  if (!bad.error || !/Not valid JSON/.test(bad.message)) throw new Error("bad parse " + bad.message);\n' +
    '  var g = JsonCrack.toGraph({ a: 1, b: { c: "x" }, d: [true, { e: null }] });\n' +
    '  if (g.nodes.length !== 4) throw new Error("nodes " + g.nodes.length);\n' +
    '  if (g.edges.length !== 3) throw new Error("edges " + g.edges.length);\n' +
    '  var root = g.nodes[0];\n' +
    '  if (root.rows.length !== 3 || root.rows[0].k !== "a" || !root.rows[1].nested) throw new Error("root rows");\n' +
    '  var L = JsonCrack.layout(g, {});\n' +
    '  if (!L.nodes[0].w || !L.nodes[0].h) throw new Error("layout");\n' +
    '  if (JsonCrack.cardsOverlap(L)) throw new Error("overlap");\n' +
    '  var folded = JsonCrack.layout(g, (function(){ var o={}; o[root.id]=true; return o; })());\n' +
    '  if (folded.nodes.length !== 1) throw new Error("collapse " + folded.nodes.length);\n' +
    '  return g.nodes.length;\n' +
    '})();',
    ctx
  );
  console.log('JSON graph node rule + collapse ok — nodes', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: jsonCrackIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'json-crack', 'json-crack.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/json-crack/json-crack.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
