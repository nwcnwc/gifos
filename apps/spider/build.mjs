// Pack apps/spider/ into site/apps/spider/spider.gif.
import { spiderIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['engine.js', 'app.js'];

if (!existsSync(join(dir, 'vendor', 'COPYING-spider.txt'))) throw new Error('COPYING missing');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'engine.js': read('engine.js'),
  'app.js': read('app.js'),
  'COPYING-spider.txt': read('vendor/COPYING-spider.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('db');
if (manifest.capabilities.multiplayer) throw new Error('one-player');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save private');
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'spider-solitaire') {
  throw new Error('basedOn');
}
if (listing.author.name !== 'lklynet' || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Games') throw new Error('listing');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}
if (!files['COPYING-spider.txt'].includes('Lee Kelly')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')")) throw new Error('save');
if (!files['engine.js'].includes('suit')) throw new Error('suits');
if (!files['app.js'].includes('onBack')) throw new Error('onBack');
if (!files['app.js'].includes('data-suits')) throw new Error('1/2/4');
if (!files['help.md'].includes('4 suits')) throw new Error('help 4-suit');

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
    files['engine.js'] + '\n' +
    'result = (function () {\n' +
    '  var b = Spider.createBoardState("seed-1");\n' +
    '  var b2 = Spider.createBoardState("seed-1");\n' +
    '  if (JSON.stringify(b.tableau) !== JSON.stringify(b2.tableau)) throw new Error("deal not deterministic");\n' +
    '  if (b.tableau.length !== 10) throw new Error("piles");\n' +
    '  var n = 0; b.tableau.forEach(function (p) { n += p.length; });\n' +
    '  if (n + b.stock.length !== 104) throw new Error("cards " + n + " " + b.stock.length);\n' +
    '  if (b.tableau[0].length !== 6 || b.tableau[4].length !== 5) throw new Error("deal shape");\n' +
    '  if (!Spider.isValidMoveGroup([{rank:13,suit:0},{rank:12,suit:0},{rank:11,suit:0}])) throw new Error("run");\n' +
    '  if (Spider.isValidMoveGroup([{rank:13,suit:0},{rank:12,suit:1}])) throw new Error("mixed suit moved");\n' +
    '  if (Spider.isValidMoveGroup([{rank:13,suit:0},{rank:11,suit:0}])) throw new Error("gap");\n' +
    '  var b4 = Spider.createBoardState("seed-1", 4);\n' +
    '  if (b4.suits !== 4) throw new Error("4-suit");\n' +
    '  return b.stock.length;\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 50) throw new Error('stock ' + ctx.result);
  console.log('spider deal: 54 on table, 50 in stock');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: spiderIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'spider', 'spider.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/spider/spider.gif —', bytes.length, 'bytes');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
