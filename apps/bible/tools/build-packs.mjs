// Turn the cached verse-per-line ZIPs into GBP1 packs.
//
// A pack is ONE file the reader can mount whole:
//
//   "GBP1" | deflate-raw( u32 headerLen | header JSON | body )
//
// header  {v,id,name,language,lang,dir,books:[[code,[[chapter,verses],…]],…]}
// body    every verse text, in book/chapter/verse order, joined by "\n"
//
// The body stays ONE string on purpose. A verse is a slice at a known offset,
// so addressing costs nothing, and a whole-Bible search is one indexOf over
// five megabytes rather than thirty-one thousand string compares.
//
// deflate-raw and not something denser because the browser already has
// DecompressionStream('deflate-raw'): no decoder rides inside the GIF, and a
// pack that the platform can open is worth more than a smaller one it cannot.
//
// Run: node apps/bible/tools/build-packs.mjs [--only id,id]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { createHash as sha } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');
mkdirSync(outDir, { recursive: true });

const cat = JSON.parse(readFileSync(join(dir, '..', 'data', 'ebible-pd.json'), 'utf8'));
const BOOKS = JSON.parse(readFileSync(join(dir, '..', 'data', 'books.json'), 'utf8')).books;
const ORDER = new Map(BOOKS.map((b) => [b[0], b[3]]));

const onlyIx = process.argv.indexOf('--only');
const only = onlyIx > -1 ? new Set(process.argv[onlyIx + 1].split(',')) : null;

// One verse per line: "GEN 1:1 In the beginning…"
const LINE = /^([0-9A-Z]{3}) (\d+):(\d+)(?:[-,]\S*)? ?(.*)$/;

export function packOne(id, meta, vplText) {
  const byBook = new Map();
  let lines = 0, skipped = 0;
  for (const raw of vplText.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    const m = LINE.exec(line);
    if (!m) { skipped++; continue; }
    const [, code, c, v, text] = m;
    if (!ORDER.has(code)) { skipped++; continue; }
    let book = byBook.get(code);
    if (!book) byBook.set(code, (book = new Map()));
    let chap = book.get(+c);
    if (!chap) book.set(+c, (chap = new Map()));
    // A verse seen twice (bridged references) keeps the first text and
    // appends the rest, which is what a bridge means on the page.
    chap.set(+v, chap.has(+v) ? chap.get(+v) + ' ' + text : text);
    lines++;
  }

  const books = [];
  const parts = [];
  let verses = 0;
  for (const code of [...byBook.keys()].sort((a, b) => ORDER.get(a) - ORDER.get(b))) {
    const chapters = [...byBook.get(code).keys()].sort((a, b) => a - b);
    // Chapter numbers are NOT dense everywhere: the Greek additions to Esther
    // are chapters 10-16 of a book whose 1-9 live in the Hebrew Esther, so the
    // pack carries the chapter number with its verse count rather than a bare
    // list that would silently renumber them.
    const chaps = [];
    for (const n of chapters) {
      const vs = byBook.get(code).get(n);
      const nums = [...vs.keys()].sort((a, b) => a - b);
      const max = nums[nums.length - 1];
      // A gap inside a chapter becomes an EMPTY slot, never a shift: verse
      // numbers on the page have to stay the numbers the reader cites.
      for (let i = 1; i <= max; i++) { parts.push(vs.get(i) || ''); verses++; }
      chaps.push([n, max]);
    }
    books.push([code, chaps]);
  }

  const header = JSON.stringify({
    v: 1, id, name: meta.shortTitle, title: meta.title,
    language: meta.language, languageNative: meta.languageNative,
    lang: meta.lang, dir: meta.dir, copyright: meta.copyright,
    source: 'ebible.org', books,
  });
  const body = parts.join('\n');
  const hb = Buffer.from(header, 'utf8'), bb = Buffer.from(body, 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length, 0);
  const blob = deflateRawSync(Buffer.concat([len, hb, bb]), { level: 9 });
  return { bytes: Buffer.concat([Buffer.from('GBP1'), blob]), verses, skipped, lines,
           rawBytes: hb.length + bb.length + 4, books: books.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = [];
  let totalOut = 0;
  for (const t of cat.translations) {
    if (only && !only.has(t.id)) continue;
    const zip = join(cache, t.id + '_vpl.zip');
    if (!existsSync(zip)) { console.log(`  ${t.id} — no cache, skipped`); continue; }
    const name = execFileSync('unzip', ['-Z1', zip]).toString().split('\n')
                   .find((n) => n.endsWith('_vpl.txt'));
    const text = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 28 }).toString('utf8');
    const p = packOne(t.id, t, text);
    writeFileSync(join(outDir, t.id + '.gbp'), p.bytes);
    totalOut += p.bytes.length;
    built.push({ id: t.id, name: t.name || t.shortTitle, language: t.language,
                 lang: t.lang, dir: t.dir, books: p.books, verses: p.verses,
                 bytes: p.bytes.length,
                 sha256: sha('sha256').update(p.bytes).digest('hex') });
    console.log(`  ${t.id.padEnd(16)} ${String(p.books).padStart(2)} books ${String(p.verses).padStart(6)} verses  ` +
                `${(p.rawBytes / 1048576).toFixed(1)} MB → ${(p.bytes.length / 1048576).toFixed(2)} MB` +
                (p.skipped ? `  (${p.skipped} lines skipped)` : ''));
  }
  built.sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id));
  writeFileSync(join(dir, '..', 'data', 'packs.json'), JSON.stringify(built, null, 1) + '\n');
  console.log(`\n${built.length} packs, ${(totalOut / 1048576).toFixed(1)} MB total`);
}
