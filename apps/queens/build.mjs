import { queensIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['vendor/levels.js', 'game.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'levels.js'))) {
  throw new Error('vendor/levels.js missing — run node apps/queens/vendor.mjs');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-queens.txt'))) {
  throw new Error('COPYING-queens.txt missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/levels.js': read('vendor/levels.js'),
  'game.js': read('game.js'),
  'app.js': read('app.js'),
  'COPYING-queens.txt': read('vendor/COPYING-queens.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md too short');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (!files['app.js'].includes('Invite') && !files['index.html'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')")) throw new Error('save required');
if (!files['app.js'].includes('onBack')) throw new Error('onBack required');
if (!files['app.js'].includes('row.board')) throw new Error('restore in-progress board');
if (!files['app.js'].includes("db('room')")) throw new Error('room subscribe');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/samimsu/queens-game') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'samimsu') throw new Error('author samimsu');
if (/gifos/i.test(listing.author.name)) throw new Error('author is not GifOS');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter GifOS');
if (listing.license !== 'MIT') throw new Error('MIT');
if (listing.categories[0] !== 'Games') throw new Error('Games');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'Vite']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}
if (/LinkedIn/i.test(files['app.js'] + files['game.js'] + files['index.html'] + files['help.md'] + listingBlob)) {
  throw new Error('do not claim LinkedIn');
}
if (manifest.minBuild !== 947) throw new Error('minBuild 947');
if (manifest.appId !== 'queens') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('db+mp');
if (manifest.capabilities.network || manifest.capabilities.wasm) throw new Error('no network/wasm');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n !== 'vendor/levels.js' && (/^\s*import\s/m.test(s) || /^\s*export\s/m.test(s))) {
    throw new Error(n + ' ESM');
  }
  if (n === 'vendor/levels.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(files['vendor/levels.js'] + '\n' + files['game.js'] + '\n' +
    'result = (function () {\n' +
    '  if (!QUEENS_LEVELS || QUEENS_LEVELS.length < 100) throw new Error("too few levels");\n' +
    '  var lv = QUEENS_LEVELS[0];\n' +
    '  var regions = QNS.regionsOf(lv);\n' +
    '  var b = QNS.emptyBoard(lv.size);\n' +
    '  if (QNS.checkWin(b, regions)) throw new Error("empty board wins");\n' +
    '  b = QNS.tap(b, regions, 0, 0, false);\n' +
    '  if (b[0][0] !== "X") throw new Error("tap empty -> X");\n' +
    '  b = QNS.tap(b, regions, 0, 0, false);\n' +
    '  if (b[0][0] !== "Q") throw new Error("tap X -> Q");\n' +
    '  return QUEENS_LEVELS.length;\n' +
    '})();', ctx);
  console.log('queens self-test ok —', ctx.result, 'levels');
}

if (!process.argv.includes('--keep-shot')) {
  const shot = screenshotPng();
  if (shot[0] !== 0x89) throw new Error('screenshot not png');
  writeFileSync(join(dir, 'screenshot.png'), shot);
}

const bytes = await gif.encode(files, { preview: queensIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'queens', 'queens.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/queens/queens.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
