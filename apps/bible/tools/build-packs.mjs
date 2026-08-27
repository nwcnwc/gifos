// Turn the cached USFX sources into GBP2 packs — one file the reader mounts whole.
//
//   "GBP2" | deflate-raw( u32 headerLen | header JSON | body | layout | heads | notes | xrefs )
//
// The header names each section's byte length, so one inflate yields the lot
// and every section is a slice.
//
//   body     every verse, in book/chapter/verse order, joined by newlines
//   layout   one block style per verse ('' = this verse continues the last block)
//   heads    "verseIndex<TAB>section heading"
//   notes    "verseIndex<TAB>the translators' footnote"   (in anchor order)
//   xrefs    "verseIndex<TAB>cross reference"             (in anchor order)
//
// The body stays ONE string on purpose. A verse is then a slice at a known
// offset, and a whole-Bible search is one indexOf over four megabytes rather
// than thirty-one thousand string compares.
//
// deflate-raw and not something denser because the browser already has
// DecompressionStream('deflate-raw'): no decoder rides inside the GIF, and a
// pack the platform can open by itself is worth more than a smaller one it
// cannot.
//
// Run: node apps/bible/tools/build-packs.mjs [--only id,id]
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUsfx } from './usfx.mjs';
import { ensureDtn, loadDarbyNotes, overlayDarbyNotes, sourceCredit as dtnCredit } from './darby-notes.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');

const cat = JSON.parse(readFileSync(join(dir, '..', 'data', 'ebible-pd.json'), 'utf8'));
const BOOKTAB = JSON.parse(readFileSync(join(dir, '..', 'data', 'books.json'), 'utf8'));
const ORDER = new Map(BOOKTAB.books.map((b) => [b[0], b[3]]));
const SKIP = new Set(BOOKTAB.skip);

export function packOne(id, meta, xml, opts) {
  const parsed = parseUsfx(xml);
  const names = new Map(parsed.books.map((b) => [b.code, b.names]));

  const byBook = new Map();
  let unknown = new Set();
  for (const v of parsed.verses) {
    if (!v.book || SKIP.has(v.book)) continue;      // front matter is not a book
    if (!ORDER.has(v.book)) { unknown.add(v.book); continue; }
    if (!v.chapter || !v.verse) continue;
    let b = byBook.get(v.book);
    if (!b) byBook.set(v.book, (b = new Map()));
    let c = b.get(v.chapter);
    if (!c) b.set(v.chapter, (c = new Map()));
    const prev = c.get(v.verse);
    // A verse the source emits twice (a bridged reference, or a chapter split
    // across two <p>) is ONE verse on the page, so the pieces join.
    if (prev) {
      prev.text = (prev.text + ' ' + v.text).trim();
      prev.notes = prev.notes.concat(v.notes);
      prev.xrefs = prev.xrefs.concat(v.xrefs);
      if (!prev.head) prev.head = v.head;
    } else c.set(v.verse, { text: v.text, style: v.style, head: v.head, notes: v.notes, xrefs: v.xrefs });
  }

  // English Darby: replace eBible's Elohim/El/Eloah name-tags with J.N. Darby's
  // own 1890 footnotes (CrossWire DTN). Other translations keep their USFX notes.
  if (id === 'engDBY') {
    const dtn = opts && opts.dtn;
    if (!dtn) throw new Error('engDBY requires Darby translator notes (DTN)');
    overlayDarbyNotes(byBook, dtn);
  }

  const books = [];
  const body = [], layout = [], heads = [], notes = [], xrefs = [];
  let n = 0;
  for (const code of [...byBook.keys()].sort((a, b) => ORDER.get(a) - ORDER.get(b))) {
    const bk = byBook.get(code);
    const chaps = [];
    // Chapter numbers are NOT dense everywhere: the Greek additions to Esther
    // are chapters 10-16 of a book whose 1-9 sit in the Hebrew Esther. So a
    // book carries [chapter, verseCount] pairs rather than a bare count list
    // that would silently renumber them.
    for (const cn of [...bk.keys()].sort((a, b) => a - b)) {
      const ch = bk.get(cn);
      const max = Math.max(...ch.keys());
      for (let i = 1; i <= max; i++) {
        // A gap inside a chapter becomes an EMPTY slot, never a shift: a verse
        // number on the page has to stay the number a reader would cite.
        const v = ch.get(i);
        body.push(v ? v.text : '');
        layout.push(v ? v.style : '');
        if (v && v.head) heads.push(n + '\t' + v.head);
        if (v) for (const t of v.notes) notes.push(n + '\t' + t);
        if (v) for (const t of v.xrefs) xrefs.push(n + '\t' + t);
        n++;
      }
      chaps.push([cn, max]);
    }
    const nm = names.get(code) || {};
    books.push([code, nm.short || '', nm.abbr || '', chaps]);
  }

  // WHICH VERSIFICATION THIS TEXT COUNTS BY.
  //
  // Chapter and verse divisions are not universal. Three traditions appear in
  // this corpus and they disagree in ways that silently misalign a parallel
  // reading if nobody looks:
  //
  //   hebrew  Joel runs to 4 chapters (English merges 3 and 4); Malachi to 3.
  //   greek   Psalms 9 and 10 are one psalm, so the whole Psalter is numbered
  //           one lower from there, and there is a Psalm 151; Daniel runs to
  //           14 with Susanna and Bel; Esther to 16 with the additions.
  //   kjv     what an English Bible prints.
  //
  // The pack records what it IS rather than pretending; the reader maps
  // between them and says so when a reference cannot cross exactly.
  const versification = (function () {
    const psa = byBook.get('PSA');
    const joel = byBook.get('JOL');
    const greekPsalter = psa && psa.get(9) && Math.max(...psa.get(9).keys()) > 30;
    const psalm151 = psa && psa.has(151);
    const hebrewJoel = joel && joel.has(4);
    if (greekPsalter || psalm151) return 'greek';
    if (hebrewJoel) return 'hebrew';
    return 'kjv';
  })();

  const sections = [body.join('\n'), layout.join('\n'), heads.join('\n'),
                    notes.join('\n'), xrefs.join('\n')].map((s) => Buffer.from(s, 'utf8'));
  const header = JSON.stringify({
    v: 2, id, name: meta.shortTitle, title: meta.title,
    language: meta.language, languageNative: meta.languageNative,
    lang: meta.lang, dir: meta.dir, copyright: meta.copyright, source: 'ebible.org',
    versification,
    books,
    sec: { body: sections[0].length, layout: sections[1].length, heads: sections[2].length,
           notes: sections[3].length, xrefs: sections[4].length },
  });
  const hb = Buffer.from(header, 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length, 0);
  const blob = deflateRawSync(Buffer.concat([len, hb, ...sections]), { level: 9 });
  return {
    bytes: Buffer.concat([Buffer.from('GBP2'), blob]),
    verses: n, books: books.length, unknown: [...unknown],
    raw: sections.reduce((a, b) => a + b.length, 0) + hb.length + 4,
    heads: heads.length, notes: notes.length, xrefs: xrefs.length, versification,
  };
}

function writeAllPacks(ebible) {
  const gbPath = join(dir, '..', 'data', 'getbible-packs.json');
  const gb = existsSync(gbPath) ? JSON.parse(readFileSync(gbPath, 'utf8')) : [];
  const all = ebible.concat(gb);
  all.sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id));
  writeFileSync(join(dir, '..', 'data', 'all-packs.json'), JSON.stringify(all, null, 1) + '\n');
}

function mergeDtnCredit() {
  const path = join(dir, '..', 'data', 'credits.json');
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sources = Array.isArray(prior.sources) ? prior.sources.slice() : [];
  const credit = dtnCredit();
  const ix = sources.findIndex((s) => s.id === credit.id);
  if (ix >= 0) sources[ix] = Object.assign({}, sources[ix], credit);
  else sources.push(credit);
  writeFileSync(path, JSON.stringify(Object.assign({}, prior, { sources }), null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyIx = process.argv.indexOf('--only');
  const only = onlyIx > -1 ? new Set(process.argv[onlyIx + 1].split(',')) : null;
  if (!only && existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const wantDarby = !only || only.has('engDBY');
  const dtn = wantDarby ? loadDarbyNotes(await ensureDtn()) : null;
  if (dtn) {
    console.log(`  DTN ${dtn.notes} notes over ${dtn.verses} verses` +
                (dtn.dropped ? `, ${dtn.dropped} asterisk-marked 1939 notes dropped` : ''));
  }

  const built = [];
  let total = 0;
  const oddities = [];
  for (const t of cat.translations) {
    if (only && !only.has(t.id)) continue;
    const zip = join(cache, t.id + '_usfx.zip');
    if (!existsSync(zip)) { console.log(`  ${t.id} — no cache, skipped`); continue; }
    const entry = execFileSync('unzip', ['-Z1', zip]).toString().split('\n')
                    .find((x) => x.endsWith('_usfx.xml'));
    if (!entry) { oddities.push(`${t.id}: no usfx xml in the zip`); continue; }
    const xml = execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 1 << 29 }).toString('utf8');
    const p = packOne(t.id, t, xml, t.id === 'engDBY' ? { dtn } : undefined);
    if (p.unknown.length) oddities.push(`${t.id}: unknown book codes ${p.unknown.join(',')}`);
    if (!p.verses) { oddities.push(`${t.id}: no verses — dropped`); continue; }
    writeFileSync(join(outDir, t.id + '.gbp'), p.bytes);
    total += p.bytes.length;
    built.push({ id: t.id, name: t.shortTitle, title: t.title, language: t.language,
                 languageNative: t.languageNative, lang: t.lang, dir: t.dir,
                 books: p.books, verses: p.verses, bytes: p.bytes.length,
                 versification: p.versification,
                 sha256: createHash('sha256').update(p.bytes).digest('hex') });
    console.log(`  ${t.id.padEnd(16)} ${String(p.books).padStart(2)} bk ${String(p.verses).padStart(6)} vs ` +
                `${String(p.heads).padStart(5)} hd ${String(p.notes).padStart(5)} fn ${String(p.xrefs).padStart(5)} xr  ` +
                `${(p.raw / 1048576).toFixed(1)} MB -> ${(p.bytes.length / 1048576).toFixed(2)} MB`);
  }
  // A partial build merges into the existing index — rewriting the whole file
  // from a --only run would silently shrink the catalog to the packs named.
  let index = built;
  const indexPath = join(dir, '..', 'data', 'packs.json');
  if (only && existsSync(indexPath)) {
    const prev = JSON.parse(readFileSync(indexPath, 'utf8'));
    const ids = new Set(built.map((b) => b.id));
    index = prev.filter((b) => !ids.has(b.id)).concat(built);
  }
  index.sort((a, b) => a.language.localeCompare(b.language) || a.id.localeCompare(b.id));
  writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
  writeAllPacks(index);
  if (built.some((b) => b.id === 'engDBY')) mergeDtnCredit();
  if (oddities.length) { console.log('\nODDITIES'); for (const o of oddities) console.log('  ' + o); }
  console.log(`\n${built.length} packs, ${(total / 1048576).toFixed(1)} MB, ` +
              `${new Set(built.map((b) => b.language)).size} languages`);
}
