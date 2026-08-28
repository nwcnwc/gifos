// English Darby carries J.N. Darby's 1890 footnotes, not eBible's Elohim tags.
//
// The pack is the gate: a rebuild that forgot the DTN overlay, or that put the
// name-tags back, fails here. Parser-shape checks (catchword, GBF, asterisk
// drop, word-index placement) run on fixtures so they do not need the cached
// SWORD module.
//
// Run: node test/unit/bible-darby-notes.js
'use strict';
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const root = join(__dirname, '..', '..');
const packPath = join(root, 'site', 'apps', 'bible', 'packs', 'engDBY.gbp');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

require(join(root, 'apps', 'bible', 'js', 'container.js'));
require(join(root, 'apps', 'bible', 'js', 'pack.js'));
const { open } = globalThis.GifosBiblePack;

(async () => {
  const tools = await import(pathToFileURL(join(root, 'apps', 'bible', 'tools', 'darby-notes.mjs')).href);
  const { parseBlob, placeNotes, wordSpans } = tools;

  const gen11 = parseBlob(
    "1:1\n  God (a-4)\n  Heb. <FI>Elohim<Fi>, the plural of <FI>Eloah<Fi>, 'the Supreme'."
  );
  ok(gen11 && gen11.chapter === 1 && gen11.verse === 1 && gen11.notes.length === 1,
     'a DTN blob parses to chapter, verse, and one note');
  ok(gen11 && gen11.notes[0].catchword === 'God' && gen11.notes[0].word === 4 &&
     /Elohim/.test(gen11.notes[0].body) && !/<FI>/.test(gen11.notes[0].body),
     'catchword, word index, and GBF italics become a plain Elohim note');

  const starred = parseBlob("22:33\n  *God. (b-18)\n  <FI>El Olam<Fi> see Isa. 40.28.");
  ok(starred && starred.notes.length === 0,
     'asterisk-marked 1939 notes (not identified as Darby) are dropped');

  const shared = parseBlob(
    "1:16\n  lights, (d-7)\n  light (d-10)\n  light (d-18)\n\n  Lit. 'light-bearers.'"
  );
  ok(shared && shared.notes.length === 3 &&
     shared.notes.every((n) => n.body === "Lit. 'light-bearers.'"),
     'three catchwords on one verse share the body that follows them');

  const junk = parseBlob('2:12\n\n$-$-$-');
  ok(junk === null, 'placeholder blobs are not notes');

  const verse = 'In the beginning God created the heavens and the earth.';
  const spans = wordSpans(verse);
  ok(spans.length === 10 && verse.slice(spans[3].start, spans[3].end) === 'God',
     'the fourth word of Genesis 1:1 is God');
  const placed = placeNotes(verse, gen11.notes);
  ok(placed.text.indexOf('\u0003') === verse.indexOf('God') + 3 &&
     placed.notes.length === 1 && /^God — /.test(placed.notes[0]),
     'the footnote mark lands after God, and the note names the catchword');

  if (!existsSync(packPath)) {
    ok(false, 'engDBY.gbp is missing — run node apps/bible/tools/build-packs.mjs --only engDBY');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(1);
  }

  const pack = await open(readFileSync(packPath));
  ok(pack.id === 'engDBY', 'the English Darby pack opens');

  const gen = pack.chapter('GEN', 1);
  const v1 = gen && gen.verses[0];
  ok(v1 && v1.notes.length >= 1 && v1.notes[0].length > 40,
     'Genesis 1:1 carries a real translator note, not a six-letter name-tag');
  ok(v1 && v1.text.indexOf('\u0003') >= 0,
     'Genesis 1:1 has a footnote mark in the verse text');
  ok(v1 && /Elohim/i.test(v1.notes.join(' ')) && !/^Elohim\.?$/i.test(v1.notes[0].trim()),
     'the Genesis 1:1 note is Darby\'s Elohim apparatus, not the eBible tag');

  const waste = gen && gen.verses[1];
  ok(waste && waste.notes.some((n) => /waste/i.test(n) || /Isa/i.test(n)),
     'Genesis 1:2 carries the 1890 "waste" note');

  let noteVerses = 0, noteCount = 0, short = 0, marks = 0;
  for (let i = 0; i < pack.verseCount; i++) {
    const ns = pack.notes[i];
    if (!ns || !ns.length) continue;
    noteVerses++;
    noteCount += ns.length;
    for (let j = 0; j < ns.length; j++) if (ns[j].length <= 8) short++;
    if (pack.textAt(i).indexOf('\u0003') >= 0) marks++;
  }
  ok(noteCount >= 3000 && noteVerses >= 2000,
     `engDBY has ${noteCount} footnotes on ${noteVerses} verses`);
  ok(short === 0, `no leftover Elohim/El/Eloah name-tags (${short} short notes)`);
  ok(marks === noteVerses,
     `every noted verse has a mark in the text (${marks} of ${noteVerses})`);

  const jhn = pack.chapter('JHN', 1);
  ok(jhn && jhn.verses.some((v) => v.notes.length > 0),
     'John 1 carries at least one of Darby\'s New Testament notes');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
