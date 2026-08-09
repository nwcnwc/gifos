// Pack apps/pocket-voice/ source into the SLIM, downloadable
// site/apps/pocket-voice/pocket-voice.gif (see apps/README.md). Slim because
// the engine rides the install-time assets pattern (gifos-assets.js): the
// manifest pins espeak.js + config + voice by URL and SHA-256, and the OS
// downloads-then-seals them at install. This script also re-verifies those
// pins against the single staged copies in site/apps/pocket-voice/assets/ —
// a re-staged asset with a stale manifest pin must fail the BUILD, not the
// player's install.
// Run:  node apps/pocket-voice/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { pocketVoiceIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const site = join(dir, '..', '..', 'site');
for (const a of manifest.assets || []) {
  const p = join(site, a.url);
  if (!existsSync(p)) throw new Error('asset missing: site' + a.url);
  const b = readFileSync(p);
  const hex = createHash('sha256').update(b).digest('hex');
  if (hex !== a.sha256) throw new Error('asset pin stale for ' + a.path + ' — manifest says ' + a.sha256 + ', file is ' + hex);
  if (a.bytes !== b.length) throw new Error('asset size stale for ' + a.path + ' — manifest says ' + a.bytes + ', file is ' + b.length);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'app.js': read('app.js'),
  'COPYING-espeak.txt': read('COPYING-espeak.txt'),
};

const bytes = await gif.encode(files, { preview: pocketVoiceIcon(), accent: manifest.accent });
const out = join(site, 'apps', 'pocket-voice', 'pocket-voice.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pocket-voice/pocket-voice.gif —', (bytes.length / 1024).toFixed(0), 'KB from', Object.keys(files).length, 'files (assets pinned:', (manifest.assets || []).length + ')');
console.log('now refresh the store catalog: node scripts/build-app-catalog.mjs');
