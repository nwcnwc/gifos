// GBX1 round-trip: the study-helps packs the build wrote must open in the
// reader's own code, and every reference they hand out must address a verse
// that exists in a real translation.
//
// The assertions are STRUCTURAL — entry counts, interval coverage, coordinate
// sanity, day counts, and whether a reference string resolves. No dictionary
// article, no commentary note and no verse text is asserted anywhere; this file
// checks the apparatus, not the scholarship.
//
// Run: node test/unit/bible-helps.js
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
require(join(root, 'apps', 'bible', 'js', 'helps.js'));
const { open: openPack } = globalThis.GifosBiblePack;
const { open: openHelps, CANON } = globalThis.GifosBibleHelps;

const CODE_BY_NAME = new Map(CANON.map((b, i) => [b[1], b[0]]));
const CODE_BY_NUM = CANON.map((b) => b[0]);

// EXPECTED ENTRY COUNTS, and why two of them are not the figures that get
// quoted for these modules.
//
// Smith and Torrey are SWORD RawLD: a 6-byte index record — u32 offset, u16
// size — so the entry count is idx.length / 6, and 4,639 and 628 are right.
//
// Easton and Nave are zLD, whose index record is EIGHT bytes (u32 offset, u32
// size). Dividing their index by 6 yields 5,284 and 7,096 — figures that are
// exactly 4/3 of the truth and that circulate widely. The real counts are 3,963
// and 5,322, and they are confirmed twice over: the per-block entry tables
// inside easton.zdt and dict.zdt sum to the same numbers, and every 8-byte
// record's offset+size lands cleanly on an entry boundary in the .dat where a
// 6-byte read walks off it at the second record.
const EXPECT = {
  xrefs: { entries: 63682 },
  dict: { easton: 3963, smith: 4639 },
  topics: { nave: 5322, torrey: 628 },
  mhcc: { books: 66 },
};
const within5 = (got, want) => Math.abs(got - want) <= want * 0.05;

// A reference as these packs emit it: `Genesis 1:1`, `Mark 13:19-21`,
// `Zechariah 12:1-13:1`, `Exodus 6`. Deliberately NOT apps/bible/js/refs.js —
// a guard that shares a parser with the thing it guards proves nothing about
// whether the strings are well formed.
const REF = /^(.+?) (\d+)(?::(\d+))?(?:-(?:(\d+):)?(\d+))?$/;
function parseRef(s) {
  const m = REF.exec(s);
  if (!m) return null;
  const code = CODE_BY_NAME.get(m[1]);
  // A well-formed reference to a book outside the 66 — Smith cites 1 Maccabees,
  // Nave cites Wisdom and the Song of the Three Young Men — is a fact about the
  // source, not a malformed string. It is counted apart from both.
  if (!code) return { code: null, book: m[1], chapter: +m[2] };
  return { code, chapter: +m[2], verse: m[3] ? +m[3] : null,
           endChapter: m[4] ? +m[4] : null, endVerse: m[5] ? +m[5] : null };
}

(async () => {
  if (!existsSync(packs)) {
    console.log('FAIL packs directory is missing — run node apps/bible/tools/build-helps.mjs');
    process.exit(1);
  }

  /* ── every pack opens ─────────────────────────────────────────────────── */

  const KINDS = ['xrefs', 'dict', 'topics', 'mhcc', 'places', 'plans'];
  const helps = {};
  for (const kind of KINDS) {
    const file = join(packs, 'help-' + kind + '.gbx');
    if (!existsSync(file)) { ok(false, `help-${kind}.gbx exists`); continue; }
    try {
      const h = await openHelps(readFileSync(file));
      helps[kind] = h;
      ok(h.kind === kind, `help-${kind}.gbx opens in the reader's own code ` +
         `(${(readFileSync(file).length / 1048576).toFixed(2)} MB)`);
    } catch (e) { ok(false, `help-${kind}.gbx opens (${e.message})`); }
  }
  if (Object.keys(helps).length !== KINDS.length) {
    console.log(`\n${pass} PASS, ${fail} FAIL`);
    process.exit(1);
  }

  /* ── entry counts ─────────────────────────────────────────────────────── */

  const x = helps.xrefs, d = helps.dict, t = helps.topics, m = helps.mhcc,
        pl = helps.places, pn = helps.plans;

  ok(within5(x.header.entries, EXPECT.xrefs.entries),
     `TSK carries ${x.header.entries} entries over ${x.header.verses} verses ` +
     `(expected ~${EXPECT.xrefs.entries})`);
  ok(x.count('rows') === x.header.entries && x.count('index') === x.header.verses,
     'the xrefs sections hold as many records as the header claims');

  const dictCounts = { E: 0, S: 0 };
  for (let i = 0; i < d.count('heads'); i++) dictCounts[d.line('heads', i).split('\t')[2]]++;
  ok(within5(dictCounts.E, EXPECT.dict.easton),
     `Easton carries ${dictCounts.E} entries (expected ${EXPECT.dict.easton})`);
  ok(within5(dictCounts.S, EXPECT.dict.smith),
     `Smith carries ${dictCounts.S} entries (expected ${EXPECT.dict.smith})`);
  ok(d.count('heads') === d.count('bodies') && d.count('heads') === d.count('refs'),
     `the dictionary's three sections are the same ${d.count('heads')} records long`);

  const topicCounts = { N: 0, T: 0 };
  for (let i = 0; i < t.count('topics'); i++) topicCounts[t.line('topics', i).split('\t')[2]]++;
  ok(within5(topicCounts.N, EXPECT.topics.nave),
     `Nave carries ${topicCounts.N} topics (expected ${EXPECT.topics.nave})`);
  ok(within5(topicCounts.T, EXPECT.topics.torrey),
     `Torrey carries ${topicCounts.T} topics (expected ${EXPECT.topics.torrey})`);

  ok(m.header.books === EXPECT.mhcc.books,
     `Matthew Henry covers all ${m.header.books} books in ${m.header.notes} notes`);

  /* ── the reader answers the questions it exists for ───────────────────── */

  ok(x.crossRefs('GEN', 1, 1).length > 0 &&
     x.crossRefs('GEN', 1, 1)[0].refs.length > 0,
     'a verse query returns its catchwords and their references');
  ok(x.crossRefs('GEN', 1, 1).length === x.crossRefs('Genesis', 1, 1).length,
     'a verse is addressable by USFM code and by English name alike');
  ok(d.lookup('Aaron').length > 0 && d.searchHeadwords('AARO').length > 0,
     'a headword looks up and a prefix search finds it');
  ok(t.topic('Aaron').length > 0, 'a topic looks up');
  ok(pl.place('Abana') && pl.place('Abana').lat > 30, 'a place resolves to a coordinate');
  ok(pn.plans().length >= 3, `${pn.plans().length} reading plans, ` +
     pn.plans().map((p) => `${p.id} (${p.origin})`).join(', '));

  /* ── every reference resolves to a verse that exists ──────────────────── */

  // Opened with pack.js, the reader's own translation code. engwebp is the
  // reference English text; if a rebuild of the catalogue is mid-flight, any
  // complete pack that counts by the same versification answers the same way.
  let bible = null, bibleId = null;
  for (const f of ['engwebp.gbp'].concat(
         readdirSync(packs).filter((f) => f.endsWith('.gbp') && f !== 'engwebp.gbp').sort())) {
    if (!existsSync(join(packs, f))) continue;
    const p = await openPack(readFileSync(join(packs, f)));
    if (p.header.versification !== 'kjv') continue;
    if (!CODE_BY_NUM.every((c) => p.hasBook(c))) continue;
    bible = p; bibleId = p.id; break;
  }
  ok(!!bible, `a complete translation pack is open to resolve against (${bibleId})`);

  if (bible) {
    const resolveRate = (label, refs) => {
      let good = 0, bad = 0, unparsed = 0, outside = 0;
      const misses = new Map();
      for (const s of refs) {
        const r = parseRef(s);
        if (!r) { unparsed++; continue; }
        if (!r.code) { outside++; continue; }
        // A reference resolves when its FIRST verse addresses. A range's tail
        // is a matter of versification (a chapter may be a verse shorter in one
        // tradition than another); its head is a claim about a real place.
        if (bible.indexOfVerse(r.code, r.chapter, r.verse == null ? 1 : r.verse) >= 0) good++;
        else { bad++; misses.set(s, (misses.get(s) || 0) + 1); }
      }
      const total = good + bad + unparsed + outside;
      const rate = total ? (good / total) * 100 : 0;
      const worst = [...misses].sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([s, n]) => `${s} x${n}`).join(', ');
      console.log(`     ${label}: ${total} references, ${rate.toFixed(3)}% resolve` +
                  (unparsed ? `, ${unparsed} unparsable` : '') +
                  (outside ? `, ${outside} outside the 66` : '') +
                  (worst ? ` — top misses ${worst}` : ''));
      return { rate, total, unparsed, outside };
    };

    const gather = (helpsPack, section, count) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        const line = helpsPack.line(section, i);
        const field = section === 'rows' ? line.split('\t')[1] : line;
        if (field) for (const s of field.split(';')) out.push(s);
      }
      return out;
    };

    // THE THRESHOLD, and why it is where it is. These sources cite by the KJV
    // versification of 1611; the pack resolves against a modern critical text
    // in the same tradition, and the two differ in a countable handful of
    // places — a verse the modern text brackets out, a Psalm title numbered as
    // verse 1 in Hebrew but not in English, a chapter that ends one verse
    // earlier. Those are real disagreements between editions, not broken
    // references, and they are worth a fraction of a percent. A parser fault or
    // a book-name that failed to normalise is worth WHOLE percent, and would
    // put any of these well under 99%. So 99% is the line: high enough that no
    // systematic fault survives it, honest enough not to pretend two
    // versifications are one.
    const FLOOR = 99;

    const tsk = resolveRate('TSK cross references', gather(x, 'rows', x.count('rows')));
    ok(tsk.rate >= FLOOR,
       `${tsk.rate.toFixed(3)}% of the ${tsk.total} TSK cross references resolve ` +
       `to a verse in ${bibleId} (floor ${FLOOR}%)`);
    ok(tsk.unparsed === 0,
       `every TSK cross reference is a string this test's own parser reads`);
    ok(tsk.outside === 0, 'TSK cites nothing outside the 66 books');

    for (const [label, hp, section] of [['dictionary', d, 'refs'],
                                        ['topical', t, 'refs'],
                                        ['gazetteer', pl, 'places']]) {
      const refs = section === 'places'
        ? gather({ line: (s, i) => pl.line('places', i).split('\t')[4] }, 'places', pl.count('places'))
        : gather(hp, section, hp.count(section));
      const r = resolveRate(label + ' references', refs);
      ok(r.rate >= FLOOR, `${r.rate.toFixed(3)}% of the ${r.total} ${label} references ` +
         `resolve to a verse in ${bibleId} (floor ${FLOOR}%)`);
      ok(r.unparsed === 0, `every ${label} reference is a string this test's own parser reads`);
      ok(r.outside <= r.total * 0.001,
         `${r.outside} of the ${r.total} ${label} references name a book outside the 66`);
    }
  }

  /* ── the commentary is an interval index, not a lookup ────────────────── */

  // A verse is covered by EXACTLY ONE Matthew Henry note or by none: the notes
  // are keyed to ranges, and two ranges covering one verse would make the
  // reader's answer depend on which it happened to find. Sampled across all 66
  // books, every chapter of every book, at the first, middle and last verse.
  let sampled = 0, covered = 0, doubled = [], booksSeen = new Set();
  for (let bn = 1; bn <= 66; bn++) {
    const code = CODE_BY_NUM[bn - 1];
    if (bible && !bible.hasBook(code)) continue;
    const chapters = bible ? bible.chapterNumbers(code) : [1];
    for (const c of chapters) {
      const notes = m.commentaryChapter(code, c);
      if (!notes.length) continue;
      booksSeen.add(code);
      const last = notes[notes.length - 1].to;
      for (const v of [1, Math.max(1, Math.ceil(last / 2)), last]) {
        sampled++;
        const hits = notes.filter((n) => v >= n.from && v <= n.to);
        if (hits.length > 1) doubled.push(`${code} ${c}:${v} in ${hits.length} intervals`);
        const answer = m.commentary(code, c, v);
        if (hits.length === 1) {
          covered++;
          if (!answer || answer.from !== hits[0].from || answer.to !== hits[0].to) {
            doubled.push(`${code} ${c}:${v} query disagrees with the index`);
          }
        }
      }
    }
  }
  ok(doubled.length === 0, `no verse falls in two commentary intervals ` +
     `(${sampled} verses sampled)` + (doubled.length ? ' — ' + doubled.slice(0, 3).join('; ') : ''));
  ok(booksSeen.size === 66, `commentary intervals were sampled in all ${booksSeen.size} books`);
  ok(covered / sampled > 0.95,
     `${covered} of ${sampled} sampled verses are covered by exactly one interval`);
  ok(m.commentary('GEN', 1, 1) !== null && m.commentary('REV', 22, 21) !== null,
     'the first and last verses of the Bible both have a covering note');

  /* ── no place is pinned in the Atlantic ───────────────────────────────── */

  const places = pl.allPlaces();
  const zeros = places.filter((p) => p.lat === 0 && p.lon === 0);
  const offWorld = places.filter((p) => !(p.lat >= -90 && p.lat <= 90) ||
                                        !(p.lon >= -180 && p.lon <= 180));
  ok(places.length > 400, `${places.length} places carry a coordinate ` +
     `(${pl.header.droppedWithoutFix} rows of the ${pl.header.rows} in the source had no fix ` +
     `anywhere in it and were dropped)`);
  ok(zeros.length === 0, 'no place is pinned at 0,0');
  ok(offWorld.length === 0, 'every coordinate is on the globe');
  ok(places.every((p) => p.refs.length > 0), 'every place names at least one verse');
  ok(/OpenBible/.test(pl.attribution || ''),
     `the gazetteer carries its required attribution: ${pl.attribution}`);

  /* ── the reading plans ────────────────────────────────────────────────── */

  const badCells = [];
  for (const plan of pn.plans()) {
    ok(plan.dayCount === 365, `${plan.id} has ${plan.dayCount} days`);
    ok(plan.origin === 'historical' || plan.origin === 'computed',
       `${plan.id} says whether it is historical or computed: ${plan.origin}`);
    let cells = 0;
    for (let day = 1; day <= plan.dayCount; day++) {
      const d = pn.planDay(plan.id, day);
      if (!d || !d.readings.length) { badCells.push(`${plan.id} day ${day} is empty`); continue; }
      for (const cell of d.readings) {
        cells++;
        const r = parseRef(cell);
        if (!r || !r.code) { badCells.push(`${plan.id} day ${day}: ${cell}`); continue; }
        if (bible && bible.indexOfVerse(r.code, r.chapter, r.verse == null ? 1 : r.verse) < 0) {
          badCells.push(`${plan.id} day ${day}: ${cell} does not address`);
        }
      }
    }
    ok(cells >= plan.dayCount, `${plan.id} carries ${cells} readings over its ${plan.dayCount} days`);
  }
  ok(badCells.length === 0, 'every reading-plan cell parses and addresses' +
     (badCells.length ? ' — ' + badCells.slice(0, 4).join('; ') : ''));
  ok(pn.plans().some((p) => p.origin === 'historical') &&
     pn.plans().filter((p) => p.origin === 'computed').length >= 2,
     'the plans include a historical one and at least two this app computed');

  // The 366th day is not in a 365-day plan; stepping past the end clamps rather
  // than wrapping to day 1, which would restart the year in December.
  const lastDay = pn.planDay('mcheyne', 365);
  ok(pn.stepPlan('mcheyne', 365, 1).day === 365 && pn.planDay('mcheyne', 0).day === 1,
     `stepping past the end of a plan clamps (${pn.header.leapDay})`);
  ok(lastDay.readings.length > 0 && pn.stepPlan('mcheyne', 1, 1).day === 2,
     'a plan steps forward a day at a time');

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
