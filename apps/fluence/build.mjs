// Pack apps/fluence/ source into the finished, downloadable apps/fluence.gif.
// Uses the SAME codec the GifOS desktop and MCP server use
// (site/js/gifos-gif.js) — it only needs CompressionStream + TextEncoder, both
// native in Node 22. Run:  node apps/fluence/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { oratorIcon } from './icon.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'wordlists.js': read('wordlists.js'),
  'features.js': read('features.js'),
  'coach.js': read('coach.js'),
  'drills.js': read('drills.js'),
  'weekly.js': read('weekly.js'),
  'app.js': read('app.js'),
};

const bytes = await gif.encode(files, { preview: oratorIcon() });
const out = join(dir, '..', 'fluence.gif');
writeFileSync(out, bytes);
console.log('wrote apps/fluence.gif —', bytes.length, 'bytes, from', Object.keys(files).length, 'files');
