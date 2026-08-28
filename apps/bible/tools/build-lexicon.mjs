// Strong's dictionaries -> GBX1 lexicon packs, one file the reader mounts whole.
//
//   "GBX1" | deflate-raw( u32 headerLen | header JSON | section | section | ... )
//
// Same container discipline as GBP2 (apps/bible/tools/build-packs.mjs): one
// inflate yields the lot and every section is a slice. The difference is the
// header names its sections in ORDER — `sec: [[name, byteLength], ...]` — so
// one reader opens both a dictionary and an interlinear without a fixed key
// list baked into it.
//
// A DICTIONARY is not a book, so the sections are shaped for lookup:
//
//   nums      every entry's Strong's number, ascending, one per line
//   entries   one line per entry, TAB-separated:
//             lemma, transliteration, pronunciation, derivation, definition,
//             KJV usage, see-also (comma-joined numbers)
//   search    one line per entry, SAME line count as `entries`: the
//             transliteration, definition and KJV usage folded to lowercase
//             ASCII plus the consonantal lemma
//
// `nums` is a line-for-line parallel of `entries`, so a number resolves to a
// line and a line resolves to an entry with no per-entry object built at open.
// `search` is ONE string for the same reason GBP2's body is: searching every
// definition is a single indexOf over a couple of megabytes rather than eight
// thousand string compares, and the hit's offset names the line, which names
// the entry.
//
// NUMBERS ARE NORMALIZED ON INGEST to `H430` / `G2424` — a prefix letter, then
// the number with no zero padding. The sources disagree: this XML writes
// `strongs="00001"`, the KJV tagging elsewhere in the app writes `H0430`, and
// the Hebrew Bible's augmented lemmas write `1254 a` with a homonym letter.
// Everything is folded to the one form at the door, because a dictionary that
// answers to two spellings of the same number answers to neither.
//
// LICENSING. Both sources are Strong's own 1890/1894 work, public domain, and
// the paper trail is apps/bible/data/credits.json. The Hebrew file is NOT pure
// Strong: it layers Theological Wordbook of the Old Testament references into
// every `<w gloss="...">` attribute under a header that declares them
// "Copyright (c) 1980 by the Moody Bible Institute". This build NEVER READS an
// @gloss attribute, drops the `<foreign>` block of Greek gloss cross-references
// whole, and drops the `<list>` of numbered senses — those senses are not among
// Strong's own six fields and the file does not declare them as Strong's. What
// survives is lemma, transliteration, pronunciation, and the three notes that
// ARE Strong's: exegesis (derivation), explanation (definition), translation
// (KJV usage). `assertNoTwot` below fails the build if a gloss value reaches a
// section, and test/unit/bible-lexicon.js re-checks it against the source.
//
// Run: node apps/bible/tools/build-lexicon.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache', 'orig');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');

export const SOURCES = {
  greek: {
    url: 'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/StrongsGreekDictionaryXML_1.4/strongsgreek.xml',
    file: join(cache, 'strongs', 'strongsgreek.xml'),
  },
  hebrew: {
    url: 'https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/StrongHebrewG.xml',
    file: join(cache, 'strongs', 'StrongHebrewG.xml'),
  },
};

// The cache is gitignored, so a fresh clone fetches once and every later run is
// offline. A source that changes size under us is a licence question, not a
// build detail — the byte count of what was reviewed is in credits.json.
export async function grab(url, file, packPath) {
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const { pull } = await import('./source.mjs');
  const r = await pull(url, file, { packPath: packPath || null, minBytes: 100 });
  if (r.status === 'missing') throw new Error(`${url} -> ${r.reason}`);
  if (!existsSync(file)) throw new Error(`${url} frozen at pack; no cache to read`);
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------- container

export function writeGbx(header, sections) {
  const bufs = sections.map((s) => Buffer.from(s[1], 'utf8'));
  header.sec = sections.map((s, i) => [s[0], bufs[i].length]);
  const hb = Buffer.from(JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(hb.length, 0);
  const blob = deflateRawSync(Buffer.concat([len, hb, ...bufs]), { level: 9 });
  return {
    bytes: Buffer.concat([Buffer.from('GBX1'), blob]),
    raw: bufs.reduce((a, b) => a + b.length, 0) + hb.length + 4,
  };
}

// ---------------------------------------------------------------- numbers

// `00430` / `H0430` / `430` / `1254 a` all name the same entry. One spelling
// wins: prefix letter, then the number with no padding and no homonym letter.
// The homonym letter is a Hebrew-Bible lemma refinement (H1254 a and H1254 b
// are one dictionary entry), so it is dropped for lookup and kept only in the
// raw lemma an interlinear word carries.
export function normalizeStrong(raw, fallbackPrefix) {
  if (raw === null || raw === undefined) return '';
  const m = String(raw).trim().match(/^([HGhg])?\s*0*(\d+)\s*([a-z])?$/);
  if (!m) return '';
  const prefix = (m[1] || fallbackPrefix || '').toUpperCase();
  if (prefix !== 'H' && prefix !== 'G') return '';
  return prefix + String(parseInt(m[2], 10));
}

// ---------------------------------------------------------------- text

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };
const unent = (s) => s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (all, k) => {
  if (ENT[k]) return ENT[k];
  if (k[0] === '#') return String.fromCodePoint(parseInt(k[1] === 'x' ? k.slice(2) : k.slice(1), k[1] === 'x' ? 16 : 10));
  return all;
});
// A field is ONE line with no tabs: the sections are line- and tab-delimited,
// so a stray newline in a definition would invent an entry.
const flat = (s) => unent(s).replace(/\s+/g, ' ').trim();

const LATIN = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const HEBCONS = (s) => s.replace(/[֑-ׇ]/g, '');
const GRKBARE = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ς/g, 'σ').replace(/[^α-ω]/g, '');

// ---------------------------------------------------------------- Greek

export function parseGreek(xml) {
  const entries = [];
  const absent = [];
  for (const m of xml.matchAll(/<entry strongs="(\d+)">([\s\S]*?)<\/entry>/g)) {
    const n = parseInt(m[1], 10);
    const body = m[2];
    // 101 numbers carry a placeholder entry reading "Not Used": 2717, and the
    // run 3203-3302. They are gaps in Strong's own numbering, not gaps in this
    // file, so the pack records them as absent rather than shipping 101 empty
    // entries a reader would have to filter.
    if (/^\s*<strongs>\d+<\/strongs>\s*Not Used\s*$/.test(body)) { absent.push(n); continue; }

    const gk = body.match(/<greek [^>]*unicode="([^"]*)"[^>]*translit="([^"]*)"/);
    const pr = body.match(/<pronunciation strongs="([^"]*)"/);
    const der = body.match(/<strongs_derivation>([\s\S]*?)<\/strongs_derivation>/);
    const def = body.match(/<strongs_def>([\s\S]*?)<\/strongs_def>/);
    const kjv = body.match(/<kjv_def>([\s\S]*?)<\/kjv_def>/);

    // Strong writes a running note after the KJV usage in some entries ("Often
    // used ... in composition"). It is his text and belongs to the definition.
    const tailAt = body.indexOf('</kjv_def>');
    const tail = tailAt < 0 ? '' : body.slice(tailAt + 10);

    const see = [];
    for (const s of body.matchAll(/<see language="(GREEK|HEBREW)" strongs="(\d+)"/g)) {
      const num = normalizeStrong(s[2], s[1] === 'HEBREW' ? 'H' : 'G');
      if (num && see.indexOf(num) < 0) see.push(num);
    }

    entries.push({
      num: 'G' + n,
      lemma: gk ? unent(gk[1]) : '',
      translit: gk ? unent(gk[2]) : '',
      pron: pr ? unent(pr[1]) : '',
      derivation: flat(inlineGreek(der ? der[1] : '')),
      definition: flat(inlineGreek((def ? def[1] : '') + ' ' + tail)),
      kjv: flat(inlineGreek(kjv ? kjv[1] : '')).replace(/^:?--\s*/, ''),
      see,
    });
  }
  entries.sort((a, b) => parseInt(a.num.slice(1), 10) - parseInt(b.num.slice(1), 10));
  return { entries, absent };
}

// Strong quotes other words inside a definition as markup. Flatten to what a
// reader would see: the Greek or Latin itself, and a cross-reference as its
// normalized number.
function inlineGreek(s) {
  return s
    .replace(/<greek [^>]*unicode="([^"]*)"[^>]*\/>/g, '$1')
    .replace(/<pronunciation strongs="([^"]*)"\s*\/>/g, '($1)')
    .replace(/<strongsref language="(GREEK|HEBREW)" strongs="(\d+)"\s*\/>/g,
      (all, lang, num) => normalizeStrong(num, lang === 'HEBREW' ? 'H' : 'G'))
    .replace(/<see [^>]*\/>/g, '')
    .replace(/<\/?latin>/g, '')
    .replace(/<[^>]+>/g, ' ');
}

// ---------------------------------------------------------------- Hebrew

export function parseHebrew(xml) {
  const entries = [];
  let sawGloss = 0;
  for (const m of xml.matchAll(/<div type="entry" n="(\d+)">([\s\S]*?)(?=<div type="entry"|<\/div>\s*<\/div>)/g)) {
    const n = parseInt(m[1], 10);
    let body = m[2];

    // THE TWOT WALL. Every @gloss in this file is declared TWOT-sourced by
    // <workPrefix path="//w/@gloss" osisWork="TWOT"/>, and TWOT is under
    // copyright. The <foreign> block is nothing but gloss cross-references, so
    // it goes whole; the <list> of numbered senses is not one of Strong's own
    // fields and the file does not attribute it to Strong, so it goes too.
    sawGloss += (body.match(/gloss=/g) || []).length;
    body = body.replace(/<foreign[\s\S]*?<\/foreign>/g, ' ')
      .replace(/<list>[\s\S]*?<\/list>/g, ' ')
      .replace(/\sgloss="[^"]*"/g, '');

    const head = body.match(/<w\s[^>]*>/);
    const attr = (src, name) => {
      const a = src && src.match(new RegExp('\\s' + name + '="([^"]*)"'));
      return a ? unent(a[1]) : '';
    };
    const exeg = body.match(/<note type="exegesis">([\s\S]*?)<\/note>/);
    const expl = body.match(/<note type="explanation">([\s\S]*?)<\/note>/);
    const tran = body.match(/<note type="translation">([\s\S]*?)<\/note>/);

    const see = [];
    for (const s of body.matchAll(/<w [^>]*\ssrc="(\d+)"/g)) {
      const num = normalizeStrong(s[1], 'H');
      if (num && see.indexOf(num) < 0) see.push(num);
    }

    entries.push({
      num: 'H' + n,
      lemma: attr(head && head[0], 'lemma'),
      translit: attr(head && head[0], 'xlit'),
      // The Hebrew file keeps the pronunciation in @POS. The attribute is
      // misnamed in the source ("aw-bad'" is not a part of speech); @morph is
      // where its part of speech lives, and that is not one of the seven fields.
      pron: attr(head && head[0], 'POS'),
      derivation: flat(inlineHebrew(exeg ? exeg[1] : '')),
      definition: flat(inlineHebrew(expl ? expl[1] : '')),
      kjv: flat(inlineHebrew(tran ? tran[1] : '')),
      see,
    });
  }
  entries.sort((a, b) => parseInt(a.num.slice(1), 10) - parseInt(b.num.slice(1), 10));
  return { entries, sawGloss };
}

function inlineHebrew(s) {
  return s
    .replace(/<w\s[^>]*\/>/g, (w) => {
      const lem = w.match(/\slemma="([^"]*)"/);
      const src = w.match(/\ssrc="(\d+)"/);
      const num = src ? normalizeStrong(src[1], 'H') : '';
      return (lem ? unent(lem[1]) : '') + (num ? ' (' + num + ')' : '');
    })
    .replace(/<[^>]+>/g, ' ');
}

// ---------------------------------------------------------------- the wall

// A positive control, not a comment: collect every gloss VALUE the source
// carries and fail if one reached a field. The Greek cross-reference glosses
// ("G:3962") are the loudest, so they are checked as a substring too.
export function assertNoTwot(xml, entries) {
  const values = new Set();
  for (const m of xml.matchAll(/\sgloss="([^"]*)"/g)) values.add(m[1]);
  const bad = [];
  for (const e of entries) {
    for (const k of ['lemma', 'translit', 'pron', 'derivation', 'definition', 'kjv']) {
      const v = e[k];
      if (!v) continue;
      if (values.has(v)) bad.push(`${e.num}.${k} is a gloss value: ${v}`);
      if (/\bG:\d+\b/.test(v)) bad.push(`${e.num}.${k} carries a gloss cross-reference: ${v}`);
    }
  }
  if (bad.length) throw new Error('TWOT-derived text reached the pack:\n  ' + bad.slice(0, 10).join('\n  '));
  return values.size;
}

// ---------------------------------------------------------------- pack

export const FIELDS = ['lemma', 'translit', 'pron', 'derivation', 'definition', 'kjv', 'see'];

export function packLexicon(meta, entries, absent) {
  const nums = [], lines = [], search = [];
  for (const e of entries) {
    nums.push(e.num);
    lines.push([e.lemma, e.translit, e.pron, e.derivation, e.definition, e.kjv, e.see.join(',')]
      .map((f) => String(f).replace(/[\t\n\r]/g, ' ')).join('\t'));
    // The search line folds the three English fields to lowercase ASCII and
    // adds the lemma stripped of vowel points or breathings, so a reader can
    // hunt an English gloss and a bare consonantal or unaccented spelling with
    // the same indexOf.
    search.push(LATIN([e.translit, e.definition, e.kjv].join(' ')) + ' ' +
      (meta.prefix === 'H' ? HEBCONS(e.lemma) : GRKBARE(e.lemma)));
  }
  const header = {
    v: 1, kind: 'lexicon', id: meta.id, name: meta.name, prefix: meta.prefix,
    lang: meta.lang, script: meta.script, source: meta.source, license: meta.license,
    fields: FIELDS, count: entries.length,
    absent: ranges(absent || []),
  };
  return writeGbx(header, [
    ['nums', nums.join('\n')],
    ['entries', lines.join('\n')],
    ['search', search.join('\n')],
  ]);
}

// [2717, 3203, 3204, ...] -> [[2717,2717],[3203,3302]]. A run is what the gap
// actually is, and it is what a test can assert without listing 101 numbers.
export function ranges(nums) {
  const out = [];
  let start = null, prev = null;
  for (const n of [...nums].sort((a, b) => a - b)) {
    if (start === null) { start = prev = n; continue; }
    if (n === prev + 1) { prev = n; continue; }
    out.push([start, prev]); start = prev = n;
  }
  if (start !== null) out.push([start, prev]);
  return out;
}

// ---------------------------------------------------------------- run

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(outDir, { recursive: true });

  const hxml = await grab(SOURCES.hebrew.url, SOURCES.hebrew.file);
  const h = parseHebrew(hxml);
  const glosses = assertNoTwot(hxml, h.entries);
  const hp = packLexicon({
    id: 'strongs-h', name: "Strong's Hebrew Dictionary", prefix: 'H',
    lang: 'hbo', script: 'Hebr', source: SOURCES.hebrew.url,
    license: 'public domain (Strong 1894; TWOT glosses stripped)',
  }, h.entries, []);
  writeFileSync(join(outDir, 'lex-strongs-h.gbx'), hp.bytes);
  console.log(`  lex-strongs-h.gbx  ${h.entries.length} entries  ` +
    `${glosses} TWOT gloss values refused  ` +
    `${(hp.raw / 1048576).toFixed(1)} MB -> ${(hp.bytes.length / 1048576).toFixed(2)} MB`);

  const gxml = await grab(SOURCES.greek.url, SOURCES.greek.file);
  const g = parseGreek(gxml);
  const gp = packLexicon({
    id: 'strongs-g', name: "Strong's Greek Dictionary", prefix: 'G',
    lang: 'grc', script: 'Grek', source: SOURCES.greek.url,
    license: 'public domain (Strong 1890)',
  }, g.entries, g.absent);
  writeFileSync(join(outDir, 'lex-strongs-g.gbx'), gp.bytes);
  console.log(`  lex-strongs-g.gbx  ${g.entries.length} entries  ` +
    `absent ${JSON.stringify(ranges(g.absent))}  ` +
    `${(gp.raw / 1048576).toFixed(1)} MB -> ${(gp.bytes.length / 1048576).toFixed(2)} MB`);

  mergeCredits({
    'lex-strongs-h.gbx': { bytes: hp.bytes.length, sha256: sha(hp.bytes), entries: h.entries.length },
    'lex-strongs-g.gbx': { bytes: gp.bytes.length, sha256: sha(gp.bytes), entries: g.entries.length },
  });
}

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function mergeCredits(built) {
  const path = join(dir, '..', 'data', 'credits.json');
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sources = Array.isArray(prior.sources) ? prior.sources.slice() : [];
  const byId = new Map(sources.map((s, i) => [s.id, i]));
  const extra = [
    { id: 'strongs-h', title: "Strong's Hebrew Dictionary", published: '1894',
      authors: 'James Strong', url: SOURCES.hebrew.url,
      bytes: existsSync(SOURCES.hebrew.file) ? statSync(SOURCES.hebrew.file).size : null,
      license: 'Public Domain',
      licenseBasis: "Strong's 1894 dictionary is public domain by age. The Open Scriptures XML layers TWOT glosses (Moody Bible Institute, 1980, copyrighted) into @gloss; this build never reads @gloss, drops the <foreign> and <list> blocks, and test/unit/bible-lexicon.js re-checks that no gloss value reached a packed field.",
      attribution: null, usedIn: ['lex-strongs-h.gbx'] },
    { id: 'strongs-g', title: "Strong's Greek Dictionary", published: '1890',
      authors: 'James Strong', url: SOURCES.greek.url,
      bytes: existsSync(SOURCES.greek.file) ? statSync(SOURCES.greek.file).size : null,
      license: 'Public Domain',
      licenseBasis: "Strong's 1890 dictionary is public domain by age.",
      attribution: null, usedIn: ['lex-strongs-g.gbx'] },
  ];
  for (const s of extra) {
    if (!byId.has(s.id)) sources.push(s);
  }
  const out = Object.assign({}, prior, { sources, origPacks: Object.assign({}, prior.origPacks, built) });
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
}
