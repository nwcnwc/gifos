// Pack apps/restfox/ into site/apps/restfox/restfox.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Run:  node apps/restfox/build.mjs
import '../../site/js/gifos-gif.js';
import { restfoxIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const SCRIPTS = ['host.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-restfox.txt': read('COPYING-restfox.txt'),
};
for (const s of SCRIPTS) files[s] = read(s);

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
for (const [n, s] of Object.entries(files)) {
  if (n.endsWith('.js') && /<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const bytes = await gif.encode(files, { preview: restfoxIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'restfox', 'restfox.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/restfox/restfox.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
