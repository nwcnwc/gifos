// J.N. Darby's translator footnotes for the English Darby pack (engDBY).
//
// eBible's engDBY USFX marks every "God" with a six-letter name-tag (Elohim /
// El / Eloah). Those are not the footnotes printed with the 1890 English
// Bible. The footnotes live in CrossWire's DTN module (SWORD RawCom, GBF,
// DistributionLicense=Public Domain): the notes from the 1961 Kingston Bible
// Trust / Bible Truth Publishers reprint of Morrish 1890.
//
// Provenance, from DTN's own intro.txt:
//   - The 1961 BIBLE TEXT is a reprint of Morrish 1890, wording unchanged.
//   - The FOOTNOTES follow the 1939 Stow Hill condensation of the 1890 notes
//     (manuscript-apparatus references omitted) and add further notes taken
//     from Darby's French and German Bibles (published in his lifetime) and
//     from his collected writings.
//   - Notes the 1961 editors could not identify as Darby's are asterisk-marked
//     in the source. Those are dropped here — they are not 19th-century Darby.
//
// SWORD RawCom index (6-byte records: u32 offset, u16 size), KJV v11n, with
// two leading intros plus a book intro and a chapter intro (verse 0) in front
// of every chapter. Empty verses share a neighbour's offset — the note's own
// `ch:vs` header is the verse, not the slot. Catchword `(a-4)` is footnote
// letter + 1-based word index in the verse.
//
// Run: node apps/bible/tools/darby-notes.mjs          (print counts)
//      imported by build-packs.mjs when packing engDBY
import { readFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARK } from './usfx.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const cache = join(dir, '..', '.cache', 'darby-notes');
const ZIP = join(cache, 'DTN.zip');
const DTN_URL = 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip/DTN.zip';

const OT = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL'];
const NT = ['MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];

// SWORD KJV v11n verse-per-chapter. Public-domain numbering (including the
// handful of slots English Bibles print as a last-verse "Amen").
const VM = {
  GEN:[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  EXO:[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],
  LEV:[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],
  NUM:[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],
  DEU:[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],
  JOS:[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],
  JDG:[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],
  RUT:[22,23,18,22],
  '1SA':[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13],
  '2SA':[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],
  '1KI':[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],
  '2KI':[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],
  '1CH':[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],
  '2CH':[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],
  EZR:[11,70,13,24,17,22,28,36,15,44],
  NEH:[11,20,32,23,19,19,73,18,38,39,36,47,31],
  EST:[22,23,15,17,14,14,10,17,32,3],
  JOB:[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17],
  PSA:[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],
  PRO:[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31],
  ECC:[18,26,22,16,20,12,29,17,18,20,10,14],
  SNG:[17,17,11,16,16,13,13,14],
  ISA:[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],
  JER:[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],
  LAM:[22,22,66,22,22],
  EZK:[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],
  DAN:[21,49,30,37,31,28,28,27,27,21,45,13],
  HOS:[11,23,5,19,15,11,16,14,17,15,12,14,16,9],
  JOL:[20,32,21],
  AMO:[15,16,15,13,27,14,17,14,15],
  OBA:[21],
  JON:[17,10,10,11],
  MIC:[16,13,12,13,15,16,20],
  NAM:[15,13,19],
  HAB:[17,20,19],
  ZEP:[18,15,20],
  HAG:[15,23],
  ZEC:[21,13,10,14,11,15,14,23,17,12,17,14,9,21],
  MAL:[14,17,18,6],
  MAT:[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],
  MRK:[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  LUK:[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  JHN:[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  ACT:[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],
  ROM:[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],
  '1CO':[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],
  '2CO':[24,17,18,18,21,18,16,24,15,18,33,21,14],
  GAL:[24,21,29,31,26,18],
  EPH:[23,22,21,32,33,24],
  PHP:[30,30,21,23],
  COL:[29,23,25,18],
  '1TH':[10,20,13,18,28],
  '2TH':[12,17,18],
  '1TI':[20,15,16,16,25,21],
  '2TI':[18,26,17,22],
  TIT:[16,15,15],
  PHM:[25],
  HEB:[14,18,19,16,14,20,28,13,28,39,40,29,25],
  JAS:[27,26,18,17,20],
  '1PE':[25,25,22,19,14],
  '2PE':[21,22,18],
  '1JN':[10,29,24,21,21],
  '2JN':[13],
  '3JN':[14],
  JUD:[25],
  REV:[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21],
};

function moduleDir() {
  const p = join(cache, 'dtn', 'modules', 'comments', 'rawcom', 'dtn');
  if (existsSync(join(p, 'ot.vss'))) return p;
  const alt = join(cache, 'modules', 'comments', 'rawcom', 'dtn');
  if (existsSync(join(alt, 'ot.vss'))) return alt;
  return p;
}

export async function ensureDtn() {
  mkdirSync(cache, { recursive: true });
  if (!existsSync(ZIP) || statSync(ZIP).size < 1000) {
    const { pull } = await import('./source.mjs');
    const pack = join(dir, '..', '..', '..', 'site', 'apps', 'bible', 'packs', 'engDBY.gbp');
    const r = await pull(DTN_URL, ZIP, { packPath: pack });
    if (r.status === 'missing') throw new Error('DTN.zip ' + (r.reason || 'unavailable'));
  }
  if (!existsSync(join(moduleDir(), 'ot.vss'))) {
    execFileSync('unzip', ['-o', '-q', '-d', join(cache, 'dtn'), ZIP]);
  }
  if (!existsSync(join(moduleDir(), 'ot.vss'))) {
    throw new Error('DTN.zip unpacked without ot.vss');
  }
  return moduleDir();
}

function decodeBytes(buf) {
  // DTN is ASCII plus two Mac Roman bytes (ë in Meroë, ô in Nôd).
  return buf.toString('latin1').replace(/\x89/g, 'ë').replace(/\x93/g, 'ô');
}

function gbfToPlain(s) {
  return s.replace(/<FI>/g, '').replace(/<Fi>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
}

export function parseBlob(raw) {
  const text = typeof raw === 'string' ? raw : decodeBytes(raw);
  if (!text || /\$-\$-\$/.test(text) || /Rights asserted/i.test(text)) return null;
  const m = text.match(/^\s*(\d+):(\d+)\s+/);
  if (!m) return null;
  const chapter = +m[1], verse = +m[2];
  const rest = text.slice(m.index + m[0].length).replace(/<FI>/g, '').replace(/<Fi>/g, '');
  const re = /(^|\n)[ \t]*(\*?)([^\n(]+?)\s*\(([a-z])-(\d+)\)[ \t]*/g;
  const hits = [];
  let mm;
  while ((mm = re.exec(rest))) {
    hits.push({
      at: mm.index + mm[1].length,
      end: mm.index + mm[0].length,
      starred: mm[2] === '*',
      catchword: mm[3].trim().replace(/[,:;]+$/, ''),
      letter: mm[4],
      word: +mm[5],
    });
  }
  if (!hits.length) return null;
  const notes = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const body = gbfToPlain(rest.slice(h.end, i + 1 < hits.length ? hits[i + 1].at : rest.length));
    notes.push({ catchword: h.catchword, letter: h.letter, word: h.word,
                 starred: h.starred, body });
  }
  let lastBody = '';
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].body) lastBody = notes[i].body;
    else if (lastBody) notes[i].body = lastBody;
  }
  const kept = notes.filter((n) => !n.starred && n.body);
  if (!kept.length) return { chapter, verse, notes: [], dropped: notes.length };
  return { chapter, verse, notes: kept, dropped: notes.length - kept.length };
}

function iterVerses(books) {
  let idx = 2;                       // skip module intro + testament intro
  const out = [];
  for (const book of books) {
    const chaps = VM[book];
    idx++;                           // book intro
    for (let c = 1; c <= chaps.length; c++) {
      idx++;                         // chapter intro
      for (let v = 1; v <= chaps[c - 1]; v++) out.push({ idx: idx++, book, chapter: c, verse: v });
    }
  }
  return out;
}

function readTestament(base, which, books) {
  const vss = readFileSync(join(base, which + '.vss'));
  const data = readFileSync(join(base, which));
  const recs = Math.floor(vss.length / 6);
  const seenOff = new Set();
  const out = [];
  let droppedStar = 0;
  for (const slot of iterVerses(books)) {
    if (slot.idx >= recs) break;
    const off = vss.readUInt32LE(slot.idx * 6);
    const sz = vss.readUInt16LE(slot.idx * 6 + 4);
    if (!sz) continue;
    const k = off + ':' + sz;
    if (seenOff.has(k)) continue;
    seenOff.add(k);
    const parsed = parseBlob(data.slice(off, off + sz));
    if (!parsed) continue;
    droppedStar += parsed.dropped || 0;
    if (!parsed.notes.length) continue;
    out.push({ book: slot.book, chapter: parsed.chapter, verse: parsed.verse, notes: parsed.notes });
  }
  return { rows: out, droppedStar };
}

export function loadDarbyNotes(base) {
  const root = base || moduleDir();
  const ot = readTestament(root, 'ot', OT);
  const nt = readTestament(root, 'nt', NT);
  const map = new Map();
  let notes = 0, verses = 0, dropped = ot.droppedStar + nt.droppedStar;
  for (const row of ot.rows.concat(nt.rows)) {
    const key = row.book + ':' + row.chapter + ':' + row.verse;
    if (map.has(key)) continue;      // near-duplicate blob of the same verse
    map.set(key, row.notes);
    verses++;
    notes += row.notes.length;
  }
  return { map, notes, verses, dropped };
}

function isMark(c) {
  const o = c.charCodeAt(0);
  return (o >= 1 && o <= 6) || o === 0xe || o === 0xf || o === 0x10 || o === 0x11 || o === 3 || o === 4;
}

export function wordSpans(text) {
  const spans = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (isMark(c)) {
      if (c === '\u0010' && i + 1 < text.length && text[i + 1] >= '1' && text[i + 1] <= '9') i += 2;
      else i++;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    const start = i;
    while (i < text.length && !isMark(text[i]) && !/\s/.test(text[i])) i++;
    spans.push({ start, end: i });
  }
  return spans;
}

function fold(s) {
  return s.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
}

export function findNotePos(text, note) {
  const spans = wordSpans(text);
  const want = fold(note.catchword);
  const at = note.word - 1;
  if (at >= 0 && at < spans.length && fold(text.slice(spans[at].start, spans[at].end)) === want) {
    return spans[at].end;
  }
  if (want.length >= 3) {
    for (let i = 0; i < spans.length; i++) {
      if (fold(text.slice(spans[i].start, spans[i].end)) === want) return spans[i].end;
    }
    const plain = text.replace(/[\u0001-\u0006\u000e-\u0011]/g, '');
    const ix = plain.toLowerCase().indexOf(want);
    if (ix >= 0) {
      // Map the plain-text end back onto the marked string.
      let seen = 0, j = 0;
      const target = ix + want.length;
      while (j < text.length && seen < target) {
        if (!isMark(text[j])) seen++;
        j++;
      }
      return j;
    }
  }
  return text.length;
}

export function placeNotes(text, notes) {
  const placed = notes.map((n) => ({
    n,
    at: findNotePos(text, n),
    body: n.catchword + ' — ' + n.body,
  }));
  placed.sort((a, b) => a.at - b.at || a.n.letter.localeCompare(b.n.letter));
  let out = text;
  for (let i = placed.length - 1; i >= 0; i--) {
    const at = placed[i].at;
    out = out.slice(0, at) + MARK.NOTE + out.slice(at);
  }
  return { text: out, notes: placed.map((p) => p.body) };
}

export function overlayDarbyNotes(byBook, loaded) {
  const map = loaded.map;
  let attached = 0, verses = 0;
  for (const [code, chapters] of byBook) {
    for (const [cn, vs] of chapters) {
      for (const [vn, v] of vs) {
        v.text = v.text.replace(/\u0003/g, '');
        v.notes = [];
        const recs = map.get(code + ':' + cn + ':' + vn);
        if (!recs || !recs.length) continue;
        const placed = placeNotes(v.text, recs);
        v.text = placed.text;
        v.notes = placed.notes;
        attached += placed.notes.length;
        verses++;
      }
    }
  }
  return { attached, verses };
}

export function sourceCredit() {
  return {
    id: 'dtn',
    title: "Darby Translation Notes (J. N. Darby's footnotes)",
    authors: 'John Nelson Darby (1800–1882); 1890 Morrish English Bible notes, via the 1961 Kingston Bible Trust / Bible Truth Publishers reprint',
    published: '1890 (notes); 1961 reprint of the 1890 text',
    url: DTN_URL,
    bytes: existsSync(ZIP) ? statSync(ZIP).size : null,
    license: 'Public Domain',
    licenseBasis: 'CrossWire DTN module mods.d/dtn.conf: `DistributionLicense=Public Domain` '
      + '(SwordVersionDate=2002-01-01). The notes are those printed with J.N. Darby\'s English '
      + 'Bible (Morrish, 1890). Darby died in 1882; the 1890 edition is public domain by age. '
      + 'The electronic text is the 1961 reprint\'s footnotes: a condensation of the 1890 notes '
      + '(1939 Stow Hill omitted Hebrew/Greek manuscript references) plus further notes taken '
      + 'from Darby\'s French and German Bibles and his collected writings. Asterisk-marked '
      + 'notes the 1961 editors could not identify as Darby\'s are omitted.',
    attribution: null,
    usedIn: ['engDBY.gbp'],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const base = await ensureDtn();
  const loaded = loadDarbyNotes(base);
  console.log(`DTN ${loaded.verses} verses, ${loaded.notes} notes, ${loaded.dropped} asterisk-marked 1939 notes dropped`);
  for (const ref of ['GEN:1:1', 'GEN:1:2', 'GEN:1:5', 'JHN:1:1', 'MAT:1:11', 'ROM:3:21']) {
    const n = loaded.map.get(ref);
    console.log('  ' + ref + (n ? '  ' + n.length + '  ' + n[0].catchword + ' — ' + n[0].body.slice(0, 90) : '  (none)'));
  }
}
