// Pack apps/squoosh/ into site/apps/squoosh/squoosh.gif (see apps/README.md).
//
// WHAT RIDES WHERE
//   in the GIF   the app, the rewritten Squoosh encoder glue, and every WASM
//                codec (MozJPEG, WebP, AVIF, JPEG XL, OxiPNG, QOI). None of
//                them meets the 8 MB asset-pin floor, so they all travel
//                inside the GIF under .assets/ — gifos.assets() serves them
//                as a zero-copy transfer, they never become a data: URL in
//                the srcdoc (pdf-tables-ocr's lesson).
//   on demand    nothing. Optional pins are for weights in the tens of MB;
//                Squoosh's largest encoder (AVIF) is 2.7 MB.
//
// Glue is ESM (export default Module / init). The runtime inlines <script src>
// as a classic script, so build.mjs rewrites it onto window.SQUOOSH_*.
// Embind mints invokers with `new Function`; the app CSP has wasm-unsafe-eval
// and not unsafe-eval, so those sites are rewritten to ordinary functions.
//
// Run:  node apps/squoosh/build.mjs
// Do not run scripts/build-app-catalog.mjs from this work — the catalog index
// is shared. This file writes site/apps/squoosh/{squoosh.gif,app.json,cover.jpg}.
import { deflateRawSync } from 'node:zlib';
import { squooshIcon, screenshotPng } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as hat-sh/build.mjs.
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
const bin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
if (!listing.author || listing.author.name !== 'GoogleChromeLabs') throw new Error('listing.author must be GoogleChromeLabs');
if (!listing.porter) throw new Error('listing.porter is required on a port');
if (manifest.minBuild < 1178) throw new Error('minBuild must be ≥ 1178 — gifos.assets() for packed .assets/ files');

// Vendor bytes must still be the pin in UPSTREAM.txt. A silent re-fetch that
// drifted would only show up as a codec that mis-encodes in a player's browser.
{
  const pins = {};
  for (const line of read('vendor/UPSTREAM.txt').split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s+([0-9a-f]{64})$/);
    if (m) pins[m[1]] = { bytes: +m[2], sha256: m[3] };
  }
  const need = [
    'mozjpeg_enc.js', 'mozjpeg_enc.wasm', 'webp_enc.js', 'webp_enc.wasm',
    'avif_enc.js', 'avif_enc.wasm', 'jxl_enc.js', 'jxl_enc.wasm',
    'qoi_enc.js', 'qoi_enc.wasm', 'oxipng.js', 'oxipng.wasm',
  ];
  for (const n of need) {
    const p = pins[n];
    if (!p) throw new Error('vendor/UPSTREAM.txt has no pin for ' + n);
    const b = bin('vendor/' + n);
    const hex = sha256(b);
    if (b.length !== p.bytes || hex !== p.sha256) {
      throw new Error('vendor/' + n + ' drifted from UPSTREAM.txt — rerun vendor.mjs or update the pin');
    }
    if (n.endsWith('.wasm') && b.subarray(0, 4).toString() !== '\0asm') {
      throw new Error('vendor/' + n + ' is not a WebAssembly module');
    }
  }
}

// Embind (createNamedFunction, craftInvokerFunction, craftEmvalAllocator,
// emval_get_global) uses the Function constructor. The sandbox CSP will throw
// EvalError. These needles are the minified forms Squoosh's codecs actually
// ship; a toolchain bump that changes them must fail here, not in a browser.
function stripEval(js, globalName) {
  // Glue source has literal \n (two chars), not newlines — it is itself JS that
  // builds a function body string. Match that, not an interpreted newline.
  const namedNeedle = 'return new Function("body","return function "+name+"() {\\n"+\'    "use strict";\'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)';
  const namedSafe = 'var f=function(){return body.apply(this,arguments)};try{Object.defineProperty(f,"name",{value:name})}catch(e){}return f';
  if (!js.includes(namedNeedle)) {
    throw new Error(globalName + ': createNamedFunction is not the embind eval form build.mjs patches.');
  }
  js = js.split(namedNeedle).join(namedSafe);

  const invoker = 'args1.push(invokerFnBody);var invokerFunction=new_(Function,args1).apply(null,args2);return invokerFunction';
  const invokerSafe = 'return (function(){var retType=argTypes[0],classParam=argTypes[1],nArgs=argCount-2;return function(){if(arguments.length!==nArgs)throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+nArgs+" args!");var destructors=needsDestructorStack?[]:null,wired=[],i;if(isClassMethodFunc)wired.push(classParam.toWireType(destructors,this));for(i=0;i<nArgs;++i)wired.push(argTypes[i+2].toWireType(destructors,arguments[i]));var rv=cppInvokerFunc.apply(null,[cppTargetFunc].concat(wired));if(needsDestructorStack)runDestructors(destructors);else{if(isClassMethodFunc&&argTypes[1].destructorFunction!==null)argTypes[1].destructorFunction(wired[0]);for(i=0;i<nArgs;++i){var t=argTypes[i+2];if(t.destructorFunction!==null)t.destructorFunction(wired[(isClassMethodFunc?1:0)+i])}}if(returns)return retType.fromWireType(rv)}})()';
  if (!js.includes(invoker)) {
    throw new Error(globalName + ': craftInvokerFunction no longer uses new_(Function) — re-check the CSP patch.');
  }
  js = js.split(invoker).join(invokerSafe);

  const emvalMoz = 'return new Function("requireRegisteredType","Module","__emval_register",functionBody)(requireRegisteredType,Module,__emval_register)';
  const emvalAvif = 'return new Function("requireRegisteredType","Module","valueToHandle",functionBody)(requireRegisteredType,Module,Emval.toHandle)';
  const emvalSafeMoz = 'return function(constructor,argTypes,args){var unwired=[],i,t;for(i=0;i<argCount;++i){t=requireRegisteredType(Module["HEAP32"][(argTypes>>>2)+i],"parameter "+i);unwired.push(t.readValueFromPointer(args));args+=t["argPackAdvance"]}return __emval_register(Reflect.construct(constructor,unwired))}';
  const emvalSafeAvif = 'return function(constructor,argTypes,args){var unwired=[],i,t;for(i=0;i<argCount;++i){t=requireRegisteredType(Module["HEAP32"][(argTypes>>>2)+i],"parameter "+i);unwired.push(t.readValueFromPointer(args));args+=t["argPackAdvance"]}return Emval.toHandle(Reflect.construct(constructor,unwired))}';
  if (js.includes(emvalMoz)) js = js.split(emvalMoz).join(emvalSafeMoz);
  else if (js.includes(emvalAvif)) js = js.split(emvalAvif).join(emvalSafeAvif);
  else throw new Error(globalName + ': craftEmvalAllocator is not a known new Function form.');

  const glob = 'function emval_get_global(){if(typeof globalThis==="object"){return globalThis}return function(){return Function}()("return this")()}';
  const globSafe = 'function emval_get_global(){return typeof globalThis==="object"?globalThis:self}';
  if (!js.includes(glob)) {
    throw new Error(globalName + ': emval_get_global no longer uses Function("return this").');
  }
  js = js.split(glob).join(globSafe);

  if (js.includes('new Function') || js.includes('eval(') || js.includes('Function("') || js.includes("Function('")) {
    throw new Error(globalName + ' still contains eval/Function after the CSP patch.');
  }
  return js;
}

function rewriteEmscripten(js, globalName, wasmName) {
  if (!js.includes('export default Module')) {
    throw new Error(globalName + ': glue is not `export default Module` — the vendored encoder changed; update build.mjs.');
  }
  if (!js.includes('import.meta.url')) {
    throw new Error(globalName + ': glue no longer uses import.meta.url — re-check the rewrite.');
  }
  if (!js.includes('wasmBinary')) {
    throw new Error(globalName + ': glue no longer honours Module.wasmBinary.');
  }
  if (!js.includes(wasmName)) {
    throw new Error(globalName + ': glue does not name ' + wasmName);
  }
  js = js.split('import.meta.url').join('"https://squoosh.invalid/gifos-inlined/"');
  js = js.replace(/\nexport default Module;?\s*$/, '\n');
  js = stripEval(js, globalName);
  for (const bad of ['import.meta', 'export default', 'export function', 'export{']) {
    if (js.includes(bad)) throw new Error(globalName + ' still contains ' + bad + ' after the rewrite.');
  }
  if (/<\/script/i.test(js)) throw new Error(globalName + ' contains </script — cannot inline.');
  // The factory is `var Module = (function(){ ... })();`. Hang it on window
  // under a name that cannot collide with the inner Module parameter.
  return '(function(){\n' + js + '\nwindow.' + globalName + ' = Module;\n})();\n';
}

function rewriteOxipng(js) {
  if (!js.includes('export function optimise') || !js.includes('export default init')) {
    throw new Error('oxipng glue is not the wasm-pack shape build.mjs rewrites.');
  }
  js = js.split('import.meta.url').join('"https://squoosh.invalid/gifos-inlined/"');
  js = js.replace('export function optimise', 'function optimise');
  js = js.replace(/\nexport default init;?\s*$/, '\n');
  for (const bad of ['import.meta', 'export default', 'export function', 'export{', 'new Function', 'eval(']) {
    if (js.includes(bad)) throw new Error('oxipng still contains ' + bad + ' after the rewrite.');
  }
  if (/<\/script/i.test(js)) throw new Error('oxipng contains </script — cannot inline.');
  return '(function(){\n' + js + '\nwindow.SQUOOSH_OXIPNG = { init: init, optimise: optimise };\n})();\n';
}

const glue = {
  'mozjpeg.js': rewriteEmscripten(read('vendor/mozjpeg_enc.js'), 'SQUOOSH_MOZJPEG', 'mozjpeg_enc.wasm'),
  'webp.js':    rewriteEmscripten(read('vendor/webp_enc.js'),    'SQUOOSH_WEBP',    'webp_enc.wasm'),
  'avif.js':    rewriteEmscripten(read('vendor/avif_enc.js'),    'SQUOOSH_AVIF',    'avif_enc.wasm'),
  'jxl.js':     rewriteEmscripten(read('vendor/jxl_enc.js'),     'SQUOOSH_JXL',     'jxl_enc.wasm'),
  'qoi.js':     rewriteEmscripten(read('vendor/qoi_enc.js'),     'SQUOOSH_QOI',     'qoi_enc.wasm'),
  'oxipng.js':  rewriteOxipng(read('vendor/oxipng.js')),
};

const wasm = {
  'mozjpeg_enc.wasm': bin('vendor/mozjpeg_enc.wasm'),
  'webp_enc.wasm':    bin('vendor/webp_enc.wasm'),
  'avif_enc.wasm':    bin('vendor/avif_enc.wasm'),
  'jxl_enc.wasm':     bin('vendor/jxl_enc.wasm'),
  'qoi_enc.wasm':     bin('vendor/qoi_enc.wasm'),
  'oxipng.wasm':      bin('vendor/oxipng.wasm'),
};

const MOZJPEG_OPTS = {
  quality: 75, baseline: false, arithmetic: false, progressive: true,
  optimize_coding: true, smoothing: 0, color_space: 3, quant_table: 3,
  trellis_multipass: false, trellis_opt_zero: false, trellis_opt_table: false,
  trellis_loops: 1, auto_subsample: true, chroma_subsample: 2,
  separate_chroma_quality: false, chroma_quality: 75,
};
const WEBP_OPTS = {
  quality: 75, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50,
  filter_strength: 60, filter_sharpness: 0, filter_type: 1, partitions: 0,
  segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0,
  partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100,
  lossless: 0, exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0,
  low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0,
};
const AVIF_OPTS = {
  quality: 50, qualityAlpha: -1, denoiseLevel: 0, tileColsLog2: 0, tileRowsLog2: 0,
  speed: 6, subsample: 1, chromaDeltaQ: false, sharpness: 0, tune: 0,
  enableSharpYUV: false,
};
const JXL_OPTS = {
  effort: 7, quality: 75, progressive: false, epf: -1, lossyPalette: false,
  decodingSpeedTier: 0, photonNoiseIso: 0, lossyModular: false,
};

function factoryContext(src) {
  const ctx = {
    WebAssembly, console, Reflect, Object, Error, TypeError, Promise, Uint8Array,
    Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
    Float32Array, Float64Array, Array, ArrayBuffer, DataView, TextDecoder, URL,
    fetch: () => Promise.reject(new Error('codec glue fetched — wasmBinary path is broken')),
    location: { href: 'https://squoosh.invalid/gifos-inlined/' },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx);
  return ctx;
}

async function smokeEmscripten(label, factoryName, glueSrc, wasmBytes, opts) {
  const ctx = factoryContext(glueSrc);
  const factory = ctx[factoryName];
  if (typeof factory !== 'function') {
    throw new Error('rewritten ' + label + ' glue did not expose window.' + factoryName + ' as a factory');
  }
  const bytes = wasmBytes;
  const mod = await factory({
    wasmBinary: bytes,
    locateFile: (p) => p,
    instantiateWasm: (imports, receive) => {
      WebAssembly.instantiate(bytes, imports).then((result) => receive(result.instance, result.module));
      return {};
    },
  });
  if (typeof mod.encode !== 'function') throw new Error(label + ' module has no encode()');
  const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
  const out = mod.encode(px, 2, 2, opts);
  if (!out || out.length < 8) throw new Error(label + ' encode of a 2×2 test image failed (' + (out && out.length) + ' bytes)');
  console.log(label + ' smoke encode:', out.length, 'bytes from a 2×2');
}

{
  await smokeEmscripten('MozJPEG', 'SQUOOSH_MOZJPEG', glue['mozjpeg.js'], wasm['mozjpeg_enc.wasm'], MOZJPEG_OPTS);
  await smokeEmscripten('WebP',    'SQUOOSH_WEBP',    glue['webp.js'],    wasm['webp_enc.wasm'],    WEBP_OPTS);
  await smokeEmscripten('AVIF',    'SQUOOSH_AVIF',    glue['avif.js'],    wasm['avif_enc.wasm'],    AVIF_OPTS);
  await smokeEmscripten('JPEG XL', 'SQUOOSH_JXL',     glue['jxl.js'],     wasm['jxl_enc.wasm'],     JXL_OPTS);
  await smokeEmscripten('QOI',     'SQUOOSH_QOI',     glue['qoi.js'],     wasm['qoi_enc.wasm'],     {});
  {
    const ctx = factoryContext(glue['oxipng.js']);
    const api = ctx.SQUOOSH_OXIPNG;
    if (!api || typeof api.init !== 'function' || typeof api.optimise !== 'function') {
      throw new Error('rewritten OxiPNG glue did not expose window.SQUOOSH_OXIPNG');
    }
    await api.init(wasm['oxipng.wasm']);
    const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    const out = api.optimise(px, 2, 2, 2, false);
    if (!out || out.length < 8) throw new Error('OxiPNG encode of a 2×2 test image failed (' + (out && out.length) + ' bytes)');
    console.log('OxiPNG smoke encode:', out.length, 'bytes from a 2×2');
  }
}

const appJs = read('app.js');
const codecsJs = read('codecs.js');
const indexHtml = read('index.html');
const styleCss = read('style.css');

for (const [n, s] of [['app.js', appJs], ['codecs.js', codecsJs], ['index.html', indexHtml]]) {
  const code = s.split('\n').filter((l) => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
  for (const bad of ['new Function(', 'eval(', 'XMLHttpRequest', 'importScripts(', 'gtag(', 'google-analytics', 'analytics.js']) {
    if (code.includes(bad)) throw new Error(n + ' uses ' + bad + ', which this port must not.');
  }
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': indexHtml,
  'style.css': styleCss,
  'codecs.js': codecsJs,
  'app.js': appJs,
  ...glue,
  // Raw WASM under .assets/, served by gifos.assets() — not referenced by
  // src/href, so they never become a data: URL inside the srcdoc.
  '.assets/mozjpeg_enc.wasm': wasm['mozjpeg_enc.wasm'],
  '.assets/webp_enc.wasm':    wasm['webp_enc.wasm'],
  '.assets/avif_enc.wasm':    wasm['avif_enc.wasm'],
  '.assets/jxl_enc.wasm':     wasm['jxl_enc.wasm'],
  '.assets/qoi_enc.wasm':     wasm['qoi_enc.wasm'],
  '.assets/oxipng.wasm':      wasm['oxipng.wasm'],
  'COPYING-squoosh.txt': read('vendor/LICENSE-squoosh.txt'),
  'LICENSE-mozjpeg.md':  read('vendor/LICENSE-mozjpeg.md'),
  'LICENSE-oxipng.md':   read('vendor/LICENSE-oxipng.md'),
};

const html = files['index.html'];
for (const s of ['mozjpeg.js', 'webp.js', 'avif.js', 'jxl.js', 'qoi.js', 'oxipng.js', 'codecs.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/google-analytics|gtag\(|www\.google-analytics/i.test(html + appJs + codecsJs)) {
  throw new Error('Google Analytics leaked into the port — strip it.');
}

const wanted = [...codecsJs.matchAll(/'([a-z0-9_]+\.wasm)'/g)].map((m) => m[1]);
if (wanted.length !== 6) throw new Error('codecs.js ASSETS map is not 6 wasm files (got ' + wanted.length + ')');
for (const w of wanted) {
  if (!(('.assets/' + w) in files)) throw new Error('codecs.js wants .assets/' + w + ' but it is not packed');
}
const HREF_OK = new Set(Object.keys(files).filter((f) => f.endsWith('.js') || f.endsWith('.css')));
for (const m of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
  if (m[1] in files && !HREF_OK.has(m[1])) {
    throw new Error('index.html references packed file "' + m[1] + '" by src/href — reach it with gifos.assets() instead.');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: squooshIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'squoosh');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'squoosh.gif'), bytes);

const sharp = (await import('sharp')).default;
const cover = await sharp(shot)
  .resize({ width: 1200, withoutEnlargement: true })
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toBuffer();
writeFileSync(join(outDir, 'cover.jpg'), cover);

const rec = {
  catalog: '1.0',
  slug: 'squoosh',
  appId: manifest.appId,
  name: manifest.name,
  shortName: manifest.shortName,
  version: manifest.version,
  minBuild: manifest.minBuild,
  tagline: listing.tagline,
  description: listing.description,
  author: listing.author,
  releaseDate: listing.releaseDate,
  updated: listing.updated || listing.releaseDate,
  categories: listing.categories,
  tags: listing.tags || [],
  license: listing.license,
  homepage: listing.homepage || '',
  accent: manifest.accent || null,
  capabilities: manifest.capabilities || {},
  cover: '/apps/squoosh/cover.jpg',
  screenshots: [],
  gif: '/apps/squoosh/squoosh.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: sha256(bytes),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

const raw = Object.values(files).reduce((n, v) => n + (typeof v === 'string' ? Buffer.byteLength(v) : v.length), 0);
const inGif = Object.entries(wasm).map(([n, b]) => n.replace(/_enc\.wasm$|\.wasm$/, '') + ' ' + (b.length / 1024).toFixed(0) + ' KB');
console.log('wrote site/apps/squoosh/squoosh.gif —', (bytes.length / 1e6).toFixed(2), 'MB from',
  Object.keys(files).length, 'files (' + (raw / 1e6).toFixed(2), 'MB raw)');
console.log('wrote site/apps/squoosh/app.json + cover.jpg');
console.log('codecs in-GIF:', inGif.join(', '));
console.log('codecs on-demand: none (every encoder is under the 8 MB asset-pin floor)');
