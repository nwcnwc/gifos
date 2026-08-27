// Versification: a reference carried between the three numbering traditions.
//
// The table in apps/bible/js/versify.js is a claim about texts, so this file
// checks it against texts. Three kinds of assertion, weakest to strongest:
//
//   1. Documented anchors — Hebrew Joel 4:1 is English Joel 3:1, Greek Psalm 22
//      is Hebrew Psalm 23, and so on.
//   2. Round-trip — every EXACT mapping, in both directions, over every verse
//      of five real packs. An exact answer that cannot come home is a wrong row.
//   3. The packs themselves — every verse of the WLC mapped into the KJV, and
//      every verse of the KJV mapped into the WLC, must ADDRESS in the target
//      pack (indexOfVerse >= 0). A plausible-but-wrong row survives 1 and 2;
//      it does not survive being run at a chapter end against a real text.
//
// No verse TEXT is asserted anywhere — the packs are in different languages,
// and the contract is about numbers.
//
// Run: node test/unit/bible-versify.js
'use strict';
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const packs = join(root, 'site', 'apps', 'bible', 'packs');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

require(join(root, 'apps', 'bible', 'js', 'pack.js'));
require(join(root, 'apps', 'bible', 'js', 'versify.js'));
const { open } = globalThis.GifosBiblePack;
const { map, mapRange, differs, TRADITIONS } = globalThis.GifosVersify;

const at = (code, chapter, verse) => ({ code, chapter, verse });
const show = (r) => (r ? `${r.code} ${r.chapter}:${r.verse}${r.verseEnd ? '-' + r.verseEnd : ''}` +
                          (r.exact ? '' : '~') : 'null');
const is = (r, code, chapter, verse, exact) =>
  !!r && r.code === code && r.chapter === chapter && r.verse === verse && r.exact === exact;

// Every reference a pack prints, in pack order.
function refs(pack, only) {
  const out = [];
  for (const b of pack.books) {
    if (only && only !== b.code) continue;
    for (const [chapter, count] of b.chapters) {
      for (let v = 1; v <= count; v++) out.push({ code: b.code, chapter, verse: v });
    }
  }
  return out;
}

(async () => {
  if (!existsSync(packs)) {
    console.log('FAIL packs directory is missing — run node apps/bible/tools/build-packs.mjs');
    process.exit(1);
  }
  const load = (id) => open(readFileSync(join(packs, id + '.gbp')));

  // ---- the API's own rules -------------------------------------------------
  ok(TRADITIONS.length === 3 && TRADITIONS.indexOf('kjv') >= 0 &&
     TRADITIONS.indexOf('hebrew') >= 0 && TRADITIONS.indexOf('greek') >= 0,
     'three traditions are named: ' + TRADITIONS.join(', '));

  let identity = 0, wrong = null;
  for (const t of TRADITIONS) {
    for (const ref of [at('GEN', 1, 1), at('PSA', 151, 1), at('JOL', 4, 21), at('3JN', 1, 15)]) {
      const r = map(ref, t, t);
      identity++;
      if (!is(r, ref.code, ref.chapter, ref.verse, true)) wrong = `${t} ${show(r)}`;
    }
  }
  ok(!wrong, `mapping to a tradition's own numbering is the identity (${identity} probes)` +
     (wrong ? ' — ' + wrong : ''));

  let threw = 0;
  for (const bad of [() => map(at('GEN', 1, 1), 'kjv', 'vulgate'),
                     () => map(at('GEN', 1, 1), 'latin', 'kjv'),
                     () => map({ code: 'GEN', chapter: 1 }, 'kjv', 'hebrew'),
                     () => map(null, 'kjv', 'hebrew'),
                     () => differs('GEN', 'kjv', 'septuagint')]) {
    try { bad(); } catch (e) { threw++; }
  }
  ok(threw === 5, `an unknown tradition or a malformed reference throws (${threw}/5)`);

  // ---- the documented anchors ---------------------------------------------
  const anchors = [
    // Joel: the Hebrew fourth chapter is the English third.
    [at('JOL', 4, 1), 'hebrew', 'kjv', 'JOL', 3, 1, true],
    [at('JOL', 3, 1), 'kjv', 'hebrew', 'JOL', 4, 1, true],
    [at('JOL', 3, 1), 'hebrew', 'kjv', 'JOL', 2, 28, true],
    [at('JOL', 2, 32), 'kjv', 'hebrew', 'JOL', 3, 5, true],
    // Malachi: the Hebrew has three chapters, the English four.
    [at('MAL', 3, 19), 'hebrew', 'kjv', 'MAL', 4, 1, true],
    [at('MAL', 4, 6), 'kjv', 'hebrew', 'MAL', 3, 24, true],
    [at('MAL', 3, 18), 'hebrew', 'kjv', 'MAL', 3, 18, true],
    // The Greek Psalter runs a psalm behind from Psalm 10 on.
    [at('PSA', 22, 1), 'greek', 'hebrew', 'PSA', 23, 1, true],
    [at('PSA', 23, 1), 'hebrew', 'greek', 'PSA', 22, 1, true],
    [at('PSA', 9, 22), 'greek', 'hebrew', 'PSA', 10, 1, true],
    [at('PSA', 10, 1), 'hebrew', 'greek', 'PSA', 9, 22, true],
    [at('PSA', 9, 21), 'greek', 'hebrew', 'PSA', 9, 21, true],
    // and comes level again by way of two joins and two splits.
    [at('PSA', 113, 1), 'greek', 'hebrew', 'PSA', 114, 1, true],
    [at('PSA', 113, 9), 'greek', 'hebrew', 'PSA', 115, 1, true],
    [at('PSA', 116, 10), 'hebrew', 'greek', 'PSA', 115, 1, true],
    [at('PSA', 147, 12), 'hebrew', 'greek', 'PSA', 147, 1, true],
    [at('PSA', 146, 1), 'greek', 'hebrew', 'PSA', 147, 1, true],
    [at('PSA', 148, 1), 'greek', 'hebrew', 'PSA', 148, 1, true],
    // The superscription is verse 1 in Hebrew, and unnumbered in English.
    [at('PSA', 3, 2), 'hebrew', 'kjv', 'PSA', 3, 1, true],
    [at('PSA', 3, 1), 'hebrew', 'kjv', 'PSA', 3, 1, false],
    [at('PSA', 3, 1), 'kjv', 'hebrew', 'PSA', 3, 2, true],
    [at('PSA', 51, 3), 'hebrew', 'kjv', 'PSA', 51, 1, true],   // two title verses
    [at('PSA', 51, 1), 'kjv', 'hebrew', 'PSA', 51, 3, true],
    [at('PSA', 23, 1), 'hebrew', 'kjv', 'PSA', 23, 1, true],   // no title verse
    [at('PSA', 50, 3), 'greek', 'kjv', 'PSA', 51, 1, true],    // the Miserere, both ways
    [at('PSA', 51, 1), 'kjv', 'greek', 'PSA', 50, 3, true],
    // Psalm 13 counts the same number of verses by two different divisions.
    [at('PSA', 13, 2), 'hebrew', 'kjv', 'PSA', 13, 1, true],
    [at('PSA', 13, 1), 'hebrew', 'kjv', 'PSA', 13, 1, false],
    [at('PSA', 13, 6), 'hebrew', 'kjv', 'PSA', 13, 5, false],
    [at('PSA', 13, 6), 'kjv', 'hebrew', 'PSA', 13, 6, false],
    // Chapters that open a verse earlier or later in the Hebrew.
    [at('GEN', 32, 1), 'hebrew', 'kjv', 'GEN', 31, 55, true],
    [at('GEN', 31, 55), 'kjv', 'hebrew', 'GEN', 32, 1, true],
    [at('EXO', 7, 26), 'hebrew', 'kjv', 'EXO', 8, 1, true],
    [at('LEV', 5, 20), 'hebrew', 'kjv', 'LEV', 6, 1, true],
    [at('NUM', 17, 1), 'hebrew', 'kjv', 'NUM', 16, 36, true],
    [at('DEU', 28, 69), 'hebrew', 'kjv', 'DEU', 29, 1, true],
    [at('1SA', 21, 2), 'hebrew', 'kjv', '1SA', 21, 1, true],
    [at('2SA', 19, 1), 'hebrew', 'kjv', '2SA', 18, 33, true],
    [at('1KI', 5, 1), 'hebrew', 'kjv', '1KI', 4, 21, true],
    [at('2KI', 12, 1), 'hebrew', 'kjv', '2KI', 11, 21, true],
    [at('1CH', 5, 27), 'hebrew', 'kjv', '1CH', 6, 1, true],
    [at('2CH', 1, 18), 'hebrew', 'kjv', '2CH', 2, 1, true],
    [at('NEH', 10, 1), 'hebrew', 'kjv', 'NEH', 9, 38, true],
    [at('NEH', 7, 69), 'kjv', 'hebrew', 'NEH', 7, 68, true],
    [at('JOB', 41, 1), 'hebrew', 'kjv', 'JOB', 41, 9, true],
    [at('ECC', 4, 17), 'hebrew', 'kjv', 'ECC', 5, 1, true],
    [at('SNG', 7, 1), 'hebrew', 'kjv', 'SNG', 6, 13, true],
    [at('ISA', 9, 1), 'hebrew', 'kjv', 'ISA', 9, 2, true],
    [at('ISA', 64, 1), 'hebrew', 'kjv', 'ISA', 64, 2, true],
    [at('JER', 8, 23), 'hebrew', 'kjv', 'JER', 9, 1, true],
    [at('EZK', 21, 1), 'hebrew', 'kjv', 'EZK', 20, 45, true],
    [at('DAN', 6, 1), 'hebrew', 'kjv', 'DAN', 5, 31, true],
    [at('DAN', 3, 31), 'hebrew', 'kjv', 'DAN', 4, 1, true],
    [at('HOS', 2, 1), 'hebrew', 'kjv', 'HOS', 1, 10, true],
    [at('JON', 2, 1), 'hebrew', 'kjv', 'JON', 1, 17, true],
    [at('MIC', 4, 14), 'hebrew', 'kjv', 'MIC', 5, 1, true],
    [at('NAM', 2, 1), 'hebrew', 'kjv', 'NAM', 1, 15, true],
    [at('ZEC', 2, 1), 'hebrew', 'kjv', 'ZEC', 1, 18, true],
    // A verse the English divides in two: the right neighbourhood, not a number.
    [at('1SA', 21, 1), 'hebrew', 'kjv', '1SA', 20, 42, false],
    [at('1KI', 22, 44), 'hebrew', 'kjv', '1KI', 22, 43, false],
    [at('1CH', 12, 5), 'hebrew', 'kjv', '1CH', 12, 4, false],
    [at('NUM', 25, 19), 'hebrew', 'kjv', 'NUM', 26, 1, false],
    [at('ISA', 64, 1), 'kjv', 'hebrew', 'ISA', 63, 19, false],
    // Books the traditions number alike are left alone.
    [at('RUT', 1, 1), 'hebrew', 'kjv', 'RUT', 1, 1, true],
    [at('MAT', 5, 3), 'hebrew', 'kjv', 'MAT', 5, 3, true],
    [at('GEN', 1, 1), 'greek', 'kjv', 'GEN', 1, 1, true],
    // The New Testament's own divisions are an edition, not a tradition.
    [at('3JN', 1, 15), 'greek', 'kjv', '3JN', 1, 14, false],
    [at('3JN', 1, 14), 'kjv', 'greek', '3JN', 1, 14, false],
    [at('ACT', 19, 41), 'kjv', 'greek', 'ACT', 19, 40, false],
    [at('REV', 12, 18), 'greek', 'kjv', 'REV', 13, 1, false],
    // Outside the Psalter the greek tag settles nothing.
    [at('JOL', 4, 1), 'greek', 'kjv', 'JOL', 4, 1, false],
    [at('JER', 33, 1), 'greek', 'kjv', 'JER', 33, 1, false],
    [at('1KI', 21, 1), 'greek', 'hebrew', '1KI', 21, 1, false],
  ];
  const missed = [];
  for (const [ref, from, to, code, chapter, verse, exact] of anchors) {
    const r = map(ref, from, to);
    if (!is(r, code, chapter, verse, exact)) {
      missed.push(`${ref.code} ${ref.chapter}:${ref.verse} ${from}->${to} gave ${show(r)}, ` +
                  `wanted ${code} ${chapter}:${verse}${exact ? '' : '~'}`);
    }
  }
  ok(missed.length === 0, `${anchors.length} documented anchors land where they are printed` +
     (missed.length ? ' — ' + missed.slice(0, 4).join(' | ') : ''));

  // ---- references one tradition has not got --------------------------------
  ok(map(at('PSA', 151, 1), 'greek', 'hebrew') === null &&
     map(at('PSA', 151, 7), 'greek', 'kjv') === null,
     'Greek Psalm 151 has no Hebrew or English counterpart');
  ok(map(at('PSA', 151, 1), 'greek', 'greek') !== null,
     'Greek Psalm 151 still addresses inside its own tradition');
  ok(map(at('NEH', 7, 68), 'kjv', 'hebrew') === null,
     'the horses of English Nehemiah 7:68 are not a verse of the Masoretic text');
  ok(map(at('PSA', 150, 6), 'greek', 'hebrew') !== null,
     'the psalm before it crosses normally');

  // ---- differs() -----------------------------------------------------------
  const dif = [
    ['JOL', 'hebrew', 'kjv', true], ['MAL', 'kjv', 'hebrew', true],
    ['PSA', 'greek', 'kjv', true], ['PSA', 'hebrew', 'kjv', true],
    ['GEN', 'hebrew', 'kjv', true], ['DAN', 'greek', 'hebrew', true],
    ['JER', 'greek', 'kjv', true], ['EST', 'greek', 'kjv', true],
    ['3JN', 'kjv', 'greek', true], ['2CO', 'hebrew', 'kjv', true],
    ['RUT', 'hebrew', 'kjv', false], ['MAT', 'kjv', 'greek', false],
    ['OBA', 'greek', 'hebrew', false], ['AMO', 'hebrew', 'kjv', false],
    ['JOL', 'kjv', 'kjv', false], ['PSA', 'greek', 'greek', false],
    ['jol', 'hebrew', 'kjv', true],
  ];
  const difBad = dif.filter(([c, f, t, want]) => differs(c, f, t) !== want)
                    .map(([c, f, t, want]) => `${c} ${f}->${t} wanted ${want}`);
  ok(difBad.length === 0, `differs() answers for ${dif.length} book/tradition pairs` +
     (difBad.length ? ' — ' + difBad.join('; ') : ''));

  // A book differs() calls quiet must never be renumbered by map(), or the
  // cheap check would be a lie the caller acts on.
  const quiet = [];
  for (const code of ['RUT', 'AMO', 'OBA', 'HAB', 'ZEP', 'HAG', 'LAM', 'PRO', 'MRK', 'ROM']) {
    for (const from of TRADITIONS) for (const to of TRADITIONS) {
      if (differs(code, from, to)) continue;
      for (let c = 1; c <= 5; c++) for (let v = 1; v <= 20; v++) {
        const r = map(at(code, c, v), from, to);
        if (!is(r, code, c, v, true)) quiet.push(`${code} ${c}:${v} ${from}->${to} ${show(r)}`);
      }
    }
  }
  ok(quiet.length === 0, 'a book differs() calls quiet is never renumbered' +
     (quiet.length ? ' — ' + quiet.slice(0, 3).join('; ') : ''));

  // ---- mapRange ------------------------------------------------------------
  const r13 = mapRange(at('PSA', 13, 6), 'hebrew', 'kjv');
  ok(r13 && r13.chapter === 13 && r13.verse === 5 && r13.verseEnd === 6 && r13.exact === false,
     'a Hebrew verse the English divides comes back as a span: ' + show(r13));
  const rJoel = mapRange({ code: 'JOL', chapter: 4, verse: 1, verseEnd: 5 }, 'hebrew', 'kjv');
  ok(rJoel && rJoel.chapter === 3 && rJoel.verse === 1 && rJoel.verseEnd === 5 && rJoel.exact,
     'a span inside one chapter keeps its length: ' + show(rJoel));
  const rSplit = mapRange({ code: 'JOL', chapter: 2, verse: 27, verseEnd: 28 }, 'kjv', 'hebrew');
  ok(rSplit && rSplit.chapter === 2 && rSplit.verse === 27 && rSplit.verseEnd === undefined &&
     rSplit.exact === false,
     'a span the target splits across chapters refuses to name an end: ' + show(rSplit));
  ok(mapRange(at('PSA', 151, 1), 'greek', 'kjv') === null, 'mapRange is null where map is');
  const rPlain = mapRange(at('GEN', 1, 1), 'kjv', 'hebrew');
  ok(rPlain && rPlain.verseEnd === undefined && rPlain.exact,
     'an undivided verse gets no verseEnd');

  // ---- the packs -----------------------------------------------------------
  const wlc = await load('hboWLC');       // hebrew: the Leningrad Codex
  const kjv = await load('eng-kjv');      // kjv
  const bre = await load('eng-Brenton');  // greek: the Septuagint in English
  const rus = await load('russyn');       // greek: the Synodal Bible, Psalter and all
  const vuc = await load('latVUC');       // greek psalter, Latin verse divisions
  ok(wlc.header.versification === 'hebrew' && kjv.header.versification === 'kjv' &&
     bre.header.versification === 'greek' && rus.header.versification === 'greek' &&
     vuc.header.versification === 'greek',
     'the five packs under test declare hebrew, kjv, greek, greek and greek');

  // A reference is only ever asked to cross FROM the tradition that prints it:
  // a pack of that tradition is where the source references come from. (Feed
  // map() a verse its own tradition does not have — English Exodus 7:26 — and
  // it has no verse counts to catch you with; the answer is the identity.)
  const sources = [[wlc, 'hebrew'], [kjv, 'kjv'], [bre, 'greek'], [rus, 'greek']];

  // Round-trip: an exact answer must come home, every verse, both ways, over
  // every pair of traditions.
  let trips = 0, exacts = 0;
  const tripBad = [];
  for (const [pack, from] of sources) {
    for (const ref of refs(pack)) {
      for (const to of TRADITIONS) {
        if (to === from) continue;
        trips++;
        const there = map(ref, from, to);
        if (!there || !there.exact) continue;
        exacts++;
        const back = map(there, to, from);
        if (!is(back, ref.code, ref.chapter, ref.verse, true)) {
          tripBad.push(`${ref.code} ${ref.chapter}:${ref.verse} ${from}->${to} ${show(there)} ` +
                       `-> ${show(back)}`);
        }
      }
    }
  }
  ok(tripBad.length === 0, `${exacts} exact mappings of ${trips} round-trip in both directions` +
     (tripBad.length ? ' — ' + tripBad.slice(0, 4).join(' | ') : ''));

  // The strong check: the answer must ADDRESS in the target pack. A row that is
  // one verse out at a chapter end passes every assertion above and fails here.
  function crossCheck(src, dst, from, to, only) {
    const bad = [];
    let checked = 0, absent = 0;
    for (const ref of refs(src, only)) {
      if (!dst.hasBook(ref.code)) continue;
      const r = map(ref, from, to);
      if (r === null) { absent++; continue; }
      checked++;
      if (dst.indexOfVerse(r.code, r.chapter, r.verse) < 0) {
        bad.push(`${ref.code} ${ref.chapter}:${ref.verse} -> ${show(r)} is not in ${dst.id}`);
      }
    }
    return { bad, checked, absent };
  }

  // Three Masoretic packs against four English ones, every verse, both ways:
  // one pack could agree with a wrong table by accident, twelve pairs cannot.
  const hebrews = [wlc].concat(await Promise.all(['hebwlc', 'hbo'].map(load)));
  const englishes = [kjv].concat(await Promise.all(['eng-asv', 'engbsb', 'engjps'].map(load)));
  const crossBad = [];
  let crossed = 0, crossAbsent = 0, pairsRun = 0;
  for (const heb of hebrews) {
    for (const eng of englishes) {
      pairsRun++;
      for (const [src, dst, from, to] of [[heb, eng, 'hebrew', 'kjv'],
                                          [eng, heb, 'kjv', 'hebrew']]) {
        const r = crossCheck(src, dst, from, to);
        crossed += r.checked;
        crossAbsent += r.absent;
        for (const b of r.bad) crossBad.push(`${src.id}->${dst.id} ${b}`);
      }
    }
  }
  ok(crossBad.length === 0 && crossed > 500000,
     `all ${crossed} crossings between ${hebrews.length} Masoretic and ` +
     `${englishes.length} English packs address in the target pack ` +
     `(${pairsRun} pairs, ${crossAbsent} absent)` +
     (crossBad.length ? ' — ' + crossBad.slice(0, 5).join(' | ') : ''));
  ok(crossAbsent === englishes.length * hebrews.length,
     `the ${crossAbsent} references with no Masoretic counterpart are Nehemiah 7:68, once per pair`);

  // The Psalter is the one place the greek tag fixes the numbering, so it is the
  // one place the greek axis is checked against real texts.
  const lxx = await load('englxxup');     // greek: a second Septuagint psalter
  const psalters = [];
  for (const greek of [bre, lxx]) {
    for (const [other, tradition] of [[wlc, 'hebrew'], [kjv, 'kjv']]) {
      psalters.push([greek, other, 'greek', tradition]);
      psalters.push([other, greek, tradition, 'greek']);
    }
  }
  const psaBad = [];
  let psaChecked = 0, psaAbsent = 0;
  for (const [src, dst, from, to] of psalters) {
    const r = crossCheck(src, dst, from, to, 'PSA');
    psaChecked += r.checked;
    psaAbsent += r.absent;
    for (const b of r.bad) psaBad.push(`${src.id}->${dst.id} ${b}`);
  }
  ok(psaBad.length === 0 && psaChecked > 15000,
     `all ${psaChecked} psalm verses cross between the Greek, Hebrew and English ` +
     `psalters and address (${psaAbsent} absent)` +
     (psaBad.length ? ' — ' + psaBad.slice(0, 5).join(' | ') : ''));

  // Psalm 151 is the whole of the absent count above, and only the Septuagint
  // packs that print it can produce it.
  ok(psaAbsent === (bre.chapter('PSA', 151).verses.length +
                    lxx.chapter('PSA', 151).verses.length) * 2,
     `the ${psaAbsent} references with no counterpart are Psalm 151, twice over`);

  // The limit of the greek tag, measured rather than asserted away: a psalter
  // may still divide an individual verse its own way — the Latin reads Psalm
  // 2:12 as two verses, the Synodal joins the last two of Psalm 141 — and no
  // versification tag records that. These counts, over all four crossings of
  // each pack with the Hebrew and the English, are the whole of it.
  const known = { grclxx: 6, russyn: 2, latVUC: 12 };
  const tally = {};
  for (const id of Object.keys(known)) {
    const pack = id === 'russyn' ? rus : id === 'latVUC' ? vuc : await load(id);
    let n = 0;
    for (const [other, tradition] of [[wlc, 'hebrew'], [kjv, 'kjv']]) {
      n += crossCheck(pack, other, 'greek', tradition, 'PSA').bad.length;
      n += crossCheck(other, pack, tradition, 'greek', 'PSA').bad.length;
    }
    tally[id] = n;
  }
  ok(JSON.stringify(tally) === JSON.stringify(known),
     `the psalm verses a greek-tagged pack divides for itself are counted, not ` +
     `guessed at: ${JSON.stringify(tally)}`);

  // Crossing must not be a no-op where the traditions really differ: the
  // Psalter, and the chapters the Hebrew divides differently, must MOVE.
  let moved = 0;
  for (const ref of refs(wlc)) {
    const r = map(ref, 'hebrew', 'kjv');
    if (r && (r.chapter !== ref.chapter || r.verse !== ref.verse)) moved++;
  }
  ok(moved > 1500, `${moved} verses of ${wlc.id} are numbered differently in ${kjv.id}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
