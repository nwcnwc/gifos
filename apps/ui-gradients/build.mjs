// Pack apps/ui-gradients/ into the finished, downloadable
// site/apps/ui-gradients/ui-gradients.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// gradients.json and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/ui-gradients/build.mjs
import { uiGradientsIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const JSON_SHA256 = '56e1cf9e9c213aece92be9e1abe32aed958bf10c77031f2504431964b1cb7030';

for (const need of [
  'vendor/gradients.json',
  'vendor/gradients.js',
  'vendor/COPYING-uigradients.txt',
  'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/ui-gradients/vendor.mjs first (it needs the network).');
  }
}

const jsonBuf = readFileSync(join(dir, 'vendor', 'gradients.json'));
const jsonHex = createHash('sha256').update(jsonBuf).digest('hex');
if (jsonHex !== JSON_SHA256) {
  throw new Error('vendor/gradients.json sha256 ' + jsonHex + ' ≠ pin ' + JSON_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'JSON', 'CDN', 'linear-gradient', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/gradients.js', 'app.js', 'mp.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/gradients.js': read('vendor/gradients.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  // The licence rides INSIDE the GIF, not just beside it in the repo. A copy
  // of this app that someone was handed is a distribution of uiGradients' MIT
  // work, and has to carry the notice with it.
  'COPYING-uigradients.txt': read('vendor/COPYING-uigradients.txt'),
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
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (!html.includes('id="grid"') || !html.includes('id="recipe"') || !html.includes('id="swatches"')) {
  throw new Error('index.html must have a browse grid, recipe box, and colour swatches');
}
if (!html.includes('id="favBtn"') || !html.includes('id="shareBtn"') || !html.includes('id="copyBtn"')) {
  throw new Error('index.html must have favourite, share, and copy controls');
}
if (manifest.name !== 'uiGradients') throw new Error('manifest.name must be uiGradients');
if (manifest.appId !== 'ui-gradients') throw new Error('appId must be ui-gradients');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — hearts live in gifos.db.');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer — Share this pick is a room.');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — hearts do not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the pick has to sync.');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('ui-gradients has no network path');
if (manifest.capabilities.wasm) throw new Error('ui-gradients is classic JS — no wasm');
if (listing.basedOn?.name !== 'uiGradients') {
  throw new Error('listing.basedOn.name must be uiGradients');
}
if (listing.basedOn?.url !== 'https://github.com/ghosh/uiGradients') {
  throw new Error('listing.basedOn.url must be https://github.com/ghosh/uiGradients');
}
if (listing.author?.name !== 'ghosh') {
  throw new Error('listing.author.name must be ghosh — they are the author, GifOS is the porter');
}
if (listing.porter?.name !== 'GifOS') {
  throw new Error('listing.porter.name must be GifOS');
}
if (listing.basedOn?.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') {
  throw new Error('category must be Creativity');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/ui-gradients') {
  throw new Error('listing.homepage must be the gifos tree');
}

if (!files['COPYING-uigradients.txt'].includes('Indrashish Ghosh')) {
  throw new Error('COPYING-uigradients.txt is not Indrashish Ghosh\'s MIT notice');
}
if (!files['vendor/gradients.js'].includes('UIGradientsData')) {
  throw new Error('vendor/gradients.js must set UIGradientsData');
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['mp.js'].includes('pick:') || !files['mp.js'].includes('onPick')) {
  throw new Error('mp.js must share the pick on each player\'s own row');
}
if (!files['app.js'].includes("id: 'favs'") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save hearts and the last pick privately');
}
if (!files['mp.js'].includes('Invite') || !html.includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must share the pick on own rows');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  ctx.document = {
    getElementById: function () { return null; },
    createElement: function () { return { style: {}, addEventListener: function () {}, appendChild: function () {}, setAttribute: function () {} }; }
  };
  // app.js boots against the DOM. Load only the data + the functions by
  // evaluating the vendor IIFE, then the cssFor/family helpers via a slice
  // of app.js is fragile — instead boot app.js with a tiny fake DOM.
  const ids = {};
  function el(id) {
    if (ids[id]) return ids[id];
    const node = {
      id: id,
      textContent: '',
      hidden: false,
      value: '',
      style: {},
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      setAttribute: function () {},
      getAttribute: function () { return ''; },
      addEventListener: function () {},
      appendChild: function () {},
      querySelectorAll: function () { return []; },
      focus: function () {}
    };
    ids[id] = node;
    return node;
  }
  ctx.document.getElementById = el;
  ctx.document.createElement = function (tag) {
    return {
      tagName: String(tag).toUpperCase(),
      style: {},
      className: '',
      textContent: '',
      classList: { toggle: function () {} },
      setAttribute: function () {},
      addEventListener: function () {},
      appendChild: function () {}
    };
  };
  ctx.addEventListener = function () {};
  ctx.UIGradientsData = undefined;
  vm.runInNewContext(
    files['vendor/gradients.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var data = UIGradientsData;\n' +
    '  if (!data || data.length < 300) throw new Error("too few ramps " + (data && data.length));\n' +
    '  var bloody = null;\n' +
    '  for (var i = 0; i < data.length; i++) if (data[i].name === "Bloody Mary") bloody = data[i];\n' +
    '  if (!bloody) throw new Error("missing Bloody Mary");\n' +
    '  if (bloody.colors[0].toLowerCase() !== "#ff512f") throw new Error("bloody colors " + bloody.colors);\n' +
    '  var css = UGApp.cssFor(bloody, "to right");\n' +
    '  if (css.indexOf("linear-gradient(to right") < 0) throw new Error("css missing linear-gradient");\n' +
    '  if (css.indexOf("-webkit-linear-gradient") < 0) throw new Error("css missing webkit");\n' +
    '  if (css.indexOf("#FF512F") < 0 && css.indexOf("#ff512f") < 0) throw new Error("css missing first colour");\n' +
    '  var disp = UGApp.displayCss(bloody, "to left");\n' +
    '  if (disp !== "linear-gradient(to left, " + bloody.colors.join(", ") + ")") throw new Error("displayCss " + disp);\n' +
    '  var fam = UGApp.familyOf("#cb2d3e");\n' +
    '  if (fam !== "reds") throw new Error("family " + fam);\n' +
    '  if (UGApp.familyOf("#111111") !== "blacks") throw new Error("blacks");\n' +
    '  if (!UGApp.find("Omolon")) throw new Error("missing Omolon");\n' +
    '  return data.length;\n' +
    '})();',
    ctx
  );
  console.log('ramp list + recipe checks ok —', ctx.result, 'gradients');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: uiGradientsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'ui-gradients', 'ui-gradients.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/ui-gradients/ui-gradients.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (uiGradients list + copy chrome, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
