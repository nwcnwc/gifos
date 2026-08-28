// Download the USFX ZIP for every text in data/ebible-pd.json into
// the local cache (.cache/, never committed). Idempotent: a file already in
// the cache is skipped unless --force. A dead URL keeps the last cache, or
// the committed pack — it never writes an empty file over a good dest
// (tools/source.mjs).
//
// Run: node apps/bible/tools/fetch-texts.mjs [--force] [--only id,id]
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pull } from './source.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join(dir, '..', '.cache');
const packs = join(dir, '..', '..', '..', 'site', 'apps', 'bible', 'packs');
mkdirSync(cache, { recursive: true });

const cat = JSON.parse(readFileSync(join(dir, '..', 'data', 'ebible-pd.json'), 'utf8'));
const force = process.argv.includes('--force');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg ? new Set((onlyArg.split('=')[1] || process.argv[process.argv.indexOf(onlyArg) + 1]).split(',')) : null;

let got = 0, skipped = 0, frozen = 0, failed = [];
for (const t of cat.translations) {
  if (only && !only.has(t.id)) continue;
  const out = join(cache, t.id + '_usfx.zip');
  const url = `https://ebible.org/Scriptures/${t.id}_usfx.zip`;
  process.stdout.write(`  ${t.id} … `);
  const r = await pull(url, out, { force, packPath: join(packs, t.id + '.gbp') });
  if (r.status === 'fetched') {
    console.log((r.bytes / 1024 / 1024).toFixed(1) + ' MB');
    got++;
  } else if (r.status === 'cached') {
    console.log('cached');
    skipped++;
  } else if (r.status === 'frozen-cache' || r.status === 'frozen-pack') {
    console.log('FROZEN ' + r.status + (r.reason ? ' (' + r.reason + ')' : ''));
    frozen++;
  } else {
    console.log('FAILED ' + (r.reason || r.status));
    failed.push(t.id);
  }
}
console.log(`fetched ${got}, cached ${skipped}, frozen ${frozen}, failed ${failed.length}${failed.length ? ': ' + failed.join(',') : ''}`);
