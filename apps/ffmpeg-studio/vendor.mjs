// Rebuild vendor/ffmpeg-core.js (and verify the wasm pin) from @ffmpeg/core@0.12.10.
// The only step that needs the network — run it when the pin moves, not as
// part of the GIF build. The 31 MB wasm is hashed here and NOT written: it
// rides as a required manifest asset pin (8 MB floor).
//
//   node apps/ffmpeg-studio/vendor.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const VER = '0.12.10';
const CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@' + VER + '/dist/umd/';
const WRAP = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@' + VER + '/dist/umd/';
const dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

function pinsFromUpstream() {
  const pins = {};
  for (const line of readFileSync(join(outDir, 'UPSTREAM.txt'), 'utf8').split('\n')) {
    const m = line.match(/^(\S+)\s+(\d+)\s+([0-9a-f]{64})\s*$/);
    if (m) pins[m[1]] = { bytes: +m[2], sha256: m[3] };
  }
  return pins;
}

async function pull(url, name, save) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → ' + r.status);
  const cors = r.headers.get('access-control-allow-origin');
  if (save && cors !== '*' && cors !== 'https://gifos.app') {
    throw new Error(url + ' CORS is ' + JSON.stringify(cors) + ' — the OS could not download this pin in a browser');
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  return { buf, sha, bytes: buf.length, cors: cors || '' };
}

const pins = pinsFromUpstream();
const need = ['ffmpeg-core.js', '814.ffmpeg.js', 'ffmpeg-core.wasm'];
for (const n of need) if (!pins[n]) throw new Error('vendor/UPSTREAM.txt has no pin for ' + n);

{
  const g = await pull(CORE + 'ffmpeg-core.js', 'ffmpeg-core.js', false);
  if (g.sha !== pins['ffmpeg-core.js'].sha256 || g.bytes !== pins['ffmpeg-core.js'].bytes) {
    throw new Error('ffmpeg-core.js ' + g.bytes + ' ' + g.sha + ' ≠ UPSTREAM.txt — update the pin if this bump is deliberate');
  }
  if (!g.buf.includes(Buffer.from('createFFmpegCore'))) throw new Error('glue lost createFFmpegCore');
  if (!g.buf.includes(Buffer.from('wasmBinary'))) throw new Error('glue lost wasmBinary');
  if (!g.buf.includes(Buffer.from('instantiateWasm'))) throw new Error('glue lost instantiateWasm');
  writeFileSync(join(outDir, 'ffmpeg-core.js'), g.buf);
  console.log('wrote vendor/ffmpeg-core.js', g.bytes, 'bytes');
}

{
  const w = await pull(WRAP + '814.ffmpeg.js', '814.ffmpeg.js', false);
  if (w.sha !== pins['814.ffmpeg.js'].sha256 || w.bytes !== pins['814.ffmpeg.js'].bytes) {
    throw new Error('814.ffmpeg.js drifted from UPSTREAM.txt');
  }
  writeFileSync(join(outDir, '814.ffmpeg.js'), w.buf);
  console.log('wrote vendor/814.ffmpeg.js', w.bytes, 'bytes (protocol reference, not packed)');
}

{
  const wasm = await pull(CORE + 'ffmpeg-core.wasm', 'ffmpeg-core.wasm', true);
  if (wasm.buf.subarray(0, 4).toString() !== '\0asm') throw new Error('wasm is not a WebAssembly module');
  if (wasm.sha !== pins['ffmpeg-core.wasm'].sha256 || wasm.bytes !== pins['ffmpeg-core.wasm'].bytes) {
    throw new Error('ffmpeg-core.wasm ' + wasm.bytes + ' ' + wasm.sha + ' ≠ UPSTREAM.txt');
  }
  console.log('verified ffmpeg-core.wasm', wasm.bytes, 'bytes sha256', wasm.sha, 'CORS', wasm.cors, '(not written)');
}

console.log('@ffmpeg/core@' + VER + ' vendor pin matches UPSTREAM.txt');
