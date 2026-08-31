// Pack apps/shapez/ into site/apps/shapez/shapez.gif
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Run:  node apps/shapez/build.mjs
import { shapezIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

function assert(cond, msg) { if (!cond) throw new Error(msg); }

assert(existsSync(join(dir, 'COPYING.txt')), 'COPYING.txt (GPL-3) is missing');
assert(read('COPYING.txt').includes('GNU GENERAL PUBLIC LICENSE'), 'COPYING.txt is not GPL');
assert(existsSync(join(dir, 'vendor', 'UPSTREAM.txt')), 'vendor/UPSTREAM.txt is missing');
assert(existsSync(join(dir, 'help.md')), 'help.md is missing');
assert(read('help.md').trim().length >= 400, 'help.md is too short');

assert(manifest.gifos === '1.0', 'manifest.gifos');
assert(manifest.appId === 'shapez', 'manifest.appId');
assert(manifest.minBuild === 947, 'minBuild must be 947');
assert(manifest.capabilities && manifest.capabilities.db === true, 'capabilities.db');
assert(manifest.capabilities.multiplayer === true, 'capabilities.multiplayer');
assert(!manifest.capabilities.network, 'no network');
assert(manifest.data.prefs.visibility === 'private', 'prefs private');
assert(manifest.data.cells.visibility === 'read-write', 'cells read-write');
assert(manifest.data.world.visibility === 'read-only', 'world host-only');
assert(manifest.data.flow.visibility === 'read-only', 'flow host-only');

assert(listing.basedOn && listing.basedOn.blessed === false, 'unofficial port');
assert(listing.porter && listing.porter.name === 'GifOS', 'porter GifOS');
assert(listing.author && listing.author.name === 'tobspr Games', 'author tobspr Games');
assert(listing.license === 'GPL-3.0', 'listing.license GPL-3.0');
assert(listing.categories[0] === 'Games', 'category Games');
assert(/factory lives in the GIF|inside the file/i.test(listing.description), 'listing must lead with the GifOS reason');
assert(!/syncs across|cloud/i.test(listing.description), 'no cloud overclaim');

// Shape-code self-test (the opening levels).
function parse(code) {
  const q = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    const a = code.charAt(i * 2), b = code.charAt(i * 2 + 1);
    if (a && a !== '-') q[i] = a + (b || 'u');
  }
  return q;
}
function ser(q) {
  return q.map((p) => p || '--').join('');
}
function cut(code) {
  const q = parse(code);
  return { left: ser([null, null, q[2], q[3]]), right: ser([q[0], q[1], null, null]) };
}
function rot(code) {
  const q = parse(code);
  return ser([q[3], q[0], q[1], q[2]]);
}
assert(cut('CuCuCuCu').left === '----CuCu', 'cut circle → left half');
assert(cut('CuCuCuCu').right === 'CuCu----', 'cut circle → right half');
assert(rot('----CuCu') === 'Cu----Cu', 'rotate left half → top half');
assert(cut('Cu----Cu').right === 'Cu------', 'cut top half → TR quarter');
assert(rot('RuRuRuRu') === 'RuRuRuRu', 'full rect is rotationally symmetric');

const SCRIPTS = ['shapes.js', 'game.js', 'draw.js', 'net.js', 'ui.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shapes.js': read('shapes.js'),
  'game.js': read('game.js'),
  'draw.js': read('draw.js'),
  'net.js': read('net.js'),
  'ui.js': read('ui.js'),
  'boot.js': read('boot.js'),
  'help.md': read('help.md'),
  'COPYING.txt': read('COPYING.txt'),
  'vendor/UPSTREAM.txt': read('vendor/UPSTREAM.txt')
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  assert(html.includes('src="' + s + '"'), 'index.html does not load ' + s);
}
assert(html.includes('href="style.css"'), 'index.html does not load style.css');
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: shapezIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'shapez', 'shapez.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/shapez/shapez.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
