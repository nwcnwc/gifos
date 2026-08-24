// Pack apps/waveforms/ into site/apps/waveforms/waveforms.gif.
// Run:  node apps/waveforms/build.mjs
import { waveformsIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

const JS_SHA256 = 'e5a3150404ea6075cdfefb448aab8e236df861ad9439404c311054adeaf6649b';

for (const need of ['vendor/waveform.js', 'vendor/COPYING-waveforms.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const jsBuf = readFileSync(join(dir, 'vendor', 'waveform.js'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) throw new Error('vendor/waveform.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'waveforms') throw new Error('appId must be waveforms');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (manifest.capabilities.multiplayer) throw new Error('waveforms is solo');
if (manifest.capabilities.network) throw new Error('waveforms has no network path');
if (manifest.capabilities.wasm) throw new Error('waveforms is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'Waveforms' || listing.basedOn.url !== 'https://github.com/joshwcomeau/waveforms') {
  throw new Error('listing.basedOn must name Waveforms at github.com/joshwcomeau/waveforms');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || !/comeau/i.test(listing.author.name) || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Josh Comeau, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories.indexOf('Learning') < 0) throw new Error('category must include Learning');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/waveforms') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'React']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/waveform.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-waveforms.txt': read('vendor/COPYING-waveforms.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of ['vendor/waveform.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('id="amp"') || !html.includes('id="freq"') || !html.includes('id="shape"')) {
  throw new Error('index.html must offer amplitude, frequency, shape');
}
if (!html.includes('sine') || !html.includes('square') || !html.includes('sawtooth')) {
  throw new Error('index.html must offer sine/square/saw');
}

const src = files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia', 'React']) {
  if (src.includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!src.includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!src.includes('STEPS') || files['app.js'].split('id:').length < 8) {
  throw new Error('app.js must ship the explorable steps');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) throw new Error(n + ' uses ESM');
}
if (!files['COPYING-waveforms.txt'].includes('Joshua Comeau')) {
  throw new Error('COPYING-waveforms.txt is not the upstream MIT notice');
}

{
  const ctx = {
    window: {}, console, Math, Array, String, Number,
    document: { getElementById: function () { return null; } },
    requestAnimationFrame: function () { return 0; }
  };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/waveform.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var M = WaveformMath;\n' +
    '  if (M.getPositionAtPointRelativeToAxis("sine", 1, 1, 0) !== 0) throw new Error("sine0");\n' +
    '  var peak = M.getPositionAtPointRelativeToAxis("sine", 1, 1, 25);\n' +
    '  if (Math.abs(peak - 1) > 1e-9) throw new Error("sine peak " + peak);\n' +
    '  if (M.getPositionAtPointRelativeToAxis("square", 1, 1, 10) !== 1) throw new Error("sq hi");\n' +
    '  if (M.getPositionAtPointRelativeToAxis("square", 1, 1, 60) !== -1) throw new Error("sq lo");\n' +
    '  var saw0 = M.getPositionAtPointRelativeToAxis("sawtooth", 1, 1, 0);\n' +
    '  var saw99 = M.getPositionAtPointRelativeToAxis("sawtooth", 1, 1, 99);\n' +
    '  if (Math.abs(saw0 + 1) > 1e-9) throw new Error("saw0 " + saw0);\n' +
    '  if (saw99 <= 0.9) throw new Error("saw99 " + saw99);\n' +
    '  var sqH = M.getHarmonicsForWave("square", 1, 1, 2);\n' +
    '  if (sqH[0].frequency !== 3 || sqH[1].frequency !== 5) throw new Error("sq harm");\n' +
    '  if (WaveformsApp.STEPS.length < 10) throw new Error("steps");\n' +
    '  return peak;\n' +
    '})();',
    ctx
  );
  console.log('sine/square/saw + harmonic checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: waveformsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'waveforms', 'waveforms.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/waveforms/waveforms.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
