// Pack apps/parable-of-polygons/ into site/apps/parable-of-polygons/parable-of-polygons.gif.
// Run:  node apps/parable-of-polygons/build.mjs
import { polygonsIcon, screenshotPng } from './icon.mjs';
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

const SPRITE_FILES = {
  yayTriangle: 'yay_triangle.png',
  yayTriangleBlink: 'yay_triangle_blink.png',
  mehTriangle: 'meh_triangle.png',
  sadTriangle: 'sad_triangle.png',
  yaySquare: 'yay_square.png',
  yaySquareBlink: 'yay_square_blink.png',
  mehSquare: 'meh_square.png',
  sadSquare: 'sad_square.png',
  yayPentagon: 'yay_pentagon.png'
};

for (const f of Object.values(SPRITE_FILES)) {
  if (!existsSync(join(dir, 'vendor', 'img', f))) throw new Error('missing sprite vendor/img/' + f);
}
if (!existsSync(join(dir, 'vendor', 'segregated.txt'))) throw new Error('missing vendor/segregated.txt');
if (!existsSync(join(dir, 'COPYING.txt'))) throw new Error('COPYING.txt is missing');

const sprites = {};
for (const [k, f] of Object.entries(SPRITE_FILES)) {
  sprites[k] = 'data:image/png;base64,' + readFileSync(join(dir, 'vendor', 'img', f)).toString('base64');
}
const seg = read('vendor/segregated.txt').trim();
const spritesJs = 'window.POLYGON_SPRITES = ' + JSON.stringify(sprites) + ';\n' +
  'window.POLYGON_SEGREGATED = ' + JSON.stringify(seg) + ';\n';
if (/<\/script/i.test(spritesJs)) throw new Error('sprites.js contains </script');
writeFileSync(join(dir, 'sprites.js'), spritesJs);

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (manifest.minBuild !== 2154) throw new Error('minBuild must be 2154 — capabilities.links');
if (manifest.appId !== 'parable-of-polygons') throw new Error('appId must be parable-of-polygons');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (!manifest.capabilities.multiplayer) throw new Error('manifest must declare capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('this app has no network path');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.town || manifest.data.town.visibility !== 'read-write') {
  throw new Error('town must be read-write');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is Vi Hart & Nicky Case, never GifOS');
if (!/nicky|vi hart/i.test(listing.author.name)) throw new Error('author must credit Vi Hart & Nicky Case');
if (listing.license !== 'CC0-1.0') throw new Error('listing.license must be CC0-1.0');
if (!listing.categories || listing.categories.indexOf('Learning') < 0) throw new Error('category must include Learning');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/parable-of-polygons') {
  throw new Error('listing.homepage must be the gifos tree');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');
if (/gifos\.db|localStorage|sandbox|WASM/i.test(helpMd)) throw new Error('help.md mentions internals');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sprites.js': spritesJs,
  'town.js': read('town.js'),
  'slider.js': read('slider.js'),
  'splash.js': read('splash.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING.txt': read('COPYING.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const SCRIPTS = ['sprites.js', 'town.js', 'slider.js', 'splash.js', 'net.js', 'boot.js'];
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('This is a story of how harmless choices')) {
  throw new Error('essay opening is missing — do not flatten this into a toy');
}
if (!html.includes('Small individual bias')) throw new Error('the moral is missing');
if (!html.includes('Demand diversity near you')) throw new Error('wrapping-up is missing');
if (!html.includes('id="sand-board"')) throw new Error('sandbox town is missing');
if (!html.includes('Vi Hart') || !html.includes('Nicky Case')) throw new Error('credit Vi Hart + Nicky Case');

if (!files['boot.js'].includes("db('prefs')")) throw new Error('boot.js must use gifos.db prefs');
if (!files['net.js'].includes("db('town')")) throw new Error('net.js must use gifos.db town');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) throw new Error(n + ' uses ESM');
}
if (!files['COPYING.txt'].includes('CC0 1.0 Universal')) {
  throw new Error('COPYING.txt is not the upstream CC0 notice');
}

{
  const ctx = {
    window: {}, console, Math, Array, String, Number, Image: function () { this.width = 0; this.src = ''; },
    document: {
      createElement: function () { return { getContext: function () { return null; }, width: 0, height: 0, style: {}, addEventListener: function () {} }; },
      getElementById: function () { return null; }
    },
    requestAnimationFrame: function () { return 0; },
    IntersectionObserver: undefined
  };
  ctx.window = ctx;
  ctx.window.POLYGON_SPRITES = {};
  ctx.window.POLYGON_SEGREGATED = seg;
  vm.runInNewContext(
    files['town.js'] + '\n' +
    'result = (function () {\n' +
    '  var T = Town;\n' +
    '  var tile = 80, diag2 = (tile+5)*(tile+5)*2;\n' +
    '  function peep(x, y, c) { return { x: (x+0.5)*tile, y: (y+0.5)*tile, color: c }; }\n' +
    '  function board(grid) {\n' +
    '    var list = [];\n' +
    '    for (var y=0;y<grid.length;y++) for (var x=0;x<grid[y].length;x++) {\n' +
    '      if (!grid[y][x]) continue;\n' +
    '      list.push(peep(x,y, grid[y][x]===2 ? "triangle" : "square"));\n' +
    '    }\n' +
    '    return list;\n' +
    '  }\n' +
    '  var unhappy = board([[1,0,1],[1,2,1],[1,0,2]]);\n' +
    '  var u = T.samenessOf(unhappy[3], unhappy, diag2);\n' +
    '  if (u.neighbors !== 6) throw new Error("unhappy neighbors " + u.neighbors);\n' +
    '  if (Math.abs(u.sameness - 1/6) > 1e-9) throw new Error("unhappy sameness " + u.sameness);\n' +
    '  if (!T.isShaking(u.sameness, u.neighbors, 0.33, 1, false)) throw new Error("unhappy should shake");\n' +
    '  var happy = board([[1,0,1],[1,2,1],[2,0,2]]);\n' +
    '  var h = T.samenessOf(happy[3], happy, diag2);\n' +
    '  if (h.neighbors !== 6) throw new Error("happy neighbors " + h.neighbors);\n' +
    '  if (Math.abs(h.sameness - 2/6) > 1e-9) throw new Error("happy sameness " + h.sameness);\n' +
    '  if (T.isShaking(h.sameness, h.neighbors, 0.33, 1, false)) throw new Error("happy should not shake");\n' +
    '  var check = board([[2,1,2],[1,2,1],[2,1,2]]);\n' +
    '  var c = T.samenessOf(check[4], check, diag2);\n' +
    '  if (c.neighbors !== 8) throw new Error("check neighbors " + c.neighbors);\n' +
    '  if (Math.abs(c.sameness - 0.5) > 1e-9) throw new Error("check sameness " + c.sameness);\n' +
    '  if (T.isShaking(c.sameness, c.neighbors, 0.33, 1, false)) throw new Error("checkerboard happy at 33");\n' +
    '  if (!T.isShaking(c.sameness, c.neighbors, 0.51, 1, false)) throw new Error("checkerboard unhappy at 51");\n' +
    '  var g = T.parseGrid(' + JSON.stringify(seg) + ');\n' +
    '  if (g.length !== 20 || g[0].length !== 20) throw new Error("seg size");\n' +
    '  var n = 0; for (var y=0;y<20;y++) for (var x=0;x<20;x++) if (g[y][x]) n++;\n' +
    '  if (n !== 339) throw new Error("seg count " + n);\n' +
    '  return h.sameness;\n' +
    '})();',
    ctx
  );
  console.log('Schelling unhappy/happy/checkerboard + segregated snapshot ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: polygonsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'parable-of-polygons', 'parable-of-polygons.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/parable-of-polygons/parable-of-polygons.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
