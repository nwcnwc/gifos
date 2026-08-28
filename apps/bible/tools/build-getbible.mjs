// The second shelf: getbible v2 texts that passed per-title vetting.
//
// eBible.org states rights machine-readably, so its corpus is filtered by the
// publisher's own field. getbible carries NO license metadata, so every text
// from it was researched individually — first publication, translators' death
// years, any modern revision still under an active claim — and the verdicts
// with their deciding facts and sources sit in data/getbible-vetted.json.
// Only an ACCEPT is ever fetched here; changing a verdict is an edit to that
// file with a reason, never a flag on this one.
//
// Texts that duplicate an eBible pack are skipped by hand below, with the
// pack they duplicate named — carrying the same translation twice costs a
// download and buys a reader nothing.
//
// getbible JSON is flat verses with no layout, so these packs carry prose
// styling only. That is honest: the sources never had the poetry.
//
// Run: node apps/bible/tools/build-getbible.mjs [--only id,id]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');
mkdirSync(outDir, { recursive: true });
mkdirSync(cache, { recursive: true });

const vetted = JSON.parse(readFileSync(join(dir, '..', 'data', 'getbible-vetted.json'), 'utf8'));
const BOOKTAB = JSON.parse(readFileSync(join(dir, '..', 'data', 'books.json'), 'utf8'));

// getbible numbers books 1..66 in Protestant order; the table's `order` runs
// 1..39 (OT), 40..59 (deuterocanon), 60..86 (NT), so NT is order + 20.
const BY_NR = new Map();
for (const b of BOOKTAB.books) {
  const [code, , , order] = b;
  if (order <= 39) BY_NR.set(order, code);
  else if (order >= 60) BY_NR.set(order - 20, code);
}

// A duplicate is named with the pack it duplicates, so the skip is auditable.
const DUP = {
  swekarlxii1873: 'swekarlxii (a verbatim reprint of the same 1703 text)',
  chamorro: 'cha', esperanto: 'epo', bkr: 'ces1613', darby: 'frajnd',
  giovanni: 'ita1885', riveduta: 'ita1927', rv1858: 'spaRV1909',
  synodal: 'russyn', ukranian: 'ukr1871', srkdekavski: 'srp1865',
  srkdijekav: 'srp1868', vietnamese: 'vie1934', judson: 'myajvb',
  wb: 'engwebster', tyndale: 'engtnt', wycliffe: 'engWycliffe',
  japdenmo: 'jpnm (both are World English Bible renderings)',
};

// Display metadata the getbible index either lacks or gets wrong.
const META = {
  polgdanska:      { name: 'Biblia Gdańska', language: 'Polish', native: 'Polski', lang: 'pl' },
  karoli:          { name: 'Károli (1908)', language: 'Hungarian', native: 'Magyar', lang: 'hu' },
  finnish1776:     { name: 'Biblia (1776)', language: 'Finnish', native: 'Suomi', lang: 'fi' },
  swedish:         { name: 'Bibeln 1917', language: 'Swedish', native: 'Svenska', lang: 'sv' },
  swekarlxii:      { name: 'Karl XII:s Bibel', language: 'Swedish', native: 'Svenska', lang: 'sv' },
  danish1819:      { name: 'Nye Testamente 1819', language: 'Danish', native: 'Dansk', lang: 'da' },
  bibelselskap:    { name: 'Bibelen 1930', language: 'Norwegian', native: 'Norsk', lang: 'no' },
  tagalog:         { name: 'Ang Dating Biblia', language: 'Tagalog', native: 'Tagalog', lang: 'tl' },
  westernarmenian: { name: 'Western Armenian NT', language: 'Armenian', native: 'Հայերէն', lang: 'hy' },
  basque:          { name: 'Leizarraga NT', language: 'Basque', native: 'Euskara', lang: 'eu' },
  mg1865:          { name: 'Baiboly 1865', language: 'Malagasy', native: 'Malagasy', lang: 'mg' },
  mal1910:         { name: 'സത്യവേദപുസ്തകം', language: 'Malayalam', native: 'മലയാളം', lang: 'ml' },
  che1860:         { name: 'Cherokee NT', language: 'Cherokee', native: 'ᏣᎳᎩ', lang: 'chr' },
  manxgaelic:      { name: 'Yn Vible Casherick', language: 'Manx', native: 'Gaelg', lang: 'gv' },
  luther1545:      { name: 'Luther 1545', language: 'German, Standard', native: 'Deutsch', lang: 'de' },
  elberfelder:     { name: 'Elberfelder 1871', language: 'German, Standard', native: 'Deutsch', lang: 'de' },
  elberfelder1905: { name: 'Elberfelder 1905', language: 'German, Standard', native: 'Deutsch', lang: 'de' },
  martin:          { name: 'Martin 1744', language: 'French', native: 'Français', lang: 'fr' },
  almeida:         { name: 'Almeida 1911', language: 'Portuguese', native: 'Português', lang: 'pt' },
  sse:             { name: 'Valera 1865', language: 'Spanish', native: 'Español', lang: 'es' },
  statenvertaling: { name: 'Statenvertaling', language: 'Dutch', native: 'Nederlands', lang: 'nl' },
  japbungo:        { name: '文語訳聖書', language: 'Japanese', native: '日本語', lang: 'ja' },
  japraguet:       { name: 'ラゲ訳新約聖書', language: 'Japanese', native: '日本語', lang: 'ja' },
  chiunl:          { name: '文理和合本', language: 'Chinese', native: '中文', lang: 'zh' },
  peshitta:        { name: 'Peshitta NT', language: 'Syriac', native: 'ܣܘܪܝܝܐ', lang: 'syc', dir: 'rtl' },
  sahidic:         { name: 'Sahidic NT (Horner)', language: 'Coptic', native: 'ⲙⲛ̄ⲧⲣⲙ̄ⲛ̄ⲕⲏⲙⲉ', lang: 'cop' },
  potawatomi:      { name: 'Matthew & Acts (Lykins)', language: 'Potawatomi', native: 'Neshnabémwen', lang: 'pot' },
  calo:            { name: 'Embéo e Majaró Lucas', language: 'Caló', native: 'Caló', lang: 'rmq' },
  moderngreek:     { name: 'Βάμβας', language: 'Greek, Modern', native: 'Ελληνικά', lang: 'el' },
  csielizabeth:    { name: 'Елизаветинская Библия', language: 'Church Slavonic', native: 'Церковнослав.', lang: 'cu' },
  weymouth:        { name: 'Weymouth NT', language: 'English', native: 'English', lang: 'en' },
};

const onlyIx = process.argv.indexOf('--only');
const only = onlyIx > -1 ? new Set(process.argv[onlyIx + 1].split(',')) : null;

const accepted = vetted.candidates.filter((c) => c.verdict === 'ACCEPT');
const chosen = accepted.filter((c) => !DUP[c.id] && (!only || only.has(c.id)));

async function fetchText(id) {
  const f = join(cache, 'gb-' + id + '.json');
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const { pull } = await import('./source.mjs');
  const pack = join(outDir, 'gb-' + id + '.gbp');
  const r = await pull('https://api.getbible.net/v2/' + id + '.json', f, { packPath: pack, minBytes: 100 });
  if (r.status === 'missing') throw new Error(id + ': ' + (r.reason || 'unavailable'));
  if (!existsSync(f)) throw new Error(id + ': FROZEN (no cache; pack kept)');
  return JSON.parse(readFileSync(f, 'utf8'));
}

function packOne(id, meta, doc, vet) {
  const byBook = new Map();
  for (const bk of doc.books || []) {
    const code = BY_NR.get(bk.nr);
    if (!code) continue;
    const chaps = new Map();
    for (const ch of bk.chapters || []) {
      const vs = new Map();
      for (const v of ch.verses || []) {
        const t = String(v.text || '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        vs.set(v.verse, vs.has(v.verse) ? vs.get(v.verse) + ' ' + t : t);
      }
      if (vs.size) chaps.set(ch.chapter, vs);
    }
    if (chaps.size) byBook.set(code, chaps);
  }

  const ORDER = new Map(BOOKTAB.books.map((b) => [b[0], b[3]]));
  const books = [], body = [], layout = [];
  let n = 0;
  for (const code of [...byBook.keys()].sort((a, b) => ORDER.get(a) - ORDER.get(b))) {
    const bk = byBook.get(code);
    const chaps = [];
    for (const cn of [...bk.keys()].sort((a, b) => a - b)) {
      const ch = bk.get(cn);
      const max = Math.max(...ch.keys());
      for (let i = 1; i <= max; i++) { body.push(ch.get(i) || ''); layout.push(''); n++; }
      chaps.push([cn, max]);
    }
    books.push([code, '', '', chaps]);
  }

  const versification = (() => {
    const psa = byBook.get('PSA'), joel = byBook.get('JOL');
    const greek = psa && ((psa.get(9) && Math.max(...psa.get(9).keys()) > 30) || psa.has(151));
    if (greek) return 'greek';
    if (joel && joel.has(4)) return 'hebrew';
    return 'kjv';
  })();

  const m = META[id] || {};
  const sections = [body.join('\n'), layout.join('\n'), '', '', ''].map((s) => Buffer.from(s, 'utf8'));
  const header = JSON.stringify({
    v: 2, id: 'gb-' + id, name: m.name || vet.title, title: vet.title,
    language: m.language || vet.language, languageNative: m.native || '',
    lang: m.lang || '', dir: m.dir || 'ltr',
    copyright: 'public domain (' + vet.reason.split(';')[0] + ')',
    source: 'getbible.net', versification, books,
    sec: { body: sections[0].length, layout: sections[1].length, heads: 0, notes: 0, xrefs: 0 },
  });
  const hb = Buffer.from(header, 'utf8');
  const len = Buffer.alloc(4); len.writeUInt32LE(hb.length, 0);
  const blob = deflateRawSync(Buffer.concat([len, hb, ...sections]), { level: 9 });
  return { bytes: Buffer.concat([Buffer.from('GBP2'), blob]), verses: n, books: books.length,
           versification, meta: m };
}

const built = [];
for (const vet of chosen) {
  let doc;
  try { doc = await fetchText(vet.id); }
  catch (e) {
    const frozen = /FROZEN/.test(e.message);
    console.log('  ' + vet.id + (frozen ? ' ' : ' FAILED ') + e.message);
    continue;
  }
  const p = packOne(vet.id, META[vet.id], doc, vet);
  if (!p.verses) { console.log('  ' + vet.id + ' — no verses, skipped'); continue; }
  writeFileSync(join(outDir, 'gb-' + vet.id + '.gbp'), p.bytes);
  built.push({ id: 'gb-' + vet.id, name: (META[vet.id] || {}).name || vet.title, title: vet.title,
               language: (META[vet.id] || {}).language || vet.language,
               languageNative: (META[vet.id] || {}).native || '',
               lang: (META[vet.id] || {}).lang || '', dir: (META[vet.id] || {}).dir || 'ltr',
               books: p.books, verses: p.verses, bytes: p.bytes.length,
               versification: p.versification,
               sha256: createHash('sha256').update(p.bytes).digest('hex') });
  console.log(`  gb-${vet.id.padEnd(16)} ${String(p.books).padStart(2)} bk ${String(p.verses).padStart(6)} vs  ` +
              `${(p.bytes.length / 1048576).toFixed(2)} MB  ${p.versification}`);
}

writeFileSync(join(dir, '..', 'data', 'getbible-packs.json'), JSON.stringify(built, null, 1) + '\n');
const skipped = accepted.filter((c) => DUP[c.id]).map((c) => c.id + ' -> ' + DUP[c.id]);
console.log(`\n${built.length} packs from getbible; ${skipped.length} accepted but duplicate:`);
for (const s of skipped) console.log('  ' + s);
