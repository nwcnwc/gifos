// Pack apps/piano-trainer/ into site/apps/piano-trainer/piano-trainer.gif
import { pianoIcon, screenshotPng } from './icon.mjs';
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
const SCRIPTS = ['theory.js', 'sound.js', 'app.js'];
if (!existsSync(join(dir, 'vendor', 'COPYING-piano-trainer.txt'))) throw new Error('COPYING');
if (!existsSync(join(dir, 'vendor', 'UPSTREAM.txt'))) throw new Error('UPSTREAM');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'theory.js': read('theory.js'),
  'sound.js': read('sound.js'),
  'app.js': read('app.js'),
  'COPYING-piano-trainer.txt': read('vendor/COPYING-piano-trainer.txt'),
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
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite');
if (manifest.minBuild !== 947) throw new Error('minBuild');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('network');
if (manifest.data.save.visibility !== 'private' || manifest.data.room.visibility !== 'read-write') {
  throw new Error('data');
}
if (!listing.basedOn || listing.basedOn.blessed !== false || listing.basedOn.name !== 'Piano Trainer') {
  throw new Error('basedOn');
}
if (!listing.author || /gifos/i.test(listing.author.name) || listing.porter.name !== 'GifOS') throw new Error('credits');
if (listing.license !== 'MIT' || listing.releaseDate !== '2026-08-24') throw new Error('listing');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/piano-trainer') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON']) {
  if (listingBlob.includes(bad)) throw new Error(bad);
}
if (!files['COPYING-piano-trainer.txt'].includes('Zane Helton')) throw new Error('COPYING');
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("db('room')")) throw new Error('db');
if (!files['app.js'].includes('Invite')) throw new Error('Invite copy');
{
  const js = files['app.js'] + files['sound.js'] + files['theory.js'];
  if (/gleitz|soundfont-player|@tauri-apps|src-tauri|tauri-plugin-sentry|react-scripts|create-react-app/i.test(js)) {
    throw new Error('CDN samples / Tauri / CRA stay behind');
  }
  if (!files['sound.js'].includes('AudioContext') || !files['sound.js'].includes('createBuffer')) {
    throw new Error('local piano bank (Web Audio) missing');
  }
  if (!files['app.js'].includes('pointermove') || !files['app.js'].includes('pointerId')) {
    throw new Error('phone pointer tracking missing');
  }
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' ' + bad);
  }
}

{
  const ctx = { console, Math };
  vm.runInNewContext(
    files['theory.js'] + '\n' +
    'result = (function () {\n' +
    '  var C = PT.TONICS.filter(function (t) { return t.id === "c-major"; })[0];\n' +
    '  var sc = PT.scaleNotes(C);\n' +
    '  if (sc.length !== 8) throw new Error("len " + sc.length);\n' +
    '  if (sc[0] !== 48 || sc[4] !== 55 || sc[7] !== 60) throw new Error("C major " + sc);\n' +
    '  var tri = PT.triad(sc, 0);\n' +
    '  if (tri[0] !== 48 || tri[1] !== 52 || tri[2] !== 55) throw new Error("C triad " + tri);\n' +
    '  var sev = PT.seventh(sc, 0);\n' +
    '  if (sev.length !== 4 || sev[3] !== 59) throw new Error("C7 " + sev);\n' +
    '  var f = PT.fifthOf(sc, 48);\n' +
    '  if (f !== 55) throw new Error("fifth of C " + f);\n' +
    '  if (!PT.chordMatch([48, 52, 55], [48, 52, 55])) throw new Error("match");\n' +
    '  if (!PT.chordMatch([60, 52, 55], [48, 52, 55])) throw new Error("octave match");\n' +
    '  if (PT.noteName(60) !== "C") throw new Error("name");\n' +
    '  var q = PT.quizItem((function () { var x = 1; return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })());\n' +
    '  if (!q.prompt || !q.answer || q.options.length !== 4) throw new Error("quiz");\n' +
    '  return PT.noteName(sc[4]);\n' +
    '})();',
    ctx
  );
  if (ctx.result !== 'G') throw new Error('theory self-test ' + ctx.result);
  console.log('scale / triad / fifth ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: pianoIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'piano-trainer', 'piano-trainer.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/piano-trainer/piano-trainer.gif —', bytes.length, 'bytes');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
