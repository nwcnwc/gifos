/* Versification — one verse, three numbering traditions.
 *
 * Every pack declares header.versification: 'kjv', 'hebrew' or 'greek'. The
 * three disagree about where chapters and verses divide, so two packs shown
 * side by side drift apart unless the reference is mapped. Hebrew Joel runs to
 * four chapters where English merges three and four; Hebrew Malachi 3:19-24 is
 * English Malachi 4; the Greek Psalter joins Psalms 9 and 10 and so runs a
 * psalm behind from there on; and in a Hebrew or Greek psalter the
 * superscription is verse 1, which pushes the rest of the psalm up by one.
 *
 * The table is a list of RUNS: a run of verses on the Hebrew side and the run
 * it answers to on the other side. One row serves both directions — the
 * reverse lookup reads the same row backwards — so a mapping can never
 * disagree with its own inverse. A row whose two runs are the same length is
 * EXACT: whole verse for whole verse, and A -> B -> A returns what it started
 * with. A row that merges or splits, or that is marked NEAR, answers
 * exact:false — the right neighbourhood, a different division. Exact rows are
 * matched first, so the verse a superscription pushed aside never steals the
 * lookup from the verse that really answers to it.
 *
 * Every row was checked against the packs the catalog ships (the WLC packs for
 * Hebrew, eng-kjv/eng-asv/engbsb for English, eng-Brenton/latVUC/russyn for
 * Greek); test/unit/bible-versify.js maps every verse of a whole pack through
 * the table and asserts the answer exists in the target pack.
 *
 * WHAT IS DELIBERATELY NOT MAPPED, because the tag does not record it:
 *
 *   Outside the Psalter the 'greek' tag says nothing about how a text divides
 *   its chapters. A pack is tagged greek because of its PSALTER, and the packs
 *   that carry that psalter split evenly: eng-Brenton and grclxx divide Joel,
 *   Malachi, Zechariah and Nahum the Hebrew way, while latVUC, engDRA and
 *   russyn divide them the English way. So a greek reference outside Psalms is
 *   returned unrenumbered, with exact:false wherever the Hebrew and English
 *   divisions differ. The same holds for the LXX's reordered Jeremiah, the
 *   Greek additions inside Daniel and Esther, and the 3 Kingdoms transposition
 *   of 1 Kings 20 and 21 — all listed in NEAR_GREEK.
 *
 *   New Testament verse divisions (3 John 14/15, 2 Corinthians 13:12-14,
 *   Acts 19:40-41, Revelation 12:18 / 13:1) are an EDITION difference —
 *   critical text against Textus Receptus — and the versification tag does not
 *   record it: grcsr prints 3 John 15 and grc-tisch prints 2 Corinthians 13:13
 *   while both are tagged kjv, exactly like eng-kjv, which prints neither. So
 *   EDITION rows only ever flag the neighbourhood; no NT reference is
 *   renumbered on a claim this module cannot check.
 *
 *   The deuterocanon is not mapped at all: Sirach, Tobit and Baruch divide
 *   differently between the Greek and Latin traditions, and neither the kjv
 *   nor the hebrew tradition prints them to compare against.
 */
(function (root) {
  'use strict';

  var KJV = 'kjv', HEBREW = 'hebrew', GREEK = 'greek';

  // [book, hebChapter, hebFirst, hebLast, chapter, first, last, near]
  // Verified run by run against the packs; a row with a NEAR flag is one where
  // the two runs are the same length but not the same text.
  var HEB_KJV = [
    ['GEN', 32, 1, 1, 31, 55, 55],
    ['GEN', 32, 2, 33, 32, 1, 32],

    ['EXO', 7, 26, 29, 8, 1, 4],
    ['EXO', 8, 1, 28, 8, 5, 32],
    ['EXO', 21, 37, 37, 22, 1, 1],
    ['EXO', 22, 1, 30, 22, 2, 31],

    ['LEV', 5, 20, 26, 6, 1, 7],
    ['LEV', 6, 1, 23, 6, 8, 30],

    ['NUM', 17, 1, 15, 16, 36, 50],
    ['NUM', 17, 16, 28, 17, 1, 13],
    // English Numbers 26:1 is the Hebrew 25:19 and 26:1 read as one verse.
    ['NUM', 25, 19, 19, 26, 1, 1, 1],
    ['NUM', 26, 1, 1, 26, 1, 1, 1],
    ['NUM', 30, 1, 1, 29, 40, 40],
    ['NUM', 30, 2, 17, 30, 1, 16],

    ['DEU', 13, 1, 1, 12, 32, 32],
    ['DEU', 13, 2, 19, 13, 1, 18],
    ['DEU', 23, 1, 1, 22, 30, 30],
    ['DEU', 23, 2, 26, 23, 1, 25],
    ['DEU', 28, 69, 69, 29, 1, 1],
    ['DEU', 29, 1, 28, 29, 2, 29],

    // English 1 Samuel 20:42 ends with the sentence the Hebrew numbers 21:1.
    ['1SA', 20, 42, 42, 20, 42, 42, 1],
    ['1SA', 21, 1, 1, 20, 42, 42, 1],
    ['1SA', 21, 2, 16, 21, 1, 15],
    ['1SA', 24, 1, 1, 23, 29, 29],
    ['1SA', 24, 2, 23, 24, 1, 22],

    ['2SA', 19, 1, 1, 18, 33, 33],
    ['2SA', 19, 2, 44, 19, 1, 43],

    ['1KI', 5, 1, 14, 4, 21, 34],
    ['1KI', 5, 15, 32, 5, 1, 18],
    // English 1 Kings 22:43 carries the Hebrew 22:43 and 22:44 together.
    ['1KI', 22, 43, 43, 22, 43, 43, 1],
    ['1KI', 22, 44, 44, 22, 43, 43, 1],
    ['1KI', 22, 45, 54, 22, 44, 53],

    ['2KI', 12, 1, 1, 11, 21, 21],
    ['2KI', 12, 2, 22, 12, 1, 21],

    ['1CH', 5, 27, 41, 6, 1, 15],
    ['1CH', 6, 1, 66, 6, 16, 81],
    // English 1 Chronicles 12:4 carries the Hebrew 12:4 and 12:5 together.
    ['1CH', 12, 4, 4, 12, 4, 4, 1],
    ['1CH', 12, 5, 5, 12, 4, 4, 1],
    ['1CH', 12, 6, 41, 12, 5, 40],

    ['2CH', 1, 18, 18, 2, 1, 1],
    ['2CH', 2, 1, 17, 2, 2, 18],
    ['2CH', 13, 23, 23, 14, 1, 1],
    ['2CH', 14, 1, 14, 14, 2, 15],

    ['NEH', 3, 33, 38, 4, 1, 6],
    ['NEH', 4, 1, 17, 4, 7, 23],
    // The horses of English Nehemiah 7:68 are not a verse of the Masoretic
    // text, so the rest of the chapter stands one number lower there.
    ['NEH', 7, 68, 72, 7, 69, 73],
    ['NEH', 10, 1, 1, 9, 38, 38],
    ['NEH', 10, 2, 40, 10, 1, 39],

    ['JOB', 40, 25, 32, 41, 1, 8],
    ['JOB', 41, 1, 26, 41, 9, 34],

    // Psalm 13 keeps the same verse count in both, but its superscription is a
    // verse in Hebrew and its last verse is two in English.
    ['PSA', 13, 2, 5, 13, 1, 4],
    ['PSA', 13, 6, 6, 13, 5, 6, 1],

    ['ECC', 4, 17, 17, 5, 1, 1],
    ['ECC', 5, 1, 19, 5, 2, 20],

    ['SNG', 7, 1, 1, 6, 13, 13],
    ['SNG', 7, 2, 14, 7, 1, 13],

    ['ISA', 8, 23, 23, 9, 1, 1],
    ['ISA', 9, 1, 20, 9, 2, 21],
    // Hebrew Isaiah 63:19 is English 63:19 and the whole of 64:1.
    ['ISA', 63, 19, 19, 63, 19, 19, 1],
    ['ISA', 63, 19, 19, 64, 1, 1, 1],
    ['ISA', 64, 1, 11, 64, 2, 12],

    ['JER', 8, 23, 23, 9, 1, 1],
    ['JER', 9, 1, 25, 9, 2, 26],

    ['EZK', 21, 1, 5, 20, 45, 49],
    ['EZK', 21, 6, 37, 21, 1, 32],

    ['DAN', 3, 31, 33, 4, 1, 3],
    ['DAN', 4, 1, 34, 4, 4, 37],
    ['DAN', 6, 1, 1, 5, 31, 31],
    ['DAN', 6, 2, 29, 6, 1, 28],

    ['HOS', 2, 1, 2, 1, 10, 11],
    ['HOS', 2, 3, 25, 2, 1, 23],
    ['HOS', 12, 1, 1, 11, 12, 12],
    ['HOS', 12, 2, 15, 12, 1, 14],
    ['HOS', 14, 1, 1, 13, 16, 16],
    ['HOS', 14, 2, 10, 14, 1, 9],

    ['JOL', 3, 1, 5, 2, 28, 32],
    ['JOL', 4, 1, 21, 3, 1, 21],

    ['JON', 2, 1, 1, 1, 17, 17],
    ['JON', 2, 2, 11, 2, 1, 10],

    ['MIC', 4, 14, 14, 5, 1, 1],
    ['MIC', 5, 1, 14, 5, 2, 15],

    ['NAM', 2, 1, 1, 1, 15, 15],
    ['NAM', 2, 2, 14, 2, 1, 13],

    ['ZEC', 2, 1, 4, 1, 18, 21],
    ['ZEC', 2, 5, 17, 2, 1, 13],

    ['MAL', 3, 19, 24, 4, 1, 6]
  ];

  // The psalms whose superscription the Hebrew counts as a verse, and the ones
  // whose two-line superscription it counts as two. Every other psalm numbers
  // alike in both — either it has no superscription, or its title is read as
  // the head of verse 1. Measured across hboWLC, hebwlc and hbo against
  // eng-kjv, eng-asv, engbsb, eng-web, engjps, engDBY and engylt, which agree
  // on all 150.
  var TITLE_1 = [3, 4, 5, 6, 7, 8, 9, 12, 18, 19, 20, 21, 22, 30, 31, 34, 36,
                 38, 39, 40, 41, 42, 44, 45, 46, 47, 48, 49, 53, 55, 56, 57,
                 58, 59, 61, 62, 63, 64, 65, 67, 68, 69, 70, 75, 76, 77, 80,
                 81, 83, 84, 85, 88, 89, 92, 102, 108, 140, 142];
  var TITLE_2 = [51, 52, 54, 60];

  // Past the longest psalm, so a run can stand for "the rest of the chapter".
  var TAIL = 200;

  function titleRows(psalms, titles) {
    var i;
    for (i = 0; i < psalms.length; i++) {
      // The title itself has no number in English; it sits above verse 1.
      HEB_KJV.push(['PSA', psalms[i], 1, titles, psalms[i], 1, 1, 1]);
      HEB_KJV.push(['PSA', psalms[i], titles + 1, TAIL, psalms[i], 1, TAIL - titles]);
    }
  }
  titleRows(TITLE_1, 1);
  titleRows(TITLE_2, 2);

  // Hebrew psalm -> Greek psalm. The Greek joins Hebrew 9 and 10, so it runs a
  // psalm behind until it joins 114 and 115 as well, then splits Hebrew 116
  // and 147 to come level again at 148. Verse numbers inside a psalm agree:
  // both count the superscription.
  var HEB_GREEK = [
    ['PSA', 10, 1, 18, 9, 22, 39],
    ['PSA', 114, 1, 8, 113, 1, 8],
    ['PSA', 115, 1, 18, 113, 9, 26],
    ['PSA', 116, 1, 9, 114, 1, 9],
    ['PSA', 116, 10, 19, 115, 1, 10],
    ['PSA', 147, 1, 11, 146, 1, 11],
    ['PSA', 147, 12, 20, 147, 1, 9]
  ];

  function shiftRows(from, to) {
    for (var h = from; h <= to; h++) HEB_GREEK.push(['PSA', h, 1, TAIL, h - 1, 1, TAIL]);
  }
  shiftRows(11, 113);
  shiftRows(117, 146);

  // A reference one tradition prints and another simply has not got.
  // [tradition, book, chapter, first, last, absentIn] — absentIn null means
  // absent from both of the others.
  var ABSENT = [
    [GREEK, 'PSA', 151, 1, TAIL, null],
    [KJV, 'NEH', 7, 68, 68, HEBREW]
  ];

  // Where the greek tag settles nothing outside the Psalter: the LXX carries a
  // reordered Jeremiah, Daniel and Esther with the additions numbered inline,
  // and 3 Kingdoms with 1 Kings 20 and 21 transposed — and half the packs
  // wearing the tag print none of it. [book, firstChapter, lastChapter]
  var NEAR_GREEK = [
    ['JER', 25, 52],
    ['DAN', 1, 14],
    ['EST', 1, 16],
    ['1KI', 20, 21]
  ];

  // Divisions that vary by EDITION rather than by tradition. Always near: the
  // rows say which verses belong to one unit, never which numbering a pack
  // uses, because no pack records that.
  var EDITION = [
    ['3JN', 1, 14, 15, 1, 14, 14, 1],
    ['2CO', 13, 12, 14, 13, 12, 12, 1],
    ['ACT', 19, 40, 41, 19, 40, 40, 1],
    ['REV', 12, 18, 18, 13, 1, 1, 1],
    ['REV', 13, 1, 1, 13, 1, 1, 1]
  ];

  // Rows are grouped by book once, so a lookup reads a handful of rows rather
  // than the whole table — map() is called per verse of a chapter.
  function byBook(rows) {
    var set = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      (set[rows[i][0]] || (set[rows[i][0]] = [])).push(rows[i]);
    }
    return set;
  }
  var HEB_KJV_BOOKS = byBook(HEB_KJV);
  var HEB_GREEK_BOOKS = byBook(HEB_GREEK);
  var EDITION_BOOKS = byBook(EDITION);
  var NEAR_GREEK_BOOKS = byBook(NEAR_GREEK);

  function exactRow(row) {
    return !row[7] && row[3] - row[2] === row[6] - row[5];
  }

  // One lookup over a table. forward reads a row left to right, backward reads
  // the same row right to left, which is what keeps the two directions honest.
  function find(table, code, chapter, verse, forward, onlyExact) {
    var rows = table[code];
    if (!rows) return null;
    var i, row, c, first, last;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      if (onlyExact && !exactRow(row)) continue;
      c = forward ? row[1] : row[4];
      first = forward ? row[2] : row[5];
      last = forward ? row[3] : row[6];
      if (chapter !== c || verse < first || verse > last) continue;
      return row;
    }
    return null;
  }

  function through(rows, ref, forward) {
    var row = find(rows, ref.code, ref.chapter, ref.verse, forward, true) ||
              find(rows, ref.code, ref.chapter, ref.verse, forward, false);
    if (!row) return { code: ref.code, chapter: ref.chapter, verse: ref.verse, exact: true, span: 0 };
    var from = forward ? row[2] : row[5];
    var to = forward ? row[3] : row[6];
    var c = forward ? row[4] : row[1];
    var first = forward ? row[5] : row[2];
    var last = forward ? row[6] : row[3];
    var verse = first + (ref.verse - from);
    if (verse > last) verse = last;                 // a merge: the run is shorter here
    return {
      code: ref.code, chapter: c, verse: verse, exact: exactRow(row),
      // One verse answered by several: the caller may want the whole span.
      span: (from === to && last > first) ? last : 0
    };
  }

  function inRanges(ranges, code, chapter) {
    for (var i = 0; i < ranges.length; i++) {
      if (ranges[i][0] === code && chapter >= ranges[i][1] && chapter <= ranges[i][2]) return true;
    }
    return false;
  }

  // Does any Hebrew/English row touch this reference, from either side? That is
  // the test for "the greek tag cannot tell me which way this text divides".
  function contested(code, chapter, verse) {
    return !!(find(HEB_KJV_BOOKS, code, chapter, verse, true, false) ||
              find(HEB_KJV_BOOKS, code, chapter, verse, false, false));
  }

  function absent(ref, from, to) {
    for (var i = 0; i < ABSENT.length; i++) {
      var a = ABSENT[i];
      if (a[0] !== from || a[1] !== ref.code || a[2] !== ref.chapter) continue;
      if (ref.verse < a[3] || ref.verse > a[4]) continue;
      if (a[5] === null || a[5] === to) return true;
    }
    return false;
  }

  function edition(out) {
    var row = find(EDITION_BOOKS, out.code, out.chapter, out.verse, true, false);
    var forward = !!row;
    if (!row) row = find(EDITION_BOOKS, out.code, out.chapter, out.verse, false, false);
    if (!row) return out;
    var moved = through(EDITION_BOOKS, { code: out.code, chapter: out.chapter, verse: out.verse }, forward);
    moved.exact = false;
    return moved;
  }

  // The Greek Psalter is reached through the Hebrew one, so an English
  // reference crosses in two legs and is only exact if both legs are.
  function greekAxis(ref, other, toGreek) {
    var leg, out;
    if (ref.code === 'PSA') {
      if (toGreek) {
        leg = other === KJV ? through(HEB_KJV_BOOKS, ref, false)
                            : { code: ref.code, chapter: ref.chapter, verse: ref.verse, exact: true };
        out = through(HEB_GREEK_BOOKS, leg, true);
      } else {
        leg = through(HEB_GREEK_BOOKS, ref, false);
        out = other === KJV ? through(HEB_KJV_BOOKS, leg, true) : leg;
      }
      if (!leg.exact) out.exact = false;
      return out;
    }
    // Outside the Psalter the tag records nothing: keep the numbers, say so.
    var sure = !inRanges(NEAR_GREEK, ref.code, ref.chapter) &&
               !contested(ref.code, ref.chapter, ref.verse);
    return { code: ref.code, chapter: ref.chapter, verse: ref.verse, exact: sure, span: 0 };
  }

  function tradition(name) {
    if (name !== KJV && name !== HEBREW && name !== GREEK) {
      throw new TypeError('Unknown versification "' + name + '"');
    }
    return name;
  }

  function reference(ref) {
    if (!ref || typeof ref.code !== 'string' ||
        !(ref.chapter > 0) || !(ref.verse > 0)) {
      throw new TypeError('A reference needs a code, a chapter and a verse.');
    }
    return { code: ref.code.toUpperCase(), chapter: ref.chapter | 0, verse: ref.verse | 0 };
  }

  function place(ref, from, to) {
    var start = reference(ref);
    tradition(from); tradition(to);
    if (from === to) return { code: start.code, chapter: start.chapter, verse: start.verse, exact: true, span: 0 };
    if (absent(start, from, to)) return null;

    var out;
    if (from === GREEK) out = greekAxis(start, to, false);
    else if (to === GREEK) out = greekAxis(start, from, true);
    else out = through(HEB_KJV_BOOKS, start, from === HEBREW);
    return edition(out);
  }

  function map(ref, from, to) {
    var out = place(ref, from, to);
    if (!out) return null;
    return { code: out.code, chapter: out.chapter, verse: out.verse, exact: out.exact };
  }

  // The same mapping for a span. A single verse answered by several comes back
  // with verseEnd; a span whose ends land in different chapters cannot be one
  // range in the target, so it comes back as its start, inexact.
  function mapRange(ref, from, to) {
    var start = place(ref, from, to);
    if (!start) return null;
    var out = { code: start.code, chapter: start.chapter, verse: start.verse, exact: start.exact };
    var end = ref.verseEnd;
    if (!(end > ref.verse)) {
      if (start.span) { out.verseEnd = start.span; out.exact = false; }
      return out;
    }
    var stop = place({ code: ref.code, chapter: ref.chapter, verse: end }, from, to);
    if (!stop) { out.exact = false; return out; }
    if (stop.chapter !== out.chapter) { out.exact = false; return out; }
    out.verseEnd = stop.span || stop.verse;
    if (!stop.exact) out.exact = false;
    return out;
  }

  // Cheap enough to call per chapter: is this book numbered alike in both?
  function differs(code, from, to) {
    tradition(from); tradition(to);
    if (from === to) return false;
    var c = String(code).toUpperCase();
    if (EDITION_BOOKS[c]) return true;
    if (from === GREEK || to === GREEK) {
      return c === 'PSA' || !!HEB_KJV_BOOKS[c] || !!NEAR_GREEK_BOOKS[c];
    }
    return !!HEB_KJV_BOOKS[c];
  }

  root.GifosVersify = {
    map: map, mapRange: mapRange, differs: differs,
    TRADITIONS: [KJV, HEBREW, GREEK]
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
