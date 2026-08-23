// Pack apps/guitar-bro/ into site/apps/guitar-bro/guitar-bro.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Offline and deterministic. Classic-script rewrite of makaroni4/guitar_bro.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/guitar-bro/build.mjs
import { guitarBroIcon, screenshotPng } from './icon.mjs';
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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const SCRIPTS = ['config.js', 'songs.js', 'pitch.js', 'game.js', 'mp.js', 'app.js'];

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (!existsSync(join(dir, 'vendor', 'COPYING-guitar-bro.txt'))) {
  throw new Error('vendor/COPYING-guitar-bro.txt is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'guitar-bro') throw new Error('appId must be guitar-bro');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.microphone !== true) {
  throw new Error('manifest must declare capabilities.microphone — Listen records a clip');
}
if (manifest.capabilities.network) throw new Error('guitar-bro has no network path');
if (manifest.capabilities.wasm) throw new Error('guitar-bro is classic canvas — no wasm');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write — live scores have to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'Guitar Bro') {
  throw new Error('basedOn.name must be Guitar Bro');
}
if (listing.basedOn.url !== 'https://github.com/makaroni4/guitar_bro') {
  throw new Error('basedOn.url must be makaroni4/guitar_bro');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'makaroni4' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is makaroni4, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories.indexOf('Learning') < 0) {
  throw new Error('listing.categories must include Learning');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/guitar-bro') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'FFT', 'getUserMedia', 'Web Audio', 'jQuery']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-guitar-bro.txt': read('vendor/COPYING-guitar-bro.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/src=["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote script — nothing may be fetched.');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite') && !files['index.html'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['mp.js'].includes('players') || !files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must race on the players collection and tell that nobody writes anybody else\'s row');
}
if (!files['app.js'].includes('recordAudio')) {
  throw new Error('app.js must use gifos.recordAudio — never a live microphone');
}
if (files['app.js'].includes('getUserMedia') || files['pitch.js'].includes('getUserMedia') || files['game.js'].includes('getUserMedia')) {
  throw new Error('no getUserMedia — the sandbox cannot hold a live mic');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing is fetched.');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}
if (!files['COPYING-guitar-bro.txt'].includes('Anatoli Makarevich')) {
  throw new Error('COPYING-guitar-bro.txt is not the upstream MIT notice');
}

{
  const ctx = {
    console,
    window: {},
    requestAnimationFrame: function () { return 0; },
    cancelAnimationFrame: function () {},
    performance: { now: function () { return 0; } },
    Date,
    Math,
    Float32Array,
    Float64Array,
    Object,
    Array,
    String,
    Number
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  function stubCanvas() {
    const c = { width: 720, height: 420, style: {} };
    const noop = function () {};
    c.getContext = function () {
      return {
        canvas: c,
        fillRect: noop, clearRect: noop, beginPath: noop, closePath: noop,
        arc: noop, fill: noop, stroke: noop, moveTo: noop, lineTo: noop,
        bezierCurveTo: noop, fillText: noop, setTransform: noop,
        measureText: function () { return { width: 10 }; },
        font: '', lineWidth: 1, strokeStyle: '', fillStyle: '',
        textAlign: '', textBaseline: '', globalAlpha: 1
      };
    };
    return c;
  }
  vm.createContext(ctx);
  vm.runInContext(files['config.js'], ctx);
  vm.runInContext(files['songs.js'], ctx);
  vm.runInContext(files['pitch.js'], ctx);
  vm.runInContext(files['game.js'], ctx);
  const Songs = ctx.GBSongs;
  const Pitch = ctx.GBPitch;
  const Cfg = ctx.GBConfig;
  if (!Songs || Songs.names.length < 10) throw new Error('songs did not load');
  if (Songs.names.indexOf('Smoke on the Water (Tempo=112)') < 0) {
    throw new Error('missing Smoke on the Water');
  }
  const smoke = Songs.load('Smoke on the Water (Tempo=112)', '1', 1);
  if (smoke[0][0] !== 'F' || smoke[1][0] !== 'G#') {
    throw new Error('Smoke on the Water drifted: ' + JSON.stringify(smoke.slice(0, 3)));
  }
  const hb = Songs.load('Happy Birthday', '1', 1);
  if (hb[0][0] !== 'E') throw new Error('Happy Birthday open string should be E');
  if (Songs.findNoteIndex('A', '1') !== 4) throw new Error('A on high E should be fret index 4');
  const a440 = Pitch.sine(440, 44100, Pitch.N);
  const heard = Pitch.detect(a440, 44100, Cfg.strings['1']);
  if (heard !== 'A') throw new Error('440 Hz should detect as A, got ' + heard);
  const e329 = Pitch.sine(329.6, 44100, Pitch.N);
  const highE = Pitch.detect(e329, 44100, Cfg.strings['1']);
  if (highE !== 'E') throw new Error('329.6 Hz should detect as E on thin E, got ' + highE);

  const g = new ctx.GBGame(stubCanvas());
  g.start({ songName: 'Smoke on the Water (Tempo=112)', stringId: '1', bpm: 60, mode: 'practice', seed: 1, race: true, loop: false });
  let scored = false;
  for (let n = 0; n < 80; n++) {
    g.advance(1);
    if (g.playNote('F')) { scored = true; break; }
  }
  if (!scored || g.score !== 10 || g.hits !== 1) {
    throw new Error('hitting F should score 10, got score=' + g.score + ' hits=' + g.hits + ' scored=' + scored);
  }
  console.log('song + pitch + score checks ok — 440 Hz is A, Smoke opens on F');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: guitarBroIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'guitar-bro', 'guitar-bro.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/guitar-bro/guitar-bro.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (fret trainer, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
