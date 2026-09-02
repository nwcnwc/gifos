// Pack apps/beepbox/ into the finished, downloadable
// site/apps/beepbox/beepbox.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// johnnesky/beepbox tag and is run only when the pin moves.
//
// Run:  node apps/beepbox/build.mjs
import { beepboxIcon, screenshotPng } from './icon.mjs';
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

const EDITOR_SHA256 = '62d253d49f5987928d0c7c81e43a7cae62e82e3c289fe341df58d3f2d2d7fe59';

for (const need of [
  'vendor/beepbox_editor.min.js', 'vendor/seed.js', 'vendor/seed.json',
  'vendor/COPYING-beepbox.txt', 'vendor/UPSTREAM.txt',
]) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/beepbox/vendor.mjs first (it needs the network).');
  }
}

const editorBuf = readFileSync(join(dir, 'vendor', 'beepbox_editor.min.js'));
const editorHex = createHash('sha256').update(editorBuf).digest('hex');
if (editorHex !== EDITOR_SHA256) {
  throw new Error('vendor/beepbox_editor.min.js sha256 ' + editorHex + ' ≠ pin ' + EDITOR_SHA256 + ' — rerun vendor.mjs or move the pin.');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('beepbox has no network path. Do not declare capabilities.network.');
if (!manifest.data || !manifest.data.songs || manifest.data.songs.visibility !== 'private') {
  throw new Error('manifest.data.songs must be private — the solo song stays on this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — a jam has to sync.');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'BeepBox' || listing.basedOn.url !== 'https://github.com/johnnesky/beepbox') {
  throw new Error('listing.basedOn must name BeepBox at github.com/johnnesky/beepbox');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'John Nesky') {
  throw new Error('listing.author must be John Nesky');
}
if (listing.author.name === 'GifOS') {
  throw new Error('author is John Nesky, never GifOS — this is a port');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.releaseDate !== '2026-08-30') throw new Error('releaseDate must be 2026-08-30');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'WebGL', 'Web Audio', 'CDN', 'TypeScript']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

function safeScript(s) {
  return s.replace(/<\/(script)/gi, '<\\/$1');
}

const SCRIPTS = ['shim.js', 'vendor/seed.js', 'vendor/beepbox_editor.min.js', 'net.js', 'touch.js', 'boot.js'];

const help = read('help.md').replace(/^\uFEFF/, '');
if (help.trim().length < 400) throw new Error('help.md is missing or too short — need >= 400 trimmed characters');
if (!/^#\s+\S/.test(help.trim())) throw new Error('help.md must start with # <App Name>');

const FN_NEEDLE = 'new Function("Config","Synth",';
const FN_REPL = 'window.GifOSBeepboxShim.compile("Config","Synth",';
let editorSrc = editorBuf.toString('utf8').replace(/\n\/\/# sourceMappingURL=.*$/, '');
const fnSites = editorSrc.split(FN_NEEDLE).length - 1;
if (fnSites !== 3) {
  throw new Error('editor Function-constructor sites: ' + fnSites + ' (expected 3 — FM, picked string, effects)');
}
editorSrc = editorSrc.split(FN_NEEDLE).join(FN_REPL);

const TAIL = 'this.whenUpdated(),this.mainLayer.focus(),';
const TAIL_SAFE = 'this.whenUpdated(),(function(el){try{el.focus()}catch(e0){}})(this.mainLayer),';
if (!editorSrc.includes(TAIL)) throw new Error('SongEditor constructor tail (whenUpdated/focus) moved — update the sandbox patch');
editorSrc = editorSrc.split(TAIL).join(TAIL_SAFE);

const SW = 'this.updatePlayButton(),"scrollRestoration"in history&&(history.scrollRestoration="manual"),"serviceWorker"in navigator&&navigator.serviceWorker.register("/service_worker.js",{updateViaCache:"all",scope:"/"}).catch((()=>{}))';
const SW_SAFE = 'this.updatePlayButton();try{if("scrollRestoration"in history)history.scrollRestoration="manual"}catch(e1){}try{if("serviceWorker"in navigator&&navigator.serviceWorker.register)navigator.serviceWorker.register("/service_worker.js",{updateViaCache:"all",scope:"/"}).catch(function(){})}catch(e2){}';
if (!editorSrc.includes(SW)) throw new Error('SongEditor constructor serviceWorker/scrollRestoration tail moved — update the sandbox patch');
editorSrc = editorSrc.split(SW).join(SW_SAFE);

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'shim.js': safeScript(read('shim.js')),
  'vendor/seed.js': safeScript(read('vendor/seed.js')),
  'vendor/beepbox_editor.min.js': safeScript(editorSrc),
  'net.js': safeScript(read('net.js')),
  'touch.js': safeScript(read('touch.js')),
  'boot.js': safeScript(read('boot.js')),
  'COPYING-beepbox.txt': read('vendor/COPYING-beepbox.txt'),
  'help.md': help,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}

const src = files['shim.js'] + files['net.js'] + files['touch.js'] + files['boot.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('a shell script uses ' + bad);
}
if (!files['shim.js'].includes('createElement("script")') && !files['shim.js'].includes("createElement('script')")) {
  throw new Error('shim must compile synth functions via an inline script — CSP has no unsafe-eval');
}
if (!files['shim.js'].includes('GifOSBeepboxShim') || !files['shim.js'].includes('compile:')) {
  throw new Error('shim must expose GifOSBeepboxShim.compile for the packed editor');
}
if (files['vendor/beepbox_editor.min.js'].includes(FN_NEEDLE)) {
  throw new Error('packed editor still contains ' + FN_NEEDLE + ' — CSP will refuse it');
}
if ((files['boot.js'].split('new root.beepbox.SongEditor').length - 1) !== 1) {
  throw new Error('boot must construct SongEditor exactly once — a catch retry doubled the chrome');
}
if (!files['boot.js'].includes("db('songs')")) {
  throw new Error('boot must persist the song in gifos.db(\'songs\')');
}
if (!files['net.js'].includes("db('room')")) {
  throw new Error('net.js must share the song on gifos.db(\'room\')');
}
if (!files['COPYING-beepbox.txt'].includes('John Nesky')) {
  throw new Error('COPYING-beepbox.txt is not the upstream MIT notice');
}
if (!files['vendor/beepbox_editor.min.js'].startsWith('var beepbox=')) {
  throw new Error('editor bundle is not the beepbox IIFE');
}
if (!files['vendor/seed.js'].includes('BEEPBOX_SEED')) {
  throw new Error('seed.js must attach window.BEEPBOX_SEED');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n.indexOf('vendor/beepbox_editor') >= 0) continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}

const seed = JSON.parse(read('vendor/seed.json'));
if (seed.format !== 'BeepBox' || !Array.isArray(seed.channels) || seed.channels.length < 4) {
  throw new Error('seed.json is not a BeepBox song with four channels');
}
if (!seed.channels[0].patterns[0].notes.length) throw new Error('seed melody is empty');

{
  const sandbox = {
    console, Math, Date, JSON, Array, Object, String, Number, Boolean, Error,
    Uint8Array, Float32Array, Float64Array, Int32Array, Uint32Array, ArrayBuffer,
    parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(files['vendor/seed.js'], sandbox);
  if (!sandbox.BEEPBOX_SEED || sandbox.BEEPBOX_SEED.format !== 'BeepBox') {
    throw new Error('seed.js did not attach BEEPBOX_SEED');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: beepboxIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'beepbox', 'beepbox.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/beepbox/beepbox.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/beepbox/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
