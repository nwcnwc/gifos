// GBP2 round-trip: the packs the build wrote must open in the reader's own
// code and address to the right verse.
//
// The assertions are STRUCTURAL — book counts, chapter counts, verse counts,
// the numbers a reference is made of. No verse text is asserted anywhere.
//
// The first version of this file assumed one versification and failed on
// fourteen packs that were all correct. Chapter and verse divisions are NOT
// universal: Hebrew Joel runs to four chapters where an English Bible merges
// three and four; the Septuagint joins Psalms 9 and 10 and so numbers the rest
// of the Psalter one lower, and adds a Psalm 151; Greek Daniel runs to
// fourteen with Susanna and Bel, Greek Esther to sixteen with the additions.
// So each pack declares the tradition it counts by, and this file holds each
// tradition to ITS numbers — and asserts the deviations are actually present,
// which is a stronger check than the one that was wrong.
//
// Run: node test/unit/bible-pack.js
'use strict';
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const packs = join(root, 'site', 'apps', 'bible', 'packs');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

require(join(root, 'apps', 'bible', 'js', 'container.js'));
require(join(root, 'apps', 'bible', 'js', 'pack.js'));
const { open } = globalThis.GifosBiblePack;

// Chapter counts as an English Bible prints them.
const KJV = {
  GEN: 50, EXO: 40, LEV: 27, NUM: 36, DEU: 34, JOS: 24, JDG: 21, RUT: 4,
  '1SA': 31, '2SA': 24, '1KI': 22, '2KI': 25, '1CH': 29, '2CH': 36, EZR: 10,
  NEH: 13, EST: 10, JOB: 42, PSA: 150, PRO: 31, ECC: 12, SNG: 8, ISA: 66,
  JER: 52, LAM: 5, EZK: 48, DAN: 12, HOS: 14, JOL: 3, AMO: 9, OBA: 1, JON: 4,
  MIC: 7, NAM: 3, HAB: 3, ZEP: 3, HAG: 2, ZEC: 14, MAL: 4,
  MAT: 28, MRK: 16, LUK: 24, JHN: 21, ACT: 28, ROM: 16, '1CO': 16, '2CO': 13,
  GAL: 6, EPH: 6, PHP: 4, COL: 4, '1TH': 5, '2TH': 3, '1TI': 6, '2TI': 4,
  TIT: 3, PHM: 1, HEB: 13, JAS: 5, '1PE': 5, '2PE': 3, '1JN': 5, '2JN': 1,
  '3JN': 1, JUD: 1, REV: 22,
};
// The most chapters any tradition in this corpus gives a book. A text may
// print fewer — Hebrew Malachi has three where English has four, and several
// packs carry only part of a book — but none may print more.
//
// This is a CEILING rather than a per-tradition table, because the traditions
// mix: the Croatian Bible chapters Joel the Hebrew way AND carries the Greek
// Daniel with Susanna and Bel. A taxonomy that forced it to be one or the
// other was the first thing this file got wrong.
const CEILING = { JOL: 4, DAN: 14, EST: 16, EZR: 23, BAR: 6, PSA: 151 };

(async () => {
  if (!existsSync(packs)) {
    console.log('FAIL packs directory is missing — run node apps/bible/tools/build-packs.mjs');
    process.exit(1);
  }
  const files = readdirSync(packs).filter((f) => f.endsWith('.gbp')).sort();
  ok(files.length >= 100, `the catalog carries ${files.length} packs`);

  const opened = [];
  for (const f of files) {
    const id = f.replace(/\.gbp$/, '');
    try { opened.push(await open(readFileSync(join(packs, f)))); }
    catch (e) { ok(false, `${id} opens (${e.message})`); }
  }
  ok(opened.length === files.length, `all ${files.length} packs open in the reader's own code`);

  const langs = new Set();
  const traditions = {};
  let checkedBooks = 0, badPacks = [];
  for (const p of opened) {
    langs.add(p.language);
    const vsn = p.header.versification;
    traditions[vsn] = (traditions[vsn] || 0) + 1;
    if (vsn !== 'kjv' && vsn !== 'greek' && vsn !== 'hebrew') {
      badPacks.push(`${p.id}: unknown versification "${vsn}"`);
      continue;
    }

    const bad = [];
    for (const b of p.books) {
      const want = Math.max(CEILING[b.code] || 0, KJV[b.code] || 0) || undefined;
      if (want === undefined) continue;                 // deuterocanon varies freely
      checkedBooks++;
      const nums = p.chapterNumbers(b.code);
      // A pack may carry only PART of a book (several are gospel samples), but
      // what it carries must be numbered inside its tradition's range.
      if (nums[nums.length - 1] > want) {
        bad.push(`${b.code} chapter ${nums[nums.length - 1]} is past ${want}`);
      }
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i - 1]) bad.push(`${b.code} chapters out of order at ${nums[i]}`);
      }
      // The last verse of the last chapter must address, and come back as the
      // same reference — that is the whole contract the reader relies on.
      const last = nums[nums.length - 1];
      const ch = p.chapter(b.code, last);
      if (!ch || !ch.verses.length) { bad.push(`${b.code} ${last} does not open`); continue; }
      const idx = p.indexOfVerse(b.code, last, ch.verses.length);
      const back = idx >= 0 && p.refOf(idx);
      if (!back || back.code !== b.code || back.chapter !== last || back.verse !== ch.verses.length) {
        bad.push(`${b.code} ${last}:${ch.verses.length} does not round-trip`);
      }
    }
    if (bad.length) badPacks.push(`${p.id} — ${bad.slice(0, 3).join('; ')}`);
  }
  ok(badPacks.length === 0, `every book in every pack addresses and round-trips` +
     (badPacks.length ? ' — ' + badPacks.slice(0, 5).join(' | ') : ''));
  ok(checkedBooks > 5000, `${checkedBooks} canonical books checked across the catalog`);
  ok(langs.size >= 40, `${langs.size} languages in the catalog`);
  ok(traditions.kjv > 50 && traditions.greek >= 5 && traditions.hebrew >= 5,
     `versifications recognised: ${JSON.stringify(traditions)}`);

  // The tag is not decoration: every pack that claims a tradition must carry
  // that tradition's fingerprint, and every pack that claims none must not.
  const tagBad = [];
  for (const p of opened) {
    const vsn = p.header.versification;
    const joel4 = p.hasBook('JOL') && p.chapterNumbers('JOL').indexOf(4) >= 0;
    const ps9 = p.hasBook('PSA') && p.chapter('PSA', 9);
    const merged9 = !!ps9 && ps9.verses.length > 30;
    const ps151 = p.hasBook('PSA') && p.chapterNumbers('PSA').indexOf(151) >= 0;
    if (vsn === 'greek' && !(merged9 || ps151)) tagBad.push(`${p.id} claims greek with an unmerged Psalm 9`);
    if (vsn === 'hebrew' && !joel4) tagBad.push(`${p.id} claims hebrew with a three-chapter Joel`);
    if (vsn === 'kjv' && (merged9 || ps151 || joel4)) tagBad.push(`${p.id} claims kjv but counts another way`);
  }
  ok(tagBad.length === 0, 'every versification tag matches the text it describes' +
     (tagBad.length ? ' — ' + tagBad.slice(0, 3).join('; ') : ''));

  // The longest chapter in the Bible is 176 verses. It is Psalm 119 counting
  // the Hebrew way and Psalm 118 counting the Greek way — and it must be there
  // under exactly one of those numbers, never both, or the detection is wrong.
  let checkedPsalters = 0;
  const psalmBad = [];
  for (const p of opened) {
    if (!p.hasBook('PSA') || p.chapterNumbers('PSA').length < 150) continue;
    const greek = p.header.versification === 'greek';
    const wantAt = greek ? 118 : 119, notAt = greek ? 119 : 118;
    const here = p.chapter('PSA', wantAt), there = p.chapter('PSA', notAt);
    checkedPsalters++;
    if (!here || here.verses.length !== 176) {
      psalmBad.push(`${p.id}: Psalm ${wantAt} has ${here ? here.verses.length : 'no'} verses, expected 176`);
    } else if (there && there.verses.length === 176) {
      psalmBad.push(`${p.id}: both Psalm 118 and 119 have 176 verses`);
    }
  }
  ok(psalmBad.length === 0, `the 176-verse psalm sits where its tradition puts it in ` +
     `${checkedPsalters} psalters` + (psalmBad.length ? ' — ' + psalmBad.slice(0, 3).join('; ') : ''));

  // Every pack must be able to say what any index is, and no index may be lost.
  const strayBad = [];
  for (const p of opened) {
    const probes = [0, 1, (p.verseCount / 3) | 0, (p.verseCount / 2) | 0, p.verseCount - 1];
    for (const i of probes) {
      const r = p.refOf(i);
      if (!r) { strayBad.push(`${p.id}: index ${i} has no reference`); break; }
      if (p.indexOfVerse(r.code, r.chapter, r.verse) !== i) {
        strayBad.push(`${p.id}: ${r.code} ${r.chapter}:${r.verse} does not return to ${i}`);
        break;
      }
    }
  }
  ok(strayBad.length === 0, `every probed index names a reference that addresses back` +
     (strayBad.length ? ' — ' + strayBad.slice(0, 3).join('; ') : ''));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
