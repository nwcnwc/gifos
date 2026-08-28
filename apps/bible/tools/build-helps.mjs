// Turn the cached study-helps sources into GBX1 packs — one file per apparatus,
// each mounted whole the way a translation pack is.
//
//   "GBX1" | deflate-raw( u32 headerLen | header JSON | section | section | … )
//
// The header names the pack's kind and each section's byte length, so one
// inflate yields the lot and every section is a slice. Same container as GBP2
// (apps/bible/tools/build-packs.mjs) and for the same reason: the browser owns
// DecompressionStream('deflate-raw'), so nothing rides inside the GIF to open it.
//
// Every section is UTF-8 text, one record per line, tab-separated. Records that
// carry prose keep it on ONE line — a paragraph break inside prose is U+0011
// (GBP2's MARK.PARA) and a field break inside a record is U+0012. A line is
// therefore always a record, and a section is always splittable.
//
// SIX PACKS
//
//   help-xrefs.gbx   kind "xrefs"   Treasury of Scripture Knowledge
//     rows    catchword TAB ref;ref;…           one TSK entry, in verse order
//     index   bcv TAB firstRow TAB rowCount     one line per verse that has any
//     `bcv` is book*1000000 + chapter*1000 + verse, ascending, so the reader
//     binary-searches an Int32Array instead of building a 30,000-key object.
//
//   help-dict.gbx    kind "dict"    Easton's + Smith's, merged
//     heads   fold TAB headword TAB src         sorted by fold; src is E or S
//     bodies  entry prose                       same order as heads
//     refs    ref;ref;…                         same order as heads
//     `fold` is the headword uppercased with punctuation dropped — the search
//     index IS the sort order, so a prefix search is one binary search and a
//     walk, and a substring search is one indexOf over the whole section.
//
//   help-topics.gbx  kind "topics"  Nave's + Torrey's
//     topics  fold TAB topic TAB src            sorted by fold; src is N or T
//     subs    label U+0012 refs U+0011 label …  the topic's outline, in order
//     refs    ref;ref;…                         every reference the topic cites
//
//   help-mhcc.gbx    kind "mhcc"    Matthew Henry's Concise Commentary
//     notes   note prose                        one note per line
//     index   bcv TAB lastVerse TAB noteRow     ascending by bcv
//     A note is keyed to a verse RANGE, never a verse: `bcv` is its FIRST verse
//     and `lastVerse` its last. Ranges inside a chapter do not overlap, so the
//     covering note for a verse is the last index row at or below it.
//
//   help-places.gbx  kind "places"  OpenBible.info gazetteer
//     places  fold TAB name TAB lat TAB lon TAB ref;ref;…   sorted by fold
//
//   help-plans.gbx   kind "plans"   reading plans
//     days    ref TAB ref TAB …                 one line per day, plans joined
//     The header's `plans` array names each plan, its first day's row and its
//     day count, and says whether it is `historical` (a published plan
//     transcribed) or `computed` (derived here, by a rule the header states).
//
// REFERENCES ARE PLAIN STRINGS. Five source syntaxes land in these packs —
// TSK's lowercase `ps 33:6,9`, ThML's `<scripRef passage="nu 26:59">`, ThML
// bodies that continue an unnamed book (`Ps 4:6; 119:76`), TEI's
// `<ref osisRef="Bible:2Sam.23.8">`, and the gazetteer's `2 Kgs 5:12`. All are
// parsed to (book, chapter, verse) here and re-emitted as `Book C:V`,
// `Book C:V-V`, `Book C:V-C:V` or `Book C` with the English book name from
// data/books.json. Nothing downstream re-parses a source abbreviation.
//
// Run: node apps/bible/tools/build-helps.mjs [--only xrefs,dict,…]
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { deflateRawSync, inflateRawSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache', 'helps');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');
const dataDir = join(dir, '..', 'data');

const PARA = '\u0011';   // paragraph break inside a record
const FS = '\u0012';     // field break inside a record

/* ── the book table, and every alias five sources spell it by ───────────── */

const BOOKTAB = JSON.parse(readFileSync(join(dataDir, 'books.json'), 'utf8'));
const NAME = new Map(BOOKTAB.books.map((b) => [b[0], b[1]]));

// The 66-book Protestant canon in shelf order — what a pack's bcv key numbers,
// and what the reading plans divide. It is NOT a filter on references: Smith
// cites 1 Maccabees and Nave cites Wisdom and the Song of the Three Young Men,
// and those citations are emitted as they stand. A reference to a book a given
// translation does not carry is a fact about the translation, not a broken
// reference, and dropping it would hide what the source actually said.
const CANON = BOOKTAB.books.filter((b) => b[4] !== 'dc').map((b) => b[0]);
const CANON_NO = new Map(CANON.map((c, i) => [c, i + 1]));   // 1..66, TSK's book_key

// OSIS codes, in canon order — Easton and Nave key by these.
const OSIS = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song',
  'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah',
  'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor',
  '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm',
  'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];

// The lowercase abbreviations TSK's reference_list and Smith's scripRef use, in
// canon order — the table is printed in the sibling tsk-data-readme.txt.
const TSK_ABBR = ['ge', 'ex', 'le', 'nu', 'de', 'jos', 'jud', 'ru', '1sa', '2sa', '1ki', '2ki',
  '1ch', '2ch', 'ezr', 'ne', 'es', 'job', 'ps', 'pr', 'ec', 'so', 'isa', 'jer', 'la', 'eze',
  'da', 'ho', 'joe', 'am', 'ob', 'jon', 'mic', 'na', 'hab', 'zep', 'hag', 'zec', 'mal', 'mt',
  'mr', 'lu', 'joh', 'ac', 'ro', '1co', '2co', 'ga', 'eph', 'php', 'col', '1th', '2th', '1ti',
  '2ti', 'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jo', '2jo', '3jo', 'jude', 're'];

// Spellings no generated table produces: the gazetteer's ESV labels, Torrey's
// capitalised ThML, and the shorter forms the Bible Foundation texts use.
const EXTRA = {
  GEN: ['gn'], EXO: ['exo', 'exd'], LEV: ['lv'], NUM: ['nm', 'nb'], DEU: ['dt', 'deu'],
  JOS: ['jsh'], JDG: ['jg', 'judg', 'jdg'], RUT: ['rth'],
  '1SA': ['1s', '1sm'], '2SA': ['2s', '2sm'],
  '1KI': ['1kg', '1k'], '2KI': ['2kg', '2k'], '1CH': ['1chr', '1cr'], '2CH': ['2chr', '2cr'],
  EZR: ['ezra'], NEH: ['neh'], EST: ['est', 'esth'], JOB: ['jb'],
  PSA: ['psalm', 'psalms', 'psa', 'pss'], PRO: ['prov', 'prv'],
  ECC: ['eccl', 'eccles', 'ecclesiastes', 'ecclesiates'],
  SNG: ['song', 'songofsongs', 'canticles', 'sos', 'sng', 'cant', 'sol'],
  JER: ['jrm'], LAM: ['lam'], EZK: ['ezek', 'ezk'], DAN: ['dan', 'dn'],
  HOS: ['hos'], JOL: ['joel', 'jl'], AMO: ['amos'], OBA: ['obad'], JON: ['jnh', 'jonah'],
  MIC: ['micah', 'mch'], NAM: ['nah', 'nam'], HAB: ['habakkuk'], ZEP: ['zeph'],
  HAG: ['haggai', 'hagg', 'haggi'], ZEC: ['zech', 'zch'], MAL: ['malachi'],
  MAT: ['matt', 'mat'], MRK: ['mark', 'mk', 'mrk'], LUK: ['luke', 'lk'],
  JHN: ['john', 'jn', 'jhn'], ACT: ['acts', 'act'], ROM: ['rom', 'rm'],
  '1CO': ['1cor', '1c'], '2CO': ['2cor', '2c'], GAL: ['gal'], EPH: ['ephes'],
  PHP: ['phil', 'phili', 'phi'], COL: ['colos'],
  '1TH': ['1thess', '1thes', '1ths'], '2TH': ['2thess', '2thes', '2ths'],
  '1TI': ['1tim', '1tm'], '2TI': ['2tim', '2tm'], TIT: ['titus', 'tt'],
  PHM: ['phlm', 'philem', 'phile'], HEB: ['hebr'], JAS: ['james', 'jm'],
  '1PE': ['1pet', '1pt', '1p'], '2PE': ['2pet', '2pt', '2p'],
  '1JN': ['1john', '1jn', '1jo', '1j'], '2JN': ['2john', '2jn', '2jo', '2j'],
  '3JN': ['3john', '3jn', '3jo', '3j'], JUD: ['jude', 'jd'],
  REV: ['rev', 'apoc', 'apocalypse', 'revelations'],
};

// Fold a book label to its lookup key: lowercase, ordinals to digits, every
// separator dropped. `2 Kgs`, `II Kings`, `2ki.` and `Second Kings` all land on
// the same string, so one table serves five source syntaxes.
function foldBook(s) {
  const t = String(s).toLowerCase().trim()
    .replace(/^(?:the\s+)?(?:book\s+of\s+)?/, '')
    .replace(/^(?:first|1st|i)\s+/, '1 ')
    .replace(/^(?:second|2nd|ii)\s+/, '2 ')
    .replace(/^(?:third|3rd|iii)\s+/, '3 ');
  return t.replace(/[^a-z0-9]/g, '');
}

// USFM CODES ARE DELIBERATELY NOT IN THIS TABLE. `jud` is JUDGES in TSK, in
// Smith and in Torrey, and JUD is the USFM code for JUDE — registering codes
// first silently turned 1,247 references to Judges into references to a
// one-chapter epistle, which resolved as `Jude 5:14` and looked like a
// versification quarrel rather than a bug. No source spells a reference with a
// USFM code, so the code is not an alias; only names and printed abbreviations
// are.
const BOOK_BY_ALIAS = new Map();
function alias(a, code) {
  const k = foldBook(a);
  if (k && !BOOK_BY_ALIAS.has(k)) BOOK_BY_ALIAS.set(k, code);
}
for (const b of BOOKTAB.books) { alias(b[1], b[0]); alias(b[2], b[0]); }
CANON.forEach((code, i) => { alias(OSIS[i], code); alias(TSK_ABBR[i], code); });
for (const code of Object.keys(EXTRA)) for (const a of EXTRA[code]) alias(a, code);

function bookOf(label) { return BOOK_BY_ALIAS.get(foldBook(label)) || null; }

/* ── references in, plain strings out ───────────────────────────────────── */

// A parsed reference is { code, c1, v1, c2, v2 } with v null for a whole
// chapter. Everything these builders emit goes through refString(), so the only
// reference syntax that reaches a pack is the one written here.
function refString(r) {
  const n = NAME.get(r.code) || r.code;
  if (r.v1 == null) return r.c2 && r.c2 !== r.c1 ? `${n} ${r.c1}-${r.c2}` : `${n} ${r.c1}`;
  if (r.c2 != null && r.c2 !== r.c1) return `${n} ${r.c1}:${r.v1}-${r.c2}:${r.v2 || 1}`;
  if (r.v2 != null && r.v2 !== r.v1) return `${n} ${r.c1}:${r.v1}-${r.v2}`;
  return `${n} ${r.c1}:${r.v1}`;
}

// One reference list, in the shape ThML and TSK write it:
//
//   ge 1:1;ex 20:11        book named every time (TSK)
//   Ps 4:6; 119:76         a bare chapter continues the last book (Torrey)
//   ps 33:6,9              a bare number continues the last chapter
//   nu 26:59-61            a range within the chapter
//
// The book and chapter in force carry across separators, which is the whole
// reason a token like `119:76` means anything at all.
function parseRefList(text) {
  const out = [];
  let code = null, chap = null;
  for (const raw of String(text).split(';')) {
    let s = raw.replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const bm = s.match(/^((?:[123]\s*)?[A-Za-z][A-Za-z'.\s]*?)\s*(?=\d)/);
    if (bm) {
      const c = bookOf(bm[1]);
      if (c) { code = c; chap = null; s = s.slice(bm[0].length).trim(); }
      else { noteUnknownBook(bm[1]); if (!code) continue; }   // nothing in force to continue
    }
    if (!code) continue;
    // What is left is a chapter:verse tail, possibly a comma list of verses and
    // verse ranges that all belong to the chapter the first piece names.
    for (const piece of s.split(',')) {
      const p = piece.trim();
      if (!p) continue;
      let m = p.match(/^(\d+):(\d+)\s*-\s*(\d+):(\d+)$/);
      if (m) { chap = +m[1]; out.push({ code, c1: +m[1], v1: +m[2], c2: +m[3], v2: +m[4] }); continue; }
      m = p.match(/^(\d+):(\d+)\s*-\s*(\d+)$/);
      if (m) { chap = +m[1]; out.push({ code, c1: +m[1], v1: +m[2], c2: +m[1], v2: +m[3] }); continue; }
      m = p.match(/^(\d+):(\d+)$/);
      if (m) { chap = +m[1]; out.push({ code, c1: +m[1], v1: +m[2], c2: +m[1], v2: +m[2] }); continue; }
      m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        // Two bare numbers are verses when a chapter is in force and chapters
        // when one is not — `Ps 4:6; 119:76` versus `Genesis 9-10`.
        if (chap != null) out.push({ code, c1: chap, v1: +m[1], c2: chap, v2: +m[2] });
        else out.push({ code, c1: +m[1], v1: null, c2: +m[2], v2: null });
        continue;
      }
      m = p.match(/^(\d+)$/);
      if (m) {
        if (chap != null) out.push({ code, c1: chap, v1: +m[1], c2: chap, v2: +m[1] });
        else { chap = +m[1]; out.push({ code, c1: +m[1], v1: null, c2: +m[1], v2: null }); }
      }
    }
  }
  return out;
}

// OSIS: `Bible:2Sam.23.8`, `Exod.6.16-Exod.6.20`, `1Chr.24`.
function parseOsis(s) {
  const one = (t) => {
    const m = String(t).replace(/^Bible:/, '').match(/^([A-Za-z0-9]+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m || !m[2]) return null;
    const code = bookOf(m[1]);
    return code ? { code, c: +m[2], v: m[3] ? +m[3] : null } : null;
  };
  const parts = String(s).replace(/^Bible:/, '').split('-');
  const a = one(parts[0]);
  if (!a) return [];
  const b = parts.length > 1 ? one(parts[1]) : null;
  if (b && b.code === a.code) return [{ code: a.code, c1: a.c, v1: a.v, c2: b.c, v2: b.v }];
  return [{ code: a.code, c1: a.c, v1: a.v, c2: a.c, v2: a.v }];
}

// A book label no table knows is counted, not swallowed. `Sng 4:8` in the
// gazetteer matched nothing until it was, and the only symptom was one place in
// 556 that named no verse.
const tally = { refs: 0, unknownBooks: new Map() };
function noteUnknownBook(label) {
  const k = String(label).trim();
  tally.unknownBooks.set(k, (tally.unknownBooks.get(k) || 0) + 1);
}
function refsToStrings(list) {
  const out = [];
  const seen = new Set();
  for (const r of list) {
    const s = refString(r);
    if (seen.has(s)) continue;
    seen.add(s); out.push(s); tally.refs++;
  }
  return out;
}

/* ── the container ──────────────────────────────────────────────────────── */

function writePack(name, kind, header, sections) {
  const bufs = sections.map((s) => Buffer.from(s.text, 'utf8'));
  const sec = {};
  sections.forEach((s, i) => { sec[s.name] = bufs[i].length; });
  const hb = Buffer.from(JSON.stringify(Object.assign({
    v: 1, kind, order: sections.map((s) => s.name), sec,
  }, header)), 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length, 0);
  const bytes = Buffer.concat([Buffer.from('GBX1'),
    deflateRawSync(Buffer.concat([len, hb, ...bufs]), { level: 9 })]);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name), bytes);
  return { name, bytes: bytes.length,
           raw: bufs.reduce((a, b) => a + b.length, 0) + hb.length + 4,
           sha256: createHash('sha256').update(bytes).digest('hex') };
}

// Prose goes on one line: a paragraph break becomes PARA and every other
// control character is dropped, so splitting a section on '\n' always yields
// records.
function flatten(s) {
  return String(s).replace(/\r\n?/g, '\n').replace(/\n{2,}/g, PARA)
    .replace(/\n/g, ' ')
    .replace(/[\u0000-\u0010\u0012-\u001f]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

// A headword folded for search and for sort: uppercase, accents stripped,
// punctuation dropped. `Abel-beth-maachah` and `ABEL BETH MAACHAH` fold alike.
function foldWord(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const unescapeXml = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/* ── the SWORD module readers ───────────────────────────────────────────── */
//
// Two on-disk shapes, both about ten lines once the record sizes are right.
//
//   RawLD (Smith, Torrey)  .idx of 6-byte records — u32 offset, u16 size —
//     into .dat, where an entry is `key\ndata`.
//   zLD (Easton, Nave)     .idx of 8-byte records — u32 offset, u32 size — into
//     .dat, where an entry is `key\r\n` then u32 block, u32 ordinal. A block is
//     a zlib member in .zdt located by an 8-byte record in .zdx, and inside the
//     inflated block is its own table: u32 count, then count × (u32 offset,
//     u32 size).
//
// The record size is the whole game. Reading a zLD .idx with RawLD's 6-byte
// stride yields a plausible-looking entry count that is 4/3 of the truth
// (Easton 5284 instead of 3963, Nave 7096 instead of 5322) and garbage offsets
// from the second record on.

function rawld(base) {
  const idx = readFileSync(base + '.idx'), dat = readFileSync(base + '.dat');
  const out = [];
  for (let i = 0; i + 6 <= idx.length; i += 6) {
    const o = idx.readUInt32LE(i), s = idx.readUInt16LE(i + 4);
    if (o + s > dat.length) continue;
    const e = dat.subarray(o, o + s).toString('utf8');
    const nl = e.indexOf('\n');
    if (nl < 0) continue;
    out.push([e.slice(0, nl).replace(/\r$/, ''), e.slice(nl + 1)]);
  }
  return out;
}

function zld(base) {
  const idx = readFileSync(base + '.idx'), dat = readFileSync(base + '.dat');
  const zdx = readFileSync(base + '.zdx'), zdt = readFileSync(base + '.zdt');
  const blocks = [];
  for (let b = 0; b + 8 <= zdx.length; b += 8) {
    const raw = inflateSync(zdt.subarray(zdx.readUInt32LE(b),
                                         zdx.readUInt32LE(b) + zdx.readUInt32LE(b + 4)));
    const n = raw.readUInt32LE(0), ent = [];
    for (let i = 0; i < n; i++) {
      const o = raw.readUInt32LE(4 + i * 8), s = raw.readUInt32LE(8 + i * 8);
      ent.push(raw.subarray(o, o + s).toString('utf8'));
    }
    blocks.push(ent);
  }
  const out = [];
  for (let i = 0; i + 8 <= idx.length; i += 8) {
    const o = idx.readUInt32LE(i), s = idx.readUInt32LE(i + 4);
    const e = dat.subarray(o, o + s);
    const nl = e.indexOf(0x0a);
    if (nl < 0 || nl + 9 > e.length) continue;
    out.push([e.subarray(0, nl).toString('utf8').replace(/\r$/, ''),
              blocks[e.readUInt32LE(nl + 1)][e.readUInt32LE(nl + 5)]]);
  }
  return out;
}

/* ── 1. help-xrefs.gbx — Treasury of Scripture Knowledge ────────────────── */

function buildXrefs() {
  const lines = readFileSync(join(cache, 'tskxref.txt'), 'utf8').split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].replace(/\r$/, '').split('\t');
    if (f.length < 6) continue;
    const bk = +f[0], c = +f[1], v = +f[2];
    if (!(bk >= 1 && bk <= 66) || !c || !v) continue;
    const refs = refsToStrings(parseRefList(f[5]));
    if (!refs.length) { tally.unparsed++; continue; }
    rows.push({ bcv: bk * 1000000 + c * 1000 + v, sort: +f[3] || 0,
                word: f[4].trim(), refs: refs.join(';') });
  }
  // TSK is already in verse order and the sort column is the printed order of
  // catchwords within a verse; sorting by (bcv, sort) makes a verse's rows one
  // contiguous run, which is what lets the index carry a start and a count.
  rows.sort((a, b) => a.bcv - b.bcv || a.sort - b.sort);

  const rowText = [], index = [];
  let at = 0;
  while (at < rows.length) {
    let end = at;
    while (end < rows.length && rows[end].bcv === rows[at].bcv) end++;
    index.push(rows[at].bcv + '\t' + rowText.length + '\t' + (end - at));
    for (let i = at; i < end; i++) rowText.push(rows[i].word + '\t' + rows[i].refs);
    at = end;
  }
  return {
    stats: { entries: rows.length, verses: index.length },
    pack: writePack('help-xrefs.gbx', 'xrefs', {
      title: "Treasury of Scripture Knowledge",
      source: 'Canne, Browne, Blayney, Scott and others, c.1880',
      license: 'Public Domain',
      entries: rows.length, verses: index.length,
    }, [{ name: 'rows', text: rowText.join('\n') },
        { name: 'index', text: index.join('\n') }]),
  };
}

/* ── 2. help-dict.gbx — Easton's + Smith's ──────────────────────────────── */

// Easton is TEI: <entryFree n="Aaron"><title>Aaron</title><p>… with
// <ref osisRef="Bible:Exod.6.20">. Smith is ThML: <term>, <i>, <ol>/<li> and
// <scripRef passage="nu 26:59">Numbers 26:59</scripRef>. Both reduce to prose
// plus a reference list.
function dictEntries() {
  const out = [];

  for (const [key, body] of zld(join(cache, 'sw/modules/lexdict/zld/easton/easton'))) {
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const refs = [];
    for (const m of body.matchAll(/osisRef="([^"]*)"/g)) refs.push(...parseOsis(m[1]));
    const prose = body.replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<\/p>/g, '\n\n').replace(/<[^>]*>/g, '');
    out.push({ head: unescapeXml(title || key).trim(), src: 'E',
               body: flatten(unescapeXml(prose)), refs: refsToStrings(refs) });
  }

  for (const [key, body] of rawld(join(cache, 'sw/modules/lexdict/rawld/smith/smith'))) {
    const refs = [];
    for (const m of body.matchAll(/<scripRef(?:\s+passage="([^"]*)")?>([\s\S]*?)<\/scripRef>/g)) {
      refs.push(...parseRefList(unescapeXml(m[1] != null ? m[1] : m[2])));
    }
    const prose = body.replace(/<\/li>/g, '\n\n').replace(/<[^>]*>/g, '');
    out.push({ head: unescapeXml(key).trim(), src: 'S',
               body: flatten(unescapeXml(prose)), refs: refsToStrings(refs) });
  }
  return out;
}

function buildDict() {
  const entries = dictEntries().filter((e) => e.head && e.body);
  // The sort IS the search index: fold, then headword, then source, so a
  // dictionary and a lexicon entry for the same word sit next to each other.
  entries.forEach((e) => { e.fold = foldWord(e.head); });
  entries.sort((a, b) => (a.fold < b.fold ? -1 : a.fold > b.fold ? 1 : 0)
                      || (a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
  const counts = { E: 0, S: 0 };
  for (const e of entries) counts[e.src]++;
  return {
    stats: { easton: counts.E, smith: counts.S, entries: entries.length },
    pack: writePack('help-dict.gbx', 'dict', {
      title: "Easton's and Smith's Bible Dictionaries",
      sources: [
        { tag: 'E', title: "Easton's Bible Dictionary", year: 1897, entries: counts.E,
          license: 'Public Domain' },
        { tag: 'S', title: "Smith's Bible Dictionary", year: 1884, entries: counts.S,
          license: 'Public Domain' },
      ],
      entries: entries.length,
    }, [
      { name: 'heads', text: entries.map((e) => e.fold + '\t' + e.head + '\t' + e.src).join('\n') },
      { name: 'bodies', text: entries.map((e) => e.body).join('\n') },
      { name: 'refs', text: entries.map((e) => e.refs.join(';')).join('\n') },
    ]),
  };
}

/* ── 3. help-topics.gbx — Nave's + Torrey's ─────────────────────────────── */

// Nave is TEI with an arrow-led outline: each <lb/> starts a subtopic whose
// label runs to the first <ref>. Torrey is ThML: <br /> separates lines, a
// hyphen leads a subtopic label and the <scripRef> that follows it carries the
// references. Both reduce to an ordered list of (label, references).
function topicOutline(body, kind) {
  const subs = [];
  const push = (label, refs) => {
    const l = flatten(unescapeXml(label)).replace(/^[-→\s]+/, '').replace(/[\s:.,]+$/, '');
    if (l || refs.length) subs.push({ label: l, refs });
  };
  if (kind === 'N') {
    for (const seg of body.replace(/<lb\s*\/?>/g, '\n').split('\n')) {
      if (!seg.trim()) continue;
      const refs = [];
      for (const m of seg.matchAll(/osisRef="([^"]*)"/g)) refs.push(...parseOsis(m[1]));
      push(seg.split(/<ref\b/)[0].replace(/<[^>]*>/g, ''), refsToStrings(refs));
    }
  } else {
    for (const seg of body.replace(/<br\s*\/?>/g, '\n').split('\n')) {
      if (!seg.trim()) continue;
      const refs = [];
      for (const m of seg.matchAll(/<scripRef(?:\s+passage="([^"]*)")?>([\s\S]*?)<\/scripRef>/g)) {
        refs.push(...parseRefList(unescapeXml(m[1] != null ? m[1] : m[2])));
      }
      push(seg.split(/<scripRef\b/)[0].replace(/<[^>]*>/g, ''), refsToStrings(refs));
    }
  }
  return subs;
}

function buildTopics() {
  const topics = [];
  for (const [key, body] of zld(join(cache, 'sw/modules/lexdict/zld/nave/dict'))) {
    const title = (body.match(/<entryFree n="([^"]*)"/) || [])[1] || key;
    topics.push({ topic: unescapeXml(title).trim(), src: 'N', subs: topicOutline(body, 'N') });
  }
  for (const [key, body] of rawld(join(cache, 'sw/modules/lexdict/rawld/torrey/torrey'))) {
    topics.push({ topic: unescapeXml(key).trim(), src: 'T', subs: topicOutline(body, 'T') });
  }
  const kept = topics.filter((t) => t.topic && t.subs.length);
  kept.forEach((t) => {
    t.fold = foldWord(t.topic);
    const seen = new Set(), all = [];
    for (const s of t.subs) for (const r of s.refs) if (!seen.has(r)) { seen.add(r); all.push(r); }
    t.all = all;
  });
  kept.sort((a, b) => (a.fold < b.fold ? -1 : a.fold > b.fold ? 1 : 0)
                   || (a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
  const counts = { N: 0, T: 0 };
  for (const t of kept) counts[t.src]++;
  const refCount = kept.reduce((a, t) => a + t.all.length, 0);
  return {
    stats: { nave: counts.N, torrey: counts.T, topics: kept.length, refs: refCount },
    pack: writePack('help-topics.gbx', 'topics', {
      title: "Nave's Topical Bible and Torrey's New Topical Textbook",
      sources: [
        { tag: 'N', title: "Nave's Topical Bible", topics: counts.N, license: 'Public Domain' },
        { tag: 'T', title: "Torrey's New Topical Textbook", topics: counts.T,
          license: 'Public Domain' },
      ],
      topics: kept.length, refs: refCount,
    }, [
      { name: 'topics', text: kept.map((t) => t.fold + '\t' + t.topic + '\t' + t.src).join('\n') },
      { name: 'subs', text: kept.map((t) => t.subs.map((s) => s.label + FS + s.refs.join(';'))
                                              .join(PARA)).join('\n') },
      { name: 'refs', text: kept.map((t) => t.all.join(';')).join('\n') },
    ]),
  };
}

/* ── 4. help-mhcc.gbx — Matthew Henry's Concise Commentary ──────────────── */

// The CC0 markdown export (github.com/lyteword/mhenry-concise) is Hugo: YAML
// front matter, {{< cards >}} shortcodes, one file per chapter under a
// slugified book directory. A note's heading is a verse RANGE, and the dash in
// it is an EN DASH in 2,780 of the 4,000 headings and a hyphen in 633 — match
// both or two thirds of the commentary silently disappears.
const MHCC_HEAD = /^##\s+(?:Verses?|Chapter)\s+([0-9]+)\s*(?:[-–—,]\s*([0-9]+))?\s*$/;

function stripHugo(text) {
  return String(text).replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\{\{<[\s\S]*?>\}\}/g, '');
}

function buildMhcc() {
  const src = join(cache, 'mhenry-concise');
  const notes = [], index = [];
  const seenBooks = new Set();
  let skippedHeads = 0, booksPrefaced = 0, outlines = 0;
  const dirs = readdirSync(src, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '.git').map((d) => d.name).sort();
  const found = [];
  for (const d of dirs) {
    const code = bookOf(d.replace(/-/g, ' '));
    if (!code || !CANON_NO.has(code)) continue;
    const preface = join(src, d, '_index.md');
    if (existsSync(preface)) {
      const body = flatten(stripHugo(readFileSync(preface, 'utf8')).replace(/^\s*# .+\n/, ''));
      if (body) {
        found.push({ code, chapter: 0, v1: 0, v2: 0, body });
        booksPrefaced++;
      }
    }
    // Psalms are filed psalm-150.md and every other book chapter-N.md; matching
    // only the second name drops the Psalter entire and still reports 65 books.
    for (const f of readdirSync(join(src, d)).filter((f) => /^(?:chapter|psalm)-\d+\.md$/.test(f))) {
      const chapter = +f.match(/(\d+)/)[1];
      const text = stripHugo(readFileSync(join(src, d, f), 'utf8'));
      const lines = text.split('\n');
      let cur = null;
      const flush = () => {
        if (!cur) return;
        const body = flatten(cur.buf.join('\n'));
        if (body) found.push({ code, chapter, v1: cur.v1, v2: cur.v2, body });
        if (cur.v1 === 0 && body) outlines++;
        cur = null;
      };
      for (const line of lines) {
        if (/^##\s/.test(line)) {
          flush();
          if (/^##\s+Chapter Outline\b/i.test(line)) {
            cur = { v1: 0, v2: 0, buf: [] };
          } else {
            const m = line.match(MHCC_HEAD);
            if (m) cur = { v1: +m[1], v2: m[2] ? +m[2] : +m[1], buf: [] };
            else skippedHeads++;
          }
        } else if (cur) cur.buf.push(line);
      }
      flush();
      seenBooks.add(code);
    }
  }
  // Ascending by (book, chapter, first verse) so the covering note for a verse
  // is the last row at or below its key — one binary search, no scan.
  found.sort((a, b) => CANON_NO.get(a.code) - CANON_NO.get(b.code)
                    || a.chapter - b.chapter || a.v1 - b.v1 || a.v2 - b.v2);
  // A heading whose range starts where the previous one did (the sources carry
  // a handful) would make two notes cover one verse; the later one wins, since
  // the file's own order puts the fuller note last.
  const rows = [];
  for (const n of found) {
    const prev = rows[rows.length - 1];
    if (prev && prev.code === n.code && prev.chapter === n.chapter && prev.v1 === n.v1) rows.pop();
    rows.push(n);
  }
  for (const n of rows) {
    index.push((CANON_NO.get(n.code) * 1000000 + n.chapter * 1000 + n.v1) + '\t' +
               n.v2 + '\t' + notes.length);
    notes.push(n.body);
  }
  return {
    stats: { notes: rows.length, books: seenBooks.size, skippedHeads, booksPrefaced, outlines },
    pack: writePack('help-mhcc.gbx', 'mhcc', {
      title: "Matthew Henry's Concise Commentary on the Whole Bible",
      source: 'github.com/lyteword/mhenry-concise',
      license: 'CC0-1.0',
      notes: rows.length, books: seenBooks.size,
    }, [{ name: 'notes', text: notes.join('\n') },
        { name: 'index', text: index.join('\n') }]),
  };
}

/* ── 5. help-places.gbx — the OpenBible.info gazetteer ──────────────────── */

// TSV: ESV Name, KMZ Name, Lat, Lon, Passages, Comment. A row without
// coordinates points at the place that HAS them, and it does so in whichever of
// the two name columns is free — `Abarim <tab> <tab> Mount Nebo` puts the
// target in the Lat column, `Abel <tab> <tab> Abel-beth-maacah` likewise, while
// `Abel-beth-maacah <tab> Abel-Beth-Maacah` names its KMZ twin and has no
// coordinates at all. So the pointer is resolved by NAME through both columns,
// transitively, and a row that still has no fix is DROPPED. A pin at 0,0 is an
// island in the Atlantic, not a place in the Bible.
function buildPlaces() {
  const lines = readFileSync(join(cache, 'places.txt'), 'utf8').split('\n');
  // The coordinate columns carry four different things: a number, an
  // APPROXIMATE number written `~32.02425`, a literal `?`, or the NAME of the
  // place that has the fix (`Mount Nebo`, `~Ezion-geber`, `Ophrah 2`).
  const coord = (t) => {
    const m = String(t).trim().replace(/^~/, '');
    return /^-?\d+(?:\.\d+)?$/.test(m) ? parseFloat(m) : null;
  };
  const raw = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].replace(/\r$/, '').split('\t');
    if (f.length < 5 || !f[0].trim()) continue;
    const lat = coord(f[2]), lon = coord(f[3]);
    let pointer = '';
    if (lat == null || lon == null) {
      const t = (f[2] || '').trim().replace(/^~/, '');
      pointer = t && t !== '?' ? t : (f[1] || '').trim();
    }
    raw.push({
      name: f[0].trim(), kmz: (f[1] || '').trim(),
      lat: lon == null ? null : lat, lon: lat == null ? null : lon,
      approx: /^~/.test((f[2] || '').trim()), pointer,
      passages: (f[4] || '').trim(),
    });
  }
  const byFold = new Map();
  for (const r of raw) {
    for (const n of [r.name, r.kmz]) {
      const k = foldWord(n);
      if (k && r.lat != null && !byFold.has(k)) byFold.set(k, r);
    }
  }
  let resolved = 0, dropped = 0, approx = 0;
  const out = [];
  for (const r of raw) {
    let lat = r.lat, lon = r.lon, near = r.approx;
    if (lat == null) {
      // Follow the pointer through both name columns, and through a chain of
      // them, until a row with a fix turns up or the trail closes on itself.
      const seen = new Set();
      let hop = r.pointer;
      while (hop && !seen.has(foldWord(hop))) {
        seen.add(foldWord(hop));
        const t = byFold.get(foldWord(hop));
        if (t && t.lat != null) { lat = t.lat; lon = t.lon; near = true; resolved++; break; }
        hop = t ? t.pointer : '';
      }
    }
    // A row with no fix anywhere in the file is DROPPED. Most of this
    // gazetteer's rows are names whose coordinates live only in the companion
    // KMZ; a pin at 0,0 is an island in the Atlantic, not a place in the Bible.
    if (lat == null || lon == null || (lat === 0 && lon === 0)) { dropped++; continue; }
    if (near) approx++;
    // The Passages column separates references by COMMA, not semicolon, so the
    // comma before a book name is promoted before the shared parser sees it —
    // otherwise `Num 27:12, Num 33:47` reads as verses 12 and 33 of Numbers 27.
    const refs = refsToStrings(parseRefList(r.passages.replace(/,\s*(?=[A-Za-z])/g, ';')));
    out.push({ fold: foldWord(r.name), name: r.name, lat, lon, refs });
  }
  out.sort((a, b) => (a.fold < b.fold ? -1 : a.fold > b.fold ? 1 : 0));
  return {
    stats: { places: out.length, resolved, approx, dropped, rows: raw.length },
    pack: writePack('help-places.gbx', 'places', {
      title: 'Bible place gazetteer',
      source: 'openbible.info/geo',
      license: 'CC BY 4.0',
      attribution: 'Bible place data \u00a9 OpenBible.info, licensed CC BY 4.0.',
      places: out.length, rows: raw.length, droppedWithoutFix: dropped,
    }, [{ name: 'places', text: out.map((p) => [p.fold, p.name, p.lat.toFixed(6),
                                                p.lon.toFixed(6), p.refs.join(';')].join('\t'))
                                 .join('\n') }]),
  };
}

/* ── 6. help-plans.gbx — reading plans ──────────────────────────────────── */

// M'Cheyne's 1842 plan, transcribed. Robert Murray M'Cheyne published the
// "Daily Bread" calendar for his Dundee congregation; the plan itself is public
// domain and this table is a transcription of it, not a copy of anyone's file —
// the machine-readable copy consulted (willswire/mcheyne, App/PlanConstants.swift)
// carries an Apache-2.0 wrapper that has no claim on the 1842 table underneath,
// and vendoring the Swift would have imported that wrapper for nothing.
//
// The plan runs 365 days by construction: one chapter of each of four streams a
// day, sized to the year. THE 366TH DAY IS NOT IN THE PLAN — on a leap year the
// reader repeats day 365's readings on 31 December rather than shifting the
// whole calendar, which is what dayCount and the reader's `step` clamp do.
const MCHEYNE = [
  "Genesis 1|Matthew 1|Ezra 1|Acts 1",
  "Genesis 2|Matthew 2|Ezra 2|Acts 2",
  "Genesis 3|Matthew 3|Ezra 3|Acts 3",
  "Genesis 4|Matthew 4|Ezra 4|Acts 4",
  "Genesis 5|Matthew 5|Ezra 5|Acts 5",
  "Genesis 6|Matthew 6|Ezra 6|Acts 6",
  "Genesis 7|Matthew 7|Ezra 7|Acts 7",
  "Genesis 8|Matthew 8|Ezra 8|Acts 8",
  "Genesis 9-10|Matthew 9|Ezra 9|Acts 9",
  "Genesis 11|Matthew 10|Ezra 10|Acts 10",
  "Genesis 12|Matthew 11|Nehemiah 1|Acts 11",
  "Genesis 13|Matthew 12|Nehemiah 2|Acts 12",
  "Genesis 14|Matthew 13|Nehemiah 3|Acts 13",
  "Genesis 15|Matthew 14|Nehemiah 4|Acts 14",
  "Genesis 16|Matthew 15|Nehemiah 5|Acts 15",
  "Genesis 17|Matthew 16|Nehemiah 6|Acts 16",
  "Genesis 18|Matthew 17|Nehemiah 7|Acts 17",
  "Genesis 19|Matthew 18|Nehemiah 8|Acts 18",
  "Genesis 20|Matthew 19|Nehemiah 9|Acts 19",
  "Genesis 21|Matthew 20|Nehemiah 10|Acts 20",
  "Genesis 22|Matthew 21|Nehemiah 11|Acts 21",
  "Genesis 23|Matthew 22|Nehemiah 12|Acts 22",
  "Genesis 24|Matthew 23|Nehemiah 13|Acts 23",
  "Genesis 25|Matthew 24|Esther 1|Acts 24",
  "Genesis 26|Matthew 25|Esther 2|Acts 25",
  "Genesis 27|Matthew 26|Esther 3|Acts 26",
  "Genesis 28|Matthew 27|Esther 4|Acts 27",
  "Genesis 29|Matthew 28|Esther 5|Acts 28",
  "Genesis 30|Mark 1|Esther 6|Romans 1",
  "Genesis 31|Mark 2|Esther 7|Romans 2",
  "Genesis 32|Mark 3|Esther 8|Romans 3",
  "Genesis 33|Mark 4|Esther 9-10|Romans 4",
  "Genesis 34|Mark 5|Job 1|Romans 5",
  "Genesis 35-36|Mark 6|Job 2|Romans 6",
  "Genesis 37|Mark 7|Job 3|Romans 7",
  "Genesis 38|Mark 8|Job 4|Romans 8",
  "Genesis 39|Mark 9|Job 5|Romans 9",
  "Genesis 40|Mark 10|Job 6|Romans 10",
  "Genesis 41|Mark 11|Job 7|Romans 11",
  "Genesis 42|Mark 12|Job 8|Romans 12",
  "Genesis 43|Mark 13|Job 9|Romans 13",
  "Genesis 44|Mark 14|Job 10|Romans 14",
  "Genesis 45|Mark 15|Job 11|Romans 15",
  "Genesis 46|Mark 16|Job 12|Romans 16",
  "Genesis 47|Luke 1:1-38|Job 13|1 Corinthians 1",
  "Genesis 48|Luke 1:39-80|Job 14|1 Corinthians 2",
  "Genesis 49|Luke 2|Job 15|1 Corinthians 3",
  "Genesis 50|Luke 3|Job 16-17|1 Corinthians 4",
  "Exodus 1|Luke 4|Job 18|1 Corinthians 5",
  "Exodus 2|Luke 5|Job 19|1 Corinthians 6",
  "Exodus 3|Luke 6|Job 20|1 Corinthians 7",
  "Exodus 4|Luke 7|Job 21|1 Corinthians 8",
  "Exodus 5|Luke 8|Job 22|1 Corinthians 9",
  "Exodus 6|Luke 9|Job 23|1 Corinthians 10",
  "Exodus 7|Luke 10|Job 24|1 Corinthians 11",
  "Exodus 8|Luke 11|Job 25-26|1 Corinthians 12",
  "Exodus 9|Luke 12|Job 27|1 Corinthians 13",
  "Exodus 10|Luke 13|Job 28|1 Corinthians 14",
  "Exodus 11:1-12:21|Luke 14|Job 29|1 Corinthians 15",
  "Exodus 12:22-51|Luke 15|Job 30|1 Corinthians 16",
  "Exodus 13|Luke 16|Job 31|2 Corinthians 1",
  "Exodus 14|Luke 17|Job 32|2 Corinthians 2",
  "Exodus 15|Luke 18|Job 33|2 Corinthians 3",
  "Exodus 16|Luke 19|Job 34|2 Corinthians 4",
  "Exodus 17|Luke 20|Job 35|2 Corinthians 5",
  "Exodus 18|Luke 21|Job 36|2 Corinthians 6",
  "Exodus 19|Luke 22|Job 37|2 Corinthians 7",
  "Exodus 20|Luke 23|Job 38|2 Corinthians 8",
  "Exodus 21|Luke 24|Job 39|2 Corinthians 9",
  "Exodus 22|John 1|Job 40|2 Corinthians 10",
  "Exodus 23|John 2|Job 41|2 Corinthians 11",
  "Exodus 24|John 3|Job 42|2 Corinthians 12",
  "Exodus 25|John 4|Proverbs 1|2 Corinthians 13",
  "Exodus 26|John 5|Proverbs 2|Galatians 1",
  "Exodus 27|John 6|Proverbs 3|Galatians 2",
  "Exodus 28|John 7|Proverbs 4|Galatians 3",
  "Exodus 29|John 8|Proverbs 5|Galatians 4",
  "Exodus 30|John 9|Proverbs 6|Galatians 5",
  "Exodus 31|John 10|Proverbs 7|Galatians 6",
  "Exodus 32|John 11|Proverbs 8|Ephesians 1",
  "Exodus 33|John 12|Proverbs 9|Ephesians 2",
  "Exodus 34|John 13|Proverbs 10|Ephesians 3",
  "Exodus 35|John 14|Proverbs 11|Ephesians 4",
  "Exodus 36|John 15|Proverbs 12|Ephesians 5",
  "Exodus 37|John 16|Proverbs 13|Ephesians 6",
  "Exodus 38|John 17|Proverbs 14|Philippians 1",
  "Exodus 39|John 18|Proverbs 15|Philippians 2",
  "Exodus 40|John 19|Proverbs 16|Philippians 3",
  "Leviticus 1|John 20|Proverbs 17|Philippians 4",
  "Leviticus 2-3|John 21|Proverbs 18|Colossians 1",
  "Leviticus 4|Psalms 1-2|Proverbs 19|Colossians 2",
  "Leviticus 5|Psalms 3-4|Proverbs 20|Colossians 3",
  "Leviticus 6|Psalms 5-6|Proverbs 21|Colossians 4",
  "Leviticus 7|Psalms 7-8|Proverbs 22|1 Thessalonians 1",
  "Leviticus 8|Psalms 9|Proverbs 23|1 Thessalonians 2",
  "Leviticus 9|Psalms 10|Proverbs 24|1 Thessalonians 3",
  "Leviticus 10|Psalms 11-12|Proverbs 25|1 Thessalonians 4",
  "Leviticus 11-12|Psalms 13-14|Proverbs 26|1 Thessalonians 5",
  "Leviticus 13|Psalms 15-16|Proverbs 27|2 Thessalonians 1",
  "Leviticus 14|Psalms 17|Proverbs 28|2 Thessalonians 2",
  "Leviticus 15|Psalms 18|Proverbs 29|2 Thessalonians 3",
  "Leviticus 16|Psalms 19|Proverbs 30|1 Timothy 1",
  "Leviticus 17|Psalms 20-21|Proverbs 31|1 Timothy 2",
  "Leviticus 18|Psalms 22|Ecclesiastes 1|1 Timothy 3",
  "Leviticus 19|Psalms 23-24|Ecclesiastes 2|1 Timothy 4",
  "Leviticus 20|Psalms 25|Ecclesiastes 3|1 Timothy 5",
  "Leviticus 21|Psalms 26-27|Ecclesiastes 4|1 Timothy 6",
  "Leviticus 22|Psalms 28-29|Ecclesiastes 5|2 Timothy 1",
  "Leviticus 23|Psalms 30|Ecclesiastes 6|2 Timothy 2",
  "Leviticus 24|Psalms 31|Ecclesiastes 7|2 Timothy 3",
  "Leviticus 25|Psalms 32|Ecclesiastes 8|2 Timothy 4",
  "Leviticus 26|Psalms 33|Ecclesiastes 9|Titus 1",
  "Leviticus 27|Psalms 34|Ecclesiastes 10|Titus 2",
  "Numbers 1|Psalms 35|Ecclesiastes 11|Titus 3",
  "Numbers 2|Psalms 36|Ecclesiastes 12|Philemon 1",
  "Numbers 3|Psalms 37|Song of Songs 1|Hebrews 1",
  "Numbers 4|Psalms 38|Song of Songs 2|Hebrews 2",
  "Numbers 5|Psalms 39|Song of Songs 3|Hebrews 3",
  "Numbers 6|Psalms 40-41|Song of Songs 4|Hebrews 4",
  "Numbers 7|Psalms 42-43|Song of Songs 5|Hebrews 5",
  "Numbers 8|Psalms 44|Song of Songs 6|Hebrews 6",
  "Numbers 9|Psalms 45|Song of Songs 7|Hebrews 7",
  "Numbers 10|Psalms 46-47|Song of Songs 8|Hebrews 8",
  "Numbers 11|Psalms 48|Isaiah 1|Hebrews 9",
  "Numbers 12-13|Psalms 49|Isaiah 2|Hebrews 10",
  "Numbers 14|Psalms 50|Isaiah 3-4|Hebrews 11",
  "Numbers 15|Psalms 51|Isaiah 5|Hebrews 12",
  "Numbers 16|Psalms 52-54|Isaiah 6|Hebrews 13",
  "Numbers 17-18|Psalms 55|Isaiah 7|James 1",
  "Numbers 19|Psalms 56-57|Isaiah 8:1-9:7|James 2",
  "Numbers 20|Psalms 58-59|Isaiah 9:8-10:4|James 3",
  "Numbers 21|Psalms 60-61|Isaiah 10:5-34|James 4",
  "Numbers 22|Psalms 62-63|Isaiah 11-12|James 5",
  "Numbers 23|Psalms 64-65|Isaiah 13|1 Peter 1",
  "Numbers 24|Psalms 66-67|Isaiah 14|1 Peter 2",
  "Numbers 25|Psalms 68|Isaiah 15|1 Peter 3",
  "Numbers 26|Psalms 69|Isaiah 16|1 Peter 4",
  "Numbers 27|Psalms 70-71|Isaiah 17-18|1 Peter 5",
  "Numbers 28|Psalms 72|Isaiah 19-20|2 Peter 1",
  "Numbers 29|Psalms 73|Isaiah 21|2 Peter 2",
  "Numbers 30|Psalms 74|Isaiah 22|2 Peter 3",
  "Numbers 31|Psalms 75-76|Isaiah 23|1 John 1",
  "Numbers 32|Psalms 77|Isaiah 24|1 John 2",
  "Numbers 33|Psalms 78:1-37|Isaiah 25|1 John 3",
  "Numbers 34|Psalms 78:38-72|Isaiah 26|1 John 4",
  "Numbers 35|Psalms 79|Isaiah 27|1 John 5",
  "Numbers 36|Psalms 80|Isaiah 28|2 John 1",
  "Deuteronomy 1|Psalms 81-82|Isaiah 29|3 John 1",
  "Deuteronomy 2|Psalms 83-84|Isaiah 30|Jude 1",
  "Deuteronomy 3|Psalms 85|Isaiah 31|Revelation 1",
  "Deuteronomy 4|Psalms 86-87|Isaiah 32|Revelation 2",
  "Deuteronomy 5|Psalms 88|Isaiah 33|Revelation 3",
  "Deuteronomy 6|Psalms 89|Isaiah 34|Revelation 4",
  "Deuteronomy 7|Psalms 90|Isaiah 35|Revelation 5",
  "Deuteronomy 8|Psalms 91|Isaiah 36|Revelation 6",
  "Deuteronomy 9|Psalms 92-93|Isaiah 37|Revelation 7",
  "Deuteronomy 10|Psalms 94|Isaiah 38|Revelation 8",
  "Deuteronomy 11|Psalms 95-96|Isaiah 39|Revelation 9",
  "Deuteronomy 12|Psalms 97-98|Isaiah 40|Revelation 10",
  "Deuteronomy 13-14|Psalms 99-101|Isaiah 41|Revelation 11",
  "Deuteronomy 15|Psalms 102|Isaiah 42|Revelation 12",
  "Deuteronomy 16|Psalms 103|Isaiah 43|Revelation 13",
  "Deuteronomy 17|Psalms 104|Isaiah 44|Revelation 14",
  "Deuteronomy 18|Psalms 105|Isaiah 45|Revelation 15",
  "Deuteronomy 19|Psalms 106|Isaiah 46|Revelation 16",
  "Deuteronomy 20|Psalms 107|Isaiah 47|Revelation 17",
  "Deuteronomy 21|Psalms 108-109|Isaiah 48|Revelation 18",
  "Deuteronomy 22|Psalms 110-111|Isaiah 49|Revelation 19",
  "Deuteronomy 23|Psalms 112-113|Isaiah 50|Revelation 20",
  "Deuteronomy 24|Psalms 114-115|Isaiah 51|Revelation 21",
  "Deuteronomy 25|Psalms 116|Isaiah 52|Revelation 22",
  "Deuteronomy 26|Psalms 117-118|Isaiah 53|Matthew 1",
  "Deuteronomy 27:1-28:19|Psalms 119:1-24|Isaiah 54|Matthew 2",
  "Deuteronomy 28:20-68|Psalms 119:25-48|Isaiah 55|Matthew 3",
  "Deuteronomy 29|Psalms 119:49-72|Isaiah 56|Matthew 4",
  "Deuteronomy 30|Psalms 119:73-96|Isaiah 57|Matthew 5",
  "Deuteronomy 31|Psalms 119:97-120|Isaiah 58|Matthew 6",
  "Deuteronomy 32|Psalms 119:121-144|Isaiah 59|Matthew 7",
  "Deuteronomy 33-34|Psalms 119:145-176|Isaiah 60|Matthew 8",
  "Joshua 1|Psalms 120-122|Isaiah 61|Matthew 9",
  "Joshua 2|Psalms 123-125|Isaiah 62|Matthew 10",
  "Joshua 3|Psalms 126-128|Isaiah 63|Matthew 11",
  "Joshua 4|Psalms 129-131|Isaiah 64|Matthew 12",
  "Joshua 5:1-6:5|Psalms 132-134|Isaiah 65|Matthew 13",
  "Joshua 6:6-27|Psalms 135-136|Isaiah 66|Matthew 14",
  "Joshua 7|Psalms 137-138|Jeremiah 1|Matthew 15",
  "Joshua 8|Psalms 139|Jeremiah 2|Matthew 16",
  "Joshua 9|Psalms 140-141|Jeremiah 3|Matthew 17",
  "Joshua 10|Psalms 142-143|Jeremiah 4|Matthew 18",
  "Joshua 11|Psalms 144|Jeremiah 5|Matthew 19",
  "Joshua 12-13|Psalms 145|Jeremiah 6|Matthew 20",
  "Joshua 14-15|Psalms 146-147|Jeremiah 7|Matthew 21",
  "Joshua 16-17|Psalms 148|Jeremiah 8|Matthew 22",
  "Joshua 18-19|Psalms 149-150|Jeremiah 9|Matthew 23",
  "Joshua 20-21|Acts 1|Jeremiah 10|Matthew 24",
  "Joshua 22|Acts 2|Jeremiah 11|Matthew 25",
  "Joshua 23|Acts 3|Jeremiah 12|Matthew 26",
  "Joshua 24|Acts 4|Jeremiah 13|Matthew 27",
  "Judges 1|Acts 5|Jeremiah 14|Matthew 28",
  "Judges 2|Acts 6|Jeremiah 15|Mark 1",
  "Judges 3|Acts 7|Jeremiah 16|Mark 2",
  "Judges 4|Acts 8|Jeremiah 17|Mark 3",
  "Judges 5|Acts 9|Jeremiah 18|Mark 4",
  "Judges 6|Acts 10|Jeremiah 19|Mark 5",
  "Judges 7|Acts 11|Jeremiah 20|Mark 6",
  "Judges 8|Acts 12|Jeremiah 21|Mark 7",
  "Judges 9|Acts 13|Jeremiah 22|Mark 8",
  "Judges 10:1-11:11|Acts 14|Jeremiah 23|Mark 9",
  "Judges 11:12-40|Acts 15|Jeremiah 24|Mark 10",
  "Judges 12|Acts 16|Jeremiah 25|Mark 11",
  "Judges 13|Acts 17|Jeremiah 26|Mark 12",
  "Judges 14|Acts 18|Jeremiah 27|Mark 13",
  "Judges 15|Acts 19|Jeremiah 28|Mark 14",
  "Judges 16|Acts 20|Jeremiah 29|Mark 15",
  "Judges 17|Acts 21|Jeremiah 30-31|Mark 16",
  "Judges 18|Acts 22|Jeremiah 32|Psalms 1-2",
  "Judges 19|Acts 23|Jeremiah 33|Psalms 3-4",
  "Judges 20|Acts 24|Jeremiah 34|Psalms 5-6",
  "Judges 21|Acts 25|Jeremiah 35|Psalms 7-8",
  "Ruth 1|Acts 26|Jeremiah 36,45|Psalms 9",
  "Ruth 2|Acts 27|Jeremiah 37|Psalms 10",
  "Ruth 3-4|Acts 28|Jeremiah 38|Psalms 11-12",
  "1 Samuel 1|Romans 1|Jeremiah 39|Psalms 13-14",
  "1 Samuel 2|Romans 2|Jeremiah 40|Psalms 15-16",
  "1 Samuel 3|Romans 3|Jeremiah 41|Psalms 17",
  "1 Samuel 4|Romans 4|Jeremiah 42|Psalms 18",
  "1 Samuel 5-6|Romans 5|Jeremiah 43|Psalms 19",
  "1 Samuel 7-8|Romans 6|Jeremiah 44|Psalms 20-21",
  "1 Samuel 9|Romans 7|Jeremiah 46|Psalms 22",
  "1 Samuel 10|Romans 8|Jeremiah 47|Psalms 23-24",
  "1 Samuel 11|Romans 9|Jeremiah 48|Psalms 25",
  "1 Samuel 12|Romans 10|Jeremiah 49|Psalms 26-27",
  "1 Samuel 13|Romans 11|Jeremiah 50|Psalms 28-29",
  "1 Samuel 14|Romans 12|Jeremiah 51|Psalms 30",
  "1 Samuel 15|Romans 13|Jeremiah 52|Psalms 31",
  "1 Samuel 16|Romans 14|Lamentations 1|Psalms 32",
  "1 Samuel 17|Romans 15|Lamentations 2|Psalms 33",
  "1 Samuel 18|Romans 16|Lamentations 3|Psalms 34",
  "1 Samuel 19|1 Corinthians 1|Lamentations 4|Psalms 35",
  "1 Samuel 20|1 Corinthians 2|Lamentations 5|Psalms 36",
  "1 Samuel 21-22|1 Corinthians 3|Ezekiel 1|Psalms 37",
  "1 Samuel 23|1 Corinthians 4|Ezekiel 2|Psalms 38",
  "1 Samuel 24|1 Corinthians 5|Ezekiel 3|Psalms 39",
  "1 Samuel 25|1 Corinthians 6|Ezekiel 4|Psalms 40-41",
  "1 Samuel 26|1 Corinthians 7|Ezekiel 5|Psalms 42-43",
  "1 Samuel 27|1 Corinthians 8|Ezekiel 6|Psalms 44",
  "1 Samuel 28|1 Corinthians 9|Ezekiel 7|Psalms 45",
  "1 Samuel 29-30|1 Corinthians 10|Ezekiel 8|Psalms 46-47",
  "1 Samuel 31|1 Corinthians 11|Ezekiel 9|Psalms 48",
  "2 Samuel 1|1 Corinthians 12|Ezekiel 10|Psalms 49",
  "2 Samuel 2|1 Corinthians 13|Ezekiel 11|Psalms 50",
  "2 Samuel 3|1 Corinthians 14|Ezekiel 12|Psalms 51",
  "2 Samuel 4-5|1 Corinthians 15|Ezekiel 13|Psalms 52-54",
  "2 Samuel 6|1 Corinthians 16|Ezekiel 14|Psalms 55",
  "2 Samuel 7|2 Corinthians 1|Ezekiel 15|Psalms 56-57",
  "2 Samuel 8-9|2 Corinthians 2|Ezekiel 16|Psalms 58-59",
  "2 Samuel 10|2 Corinthians 3|Ezekiel 17|Psalms 60-61",
  "2 Samuel 11|2 Corinthians 4|Ezekiel 18|Psalms 62-63",
  "2 Samuel 12|2 Corinthians 5|Ezekiel 19|Psalms 64-65",
  "2 Samuel 13|2 Corinthians 6|Ezekiel 20|Psalms 66-67",
  "2 Samuel 14|2 Corinthians 7|Ezekiel 21|Psalms 68",
  "2 Samuel 15|2 Corinthians 8|Ezekiel 22|Psalms 69",
  "2 Samuel 16|2 Corinthians 9|Ezekiel 23|Psalms 70-71",
  "2 Samuel 17|2 Corinthians 10|Ezekiel 24|Psalms 72",
  "2 Samuel 18|2 Corinthians 11|Ezekiel 25|Psalms 73",
  "2 Samuel 19|2 Corinthians 12|Ezekiel 26|Psalms 74",
  "2 Samuel 20|2 Corinthians 13|Ezekiel 27|Psalms 75-76",
  "2 Samuel 21|Galatians 1|Ezekiel 28|Psalms 77",
  "2 Samuel 22|Galatians 2|Ezekiel 29|Psalms 78:1-37",
  "2 Samuel 23|Galatians 3|Ezekiel 30|Psalms 78:38-72",
  "2 Samuel 24|Galatians 4|Ezekiel 31|Psalms 79",
  "1 Kings 1|Galatians 5|Ezekiel 32|Psalms 80",
  "1 Kings 2|Galatians 6|Ezekiel 33|Psalms 81-82",
  "1 Kings 3|Ephesians 1|Ezekiel 34|Psalms 83-84",
  "1 Kings 4-5|Ephesians 2|Ezekiel 35|Psalms 85",
  "1 Kings 6|Ephesians 3|Ezekiel 36|Psalms 86",
  "1 Kings 7|Ephesians 4|Ezekiel 37|Psalms 87-88",
  "1 Kings 8|Ephesians 5|Ezekiel 38|Psalms 89",
  "1 Kings 9|Ephesians 6|Ezekiel 39|Psalms 90",
  "1 Kings 10|Philippians 1|Ezekiel 40|Psalms 91",
  "1 Kings 11|Philippians 2|Ezekiel 41|Psalms 92-93",
  "1 Kings 12|Philippians 3|Ezekiel 42|Psalms 94",
  "1 Kings 13|Philippians 4|Ezekiel 43|Psalms 95-96",
  "1 Kings 14|Colossians 1|Ezekiel 44|Psalms 97-98",
  "1 Kings 15|Colossians 2|Ezekiel 45|Psalms 99-101",
  "1 Kings 16|Colossians 3|Ezekiel 46|Psalms 102",
  "1 Kings 17|Colossians 4|Ezekiel 47|Psalms 103",
  "1 Kings 18|1 Thessalonians 1|Ezekiel 48|Psalms 104",
  "1 Kings 19|1 Thessalonians 2|Daniel 1|Psalms 105",
  "1 Kings 20|1 Thessalonians 3|Daniel 2|Psalms 106",
  "1 Kings 21|1 Thessalonians 4|Daniel 3|Psalms 107",
  "1 Kings 22|1 Thessalonians 5|Daniel 4|Psalms 108-109",
  "2 Kings 1|2 Thessalonians 1|Daniel 5|Psalms 110-111",
  "2 Kings 2|2 Thessalonians 2|Daniel 6|Psalms 112-113",
  "2 Kings 3|2 Thessalonians 3|Daniel 7|Psalms 114-115",
  "2 Kings 4|1 Timothy 1|Daniel 8|Psalms 116",
  "2 Kings 5|1 Timothy 2|Daniel 9|Psalms 117-118",
  "2 Kings 6|1 Timothy 3|Daniel 10|Psalms 119:1-24",
  "2 Kings 7|1 Timothy 4|Daniel 11|Psalms 119:25-48",
  "2 Kings 8|1 Timothy 5|Daniel 12|Psalms 119:49-72",
  "2 Kings 9|1 Timothy 6|Hosea 1|Psalms 119:73-96",
  "2 Kings 10|2 Timothy 1|Hosea 2|Psalms 119:97-120",
  "2 Kings 11-12|2 Timothy 2|Hosea 3-4|Psalms 119:121-144",
  "2 Kings 13|2 Timothy 3|Hosea 5-6|Psalms 119:145-176",
  "2 Kings 14|2 Timothy 4|Hosea 7|Psalms 120-122",
  "2 Kings 15|Titus 1|Hosea 8|Psalms 123-125",
  "2 Kings 16|Titus 2|Hosea 9|Psalms 126-128",
  "2 Kings 17|Titus 3|Hosea 10|Psalms 129-131",
  "2 Kings 18|Philemon 1|Hosea 11|Psalms 132-134",
  "2 Kings 19|Hebrews 1|Hosea 12|Psalms 135-136",
  "2 Kings 20|Hebrews 2|Hosea 13|Psalms 137-138",
  "2 Kings 21|Hebrews 3|Hosea 14|Psalms 139",
  "2 Kings 22|Hebrews 4|Joel 1|Psalms 140-141",
  "2 Kings 23|Hebrews 5|Joel 2|Psalms 142",
  "2 Kings 24|Hebrews 6|Joel 3|Psalms 143",
  "2 Kings 25|Hebrews 7|Amos 1|Psalms 144",
  "1 Chronicles 1-2|Hebrews 8|Amos 2|Psalms 145",
  "1 Chronicles 3-4|Hebrews 9|Amos 3|Psalms 146-147",
  "1 Chronicles 5-6|Hebrews 10|Amos 4|Psalms 148-150",
  "1 Chronicles 7-8|Hebrews 11|Amos 5|Luke 1:1-38",
  "1 Chronicles 9-10|Hebrews 12|Amos 6|Luke 1:39-80",
  "1 Chronicles 11-12|Hebrews 13|Amos 7|Luke 2",
  "1 Chronicles 13-14|James 1|Amos 8|Luke 3",
  "1 Chronicles 15|James 2|Amos 9|Luke 4",
  "1 Chronicles 16|James 3|Obadiah 1|Luke 5",
  "1 Chronicles 17|James 4|Jonah 1|Luke 6",
  "1 Chronicles 18|James 5|Jonah 2|Luke 7",
  "1 Chronicles 19-20|1 Peter 1|Jonah 3|Luke 8",
  "1 Chronicles 21|1 Peter 2|Jonah 4|Luke 9",
  "1 Chronicles 22|1 Peter 3|Micah 1|Luke 10",
  "1 Chronicles 23|1 Peter 4|Micah 2|Luke 11",
  "1 Chronicles 24-25|1 Peter 5|Micah 3|Luke 12",
  "1 Chronicles 26-27|2 Peter 1|Micah 4|Luke 13",
  "1 Chronicles 28|2 Peter 2|Micah 5|Luke 14",
  "1 Chronicles 29|2 Peter 3|Micah 6|Luke 15",
  "2 Chronicles 1|1 John 1|Micah 7|Luke 16",
  "2 Chronicles 2|1 John 2|Nahum 1|Luke 17",
  "2 Chronicles 3-4|1 John 3|Nahum 2|Luke 18",
  "2 Chronicles 5:1-6:11|1 John 4|Nahum 3|Luke 19",
  "2 Chronicles 6:12-42|1 John 5|Habakkuk 1|Luke 20",
  "2 Chronicles 7|2 John 1|Habakkuk 2|Luke 21",
  "2 Chronicles 8|3 John 1|Habakkuk 3|Luke 22",
  "2 Chronicles 9|Jude 1|Zephaniah 1|Luke 23",
  "2 Chronicles 10|Revelation 1|Zephaniah 2|Luke 24",
  "2 Chronicles 11-12|Revelation 2|Zephaniah 3|John 1",
  "2 Chronicles 13|Revelation 3|Haggai 1|John 2",
  "2 Chronicles 14-15|Revelation 4|Haggai 2|John 3",
  "2 Chronicles 16|Revelation 5|Zechariah 1|John 4",
  "2 Chronicles 17|Revelation 6|Zechariah 2|John 5",
  "2 Chronicles 18|Revelation 7|Zechariah 3|John 6",
  "2 Chronicles 19-20|Revelation 8|Zechariah 4|John 7",
  "2 Chronicles 21|Revelation 9|Zechariah 5|John 8",
  "2 Chronicles 22-23|Revelation 10|Zechariah 6|John 9",
  "2 Chronicles 24|Revelation 11|Zechariah 7|John 10",
  "2 Chronicles 25|Revelation 12|Zechariah 8|John 11",
  "2 Chronicles 26|Revelation 13|Zechariah 9|John 12",
  "2 Chronicles 27-28|Revelation 14|Zechariah 10|John 13",
  "2 Chronicles 29|Revelation 15|Zechariah 11|John 14",
  "2 Chronicles 30|Revelation 16|Zechariah 12:1-13:1|John 15",
  "2 Chronicles 31|Revelation 17|Zechariah 13:2-9|John 16",
  "2 Chronicles 32|Revelation 18|Zechariah 14|John 17",
  "2 Chronicles 33|Revelation 19|Malachi 1|John 18",
  "2 Chronicles 34|Revelation 20|Malachi 2|John 19",
  "2 Chronicles 35|Revelation 21|Malachi 3|John 20",
  "2 Chronicles 36|Revelation 22|Malachi 4|John 21"
];

// Every plan cell is normalised through the same parser as every reference, so
// `Genesis 9-10`, `Zechariah 12:1-13:1` and `Psalm 119:1-24` all come out as
// strings the app's reference parser reads.
//
// A COMMA IN A PLAN CELL SEPARATES CHAPTERS, not verses. `Jeremiah 36,45` is
// two chapters of Jeremiah; the shared parser reads a bare number after a
// chapter as a VERSE, which is right for `ps 33:6,9` and wrong here, so the
// pieces are split and each is given the book back before parsing. One cell in
// the 1,460 has this shape, and it read as Jeremiah 36:45 until it was.
function planCells(cell) {
  const pieces = String(cell).split(',');
  const book = (pieces[0].match(/^\s*((?:[123]\s*)?[A-Za-z][A-Za-z'.\s]*?)\s*(?=\d)/) || [])[1];
  const out = [];
  for (const piece of pieces) {
    const t = piece.trim();
    if (!t) continue;
    for (const r of parseRefList(/[A-Za-z]/.test(t) ? t : (book || '') + ' ' + t)) {
      out.push(refString(r));
    }
  }
  return out;
}

function psalmsProverbsMonthly() {
  // COMPUTED, not historical. Proverbs has 31 chapters and the Psalter 150, so
  // the oldest mechanical devotional rule is: Proverbs by the day of the month,
  // and five Psalms a day at a 30-Psalm stride (day 1 → 1, 31, 61, 91, 121).
  // Psalm 119 falls on day 29 that way and is longer than most books, so it is
  // split across the five slots of its own day.
  const days = [];
  const monthLen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= monthLen[m]; d++) {
      const cells = ['Proverbs ' + d];
      for (let k = 0; k < 5; k++) {
        const ps = d + k * 30;
        if (ps > 150) continue;
        if (ps === 119) cells.push('Psalms 119:1-88', 'Psalms 119:89-176');
        else cells.push('Psalms ' + ps);
      }
      days.push(cells);
    }
  }
  return days;   // 365 in a common year; February decides which Proverbs repeat
}

function wholeBibleByVerses(counts) {
  // COMPUTED, not historical. The 66 books' verses in shelf order are cut into
  // 365 spans of equal LENGTH, not equal chapter count — so a day in Psalms is
  // not five times a day in Chronicles. A span is broken at every book
  // boundary, which is why some days carry two cells.
  const flat = [];
  for (const b of counts) for (const [c, n] of b.chapters) for (let v = 1; v <= n; v++) flat.push([b.code, c, v]);
  const per = flat.length / 365;
  const days = [];
  for (let d = 0; d < 365; d++) {
    const from = Math.round(d * per), to = Math.round((d + 1) * per) - 1;
    const cells = [];
    let i = from;
    while (i <= to) {
      const code = flat[i][0];
      let j = i;
      while (j + 1 <= to && flat[j + 1][0] === code) j++;
      cells.push(refString({ code, c1: flat[i][1], v1: flat[i][2], c2: flat[j][1], v2: flat[j][2] }));
      i = j + 1;
    }
    days.push(cells);
  }
  return days;
}

// A GBP2 pack's own book table — the header alone answers what the computed
// plan needs, so a 1.3 MB pack costs one inflate and no body decode. Only the
// 66-book canon is divided: a plan that ran through the deuterocanon would be a
// different plan.
//
// The division must be of a REAL versification rather than a table typed here,
// so it reads the catalogue's reference English text. Any pack that counts by
// `kjv` and carries all 66 books gives the same answer; the preferred id is
// tried first and the header records which one was actually divided.
function readCanonCounts(preferred) {
  const files = existsSync(outDir)
    ? readdirSync(outDir).filter((f) => f.endsWith('.gbp')).sort() : [];
  const tries = [preferred + '.gbp'].concat(files.filter((f) => f !== preferred + '.gbp'));
  for (const f of tries) {
    if (!existsSync(join(outDir, f))) continue;
    const bytes = readFileSync(join(outDir, f));
    if (bytes.subarray(0, 4).toString() !== 'GBP2') continue;
    const all = inflateRawSync(bytes.subarray(4));
    const header = JSON.parse(all.subarray(4, 4 + all.readUInt32LE(0)).toString('utf8'));
    if (header.versification !== 'kjv') continue;
    const byCode = new Map(header.books.map((b) => [b[0], b[3]]));
    if (!CANON.every((c) => byCode.has(c))) continue;
    return { id: header.id, books: CANON.map((code) => ({ code, chapters: byCode.get(code) })) };
  }
  throw new Error('no complete kjv-versification GBP2 pack in ' + outDir +
                  ' — run apps/bible/tools/build-packs.mjs first');
}

function buildPlans(counts) {
  const plans = [
    { id: 'mcheyne', name: "M'Cheyne One-Year Plan",
      origin: 'historical',
      note: "Robert Murray M'Cheyne's 1842 calendar for his Dundee congregation: "
          + 'four readings a day, the Old Testament once and the New Testament '
          + 'and Psalms twice in a year.',
      days: MCHEYNE.map((row) => row.split('|').reduce((a, c) => a.concat(planCells(c)), [])) },
    { id: 'psalms-proverbs', name: 'Psalms and Proverbs by the Month',
      origin: 'computed',
      note: 'Computed by GifOS, not a published plan: Proverbs by the day of the '
          + 'month, and five Psalms a day at a 30-Psalm stride, so the Psalter and '
          + 'Proverbs each finish once a month. Psalm 119 is split across its day.',
      days: psalmsProverbsMonthly() },
    { id: 'whole-bible-even', name: 'Whole Bible in a Year, by Even Reading',
      origin: 'computed',
      note: 'Computed by GifOS, not a published plan: the 66 books in shelf order '
          + 'cut into 365 spans of equal verse count, broken at every book '
          + 'boundary. Days are the same LENGTH, not the same number of chapters. '
          + 'Divided over the ' + counts.id + ' versification.',
      days: wholeBibleByVerses(counts.books) },
  ];

  const days = [];
  const meta = [];
  for (const p of plans) {
    meta.push({ id: p.id, name: p.name, origin: p.origin, note: p.note,
                first: days.length, dayCount: p.days.length });
    for (const d of p.days) days.push(d.join('\t'));
  }
  return {
    stats: Object.fromEntries(plans.map((p) => [p.id, p.days.length])),
    pack: writePack('help-plans.gbx', 'plans', {
      title: 'Bible reading plans',
      // A plan of 365 days has no 366th. On a leap year a reader repeats the
      // last day rather than shifting the calendar; the reader's step() clamps.
      leapDay: 'repeat the previous day',
      versificationFrom: counts.id,
      plans: meta,
    }, [{ name: 'days', text: days.join('\n') }]),
  };
}

/* ── credits ────────────────────────────────────────────────────────────── */

// Every source's URL, byte count, licence statement and required attribution,
// merged into data/credits.json by id. The file is APPEND-ONLY across tools:
// other builders write their own ids into it, so it is re-read and merged here
// rather than overwritten.
function sourceCredits() {
  const size = (p) => (existsSync(p) ? readFileSync(p).length : null);
  return [
    { id: 'tsk', title: 'Treasury of Scripture Knowledge',
      authors: 'Canne, Browne, Blayney, Scott and others',
      published: 'c.1830-1880',
      url: 'https://raw.githubusercontent.com/narthur/tsk-cli/master/tskxref.txt',
      bytes: size(join(cache, 'tskxref.txt')),
      license: 'Public Domain',
      licenseBasis: "The TSV file is distributed inside a GPL-3.0 repository that states no "
        + "grant of its own for the data. The WORK is public domain by age (published c.1880) "
        + "and CrossWire's packaging of the same text records that determination: "
        + "https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/TSK.zip (2643739 bytes), "
        + "mods.d/tsk.conf line `DistributionLicense=Public Domain`. The TSV is used for its "
        + "structure; the rights basis is the c.1880 publication date and CrossWire's determination.",
      attribution: null, usedIn: ['help-xrefs.gbx'] },

    { id: 'easton', title: "Easton's Bible Dictionary", published: '1897',
      authors: 'M. G. Easton, M.A., D.D.',
      url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Easton.zip',
      bytes: size(join(cache, 'Easton.zip')),
      license: 'Public Domain',
      licenseBasis: 'mods.d/easton.conf: `DistributionLicense=Public Domain`; About: '
        + '"Easton\'s 1897 Bible Dictionary … Public Domain -- Copy Freely".',
      attribution: null, usedIn: ['help-dict.gbx'] },

    { id: 'smith', title: "Smith's Bible Dictionary", published: '1884',
      authors: 'Dr. William Smith',
      url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Smith.zip',
      bytes: size(join(cache, 'Smith.zip')),
      license: 'Public Domain',
      licenseBasis: 'mods.d/smith.conf: `DistributionLicense=Public Domain`; About: '
        + '"Smith\'s Bible Dictionary by Dr. William Smith. (1884) Public domain."',
      attribution: null, usedIn: ['help-dict.gbx'] },

    { id: 'nave', title: "Nave's Topical Bible", published: 'early 1900s',
      authors: 'Orville J. Nave, A.M., D.D., LL.D.',
      url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Nave.zip',
      bytes: size(join(cache, 'Nave.zip')),
      license: 'Public Domain',
      licenseBasis: 'mods.d/nave.conf: `DistributionLicense=Public Domain`, '
        + 'TextSource=https://ccel.org/ccel/n/nave/bible.xml',
      attribution: null, usedIn: ['help-topics.gbx'] },

    { id: 'torrey', title: "Torrey's New Topical Textbook",
      authors: 'R. A. Torrey', published: 'reprint of an out-of-copyright edition',
      url: 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/Torrey.zip',
      bytes: size(join(cache, 'Torrey.zip')),
      license: 'Public Domain',
      licenseBasis: 'mods.d/torrey.conf: `DistributionLicense=Public Domain`; About: '
        + '"No copyright notice appears on the book, and it is a reprint of the original '
        + 'edition which is out of copyright."',
      attribution: null, usedIn: ['help-topics.gbx'] },

    { id: 'mhcc', title: "Matthew Henry's Concise Commentary on the Whole Bible",
      authors: 'Matthew Henry (1662-1714), with the concise edition completed after his death',
      url: 'https://github.com/lyteword/mhenry-concise',
      bytes: null,
      license: 'CC0-1.0',
      licenseBasis: 'The repository\'s LICENSE file is the Creative Commons CC0 1.0 Universal '
        + 'public-domain dedication, verified by its opening lines "Creative Commons Legal Code" '
        + 'and "CC0 1.0 Universal". CrossWire\'s MHCC.zip (1773039 bytes, '
        + 'mods.d/mhcc.conf `DistributionLicense=Public Domain`) carries the same text and is '
        + 'the fallback; it is not used here.',
      attribution: null, usedIn: ['help-mhcc.gbx'] },

    { id: 'openbible-geo', title: 'Bible place gazetteer',
      authors: 'OpenBible.info',
      url: 'https://www.openbible.info/geo/data/places.txt',
      bytes: size(join(cache, 'places.txt')),
      license: 'CC BY',
      licenseBasis: 'OpenBible.info publishes its geocoding data under Creative Commons '
        + 'Attribution. Attribution is REQUIRED and is carried in the pack header and shown '
        + 'wherever a place is displayed.',
      attribution: 'Bible place data © OpenBible.info, licensed CC BY 4.0. '
        + 'Source: https://www.openbible.info/geo/',
      usedIn: ['help-places.gbx'] },

    { id: 'mcheyne', title: "M'Cheyne One-Year Reading Plan", published: '1842',
      authors: "Robert Murray M'Cheyne",
      url: 'https://raw.githubusercontent.com/willswire/mcheyne/main/App/PlanConstants.swift',
      bytes: size(join(cache, 'PlanConstants.swift')),
      license: 'Public Domain',
      licenseBasis: 'The 1842 plan is public domain by age. The machine-readable copy consulted '
        + 'sits in an Apache-2.0 repository whose licence covers that project\'s code, not the '
        + '1842 table; the table was transcribed into the MCHEYNE literal in '
        + 'apps/bible/tools/build-helps.mjs rather '
        + 'than vendored, so no Apache-2.0 file is redistributed.',
      attribution: null, usedIn: ['help-plans.gbx'] },
  ];
}

function mergeCredits(built) {
  const path = join(dataDir, 'credits.json');
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sources = Array.isArray(prior.sources) ? prior.sources.slice() : [];
  const byId = new Map(sources.map((s, i) => [s.id, i]));
  for (const s of sourceCredits()) {
    if (byId.has(s.id)) sources[byId.get(s.id)] = Object.assign({}, sources[byId.get(s.id)], s);
    else sources.push(s);
  }
  const out = Object.assign({}, prior, {
    note: prior.note || 'Every source this app ships from, with the URL it came from, the bytes '
      + 'that were fetched, the licence statement that permits the use, and the attribution the '
      + 'licence requires. Appended to by each builder; never overwritten.',
    sources,
  });
  if (built) out.helpsPacks = built;
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
  return sources.length;
}

/* ── run ────────────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyIx = process.argv.indexOf('--only');
  const only = onlyIx > -1 ? new Set(process.argv[onlyIx + 1].split(',')) : null;
  const want = (k) => !only || only.has(k);

  const built = {};
  const log = (k, r, extra) => {
    built[r.pack.name] = Object.assign({ bytes: r.pack.bytes, sha256: r.pack.sha256 }, r.stats);
    console.log(`  ${r.pack.name.padEnd(18)} ${(r.pack.raw / 1048576).toFixed(1)} MB -> ` +
                `${(r.pack.bytes / 1048576).toFixed(2)} MB  ${extra}`);
  };

  if (want('xrefs')) { const r = buildXrefs(); log('xrefs', r, `${r.stats.entries} entries over ${r.stats.verses} verses`); }
  if (want('dict')) { const r = buildDict(); log('dict', r, `Easton ${r.stats.easton} + Smith ${r.stats.smith}`); }
  if (want('topics')) { const r = buildTopics(); log('topics', r, `Nave ${r.stats.nave} + Torrey ${r.stats.torrey}, ${r.stats.refs} refs`); }
  if (want('mhcc')) { const r = buildMhcc(); log('mhcc', r, `${r.stats.notes} notes over ${r.stats.books} books`); }
  if (want('places')) { const r = buildPlaces(); log('places', r, `${r.stats.places} placed, ${r.stats.resolved} by pointer, ${r.stats.dropped} without a fix`); }
  if (want('plans')) {
    const counts = readCanonCounts('engwebp');
    const r = buildPlans(counts); log('plans', r, JSON.stringify(r.stats));
  }

  const n = mergeCredits(Object.keys(built).length === 6 ? built : null);
  console.log(`\n${tally.refs} references emitted, ${n} sources credited`);
  if (tally.unknownBooks.size) {
    console.log('UNKNOWN BOOK LABELS  ' + [...tally.unknownBooks]
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(', '));
  }
}
