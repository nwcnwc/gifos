// Pack apps/sokoban/ into site/apps/sokoban/sokoban.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Offline and deterministic. The Vite original is not shipped — this is a
// classic-script rewrite of the same fifty warehouses. vendor.mjs is the
// only networked step, and it is run only when the pin moves.
//
// Run:  node apps/sokoban/build.mjs
import { sokobanIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
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

if (!existsSync(join(dir, 'vendor', 'levels.json'))) {
  throw new Error('vendor/levels.json is missing — run node apps/sokoban/vendor.mjs first (it needs the network).');
}

const rawLevels = JSON.parse(read('vendor/levels.json'));
if (!Array.isArray(rawLevels) || rawLevels.length !== 50) {
  throw new Error('expected 50 warehouses, got ' + (rawLevels && rawLevels.length));
}
for (const lv of rawLevels) {
  if (lv.w * lv.h !== lv.map.length) throw new Error('level ' + lv.id + ' map length mismatch');
  if ((lv.map.match(/[@+]/g) || []).length !== 1) throw new Error('level ' + lv.id + ' needs one keeper');
  const boxes = (lv.map.match(/[$*]/g) || []).length;
  const goals = (lv.map.match(/[.*+]/g) || []).length;
  if (boxes !== lv.boxes || boxes !== goals) {
    throw new Error('level ' + lv.id + ' boxes/goals ' + boxes + '/' + goals);
  }
}

const levelsJs = '(function(root){\n"use strict";\nvar SK=root.SK||(root.SK={});\nSK.levels=' +
  JSON.stringify(rawLevels) + ';\n})(this);\n';

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(levelsJs, sandbox);
vm.runInContext(read('game.js'), sandbox);
const SK = sandbox.SK;
if (!SK || !SK.levels || SK.levels.length !== 50) {
  throw new Error('levels did not load');
}
const first = SK.loadLevel(1);
if (!first || first.total !== 6) throw new Error('level 1 should have 6 boxes');
const startMap = first.map;
if (SK.tryMove(first, 0, 0) !== false) throw new Error('a zero move must fail');
if (first.map !== startMap || first.moves !== 0 || first.history.length) {
  throw new Error('a failed move mutated the warehouse');
}
let stepped = false;
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
  const s = SK.loadLevel(1);
  if (SK.tryMove(s, dx, dy)) {
    if (s.moves !== 1) throw new Error('a step did not count a move');
    if (!SK.undo(s) || s.map !== s.start || s.moves !== 0) {
      throw new Error('undo did not restore the warehouse');
    }
    stepped = true;
    break;
  }
}
if (!stepped) throw new Error('keeper cannot take a first step on level 1');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const SCRIPTS = ['levels.js', 'game.js', 'mp.js', 'touch.js', 'app.js'];

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md must exist and be at least 400 characters after trim');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'levels.js': levelsJs,
  'game.js': read('game.js'),
  'mp.js': read('mp.js'),
  'touch.js': read('touch.js'),
  'app.js': read('app.js'),
  'COPYING-sokoban.txt': read('vendor/COPYING-sokoban.txt'),
  'help.md': helpMd,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/src=["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote script — nothing may be fetched.');
}
if (!html.includes('id="pad"')) throw new Error('touch d-pad is required');
if (!html.includes('id="friendBtn"') || !html.includes('Invite')) {
  throw new Error('Play a friend chrome must tell the player to press Invite');
}
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('sokoban has no network path');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 (nothing newer than the App Store)');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live scores have to sync');
}
if (!files['mp.js'].includes('Invite') || !files['mp.js'].includes("db('players')")) {
  throw new Error('mp.js must race on the players collection and tell the player to press Invite');
}
if (!files['touch.js'].includes('touchstart') || !files['touch.js'].includes('data-dx')) {
  throw new Error('touch.js must reveal a pad on first touch');
}
if (listing.author && listing.author.name === 'GifOS') {
  throw new Error('author is them (klevze), never GifOS — a port is not first-party');
}
if (!listing.author || listing.author.name !== 'klevze') {
  throw new Error('listing.author must be klevze');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'sokoban') {
  throw new Error('listing.basedOn.name must be sokoban');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing is fetched.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}

const shot = screenshotPng();
if (shot.length < 1000) throw new Error('screenshot png looks empty');
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: sokobanIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'sokoban', 'sokoban.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/sokoban/sokoban.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (50 warehouses, no network)');
console.log('wrote apps/sokoban/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
