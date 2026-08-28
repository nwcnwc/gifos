// Intake: fetch study-help sources into .cache/helps/. If the pack already
// exists, this does nothing (the URL is no longer in play). --reintake is
// a deliberate second intake of the same id. Does not unpack SWORD zips.
//
// Run: node apps/bible/tools/fetch-helps.mjs [--force] [--reintake]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pull, markFrozen, clearFrozen, skipIfPacked } from './source.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join(dir, '..', '.cache', 'helps');
const packs = join(dir, '..', '..', '..', 'site', 'apps', 'bible', 'packs');
const credits = join(dir, '..', 'data', 'credits.json');
const force = process.argv.includes('--force');
const reintake = process.argv.includes('--reintake');

const FILES = [
  { id: 'tsk', dest: 'tskxref.txt', pack: 'help-xrefs.gbx',
    url: 'https://raw.githubusercontent.com/narthur/tsk-cli/master/tskxref.txt' },
  { id: 'easton', dest: 'Easton.zip', pack: 'help-dict.gbx',
    url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Easton.zip' },
  { id: 'smith', dest: 'Smith.zip', pack: 'help-dict.gbx',
    url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Smith.zip' },
  { id: 'nave', dest: 'Nave.zip', pack: 'help-topics.gbx',
    url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Nave.zip' },
  { id: 'torrey', dest: 'Torrey.zip', pack: 'help-topics.gbx',
    url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Torrey.zip' },
  { id: 'openbible-geo', dest: 'places.txt', pack: 'help-places.gbx',
    url: 'https://www.openbible.info/geo/data/places.txt', minBytes: 100 },
];

let fetched = 0, cached = 0, frozen = 0, sealed = 0, missing = 0;
for (const f of FILES) {
  const packPath = join(packs, f.pack);
  if (skipIfPacked(packPath, { reintake })) {
    console.log('  sealed       ' + f.id + '  (intake already ran; not fetching)');
    sealed++;
    continue;
  }
  const dest = join(cache, f.dest);
  const r = await pull(f.url, dest, {
    force, minBytes: f.minBytes, packPath,
  });
  const tag = r.status.padEnd(12);
  console.log('  ' + tag + ' ' + f.id + (r.reason ? '  (' + r.reason + ')' : ''));
  if (r.status === 'fetched') { fetched++; clearFrozen(credits, f.id); }
  else if (r.status === 'cached') cached++;
  else if (r.status === 'frozen-cache' || r.status === 'frozen-pack') {
    frozen++;
    markFrozen(credits, f.id, r);
  } else { missing++; }
}
console.log(`fetched ${fetched}, cached ${cached}, sealed ${sealed}, frozen ${frozen}, missing ${missing}`);
if (missing) process.exit(1);
