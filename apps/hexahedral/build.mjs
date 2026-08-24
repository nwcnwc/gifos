// Pack apps/hexahedral/ into site/apps/hexahedral/hexahedral.gif.
import { hexahedralIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['levels.js', 'game.js', 'app.js'];
if (!existsSync(join(dir, 'vendor', 'COPYING-hexahedral.txt'))) throw new Error('COPYING');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'levels.js': read('levels.js'),
  'game.js': read('game.js'),
  'app.js': read('app.js'),
  'COPYING-hexahedral.txt': read('vendor/COPYING-hexahedral.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error(s);
if (/type=["']module["']/.test(html)) throw new Error('module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('url');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite');
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (!manifest.capabilities.db) throw new Error('db');
if (manifest.capabilities.multiplayer) throw new Error('one-player');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.data.save.visibility !== 'private') throw new Error('save');
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'Hexahedral') throw new Error('basedOn');
if (listing.author.name !== 'mminer' || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error(bad);
}
if (!files['COPYING-hexahedral.txt'].includes('Matthew Miner')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')")) throw new Error('save');
if (!files['game.js'].includes('isoDir') || !files['game.js'].includes('bests')) throw new Error('engine');
if (!files['app.js'].includes('setPointerCapture') || !files['app.js'].includes('isoDrag')) throw new Error('slide');
if (/require\(|createStore|h\('/.test(files['app.js'])) throw new Error('shell must stay behind');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(
    files['levels.js'] + '\n' +
    'result = (function () {\n' +
    '  if (HEX_LEVELS.length !== 30) throw new Error("levels " + HEX_LEVELS.length);\n' +
    '  var L = HEX_LEVELS[0];\n' +
    '  if (L.tiles.length !== 2 || L.tiles[0].length !== 2) throw new Error("level 0 shape");\n' +
    '  if (L.maxMoves !== 3) throw new Error("maxMoves");\n' +
    '  var unpressed = 0;\n' +
    '  L.tiles.forEach(function (row) { row.forEach(function (t) { if (t === "0") unpressed++; }); });\n' +
    '  if (unpressed < 1) throw new Error("no raised tiles");\n' +
    '  return HEX_LEVELS[29].tiles.length;\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 5) throw new Error('last level size ' + ctx.result);
  console.log('hexahedral 30 jam levels ok');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: hexahedralIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hexahedral', 'hexahedral.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hexahedral/hexahedral.gif —', bytes.length, 'bytes');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
