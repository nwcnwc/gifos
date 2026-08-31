// Pack apps/background-removal/ into site/apps/background-removal/background-removal.gif.
//
// WHAT RIDES WHERE
//   in the GIF   the app, the transcribed IS-Net pipeline, ONNX Runtime Web
//                + its WebGPU-capable JSEP wasm (the kokoro vendor pairing).
//   by asset pin IMG.LY's IS-Net ONNX weights (44 / 88 / 176 MB) — optional,
//                sha256-pinned, fetched the first time that size is used.
//
// Run:  node apps/background-removal/build.mjs
import { backgroundRemovalIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const pins = JSON.parse(read('MODEL-PINS.json'));

{
  const wanted = new Set();
  const src = read('models.js');
  for (const m of src.matchAll(/asset:\s*'([^']+)'/g)) wanted.add(m[1]);
  const pinned = new Set((manifest.assets || []).map((a) => a.path));
  for (const w of wanted) if (!pinned.has(w)) throw new Error('models.js wants asset "' + w + '" but manifest.json pins no such path');
  for (const p of pinned) if (!wanted.has(p)) throw new Error('manifest.json pins asset "' + p + '" that models.js never reads');
  for (const p of pins.pins) {
    const a = (manifest.assets || []).find((x) => x.path === p.asset);
    if (!a) throw new Error('MODEL-PINS.json records ' + p.id + ' but the manifest does not pin it');
    if (a.sha256 !== p.sha256 || a.bytes !== p.bytes) {
      throw new Error(p.id + ': manifest.json and MODEL-PINS.json disagree about the bytes');
    }
    if (!a.optional) throw new Error(p.asset + ' must be optional — Install is not 300 MB');
    if (!a.url.includes(pins.commit)) throw new Error(p.id + ' URL is not pinned to commit ' + pins.commit);
  }
}

if (manifest.minBuild !== 1381) throw new Error('minBuild must be 1381 — optional assets + gpu');
if (manifest.appId !== 'background-removal') throw new Error('appId must be background-removal');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('manifest must declare capabilities.db');
if (manifest.capabilities.camera !== true) throw new Error('manifest must declare capabilities.camera');
if (manifest.capabilities.wasm !== true) throw new Error('manifest must declare capabilities.wasm');
if (manifest.capabilities.gpu !== true) throw new Error('manifest must declare capabilities.gpu');
if (manifest.capabilities.multiplayer) throw new Error('background-removal is solo — photos stay private');
if (manifest.capabilities.network) throw new Error('no network path');
if (!manifest.data || manifest.data.prefs.visibility !== 'private' || manifest.data.pic.visibility !== 'private') {
  throw new Error('prefs and pic must be private');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is IMG.LY, never GifOS');
if (listing.license !== 'AGPL-3.0') throw new Error('listing.license must be AGPL-3.0');
if (!listing.categories.includes('Creativity')) throw new Error('categories must include Creativity');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/background-removal') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline too long');
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'getUserMedia']) {
  if (JSON.stringify(listing).includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const kokoro = join(dir, '..', 'offline-tts-kokoro', 'vendor');
if (!existsSync(join(kokoro, 'ort-esm.js')) || !existsSync(join(kokoro, 'ort-wasm-simd-threaded.jsep.wasm'))) {
  throw new Error('offline-tts-kokoro/vendor ORT pairing is missing');
}

let ortJs = readFileSync(join(kokoro, 'ort-esm.js'), 'utf8');
const ORT_EXPORT_RE = /export\{([^}]*)\};?/;
const om = ORT_EXPORT_RE.exec(ortJs);
if (!om) throw new Error('ort-esm.js: export block not found');
const ortExports = om[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const parts = pair.split(/\s+as\s+/);
  return parts.length === 2 ? `${parts[1].trim()}: ${parts[0].trim()}` : parts[0];
});
for (const want of ['InferenceSession:', 'Tensor:', 'env:']) {
  if (!ortExports.some((e) => e.startsWith(want))) throw new Error('ORT no longer exports ' + want.slice(0, -1));
}
ortJs = ortJs.replace(ORT_EXPORT_RE, `window.ort = { ${ortExports.join(', ')} };`);

const mappedCount = (ortJs.match(/mappedAtCreation/g) || []).length;
if (mappedCount !== 1) {
  throw new Error('ort-esm.js has ' + mappedCount + ' mappedAtCreation sites, expected 1');
}
const ORT_UPLOAD_RE = /let (\w+)=this\.backend\.device\.createBuffer\(\{mappedAtCreation:!0,size:(\w+),usage:GPUBufferUsage\.MAP_WRITE\|GPUBufferUsage\.COPY_SRC\}\),(\w+)=\1\.getMappedRange\(\);new Uint8Array\(\3\)\.set\(new Uint8Array\((\w+),(\w+),(\w+)\)\),\1\.unmap\(\);/;
if (!ORT_UPLOAD_RE.test(ortJs)) {
  throw new Error('ort-esm.js: GpuDataManager.upload() shape changed — re-derive the writeBuffer rewrite');
}
ortJs = ortJs.replace(ORT_UPLOAD_RE,
  'let $1=this.backend.device.createBuffer({size:$2,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});'
  + '{let gifosQueue=this.backend.device.queue,gifosWhole=$6-$6%4;'
  + 'if(gifosWhole>0)gifosQueue.writeBuffer($1,0,$4,$5,gifosWhole);'
  + 'if(gifosWhole<$6){let gifosTail=new Uint8Array(4);gifosTail.set(new Uint8Array($4,$5+gifosWhole,$6-gifosWhole));gifosQueue.writeBuffer($1,gifosWhole,gifosTail.buffer,0,4);}}');
if (ortJs.includes('mappedAtCreation')) throw new Error('mappedAtCreation survived the rewrite');
if (!ortJs.includes('import.meta.url')) throw new Error('ort-esm.js no longer uses import.meta.url');
ortJs = ortJs.split('import.meta.url').join('"https://ort.invalid/gifos-inlined/"');
for (const bad of ['import.meta', 'import(']) {
  if (ortJs.includes(bad)) throw new Error('ORT bundle still contains ' + bad);
}
if (/^export\s|export\{/m.test(ortJs)) throw new Error('ort-esm.js still contains an export');
if (/<\/script/i.test(ortJs)) throw new Error('ORT bundle contains </script');
ortJs = '(function(){\n' + ortJs + '\n})();\n';

const ortWasm = readFileSync(join(kokoro, 'ort-wasm-simd-threaded.jsep.wasm'));
const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

const helpMd = read('help.md').trim();
if (helpMd.length < 400) throw new Error('help.md is too short (' + helpMd.length + ')');

const SCRIPTS = ['models.js', 'engine.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'ort.js': ortJs,
  'ort-wasm.js': strModule('window.BR_ORT_WASM_B64', ortWasm.toString('base64')),
  'models.js': read('models.js'),
  'engine.js': read('engine.js'),
  'app.js': read('app.js'),
  'help.md': helpMd + '\n',
  'COPYING.txt': read('COPYING.txt'),
  'LICENSE-onnxruntime.txt': readFileSync(join(kokoro, 'LICENSE-onnxruntime.txt'), 'utf8'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS.concat(['ort.js', 'ort-wasm.js'])) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!html.includes('Take photo') || !html.includes('id="empty"')) throw new Error('empty state / take photo missing');
if (!html.includes('Hold to see the original')) throw new Error('hold-to-compare missing');

const src = files['app.js'] + files['engine.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'eval(', 'new Function(', 'getUserMedia']) {
  if (src.includes(bad)) throw new Error('app uses ' + bad);
}
if (!files['app.js'].includes('takePhoto')) throw new Error('app.js must use gifos.takePhoto');
if (!files['app.js'].includes("db('prefs')") || !files['app.js'].includes("db('pic')")) {
  throw new Error('app.js must persist prefs and pic');
}
if (!files['app.js'].includes('gifos.assets')) throw new Error('app.js must load models via gifos.assets');
if (!files['engine.js'].includes('1024')) throw new Error('engine.js must run IS-Net at 1024');
if (!files['COPYING.txt'].includes('GNU AFFERO GENERAL PUBLIC LICENSE')) {
  throw new Error('COPYING.txt must carry the AGPL');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: backgroundRemovalIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'background-removal', 'background-removal.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/background-removal/background-removal.gif —',
  (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length,
  'files (engine + ORT in-GIF; IS-Net weights by optional asset pin)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
