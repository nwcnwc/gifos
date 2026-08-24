// Pack apps/tuner/ into site/apps/tuner/tuner.gif.
// Run:  node apps/tuner/build.mjs
import { tunerIcon, screenshotPng } from './icon.mjs';
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

const JS_SHA256 = '0aaa36a543fcda56df35915bd4f67321a65c9dda71c3d2f22292b8995b5455af';

for (const need of ['vendor/pitch.js', 'vendor/COPYING-pitchdetect.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const jsBuf = readFileSync(join(dir, 'vendor', 'pitch.js'));
const jsHex = createHash('sha256').update(jsBuf).digest('hex');
if (jsHex !== JS_SHA256) throw new Error('vendor/pitch.js sha256 ' + jsHex + ' ≠ pin ' + JS_SHA256);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'tuner') throw new Error('appId must be tuner');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (manifest.capabilities.microphone !== true) throw new Error('manifest must declare capabilities.microphone');
if (manifest.capabilities.multiplayer) throw new Error('tuner is solo');
if (manifest.capabilities.network) throw new Error('tuner has no network path');
if (manifest.capabilities.wasm) throw new Error('tuner is classic JS — no wasm');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'PitchDetect' || listing.basedOn.url !== 'https://github.com/cwilso/PitchDetect') {
  throw new Error('listing.basedOn must name PitchDetect at github.com/cwilso/PitchDetect');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'Chris Wilson' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Chris Wilson, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Learning') throw new Error('category must be Learning');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/tuner') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'getUserMedia']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md trimmed length is ' + helpMd.length + ', need >= 400');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'help.md': helpMd + '\n',
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/pitch.js': jsBuf.toString('utf8'),
  'app.js': read('app.js'),
  'COPYING-pitchdetect.txt': read('vendor/COPYING-pitchdetect.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of ['vendor/pitch.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('Record a note')) throw new Error('honest UI: Record a note');
if (!html.includes('No clip yet')) throw new Error('honest empty state before a clip');
if (!files['app.js'].includes('Too quiet')) throw new Error('honest when it cannot hear');
if (!files['app.js'].includes('no live microphone')) throw new Error('say there is no live microphone');

const src = files['app.js'] + files['vendor/pitch.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('a script uses ' + bad);
}
if (!files['app.js'].includes("db('save')")) throw new Error('app.js must use gifos.db save');
if (!files['app.js'].includes('recordAudio')) throw new Error('app.js must use gifos.recordAudio — never a live mic');
if (files['app.js'].includes('createMediaStreamSource') || files['vendor/pitch.js'].includes('createMediaStreamSource')) {
  throw new Error('no live MediaStream');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) throw new Error(n + ' uses ESM');
}
if (!files['COPYING-pitchdetect.txt'].includes('Chris Wilson')) {
  throw new Error('COPYING-pitchdetect.txt is not the upstream MIT notice');
}

{
  const ctx = {
    window: {}, console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    document: { getElementById: function () { return null; } }
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.runInNewContext(
    files['vendor/pitch.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var P = PitchDetect;\n' +
    '  if (P.noteFromPitch(440) !== 69) throw new Error("A4 midi " + P.noteFromPitch(440));\n' +
    '  if (Math.abs(P.frequencyFromNoteNumber(69) - 440) > 1e-6) throw new Error("440");\n' +
    '  var sine = P.sine(440, 44100, 4096);\n' +
    '  var r = P.detect(sine, 44100);\n' +
    '  if (!r || r.name !== "A") throw new Error("detect " + (r && r.name));\n' +
    '  if (Math.abs(r.hz - 440) > 2) throw new Error("hz " + r.hz);\n' +
    '  var e329 = P.detect(P.sine(329.63, 44100, 4096), 44100);\n' +
    '  if (!e329 || e329.name !== "E") throw new Error("E4 " + (e329 && e329.name));\n' +
    '  var T = TunerApp;\n' +
    '  var a = T.detectAt(P.sine(440, 44100, 4096), 44100, 440);\n' +
    '  if (!a || a.name !== "A" || a.octave !== 4) throw new Error("A4 wrap");\n' +
    '  var quiet = []; for (var i = 0; i < 2048; i++) quiet[i] = 0.001;\n' +
    '  var q = T.classify(quiet, 44100, 440);\n' +
    '  if (q.kind !== "quiet") throw new Error("quiet " + q.kind);\n' +
    '  return Math.round(r.hz);\n' +
    '})();',
    ctx
  );
  console.log('440 Hz is A, autocorrelation checks ok —', ctx.result, 'Hz');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: tunerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tuner', 'tuner.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tuner/tuner.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
