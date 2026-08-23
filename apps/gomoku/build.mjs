// Pack apps/gomoku/ into site/apps/gomoku/gomoku.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// The computer is yyjhao's HTML5-Gomoku AI worker, vendored unmodified. A thin
// factory wrap lets the same code run on this thread when the sandbox has no
// worker-src (we do not declare wasm — the AI is plain JS, not a compiled
// engine). Offline and deterministic.
//
// Run:  node apps/gomoku/build.mjs
import { gomokuIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const original = read('vendor/ai-worker.js');
if (!original.includes("self.addEventListener('message'")) {
  throw new Error('vendor/ai-worker.js is not yyjhao\'s worker — the message listener is missing.');
}
if (/<\/script/i.test(original)) throw new Error('ai-worker.js contains </script — cannot inline.');

// Same source the Worker blob uses, plus a factory so a sandbox without
// worker-src still gets a fresh AI per game (the original mutates globals).
const wrapped = [
  '(function (global) {',
  '  global.createGomokuAi = function (handler) {',
  '    function emit(data) { var fn = handler; if (typeof fn === "function") setTimeout(function () { fn({ data: data }); }, 0); }',
  '    var postMessage = emit;',
  '    var self = { addEventListener: function (type, fn) { self._on = fn; } };',
  '    var mc, ai, boardBuf, boardBufArr;',
  original,
  '    return {',
  '      postMessage: function (d) { var fn = self._on; if (fn) setTimeout(function () { fn({ data: d }); }, 0); },',
  '      terminate: function () { handler = null; self._on = null; },',
  '      set onmessage(fn) { handler = fn; }',
  '    };',
  '  };',
  '})(typeof window !== "undefined" ? window : self);',
].join('\n');

const aiSrc = ('window.GOMOKU_AI_SRC=' + JSON.stringify(original) + ';').split('</').join('<\\/');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'ai-src.js': aiSrc,
  'ai-worker.js': wrapped,
  'rules.js': read('rules.js'),
  'app.js': read('app.js'),
  'COPYING-gomoku.txt': read('vendor/COPYING-gomoku.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};

{
  if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide.');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of ['ai-src.js', 'ai-worker.js', 'rules.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm — the AI is plain JavaScript, not a compiled engine');
}
if (manifest.capabilities.network) {
  throw new Error('gomoku has no network path');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}
if (files['app.js'].includes('code.jquery.com') || files['index.html'].includes('code.jquery.com')) {
  throw new Error('do not load jQuery from a CDN — the sandbox has no network');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: gomokuIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'gomoku', 'gomoku.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/gomoku/gomoku.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (AI worker vendored, no network)');
