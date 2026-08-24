// Pack apps/blackjack/ into site/apps/blackjack/blackjack.gif.
import { blackjackIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['bj.js', 'app.js'];
if (!existsSync(join(dir, 'vendor', 'COPYING-blackjack.txt'))) throw new Error('COPYING');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'bj.js': read('bj.js'),
  'app.js': read('app.js'),
  'COPYING-blackjack.txt': read('vendor/COPYING-blackjack.txt'),
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
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.data.save.visibility !== 'private' || manifest.data.room.visibility !== 'read-write') {
  throw new Error('data');
}
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'blackjack') throw new Error('basedOn');
if (listing.author.name !== 'hanhaechi' || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error(bad);
}
if (!files['COPYING-blackjack.txt'].includes('Modesta Naciute')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("db('room')")) throw new Error('db');
if (!files['app.js'].includes('Invite')) throw new Error('Invite copy');
if (/ce-sample-api|herokuapp|\$\.ajax/i.test(files['app.js'])) throw new Error('server must stay behind');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { window: {}, console, Math };
  ctx.window = ctx;
  vm.runInNewContext(
    files['bj.js'] + '\n' +
    'result = (function () {\n' +
    '  var d = BJ.makeDeck();\n' +
    '  if (d.length !== 52) throw new Error("deck " + d.length);\n' +
    '  var ace = {value:"a", suit:"spades", game_value:11};\n' +
    '  var ten = {value:"10", suit:"hearts", game_value:10};\n' +
    '  var six = {value:"6", suit:"clubs", game_value:6};\n' +
    '  if (BJ.total([ace, ten]) !== 21) throw new Error("bj total");\n' +
    '  if (BJ.total([ace, ace, six]) !== 18) throw new Error("soft aces");\n' +
    '  if (!BJ.isBj([ace, ten])) throw new Error("isBj");\n' +
    '  var r = BJ.decide([ten, six], [ace, ten]);\n' +
    '  if (r.winner !== 1 || !r.bj) throw new Error("player bj");\n' +
    '  var bust = BJ.decide([{game_value:10},{game_value:8}], [{game_value:10},{game_value:10},{game_value:5}]);\n' +
    '  if (bust.winner !== 0) throw new Error("bust");\n' +
    '  return BJ.total([ace, ten]);\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 21) throw new Error('bj self-test ' + ctx.result);
  console.log('blackjack rules ok — 21');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: blackjackIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'blackjack', 'blackjack.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/blackjack/blackjack.gif —', bytes.length, 'bytes');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
