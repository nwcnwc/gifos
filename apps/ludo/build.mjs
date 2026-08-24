import { ludoIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['rules.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-ludo.txt'))) throw new Error('COPYING missing');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'rules.js': read('rules.js'),
  'app.js': read('app.js'),
  'COPYING-ludo.txt': read('vendor/COPYING-ludo.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md too short');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (!files['app.js'].includes('Invite')) throw new Error('tell the player to press Invite');
if (!files['app.js'].includes("db('save')")) throw new Error('save');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/chukwumaijem/ludo-game') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'chukwumaijem' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is chukwumaijem');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'MIT') throw new Error('MIT');
if (listing.categories[0] !== 'Games') throw new Error('Games');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'React']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (manifest.appId !== 'ludo') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network || manifest.capabilities.wasm) throw new Error('no net/wasm');
if (!files['COPYING-ludo.txt'].includes('Chukwuma Ezumezu')) throw new Error('COPYING');
if (!files['rules.js'].includes('56')) throw new Error('56 steps');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*import\s/m.test(s) || /^\s*export\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { window: {}, console, Math };
  ctx.window = ctx;
  vm.runInNewContext(files['rules.js'] + '\n' +
    'result = (function () {\n' +
    '  if (LUDO.LOOP.length !== 52) throw new Error("loop " + LUDO.LOOP.length);\n' +
    '  var s = LUDO.fresh(4);\n' +
    '  if (LUDO.moves(Object.assign(LUDO.clone(s), {die:1, rolled:true, turn:0})).length) throw new Error("1 leaves yard");\n' +
    '  var m6 = LUDO.moves(Object.assign(LUDO.clone(s), {die:6, rolled:true, turn:0}));\n' +
    '  if (m6.length !== 4) throw new Error("6 should free 4 tokens, got " + m6.length);\n' +
    '  s.die = 6; s.rolled = true;\n' +
    '  s = LUDO.apply(s, 0, 6);\n' +
    '  if (s.tokens[0][0] !== 0) throw new Error("leave yard -> 0");\n' +
    '  s.tokens[1][0] = 0;\n' +
    '  var cell = LUDO.cellOf(0, 13, 0);\n' +
    '  var hit = LUDO.cellOf(1, 0, 0);\n' +
    '  if (cell.r !== hit.r || cell.c !== hit.c) throw new Error("start 13 is not green start");\n' +
    '  return "ok";\n' +
    '})();', ctx);
  if (ctx.result !== 'ok') throw new Error('self-test ' + ctx.result);
  console.log('ludo rules self-test ok');
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: ludoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'ludo', 'ludo.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/ludo/ludo.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
