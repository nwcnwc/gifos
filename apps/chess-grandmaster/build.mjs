// Pack apps/chess-grandmaster/ source into the finished apps/chess-grandmaster.gif.
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Two of the packed files are GENERATED here from the vendored Stockfish engine
// (sf-src.js + stockfish.wasm, the lite single-threaded build, GPLv3):
//   sf-glue.js  →  the engine glue, executable. On the app's main thread it
//                  only DEFINES the engine (no network, no auto-run); its
//                  self-init tail is rewritten so the factory lands on
//                  window.SF_FACTORY (the runtime strips the <script> id we'd
//                  otherwise read it from).
//   sf-wasm.js  →  window.GM_WASM_B64 : the wasm (NNUE net embedded), base64,
//                  handed to the engine as wasmBinary — so it needs NO network.
// Run:  node apps/chess-grandmaster/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { grandmasterIcon } from './icon.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

// --- transform the vendored engine glue so a worker can capture its factory ---
const glueRaw = read('sf-src.js');
const NEEDLE = '"object"==typeof document&&document.currentScript?document.currentScript._exports=t():t()';
if (glueRaw.indexOf(NEEDLE) < 0) throw new Error('Stockfish glue tail not found — the vendored engine changed; update the transform in build.mjs.');
const CAPTURE = '(function(){var _f=t();try{(typeof window!=="undefined"?window:self).SF_FACTORY=_f;}catch(e){}return _f;})()';
const glue = glueRaw.replace(NEEDLE, CAPTURE);
// The glue is inlined as an executable <script>; a literal "</script>" inside it
// would close the tag early. The vendored build has none, but assert it.
if (/<\/script/i.test(glue)) throw new Error('vendored engine glue contains </script — cannot inline safely.');

// A JS string module. Escaping "</" keeps any "</script>" inside the payload
// from prematurely closing the <script> the runtime inlines it into.
const strModule = (name, value) => (name + '=' + JSON.stringify(value) + ';').split('</').join('<\\/');

const wasmB64 = readFileSync(join(dir, 'stockfish.wasm')).toString('base64');
const manifest = JSON.parse(read('manifest.json'));

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'chess.js': read('chess.js'),
  'engine.js': read('engine.js'),
  'app.js': read('app.js'),
  'sf-glue.js': glue,
  'sf-wasm.js': strModule('window.GM_WASM_B64', wasmB64),
};

const bytes = await gif.encode(files, { preview: grandmasterIcon(), accent: manifest.accent });
const out = join(dir, '..', 'chess-grandmaster.gif');
writeFileSync(out, bytes);
console.log('wrote apps/chess-grandmaster.gif —', (bytes.length / 1e6).toFixed(2), 'MB, from', Object.keys(files).length, 'files (wasm', (wasmB64.length / 1e6).toFixed(1), 'MB b64)');
