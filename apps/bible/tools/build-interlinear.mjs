// The original-language texts, word by word, into GBX1 interlinear packs.
//
//   "GBX1" | deflate-raw( u32 headerLen | header JSON | section | section | ... )
//
// Container and header shape are build-lexicon.mjs's (writeGbx). The sections
// are shaped for a text read one word at a time:
//
//   words     one line per VERSE, in the same order as the translation pack's
//             body; words separated by a space, fields inside a word by U+001F:
//             surface, Strong's digits, morphology index, lemma index,
//             and — Hebrew only, when the verse carries one — the ketiv
//   bare      one line per verse: the same words stripped of accents, vowel
//             points and cantillation, space separated
//   morphs    every distinct morphology code, one per line; a word's third
//             field is a line number here
//   lemmas    every distinct lemma, one per line; a word's fourth field is a
//             line number here
//   parse     the morphology TABLE (JSON) for this pack's scheme
//
// `bare` earns its bytes twice: it is the search index (one indexOf over the
// whole text, the same doctrine as GBP2's body) and it is the only way to hunt
// a pointed Hebrew text, where every word carries marks a reader cannot type.
//
// `parse` rides in the pack because two schemes are in play — Robinson's for
// the Greek and Open Scriptures' for the Hebrew — and a reader that hard-codes
// either becomes wrong the day a third text arrives. apps/bible/js/lexicon.js
// carries only the slot engine; every code, name and shape is here.
//
// VERSE ADDRESSING IS THE TRANSLATION PACK'S, NOT THE SOURCE'S.
//
// The header's `books` table is COPIED from the pack this interlinear pairs
// with, so verse index i here is verse index i there by construction. It has to
// be, because the sources number differently and the divergences are real:
// ebible's grcbyz splits John 1:38 in two and everything after it in that
// chapter shifts by one; it merges 2 Corinthians 13:13-14; it splits 3 John
// 1:14 and Revelation 15:8; and it prints Luke 17:36, Acts 8:37, Acts 15:34 and
// the long Acts 24:6-8, which the Robinson-Pierpont main-line CSVs put in
// variant files. A verse-number join would have hung fourteen wrong Greek
// verses under John 1.
//
// So the join is by WORDS, not by numbers. Each chapter's source word stream is
// aligned against the same chapter's pack token stream (accents and points
// stripped on both sides) by a resynchronising diff: equal tokens step
// together, and a mismatch searches for the nearest position where three
// tokens match again, preferring the smallest total edit. A source word
// inherits the verse of the pack token it landed on. A pack verse the source
// does not have comes out EMPTY rather than borrowing its neighbour's words,
// and the build prints the count.
//
// Run: node apps/bible/tools/build-interlinear.mjs [--only id,id]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { grab, writeGbx, normalizeStrong, parseGreek, SOURCES } from './build-lexicon.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '..', '..', '..');
const cache = join(dir, '..', '.cache', 'orig');
const outDir = join(root, 'site', 'apps', 'bible', 'packs');

const require = createRequire(import.meta.url);
require(join(dir, '..', 'js', 'pack.js'));
const { open } = globalThis.GifosBiblePack;

// ------------------------------------------------------------ book codes
//
// FIVE code systems meet here and three of them collide on the same books.
// The app's canonical code is USFM — apps/bible/data/books.json — and every
// source is routed through one explicit table rather than a clever rule:
//
//   USFM   MRK LUK JHN ACT 1JN 2JN 3JN JUD JAS REV
//   OSIS   Mark Luke John Acts 1John ... Jas       (morphhb writes Josh, 1Sam)
//   byztxt MAR LUK JOH ACT 1JO 2JO 3JO JUD JAM REV
//   Tisch  MR  LU  JOH AC  1JO 2JO 3JO JUDE JAS RE
//
// JUD/JUDE and JAM/JAS are the traps: USFM JUD is Jude, but a table that
// guessed would put it in Judges.

const BYZ_BOOKS = {
  MAT: 'MAT', MAR: 'MRK', LUK: 'LUK', JOH: 'JHN', ACT: 'ACT', ROM: 'ROM',
  '1CO': '1CO', '2CO': '2CO', GAL: 'GAL', EPH: 'EPH', PHP: 'PHP', COL: 'COL',
  '1TH': '1TH', '2TH': '2TH', '1TI': '1TI', '2TI': '2TI', TIT: 'TIT', PHM: 'PHM',
  HEB: 'HEB', JAM: 'JAS', '1PE': '1PE', '2PE': '2PE', '1JO': '1JN', '2JO': '2JN',
  '3JO': '3JN', JUD: 'JUD', REV: 'REV',
};
// PA.csv (the pericope adulterae on its own) and ACT24.csv (the long Acts 24:7)
// sit in the same directory as the 27 books. Globbing the directory duplicates
// those verses, so the book list is the table above and nothing else.

const TISCH_BOOKS = {
  MT: 'MAT', MR: 'MRK', LU: 'LUK', JOH: 'JHN', AC: 'ACT', RO: 'ROM',
  '1CO': '1CO', '2CO': '2CO', GA: 'GAL', EPH: 'EPH', PHP: 'PHP', COL: 'COL',
  '1TH': '1TH', '2TH': '2TH', '1TI': '1TI', '2TI': '2TI', TIT: 'TIT', PHM: 'PHM',
  HEB: 'HEB', JAS: 'JAS', '1PE': '1PE', '2PE': '2PE', '1JO': '1JN', '2JO': '2JN',
  '3JO': '3JN', JUDE: 'JUD', RE: 'REV',
};

const WLC_BOOKS = {
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS',
  Judg: 'JDG', Ruth: 'RUT', '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI',
  '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR', Neh: 'NEH',
  Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG',
  Isa: 'ISA', Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS',
  Joel: 'JOL', Amos: 'AMO', Obad: 'OBA', Jonah: 'JON', Mic: 'MIC', Nah: 'NAM',
  Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
};

// ------------------------------------------------------------ folding

// Alignment and search both need a form with nothing on it a scribe added and a
// reader cannot type. Greek: decompose, drop every combining mark, fold final
// sigma, keep letters. Hebrew: drop U+0591-U+05C7 whole — cantillation, vowel
// points, dagesh, sin/shin dots — and keep the twenty-two letters.
export const bareGreek = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ς/g, 'σ').replace(/[^α-ω]/g, '');
export const bareHebrew = (s) => s.replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '');

// The pack's own text carries GBP2's inline marks (words of Jesus, footnote
// anchors, paragraph breaks) as control characters. They are separators here,
// not letters: a paragraph mark glued between two words would otherwise make
// one token out of two and cost the aligner a resync.
//
// `drop` removes tokens the pack prints that are not words at all. The Hebrew
// needs it: the WLC's section markers, a lone samekh (setumah) or pe (petuchah)
// after the verse end, are letters after folding and the source does not carry
// them. Three of those inside one lookahead window is what left Exodus 20:15
// empty while 20:14 held four words.
function packTokens(text, fold, drop) {
  const out = [];
  for (const raw of text.replace(/[-־׀׃׆/]/g, ' ')
    .split(/\s+/)) {
    const t = fold(raw);
    if (t && !(drop && drop.has(t))) out.push(t);
  }
  return out;
}

// ------------------------------------------------------------ the aligner

const LOOKAHEAD = 3;
const RESYNC_MAX = 80;

// The nearest place the two streams agree again, cheapest total edit first.
// Near the end of a chapter there may be fewer than LOOKAHEAD tokens left, so
// the anchor shortens rather than refusing to exist.
function resync(A, i, B, j) {
  for (let d = 1; d <= RESYNC_MAX; d++) {
    for (let a = 0; a <= d; a++) {
      const b = d - a;
      const k = Math.min(LOOKAHEAD, A.length - i - a, B.length - j - b);
      if (k <= 0) continue;
      let ok = true;
      for (let n = 0; n < k; n++) if (A[i + a + n] !== B[j + b + n]) { ok = false; break; }
      if (ok) return { a, b };
    }
  }
  return null;
}

// packTok/packOwner are one chapter's tokens and the verse index each belongs
// to; src is the same chapter's source words. Returns, per source word, the
// verse index it belongs to and whether it matched a pack token outright.
export function alignChapter(packTok, packOwner, srcTok) {
  const owner = new Int32Array(srcTok.length).fill(-1);
  const matched = new Uint8Array(srcTok.length);
  let i = 0, j = 0;
  const last = packOwner.length ? packOwner[packOwner.length - 1] : -1;
  while (i < packTok.length && j < srcTok.length) {
    if (packTok[i] === srcTok[j]) { owner[j] = packOwner[i]; matched[j] = 1; i++; j++; continue; }
    const r = resync(packTok, i, srcTok, j);
    if (!r) { owner[j] = packOwner[i]; i++; j++; continue; }
    // A source word with no pack token opposite it still has to land somewhere.
    // It lands where the pack is standing: the verse whose text the reader is
    // looking at when this word occurs.
    for (let n = 0; n < r.b; n++) owner[j + n] = packOwner[Math.min(i + Math.min(n, r.a), packTok.length - 1)];
    i += r.a; j += r.b;
  }
  while (j < srcTok.length) { owner[j] = last; j++; }
  return { owner, matched };
}

// ------------------------------------------------------------ parse tables
//
// A pattern is a list of [mapName, charCount] slots. A segment is decoded by
// the first pattern whose total width matches AND whose every character is in
// its map — which is what separates P-1AP (person, case, number) from P-GSM
// (case, number, gender) with no special case in the reader.

const CNG = [[['case', 1], ['number', 1], ['gender', 1]]];

const ROBINSON = {
  scheme: 'robinson',
  name: "Robinson's morphological analysis codes",
  layout: 'segments',
  sep: '-',
  pos: {
    N: 'noun', A: 'adjective', T: 'definite article', V: 'verb',
    P: 'personal pronoun', R: 'relative pronoun', C: 'reciprocal pronoun',
    D: 'demonstrative pronoun', K: 'correlative pronoun', I: 'interrogative pronoun',
    X: 'indefinite pronoun', Q: 'correlative or interrogative pronoun',
    F: 'reflexive pronoun', S: 'possessive pronoun',
    ADV: 'adverb', CONJ: 'conjunction', COND: 'conditional', PRT: 'particle',
    PREP: 'preposition', INJ: 'interjection',
    ARAM: 'Aramaic transliterated word', HEB: 'Hebrew transliterated word',
  },
  maps: {
    case: { N: 'nominative', V: 'vocative', G: 'genitive', D: 'dative', A: 'accusative' },
    number: { S: 'singular', P: 'plural' },
    gender: { M: 'masculine', F: 'feminine', N: 'neuter' },
    person: { 1: 'first person', 2: 'second person', 3: 'third person' },
    pnum: { S: 'singular possessor', P: 'plural possessor' },
    tense: {
      P: 'present', I: 'imperfect', F: 'future', A: 'aorist', R: 'perfect',
      L: 'pluperfect', X: 'no tense stated',
      '2F': 'second future', '2A': 'second aorist', '2R': 'second perfect',
      '2L': 'second pluperfect',
    },
    voice: {
      A: 'active', M: 'middle', P: 'passive', E: 'middle or passive',
      D: 'middle deponent', O: 'passive deponent', N: 'middle or passive deponent',
      Q: 'impersonal active', X: 'no voice stated',
    },
    mood: {
      I: 'indicative', S: 'subjunctive', O: 'optative', M: 'imperative',
      N: 'infinitive', P: 'participle', R: 'imperative participle',
    },
  },
  shape: {
    N: [CNG], A: [CNG], T: [CNG], R: [CNG], C: [CNG], D: [CNG], K: [CNG],
    I: [CNG], X: [CNG], Q: [CNG],
    P: [[[['person', 1], ['case', 1], ['number', 1]],
         [['case', 1], ['number', 1], ['gender', 1]]]],
    F: [[[['person', 1], ['case', 1], ['number', 1], ['gender', 1]]]],
    S: [[[['person', 1], ['pnum', 1], ['case', 1], ['number', 1], ['gender', 1]]]],
    V: [[[['tense', 1], ['voice', 1], ['mood', 1]],
         [['tense', 2], ['voice', 1], ['mood', 1]]],
        [[['person', 1], ['number', 1]],
         [['case', 1], ['number', 1], ['gender', 1]]]],
  },
  suffix: {
    C: 'comparative', S: 'superlative', N: 'negative', K: 'crasis',
    I: 'interrogative', ATT: 'Attic form', ABB: 'abbreviated',
    P: 'particle attached', M: 'middle significance',
  },
  // Indeclinables have no slots to fill, and their letters would otherwise be
  // read as a case and a number that were never there.
  literal: {
    'A-NUI': 'indeclinable numeral',
    'A-NUI-ABB': 'indeclinable numeral, abbreviated',
    'N-PRI': 'indeclinable proper noun',
    'N-LI': 'indeclinable letter',
    'N-OI': 'indeclinable noun (other type)',
  },
};

const OSHM = {
  scheme: 'oshm',
  name: 'Open Scriptures Hebrew morphology codes',
  layout: 'morphemes',
  sep: '/',
  // One language letter prefixes the WHOLE parsing string, prefixes included,
  // and it chooses which stem table the verb reads.
  lang: { H: 'Hebrew', A: 'Aramaic' },
  langMaps: ['stem'],
  pos: {
    A: 'adjective', C: 'conjunction', D: 'adverb', N: 'noun', P: 'pronoun',
    R: 'preposition', S: 'suffix', T: 'particle', V: 'verb',
  },
  maps: {
    person: { 1: 'first person', 2: 'second person', 3: 'third person', x: 'unspecified person' },
    gender: { b: 'both genders', c: 'common gender', f: 'feminine', m: 'masculine', x: 'unspecified gender' },
    number: { d: 'dual', p: 'plural', s: 'singular', x: 'unspecified number' },
    state: { a: 'absolute', c: 'construct', d: 'determined' },
    typeA: { a: 'adjective', c: 'cardinal number', g: 'gentilic', o: 'ordinal number', x: 'unspecified type' },
    typeN: { c: 'common', g: 'gentilic', p: 'proper name', x: 'unspecified type' },
    typeP: { d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative' },
    typeR: { d: 'with the definite article' },
    typeS: { d: 'directional he', h: 'paragogic he', n: 'paragogic nun', p: 'pronominal' },
    typeT: {
      a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative',
      j: 'interjection', m: 'demonstrative', n: 'negative', o: 'direct object marker',
      r: 'relative',
    },
    conj: {
      p: 'perfect (qatal)', q: 'sequential perfect (weqatal)', i: 'imperfect (yiqtol)',
      w: 'sequential imperfect (wayyiqtol)', h: 'cohortative', j: 'jussive',
      v: 'imperative', r: 'active participle', s: 'passive participle',
      a: 'infinitive absolute', c: 'infinitive construct',
    },
    stemH: {
      q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal',
      t: 'hithpael', o: 'polel', O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal',
      k: 'palel', K: 'pulal', Q: 'qal passive', l: 'pilpel', L: 'polpal',
      f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal',
      c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel',
    },
    stemA: {
      q: 'peal', Q: 'peil', u: 'hithpeel', p: 'pael', P: 'ithpaal', M: 'hithpaal',
      a: 'aphel', h: 'haphel', s: 'saphel', e: 'shaphel', H: 'hophal', i: 'ithpeel',
      t: 'hishtaphel', v: 'ishtaphel', w: 'hithaphel', o: 'polel', z: 'ithpoel',
      r: 'hithpolel', f: 'hithpalpel', b: 'hephal', c: 'tiphel', m: 'poel',
      l: 'palpel', L: 'ithpalpel', O: 'ithpolel', G: 'ittaphal',
    },
  },
  shape: {
    A: [[[['typeA', 1], ['gender', 1], ['number', 1], ['state', 1]]]],
    C: [[]], D: [[]],
    N: [[[['typeN', 1]],
         [['typeN', 1], ['gender', 1], ['number', 1], ['state', 1]]]],
    P: [[[['typeP', 1]],
         [['typeP', 1], ['person', 1], ['gender', 1], ['number', 1]]]],
    R: [[[['typeR', 1]]]],
    S: [[[['typeS', 1]],
         [['typeS', 1], ['person', 1], ['gender', 1], ['number', 1]]]],
    T: [[[['typeT', 1]]]],
    // A participle takes a state and no person; a finite verb the other way
    // round. Both are five characters, and which is which falls out of whether
    // the characters resolve, not out of a rule about participles.
    V: [[[['stem', 1], ['conj', 1]],
         [['stem', 1], ['conj', 1], ['person', 1], ['gender', 1], ['number', 1]],
         [['stem', 1], ['conj', 1], ['gender', 1], ['number', 1], ['state', 1]]]],
  },
  suffix: {},
  literal: {},
};

// The same engine apps/bible/js/lexicon.js runs, kept here so the build can
// refuse a code the reader could not have decoded.
export function decodeMorph(table, code) {
  if (!code) return '';
  if (table.literal[code]) return table.literal[code];
  if (table.layout === 'morphemes') {
    let lang = '', body = code;
    if (table.lang[code[0]]) { lang = code[0]; body = code.slice(1); }
    const out = [];
    for (const part of body.split(table.sep)) {
      const t = decodeSlots(table, part[0], [part.slice(1)], lang);
      if (t === null) return null;
      out.push(t);
    }
    return (lang ? table.lang[lang] + ': ' : '') + out.join(' + ');
  }
  const segs = code.split(table.sep);
  return decodeSlots(table, segs[0], segs.slice(1), '');
}

function decodeSlots(table, pos, segs, lang) {
  const name = table.pos[pos];
  if (!name) return null;
  const words = [name];
  const shape = table.shape[pos] || [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s];
    if (!seg) continue;
    const patterns = shape[s] || [];
    let done = false;
    for (const pat of patterns) {
      if (pat.reduce((a, p) => a + p[1], 0) !== seg.length) continue;
      const got = [];
      let at = 0, ok = true;
      for (const [map, width] of pat) {
        const key = seg.slice(at, at + width); at += width;
        const dict = table.maps[table.langMaps && table.langMaps.indexOf(map) >= 0 ? map + lang : map];
        if (!dict || !dict[key]) { ok = false; break; }
        got.push(dict[key]);
      }
      if (!ok) continue;
      words.push(...got); done = true; break;
    }
    if (done) continue;
    if (table.suffix[seg]) { words.push(table.suffix[seg]); continue; }
    return null;
  }
  return words.join(', ');
}

// ------------------------------------------------------------ sources

// Byzantine: `chapter,verse,text` where text is `word STRONGS {PARSE}` triples.
// A verse containing a comma is quoted and may run onto the next line, so the
// reader keeps appending until the next `n,n,` header.
function readCsvVerses(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const h = line.match(/^(\d+),(\d+),/);
    if (h) out.push({ chapter: +h[1], verse: +h[2], text: line.slice(h[0].length) });
    else if (out.length && line.trim()) out[out.length - 1].text += ' ' + line;
  }
  return out;
}

async function readByzantine() {
  const base = 'https://raw.githubusercontent.com/byztxt/byzantine-majority-text/master/csv-unicode';
  const byBook = new Map();
  // These CSVs give a surface form, a number and a parse, and no lemma. The
  // lemma is Strong's own headword for that number — the same public-domain
  // dictionary this app already ships as lex-strongs-g.gbx — so it is joined in
  // here rather than left blank for the reader to fetch a second pack to fill.
  const heads = new Map();
  for (const e of parseGreek(await grab(SOURCES.greek.url, SOURCES.greek.file)).entries) {
    heads.set(e.num.slice(1), e.lemma);
  }
  for (const [src, usfm] of Object.entries(BYZ_BOOKS)) {
    const tagged = await grab(`${base}/strongs/with-parsing/${src}.csv`, join(cache, 'byz', src + '.csv'));
    // The tagged text is unaccented and lowercased. ccat/no-variants is the
    // same words accented, in the same order — verified word for word, not
    // merely verse count for verse count — so a positional zip puts the
    // accents back. If a single verse ever disagrees on word count the zip is
    // refused for the whole book rather than pairing the wrong accents.
    const accented = await grab(`${base}/ccat/no-variants/${src}.csv`, join(cache, 'ccat', src + '.csv'));
    const acc = new Map();
    for (const v of readCsvVerses(accented)) {
      acc.set(v.chapter + ':' + v.verse,
        v.text.replace(/^"|"$/g, '').replace(/¶/g, ' ').trim().split(/\s+/).filter(Boolean));
    }
    let zip = true;
    const verses = readCsvVerses(tagged).map((v) => {
      const words = [...v.text.matchAll(/(\S+)\s+(\d+)\s+\{([^}]*)\}/g)]
        .map((m) => ({ surface: m[1], strong: m[2], morph: m[3],
                       lemma: heads.get(String(parseInt(m[2], 10))) || '' }));
      const a = acc.get(v.chapter + ':' + v.verse);
      if (!a || a.length !== words.length) { zip = false; return { ...v, words }; }
      for (let i = 0; i < words.length; i++) {
        if (bareGreek(a[i]) !== bareGreek(words[i].surface)) { zip = false; break; }
      }
      return { ...v, words, accented: a };
    });
    if (zip) for (const v of verses) if (v.accented) {
      for (let i = 0; i < v.words.length; i++) v.words[i].surface = v.accented[i];
    }
    byBook.set(usfm, { verses, accents: zip });
  }
  return byBook;
}

// Tischendorf word-per-line: book, ch:v.word, punctuation class, inflected,
// normalized, parse, Strong's, lemma, `!`, alternative lemma.
async function readTischendorf() {
  const base = 'https://raw.githubusercontent.com/morphgnt/tischendorf-data/master/word-per-line/2.8/Unicode';
  const byBook = new Map();
  for (const [src, usfm] of Object.entries(TISCH_BOOKS)) {
    const text = await grab(`${base}/${src}.txt`, join(cache, 'tisch', src + '.txt'));
    const verses = [];
    const at = new Map();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const f = line.trim().split(/\s+/);
      const m = f[1].match(/^(\d+):(\d+)\.(\d+)$/);
      if (!m) throw new Error(`${src}: cannot read reference "${f[1]}"`);
      const key = m[1] + ':' + m[2];
      // The pericope adulterae is printed TWICE in these files, once in each of
      // the two forms Tischendorf gives, and the word counter restarts. A run
      // that restarts is a second reading, so it opens a second verse record;
      // which one the pack agrees with is settled later, by the alignment.
      let v = at.get(key);
      if (!v || (+m[3] === 1 && v.words.length)) {
        v = { chapter: +m[1], verse: +m[2], run: v ? v.run + 1 : 0, words: [] };
        at.set(key, v); verses.push(v);
      }
      v.words.push({
        surface: f[3].replace(/[.,;·:]+$/, ''), strong: f[6], morph: f[5], lemma: f[7] || '',
      });
    }
    byBook.set(usfm, { verses, accents: true });
  }
  return byBook;
}

// Westminster Leningrad Codex, OSIS with Open Scriptures morphology.
// A ketiv <w type="x-ketiv"> is followed by a <note type="variant"> whose
// <rdg type="x-qere"> carries the pointed reading. The pointed reading is what
// a printed WLC shows, so it is the surface, and the unpointed consonants ride
// along as the word's ketiv. Six variant notes carry no reading at all (a
// ketiv with no qere); those keep the ketiv as the surface.
async function readWlc() {
  const base = 'https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc';
  const byBook = new Map();
  for (const [src, usfm] of Object.entries(WLC_BOOKS)) {
    const xml = await grab(`${base}/${src}.xml`, join(cache, 'wlc', src + '.xml'));
    const verses = [];
    for (const vm of xml.matchAll(/<verse osisID="[^"]*\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g)) {
      const words = [];
      let inNote = 0, inQere = 0, pendingKetiv = null;
      const body = vm[3];
      for (const t of body.matchAll(/<note\b[^>]*>|<\/note>|<rdg type="x-qere">|<\/rdg>|<w\b([^>]*)>([\s\S]*?)<\/w>/g)) {
        if (t[0].startsWith('<note')) { inNote++; continue; }
        if (t[0] === '</note>') { inNote--; if (inNote <= 0 && pendingKetiv) { words.push(pendingKetiv); pendingKetiv = null; } continue; }
        if (t[0] === '<rdg type="x-qere">') { inQere++; continue; }
        if (t[0] === '</rdg>') { inQere--; continue; }
        if (inNote && !inQere) continue;                    // an accent or spelling note
        const attrs = t[1] || '', surface = (t[2] || '').trim();
        const lemma = (attrs.match(/\slemma="([^"]*)"/) || [, ''])[1];
        const morph = (attrs.match(/\smorph="([^"]*)"/) || [, ''])[1];
        const w = { surface, strong: strongOfHebrewLemma(lemma), morph, lemma };
        if (/type="x-ketiv"/.test(attrs)) { pendingKetiv = w; continue; }
        if (inQere && pendingKetiv) { w.ketiv = pendingKetiv.surface; pendingKetiv = null; }
        words.push(w);
      }
      if (pendingKetiv) words.push(pendingKetiv);
      verses.push({ chapter: +vm[1], verse: +vm[2], words });
    }
    byBook.set(usfm, { verses, accents: true });
  }
  return byBook;
}

// `b/7225` is the inseparable preposition plus H7225; `c/853` a conjunction
// plus H853; `1254 a` a homonym letter on H1254; a bare `b` is a prefix with no
// number of its own. The word's own number is the LAST numbered morpheme.
export function strongOfHebrewLemma(lemma) {
  let out = '';
  for (const part of String(lemma).split('/')) {
    const n = normalizeStrong(part, 'H');
    if (n) out = n;
  }
  return out ? out.slice(1) : '';
}

// ------------------------------------------------------------ build

export function buildInterlinear(pack, byBook, meta, table, fold, drop) {
  const morphs = [], morphIx = new Map();
  const lemmas = [], lemmaIx = new Map();
  const idx = (list, map, key) => {
    if (map.has(key)) return map.get(key);
    map.set(key, list.length); list.push(key); return list.length - 1;
  };
  idx(morphs, morphIx, ''); idx(lemmas, lemmaIx, '');   // slot 0 is "not given"

  const words = new Array(pack.verseCount).fill(null).map(() => []);
  const stats = {
    srcWords: 0, placed: 0, matched: 0, emptyVerses: 0, coveredVerses: 0,
    unknownBooks: [], missingChapters: [], badMorph: new Set(), accents: {},
  };

  for (const [code, src] of byBook) {
    if (!pack.hasBook(code)) { stats.unknownBooks.push(code); continue; }
    stats.accents[code] = src.accents;
    const byChapter = new Map();
    for (const v of src.verses) {
      if (!byChapter.has(v.chapter)) byChapter.set(v.chapter, []);
      byChapter.get(v.chapter).push(v);
    }
    for (const chapter of pack.chapterNumbers(code)) {
      const first = pack.indexOfVerse(code, chapter, 1);
      const count = pack.chapter(code, chapter).verses.length;
      const packTok = [], packOwner = [];
      for (let n = 0; n < count; n++) {
        for (const t of packTokens(pack.textAt(first + n), fold, drop)) { packTok.push(t); packOwner.push(first + n); }
      }
      let list = byChapter.get(chapter);
      if (!list) { stats.missingChapters.push(code + ' ' + chapter); continue; }
      list = chooseRuns(list, packTok, fold);

      const flatWords = [];
      for (const v of list) for (const w of v.words) flatWords.push(w);
      stats.srcWords += flatWords.length;
      const srcTok = flatWords.map((w) => fold(w.surface));
      const { owner, matched } = alignChapter(packTok, packOwner, srcTok);
      for (let n = 0; n < flatWords.length; n++) {
        const w = flatWords[n];
        if (owner[n] < 0) continue;
        stats.placed++;
        if (matched[n]) stats.matched++;
        const decoded = decodeMorph(table, w.morph);
        if (w.morph && decoded === null) stats.badMorph.add(w.morph);
        const rec = [w.surface, w.strong ? String(parseInt(w.strong, 10) || '') : '',
          idx(morphs, morphIx, w.morph || ''), idx(lemmas, lemmaIx, w.lemma || '')];
        if (w.ketiv) rec.push(w.ketiv);
        words[owner[n]].push(rec.join(''));
      }
    }
  }

  const bare = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].length) stats.coveredVerses++; else if (pack.textAt(i)) stats.emptyVerses++;
    bare.push(words[i].map((w) => fold(w.slice(0, w.indexOf('')))).join(' '));
  }

  const header = {
    v: 1, kind: 'interlinear', id: meta.id, name: meta.name, scheme: table.scheme,
    lang: meta.lang, script: meta.script, dir: meta.dir, pairs: meta.pairs,
    source: meta.source, license: meta.license, attribution: meta.attribution || '',
    books: pack.header.books, verses: pack.verseCount, words: stats.placed,
  };
  const out = writeGbx(header, [
    ['words', words.map((w) => w.join(' ')).join('\n')],
    ['bare', bare.join('\n')],
    ['morphs', morphs.join('\n')],
    ['lemmas', lemmas.join('\n')],
    ['parse', JSON.stringify(table)],
  ]);
  return { ...out, stats, morphs: morphs.length, lemmas: lemmas.length };
}

// Tischendorf gives the pericope adulterae twice. Keep, for each verse, the run
// whose words the pack actually prints — measured, not guessed.
function chooseRuns(list, packTok, fold) {
  const runs = new Map();
  for (const v of list) {
    const key = v.verse;
    if (!runs.has(key)) { runs.set(key, v); continue; }
    const have = runs.get(key);
    if (score(v, packTok, fold) > score(have, packTok, fold)) runs.set(key, v);
  }
  return [...runs.values()].sort((a, b) => a.verse - b.verse);
}

function score(v, packTok, fold) {
  if (v._score !== undefined) return v._score;
  const set = new Set(packTok);
  let n = 0;
  for (const w of v.words) if (set.has(fold(w.surface))) n++;
  v._score = v.words.length ? n / v.words.length : 0;
  return v._score;
}

// ------------------------------------------------------------ run

const BUILDS = [
  {
    id: 'grcbyz', out: 'int-grcbyz.gbx', pairs: 'grcbyz',
    name: 'Byzantine Majority Text, Strong’s numbers and Robinson’s parsing',
    lang: 'grc', script: 'Grek', dir: 'ltr', table: ROBINSON, fold: bareGreek,
    source: 'https://github.com/byztxt/byzantine-majority-text',
    license: 'Unlicense (public domain)',
    read: readByzantine,
  },
  {
    id: 'grctisch', out: 'int-grctisch.gbx', pairs: 'grc-tisch',
    name: 'Tischendorf 8th edition, Strong’s numbers and Robinson’s parsing',
    lang: 'grc', script: 'Grek', dir: 'ltr', table: ROBINSON, fold: bareGreek,
    source: 'https://github.com/morphgnt/tischendorf-data',
    license: 'public domain',
    read: readTischendorf,
  },
  {
    id: 'wlc', out: 'int-wlc.gbx', pairs: 'hboWLC',
    name: 'Westminster Leningrad Codex with Open Scriptures morphology',
    lang: 'hbo', script: 'Hebr', dir: 'rtl', table: OSHM, fold: bareHebrew,
    drop: new Set(['ס', 'פ']),
    source: 'https://github.com/openscriptures/morphhb',
    license: 'CC BY 4.0',
    attribution: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
    read: readWlc,
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const onlyIx = process.argv.indexOf('--only');
  const only = onlyIx > -1 ? new Set(process.argv[onlyIx + 1].split(',')) : null;
  mkdirSync(outDir, { recursive: true });
  const origBuilt = {};

  for (const b of BUILDS) {
    if (only && !only.has(b.id)) continue;
    const packFile = join(outDir, b.pairs + '.gbp');
    if (!existsSync(packFile)) throw new Error(`${b.out} pairs with ${b.pairs}.gbp, which is not built`);
    const pack = await open(readFileSync(packFile));
    const built = buildInterlinear(pack, await b.read(), b, b.table, b.fold, b.drop);
    const s = built.stats;
    if (s.badMorph.size) throw new Error(`${b.out}: ${s.badMorph.size} morphology codes do not decode: ` +
      [...s.badMorph].slice(0, 8).join(' '));
    if (s.unknownBooks.length) throw new Error(`${b.out}: ${s.unknownBooks.join(',')} is not in ${b.pairs}`);
    writeFileSync(join(outDir, b.out), built.bytes);
    const noAccents = Object.keys(s.accents).filter((k) => !s.accents[k]);
    console.log(`  ${b.out.padEnd(18)} ${s.placed} words in ${s.coveredVerses}/${pack.verseCount} verses  ` +
      `${(100 * s.matched / s.placed).toFixed(2)}% token match  ` +
      `${built.morphs} morphs ${built.lemmas} lemmas  ` +
      `${(built.raw / 1048576).toFixed(1)} MB -> ${(built.bytes.length / 1048576).toFixed(2)} MB`);
    if (s.emptyVerses) console.log(`      ${s.emptyVerses} verses the source does not carry, left empty`);
    if (s.missingChapters.length) console.log(`      chapters absent from the source: ${s.missingChapters.join(', ')}`);
    if (noAccents.length) console.log(`      accent zip refused, unaccented text kept: ${noAccents.join(', ')}`);
    origBuilt[b.out] = {
      bytes: built.bytes.length,
      sha256: createHash('sha256').update(built.bytes).digest('hex'),
      words: s.placed, verses: s.coveredVerses,
    };
  }
  mergeOrigCredits(origBuilt);
}

function mergeOrigCredits(built) {
  const path = join(dir, '..', 'data', 'credits.json');
  const prior = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const sources = Array.isArray(prior.sources) ? prior.sources.slice() : [];
  const byId = new Map(sources.map((s, i) => [s.id, i]));
  const extra = BUILDS.map((b) => ({
    id: b.id === 'wlc' ? 'morphhb' : b.id === 'grcbyz' ? 'byztxt' : 'tischendorf',
    title: b.name, url: b.source, license: b.license,
    licenseBasis: b.license,
    attribution: b.attribution || null,
    usedIn: [b.out],
  }));
  for (const s of extra) {
    if (!byId.has(s.id)) sources.push(s);
  }
  const out = Object.assign({}, prior, {
    sources,
    origPacks: Object.assign({}, prior.origPacks, built),
  });
  writeFileSync(path, JSON.stringify(out, null, 1) + '\n');
}

export { ROBINSON, OSHM, BUILDS };
