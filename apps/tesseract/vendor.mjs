// Rebuild vendor/tesseract-core-simd-lstm.{js,wasm} from the pinned
// tesseract.js-core version. The only step that needs the network — run it
// when LANG-PINS.json's core pin moves, not as part of the GIF build.
//
//   node apps/tesseract/vendor.mjs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const pins = JSON.parse(readFileSync(join(dir, 'LANG-PINS.json'), 'utf8'));
const ver = pins.core.version;
const base = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@' + ver + '/';
const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });

async function pull(name, want) {
  const url = base + name;
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== want.sha256) throw new Error(name + ' sha256 ' + sha + ' ≠ pinned ' + want.sha256);
  if (buf.length !== want.bytes) throw new Error(name + ' ' + buf.length + ' bytes ≠ pinned ' + want.bytes);
  writeFileSync(join(outDir, name), buf);
  console.log('wrote vendor/' + name, buf.length, 'bytes');
}

const files = pins.core.files;
await pull('tesseract-core-simd-lstm.js', files['tesseract-core-simd-lstm.js']);
await pull('tesseract-core-simd-lstm.wasm', files['tesseract-core-simd-lstm.wasm']);
console.log('tesseract.js-core@' + ver + ' vendor pin matches LANG-PINS.json');
