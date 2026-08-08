// Pack apps/sound-it-out/ source into the finished, downloadable
// site/apps/sound-it-out/sound-it-out.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/sound-it-out/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { soundItOutIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

// Script order matters: each module attaches itself to window.SIO and the
// ones after it read what came before. index.html lists them in the same
// order. fonts-data.js and clips-data.js are GENERATED (see tools/) and
// committed, same doctrine as the store catalog.
const SCRIPTS = ['fonts-data.js', 'clips-data.js', 'curriculum.js', 'library.js',
                 'dsp.js', 'store.js', 'voice.js', 'storyboard.js',
                 'frames.js', 'player.js', 'exporter.js', 'studio.js', 'ui.js', 'app.js'];

const files = { 'manifest.json': JSON.stringify(manifest),
                'index.html': read('index.html'),
                'style.css': read('style.css') };
for (const s of SCRIPTS) files[s] = read(s);

// The runtime inlines every <script src> it finds by rewriting the tag, so a
// script the HTML never references would travel in the GIF and never run.
const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

// A placeholder clips build is legal for development but must never ship.
if (/placeholder build/.test(files['clips-data.js'])) {
  console.warn('WARNING: clips-data.js is the empty placeholder - the app will have no built-in voice.');
}

const bytes = await gif.encode(files, { preview: soundItOutIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'sound-it-out', 'sound-it-out.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/sound-it-out/sound-it-out.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
