// Pack apps/cascade-studio/ into site/apps/cascade-studio/cascade-studio.gif.
//
// WHAT RIDES WHERE
//   in the GIF   the app, licences, and OpenCascade WASM + rewritten worker
//                under .assets/ — gifos.assets() serves them as a zero-copy
//                transfer so 21 MB of kernel never becomes a data: URL in the
//                srcdoc (pdf-tables-ocr's lesson).
//   on demand    nothing.
//
// The vendored cascade-worker.js is ESM (import.meta, export{}) and Embind
// mints invokers with new Function. The sandbox has wasm-unsafe-eval and not
// unsafe-eval, and refuses {type:'module'} blob workers. build.mjs rewrites
// both before packing. A leftover new Function / import.meta fails the build.
//
// Run:  node apps/cascade-studio/build.mjs
import { cascadeIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { tmpdir } from 'node:os';

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

const WASM_SHA = 'cecef84e04dee37e11e2edf824746647194346dcc930022b995888d234727edb';
const WASM_BYTES = 21241345;
const WORKER_SHA = 'b36e637132d7b94d3e216913184caf38873a44a17353a2295ef0a2f5fd6e54d5';

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (manifest.appId !== 'cascade-studio') throw new Error('appId must be cascade-studio');
if (manifest.minBuild < 1178) throw new Error('minBuild must be ≥ 1178 — gifos.assets() for packed .assets/ files');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.wasm) throw new Error('capabilities.wasm is required for the OpenCascade worker');
if (!manifest.capabilities.multiplayer) throw new Error('capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('cascade-studio has no network path');
if (!manifest.data || !manifest.data.doc || manifest.data.doc.visibility !== 'read-write') {
  throw new Error('doc must be read-write so Invite shares the sketch');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'CascadeStudio') throw new Error('basedOn.name');
if (!listing.porter) throw new Error('porter is required on a port');
if (listing.author.name !== 'Johnathon Selstad') throw new Error('author is THEM');

for (const need of [
  'vendor/cascadestudio.wasm',
  'vendor/cascade-worker.js',
  'vendor/COPYING-cascade-studio.txt',
  'vendor/COPYING-opencascade.txt',
  'vendor/UPSTREAM.txt',
  'help.md'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const wasm = bin('vendor/cascadestudio.wasm');
if (wasm.length !== WASM_BYTES || sha256(wasm) !== WASM_SHA) {
  throw new Error('vendor/cascadestudio.wasm drifted from UPSTREAM.txt');
}
if (wasm.subarray(0, 4).toString() !== '\0asm') {
  throw new Error('vendor/cascadestudio.wasm is not a WebAssembly module');
}
const workerRaw = read('vendor/cascade-worker.js');
if (sha256(Buffer.from(workerRaw)) !== WORKER_SHA) {
  throw new Error('vendor/cascade-worker.js drifted from UPSTREAM.txt');
}

const IU_SAFE = 'function iu(t,n,o,s){var needsDtorStack=bn(t),nArgs=t.length-2,dtorIdx=[];if(!needsDtorStack){for(var i=n?1:2;i<t.length;++i){if(t[i].destructorFunction!==null)dtorIdx.push(i)}}return function(humanName,throwBindingError,invoker,fn,runDestructors,fromRetWire,toClassParamWire){var rest=[].slice.call(arguments,7),toArgWires=rest.slice(0,nArgs),dtors=rest.slice(nArgs);return function(){var destructors=needsDtorStack?[]:null,pack=needsDtorStack?destructors:null,invArgs=[fn],thisWired,wired=[],i,j,idx;if(n){thisWired=toClassParamWire(pack,this);invArgs.push(thisWired)}for(i=0;i<nArgs;i++){var a=toArgWires[i](pack,arguments[i]);wired.push(a);invArgs.push(a)}var rv=invoker.apply(null,invArgs);if(needsDtorStack)runDestructors(destructors);else{for(j=0;j<dtorIdx.length;j++){idx=dtorIdx[j];dtors[j](idx===1?thisWired:wired[idx-2])}}if(o)return fromRetWire(rv)}}}';

const EMVAL_NEEDLE = 'var S=new Function(Object.keys(v),w)(...Object.values(v))';
const EMVAL_SAFE = 'var S=function(handle,methodName,destructorsRef,args){var callArgs=[],ii;for(ii=0;ii<d.length;ii++)callArgs.push(d[ii](args+ii*s));var result;if(o===2)result=Reflect.construct(Ie.toValue(handle),callArgs);else if(o===1){var obj=Ie.toValue(handle);result=obj[pi(methodName)].apply(obj,callArgs)}else if(o===3)result=callArgs.length?callArgs[callArgs.length-1]:void 0;else result=Ie.toValue(handle).apply(void 0,callArgs);if(!u.isVoid)return Ru(h,destructorsRef,result)}';

const INIT_NEEDLE = 'let a=await e({locateFile(l){return l.endsWith(".wasm")?"./cascadestudio.wasm":l}})';
const INIT_SAFE = 'let a=await e({wasmBinary:self.__OC_WASM,locateFile:function(l){return l},instantiateWasm:function(info,receive){WebAssembly.instantiate(self.__OC_WASM,info).then(function(r){receive(r.instance,r.module)}).catch(function(err){postMessage({type:"log",payload:"ERROR instantiate "+(err&&err.message||err)})})}})';

const BOOT_NEEDLE = 'dw=new rn;dw.init();export{rn as CascadeStudioWorker};';
const BOOT_SAFE = `dw=new rn;self.messageHandlers=self.messageHandlers||{};self.messageHandlers.sketchSolid=function(payload){try{self.sceneShapes=[];var pts=payload.points;if(!pts||pts.length<3)throw new Error("Need at least 3 points to make a face");var fillets=payload.fillets||[];var sk=new self.Sketch(pts[0]);for(var i=1;i<pts.length;i++){sk.LineTo(pts[i]);if(fillets[i]>0)sk.Fillet(fillets[i])}sk.LineTo(pts[0]);if(fillets[0]>0)sk.Fillet(fillets[0]);var face=sk.End(true).Face();self.Extrude(face,[0,0,payload.height||10]);return true}catch(err){postMessage({type:"log",payload:"ERROR sketchSolid "+(err&&err.message||err)});throw err}};self.onmessage=function(ev){var d=ev.data||{};if(d.type!=="gifosWasm")return;self.__OC_WASM=d.buffer;dw.init().catch(function(err){postMessage({type:"log",payload:"ERROR init "+(err&&err.stack||err)})})};`;

function rewriteWorker(js) {
  if (!js.includes('import.meta.url')) throw new Error('worker: import.meta.url missing');
  const iu0 = js.indexOf('function iu(t,n,o,s){');
  const iu1 = js.indexOf('f(iu,"createJsInvoker")');
  if (iu0 < 0 || iu1 < 0 || !js.slice(iu0, iu1).includes('new Function(S,y)')) {
    throw new Error('worker: createJsInvoker is not the form build.mjs patches');
  }
  js = js.slice(0, iu0) + IU_SAFE + js.slice(iu1);
  if (!js.includes(EMVAL_NEEDLE)) throw new Error('worker: emval_create_invoker is not the form build.mjs patches');
  if (!js.includes(INIT_NEEDLE)) throw new Error('worker: initOpenCascade call changed');
  if (!js.includes(BOOT_NEEDLE)) throw new Error('worker: bootstrap tail changed');
  js = js.split('import.meta.url').join('""');
  js = js.split('await import("module")').join('Promise.resolve(null)');
  js = js.split(EMVAL_NEEDLE).join(EMVAL_SAFE);
  js = js.split(INIT_NEEDLE).join(INIT_SAFE);
  js = js.split(BOOT_NEEDLE).join(BOOT_SAFE);
  if (!js.includes('this._loadFonts(r)')) {
    throw new Error('worker: _loadFonts call missing — update the rewrite');
  }
  js = js.split('this._loadFonts(r)').join('self.loadedFonts={}');
  if (!js.includes('eval(payload.code)')) {
    throw new Error('worker: Evaluate eval() site missing — update the rewrite');
  }
  js = js.split('eval(payload.code)').join('(function(){throw new Error("sketchSolid only")})()');
  for (const bad of ['import.meta', 'export{', 'new Function', 'eval(']) {
    if (js.includes(bad)) throw new Error('worker still contains ' + bad + ' after the rewrite');
  }
  return js;
}

const workerJs = rewriteWorker(workerRaw);
console.log('rewrote cascade-worker.js —', workerJs.length, 'bytes');

async function smoke(workerSrc, wasmBuf) {
  if (process.env.SKIP_SMOKE) {
    console.log('SKIP_SMOKE set — not instantiating OpenCascade in Node');
    return;
  }
  const prelude = `
const { parentPort } = require('node:worker_threads');
process.type = 'renderer';
globalThis.WorkerGlobalScope = function WorkerGlobalScope() {};
globalThis.self = globalThis;
globalThis.XMLHttpRequest = function () { throw new Error('XHR'); };
globalThis.fetch = function () { return Promise.reject(new Error('fetch')); };
globalThis.importScripts = function () { throw new Error('importScripts'); };
globalThis.postMessage = function (m) { parentPort.postMessage(m); };
parentPort.on('message', (d) => {
  const fn = globalThis.onmessage;
  if (typeof fn === 'function') fn({ data: d });
});
process.on('unhandledRejection', (e) => {
  parentPort.postMessage({ type: 'log', payload: 'ERROR unhandled ' + (e && e.stack || e) });
});
parentPort.postMessage({ type: 'log', payload: 'smoke worker up' });
`;
  const smokePath = join(tmpdir(), 'gifos-cascade-smoke-worker.cjs');
  writeFileSync(smokePath, prelude + '\n' + workerSrc);
  await new Promise((resolve, reject) => {
    const w = new Worker(smokePath);
    const t = setTimeout(() => {
      w.terminate();
      reject(new Error('smoke: OpenCascade did not start in 45s (phase hung)'));
    }, 45000);
    let phase = 'boot';
    w.on('message', (d) => {
      if (!d) return;
      if (d.type && d.type !== 'log' && d.type !== 'Progress') {
        console.log('  msg', d.type, d.requestId || '');
      }
      if (d.type === 'log') console.log('  worker:', d.payload);
      if (d.type === 'log' && /ERROR/.test(String(d.payload || ''))) {
        clearTimeout(t); w.terminate();
        reject(new Error('smoke log: ' + d.payload));
        return;
      }
      if (d.type === 'startupCallback' && phase === 'boot') {
        phase = 'sketch';
        w.postMessage({
          type: 'sketchSolid',
          requestId: 7,
          payload: {
            points: [[0, 0], [40, 0], [40, 24], [0, 24]],
            fillets: [6, 6, 6, 6],
            height: 12
          }
        });
        return;
      }
      if (d.requestId === 7 && phase === 'sketch') {
        phase = 'mesh';
        w.postMessage({
          type: 'combineAndRenderShapes',
          requestId: 8,
          payload: { maxDeviation: 0.3, sceneOptions: {} }
        });
        return;
      }
      if (d.requestId === 8 && phase === 'mesh') {
        clearTimeout(t); w.terminate();
        const pair = d.payload && d.payload[0];
        const faces = pair && pair[0];
        if (!faces || !faces.length) {
          reject(new Error('smoke: no faces from sample plate'));
          return;
        }
        console.log('smoke: sample plate meshed', faces.length, 'faces');
        resolve();
      }
    });
    w.on('error', (e) => { clearTimeout(t); reject(e); });
    w.on('exit', (code) => {
      if (code) reject(new Error('smoke worker exit ' + code));
    });
    w.postMessage({ type: 'gifosWasm', buffer: wasmBuf.buffer.slice(wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.byteLength) });
  });
}

await smoke(workerJs, wasm);

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const html = read('index.html');
for (const s of ['view.js', 'sketch.js', 'engine.js', 'boot.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/src="[^"]*cascadestudio|\.wasm|cascade-worker/i.test(html)) {
  throw new Error('index.html must not reference the kernel — it rides under .assets/');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': html,
  'style.css': read('style.css'),
  'view.js': read('view.js'),
  'sketch.js': read('sketch.js'),
  'engine.js': read('engine.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-opencascade.txt': read('COPYING-opencascade.txt'),
  'COPYING-cascade-studio.txt': read('vendor/COPYING-cascade-studio.txt'),
  '.assets/cascadestudio.wasm': wasm,
  '.assets/cascade-worker.js': Buffer.from(workerJs)
};

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: cascadeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'cascade-studio', 'cascade-studio.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/cascade-studio/cascade-studio.gif —',
  (bytes.length / 1024 / 1024).toFixed(2), 'MB, from', Object.keys(files).length, 'files',
  '(wasm', (wasm.length / 1024 / 1024).toFixed(1), 'MB raw)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
