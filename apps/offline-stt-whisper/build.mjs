// Pack apps/offline-stt-whisper/ source into the downloadable
// site/apps/offline-stt-whisper/offline-stt-whisper.gif (see apps/README.md).
//
// The speech-to-text sibling of the TTS providers. Same packing as
// offline-tts-kokoro — and it READS that app's vendored ONNX Runtime (the ESM
// bundle + the JSEP wasm) rather than keeping a second 28 MB copy in the repo,
// the way vocal-remover does. What is this app's own:
//   - whisper-core.js: the log-mel front end, the byte-level BPE tokenizer,
//     greedy KV-cached decoding, language detection, translate, prompting.
//   - tokenizer-data.js: the multilingual vocab (1 MB) + merges (0.5 MB).
//   - the int8 Whisper models are OPTIONAL asset pins (manifest), never in-GIF.
//
// Run:  node apps/offline-stt-whisper/build.mjs
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { whisperIcon } from './icon.mjs';

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
        flush(controller) { controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks)))); }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const kokoroVendor = join(dir, '..', 'offline-tts-kokoro', 'vendor');
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
if (!manifest.provides || !manifest.provides.ai || manifest.provides.ai.indexOf('stt') < 0) throw new Error('manifest.json must provide the stt role');
if (manifest.capabilities && (manifest.capabilities.network || manifest.capabilities.api)) throw new Error('a provider must be network-less (docs/providers.md)');
for (const a of manifest.assets || []) {
  if (!/^[0-9a-f]{64}$/.test(a.sha256)) throw new Error('asset ' + a.path + ' needs a 64-hex sha256');
  if (a.optional !== true) throw new Error('asset ' + a.path + ' must be optional — nothing downloads at install');
}

// ---- ORT: ESM → plain script, glue inlined (the kokoro build's rewrite) -------
let ortJs = readFileSync(join(kokoroVendor, 'ort-esm.js'), 'utf8');
const ORT_EXPORT_RE = /export\{([^}]*)\};?/;
const om = ORT_EXPORT_RE.exec(ortJs);
if (!om) throw new Error('offline-tts-kokoro/vendor/ort-esm.js: export block not found — the bundle shape changed; update build.mjs.');
const ortExports = om[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
  const parts = pair.split(/\s+as\s+/);
  return parts.length === 2 ? `${parts[1].trim()}: ${parts[0].trim()}` : parts[0];
});
for (const want of ['InferenceSession:', 'Tensor:', 'env:']) {
  if (!ortExports.some((e) => e.startsWith(want))) throw new Error('ORT no longer exports ' + want.slice(0, -1));
}
ortJs = ortJs.replace(ORT_EXPORT_RE, `window.ort = { ${ortExports.join(', ')} };`);
if (!ortJs.includes('import.meta.url')) throw new Error('ort-esm.js no longer uses import.meta.url — re-check the rewrite in build.mjs.');
ortJs = ortJs.split('import.meta.url').join('"https://ort.invalid/gifos-inlined/"');
for (const bad of ['import.meta', 'import(']) {
  if (ortJs.includes(bad)) throw new Error('ORT bundle still contains ' + bad + ' after the rewrite — it cannot be inlined as a classic script.');
}
if (/^export\s|export\{/m.test(ortJs)) throw new Error('ort-esm.js still contains an export statement after the rewrite.');
if (/<\/script/i.test(ortJs)) throw new Error('ORT bundle contains </script — cannot inline safely.');
const isolate = (src) => '(function(){\n' + src + '\n})();\n';
ortJs = isolate(ortJs);

const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

// ---- the tokenizer tables: assert their shape -----------------------------------
const vocab = JSON.parse(read('vendor/whisper-vocab.json'));
const nVocab = Object.keys(vocab).length;
if (nVocab < 50000 || vocab['<|endoftext|>'] !== 50257) throw new Error('vendor/whisper-vocab.json looks wrong (' + nVocab + ' entries) — it must be the multilingual Whisper vocabulary.');
const merges = read('vendor/whisper-merges.txt');
if (merges.split('\n').length < 40000) throw new Error('vendor/whisper-merges.txt looks truncated.');

const core = read('whisper-core.js');
for (const bad of ['new Worker', 'import.meta', 'fetch(', 'XMLHttpRequest']) {
  if (core.includes(bad)) throw new Error('whisper-core.js uses ' + bad + ' — re-audit it against the sandbox before shipping.');
}
if (/<\/script/i.test(core) || /<\/script/i.test(read('app.js'))) throw new Error('a script contains </script — cannot inline safely.');

const helpMd = read('help.md').replace(/^﻿/, '');
if (helpMd.trim().length < 400) throw new Error('help.md must be at least 400 characters after trim');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'whisper-core.js': core,
  'help.md': helpMd,
  'ort.js': ortJs,
  'ort-wasm.js': strModule('window.STT_ORT_WASM_B64', readFileSync(join(kokoroVendor, 'ort-wasm-simd-threaded.jsep.wasm')).toString('base64')),
  'tokenizer-data.js': [
    strModule('window.STT_VOCAB_JSON', read('vendor/whisper-vocab.json')),
    strModule('window.STT_MERGES_TXT', merges),
  ].join('\n'),
  'LICENSE-whisper.txt': read('vendor/LICENSE-whisper.txt'),
  'LICENSE-onnxruntime.txt': read('vendor/LICENSE-onnxruntime.txt'),
};

const bytes = await gif.encode(files, { preview: whisperIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'offline-stt-whisper', 'offline-stt-whisper.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/offline-stt-whisper/offline-stt-whisper.gif —', (bytes.length / 1e6).toFixed(2), 'MB from', Object.keys(files).length, 'files (engine + tokenizer in-GIF; Whisper int8 models by optional asset pin)');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
