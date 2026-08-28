// refOf, index by index, against the linear walk it replaced.
//
// refOf turns a body offset back into a reference and is what every search hit
// goes through. It used to walk 66 books and then their chapters backwards; it
// now binary-searches both. That is only worth doing if the two agree on EVERY
// index, including the ones that are easy to get wrong at a boundary: the first
// and last verse of a book, of a chapter, and the ends of the body.
//
// Run: node test/unit/bible-pack-refof.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'bible');
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '\n      ' + detail : ''));
  if (!cond) failures++;
}

// ---- the app's own pack.js, in a sandbox ------------------------------------
const g = {
  console, Math, JSON, Object, String, RegExp, Array, Error, Promise,
  Uint8Array, Int32Array, TextDecoder,
};
g.window = g; g.globalThis = g;
vm.createContext(g);
for (const f of ['container.js', 'pack.js']) {
  vm.runInContext(fs.readFileSync(path.join(APP, 'js', f), 'utf8'), g, { filename: f });
}

// ---- the linear walk refOf replaced, kept here as the oracle ---------------
function refOfLinear(pack, index) {
  for (let i = 0; i < pack.books.length; i++) {
    const b = pack.books[i];
    if (index < b.end) {
      for (let c = b.chapters.length - 1; c >= 0; c--) {
        if (index >= b.first[c]) {
          return { code: b.code, name: b.name || b.code,
                   chapter: b.chapters[c][0], verse: index - b.first[c] + 1 };
        }
      }
    }
  }
  return null;
}

function readPack(file) {
  const raw = fs.readFileSync(file);
  const all = zlib.inflateRawSync(raw.subarray(4));
  const hlen = all.readUInt32LE(0);
  const header = JSON.parse(all.subarray(4, 4 + hlen).toString('utf8'));
  // Only the header is needed: refOf reads books/chapters, never the text.
  const pack = Object.create(g.GifosBiblePack.Pack.prototype);
  pack.books = [];
  pack.byCode = Object.create(null);
  let at = 0;
  for (const b of header.books) {
    const rec = { code: b[0], name: b[1], abbr: b[2], chapters: b[3], start: at, first: [] };
    let off = at;
    for (const ch of b[3]) { rec.first.push(off); off += ch[1]; }
    rec.end = off;
    at = off;
    pack.books.push(rec);
    pack.byCode[b[0]] = rec;
  }
  pack.verseCount = at;
  return pack;
}

const PACKS = path.join(ROOT, 'site', 'apps', 'bible', 'packs');
const all = fs.readdirSync(PACKS).filter((f) => f.endsWith('.gbp')).sort();

// Every index of the two sealed English packs, and every book and chapter
// boundary of all 148. The full sweep is where an off-by-one in the middle of
// a chapter would show; the boundary sweep is where a binary search actually
// breaks, and it covers every versification shape the catalog carries —
// including the 81-book packs the two builtins do not exercise.
const FULL = ['engwebp.gbp', 'eng-kjv2006.gbp'].filter((f) => all.includes(f));
check('the sealed translations are present', FULL.length === 2, FULL.join(', '));
console.log('       (full index sweep: ' + FULL.join(', ') +
  '; boundary sweep: all ' + all.length + ' packs)');

const same = (a, b) => (a === null && b === null) ||
  !!(a && b && a.code === b.code && a.chapter === b.chapter && a.verse === b.verse && a.name === b.name);

for (const file of FULL) {
  const pack = readPack(path.join(PACKS, file));
  const n = pack.verseCount;

  let bad = null;
  for (let i = 0; i < n && !bad; i++) {
    const got = pack.refOf(i), want = refOfLinear(pack, i);
    if (!same(got, want)) bad = 'index ' + i + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want);
  }
  check(file + ': every one of ' + n + ' verse indexes resolves the same', !bad, bad);

  // Out of range in both directions, and the exact last verse.
  check(file + ': one past the end is null', pack.refOf(n) === null,
    JSON.stringify(pack.refOf(n)));
  check(file + ': a negative index is null', pack.refOf(-1) === null);
  check(file + ': the last verse resolves', same(pack.refOf(n - 1), refOfLinear(pack, n - 1)));

}

// Every book and chapter boundary of every pack in the catalog, plus both ends
// of each range. This is where a binary search goes wrong if it is going to.
let boundary = null, checked = 0;
for (const file of all) {
  if (boundary) break;
  const pack = readPack(path.join(PACKS, file));
  const n = pack.verseCount;
  if (pack.refOf(n) !== null) { boundary = file + ': one past the end is not null'; break; }
  if (pack.refOf(-1) !== null) { boundary = file + ': a negative index is not null'; break; }
  for (const b of pack.books) {
    for (let c = 0; c < b.first.length && !boundary; c++) {
      const first = b.first[c];
      const last = (c + 1 < b.first.length ? b.first[c + 1] : b.end) - 1;
      for (const i of [first, last]) {
        checked++;
        if (!same(pack.refOf(i), refOfLinear(pack, i))) {
          boundary = file + ' ' + b.code + ' ' + b.chapters[c][0] + ' at index ' + i;
        }
      }
    }
  }
}
check('every book and chapter boundary in all ' + all.length + ' packs agrees (' +
  checked + ' boundaries)', !boundary, boundary);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
