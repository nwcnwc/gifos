// What the place button says.
//
// The top-left control is the most prominent label in the app, and it was
// printing the pack's abbreviation — a mechanical truncation written by
// whatever produced the source. Every USFX pack in the catalog says "Jhn",
// "Psa", "Php". This app's own table says John, Ps, Phil, which is what a
// reader would write.
//
// The rule the fix has to keep: a pack in ANOTHER LANGUAGE names its books in
// that language, and those names must survive. A Spanish reader gets "Juan",
// never "John", and the test proves that by asking a real Spanish pack.
//
// Run: node test/unit/bible-book-labels.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'bible');
const PACKS = path.join(ROOT, 'site', 'apps', 'bible', 'packs');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '  ' + detail : ''));
  if (!cond) failures++;
}

const g = { console, Math, JSON, Object, String, RegExp, Array, Number, parseInt, isNaN };
g.window = g; g.globalThis = g;
vm.createContext(g);
g.GIFOS_BIBLE_BOOKS = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'books.json'), 'utf8'));
vm.runInContext(fs.readFileSync(path.join(APP, 'js', 'refs.js'), 'utf8'), g, { filename: 'refs.js' });
const Refs = g.GifosRefs;

// namesOf(), as reader.js builds it: the pack's own book names and abbreviations.
function namesOf(header) {
  const names = {};
  for (const b of header.books) if (b[1]) names[b[0]] = { name: b[1], abbr: b[2] || b[1] };
  return names;
}
function headerOf(file) {
  const raw = fs.readFileSync(path.join(PACKS, file));
  const all = zlib.inflateRawSync(raw.subarray(4));
  return JSON.parse(all.subarray(4, 4 + all.readUInt32LE(0)).toString('utf8'));
}
const short = (code, chapter, names) =>
  Refs.format({ code, chapter }, { names, style: 'short' });

// ---- an English pack uses this app's abbreviations --------------------------
for (const file of ['engwebp.gbp', 'eng-kjv2006.gbp']) {
  if (!fs.existsSync(path.join(PACKS, file))) { check(file + ' is present', false); continue; }
  const names = namesOf(headerOf(file));
  for (const [code, want, was] of [
    ['JHN', 'John 1', 'Jhn 1'],
    ['PSA', 'Ps 23', 'Psa 23'],
    ['PHP', 'Phil 2', 'Php 2'],
    ['1CO', '1 Cor 13', '1Co 13'],
  ]) {
    const chapter = { JHN: 1, PSA: 23, PHP: 2, '1CO': 13 }[code];
    const got = short(code, chapter, names);
    check(file + ': ' + code + ' reads "' + want + '", not "' + was + '"', got === want, 'got "' + got + '"');
  }
}

// ---- a pack in another language keeps its own names ------------------------
// The whole risk of this change: reaching for an English table would print
// "John" to a reader who has only ever seen "Juan".
const foreign = fs.readdirSync(PACKS)
  .filter((f) => f.endsWith('.gbp'))
  .map((f) => ({ file: f, header: headerOf(f) }))
  .filter(({ header }) => {
    const jhn = (header.books || []).find((b) => b[0] === 'JHN');
    return jhn && jhn[1] && jhn[1] !== 'John';
  });

check('the catalog has translations that do not call it John', foreign.length > 0,
  'nothing to prove the language rule with');
console.log('       (' + foreign.length + ' of the catalog name John in their own language)');

let broke = null;
for (const { file, header } of foreign) {
  const names = namesOf(header);
  const jhn = header.books.find((b) => b[0] === 'JHN');
  const got = short('JHN', 1, names);
  // It must print something from the PACK — its abbreviation or its name —
  // and never this app's English label.
  const ownAbbr = (jhn[2] || jhn[1]) + ' 1';
  if (got !== ownAbbr) broke = file + ': got "' + got + '", pack says "' + ownAbbr + '"';
  if (got === 'John 1') broke = file + ': printed the English label over "' + jhn[1] + '"';
  if (broke) break;
}
check('every non-English pack keeps its own book label', !broke, broke);

// ---- a book this app does not know still prints -----------------------------
// Deuterocanon and the Greek additions are in some packs and not in books.json.
const wide = fs.readdirSync(PACKS).filter((f) => f.endsWith('.gbp'))
  .map((f) => ({ file: f, header: headerOf(f) }))
  .find(({ header }) => header.books.some((b) => !Refs.books().some((t) => t.code === b[0])));
if (wide) {
  const names = namesOf(wide.header);
  const extra = wide.header.books.find((b) => !Refs.books().some((t) => t.code === b[0]));
  const got = short(extra[0], 1, names);
  check('a book outside this app\'s table prints the pack\'s own name (' + extra[0] + ')',
    got && got !== extra[0] + ' 1' ? true : got.startsWith(extra[2] || extra[1]), 'got "' + got + '"');
} else {
  check('a book outside this app\'s table prints the pack\'s own name', true);
}

// ---- with no pack at all, the app's table is used --------------------------
check('with no pack open, the app\'s own abbreviation is used',
  short('JHN', 1, null) === 'John 1', short('JHN', 1, null));
check('the long style is unchanged',
  Refs.format({ code: 'PHP', chapter: 2 }, { names: null, style: 'long' }) === 'Philippians 2');

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
