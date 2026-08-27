// Download the verse-per-line ZIP for every text in data/ebible-pd.json into
// the local cache (.cache/, never committed). Idempotent: a file already in
// the cache is skipped unless --force.
//
// Run: node apps/bible/tools/fetch-texts.mjs [--force] [--only id,id]
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join(dir, '..', '.cache');
mkdirSync(cache, { recursive: true });

const cat = JSON.parse(readFileSync(join(dir, '..', 'data', 'ebible-pd.json'), 'utf8'));
const force = process.argv.includes('--force');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg ? new Set((onlyArg.split('=')[1] || process.argv[process.argv.indexOf(onlyArg) + 1]).split(',')) : null;

let got = 0, skipped = 0, failed = [];
for (const t of cat.translations) {
  if (only && !only.has(t.id)) continue;
  const out = join(cache, t.id + '_vpl.zip');
  if (!force && existsSync(out) && statSync(out).size > 1000) { skipped++; continue; }
  const url = `https://ebible.org/Scriptures/${t.id}_vpl.zip`;
  process.stdout.write(`  ${t.id} … `);
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) throw new Error('short body ' + buf.length);
    writeFileSync(out, buf);
    console.log((buf.length / 1024 / 1024).toFixed(1) + ' MB');
    got++;
  } catch (e) {
    console.log('FAILED ' + e.message);
    failed.push(t.id);
  }
}
console.log(`fetched ${got}, cached ${skipped}, failed ${failed.length}${failed.length ? ': ' + failed.join(',') : ''}`);
