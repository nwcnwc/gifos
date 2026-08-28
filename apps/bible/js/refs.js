/* References — what a person types, turned into a place in the text.
 *
 * One reference is { code, chapter, verse, verseEnd, chapterEnd, raw }, with
 * null for every part the input did not say. `John 3` is a chapter, `John 3:16`
 * a verse, `John 3:16-18` a verse range, `Gen 1-3` a chapter range, and
 * `2 Kings 6:31-7:20` crosses a chapter boundary, so both ends carry a number.
 *
 * The parser is a token scanner rather than one regular expression because a
 * reference is a SEQUENCE with memory: `Daniel 9:27; 11:31` repeats the book,
 * `Exodus 13:2,12` repeats the chapter, and no regex that has to remember what
 * came before it stays readable. Book names are matched longest-first over up
 * to six words, so `Song of the Three Young Men` cannot be read as `Song`.
 *
 * A book name is never allowed to swallow a TRAILING number: `Ps 151` is the
 * hundred and fifty-first psalm, not the book called `Psalm 151`, and `1co13`
 * is 1 Corinthians 13. A LEADING number is part of the name (`1 Corinthians`),
 * spelled as a digit, a roman numeral, an ordinal or a word.
 *
 * Nothing here reads a pack or the network. `opts.names` takes a translation's
 * OWN book names — { CODE: { name, abbr } } — so a Spanish text both parses and
 * prints as `Juan 3:16` while the reference itself stays the USFM code JHN.
 */
(function (root) {
  'use strict';

  // code, English name, short label, shelf order, section — the same table as
  // apps/bible/data/books.json, inlined because a browser module cannot read a
  // file. test/unit/bible-refs.js fails if the two ever drift apart.
  var BOOKS = [
    ['GEN', 'Genesis', 'Gen', 1, 'ot'],
    ['EXO', 'Exodus', 'Exo', 2, 'ot'],
    ['LEV', 'Leviticus', 'Lev', 3, 'ot'],
    ['NUM', 'Numbers', 'Num', 4, 'ot'],
    ['DEU', 'Deuteronomy', 'Deut', 5, 'ot'],
    ['JOS', 'Joshua', 'Josh', 6, 'ot'],
    ['JDG', 'Judges', 'Judg', 7, 'ot'],
    ['RUT', 'Ruth', 'Ruth', 8, 'ot'],
    ['1SA', '1 Samuel', '1 Sam', 9, 'ot'],
    ['2SA', '2 Samuel', '2 Sam', 10, 'ot'],
    ['1KI', '1 Kings', '1 Kgs', 11, 'ot'],
    ['2KI', '2 Kings', '2 Kgs', 12, 'ot'],
    ['1CH', '1 Chronicles', '1 Chr', 13, 'ot'],
    ['2CH', '2 Chronicles', '2 Chr', 14, 'ot'],
    ['EZR', 'Ezra', 'Ezra', 15, 'ot'],
    ['NEH', 'Nehemiah', 'Neh', 16, 'ot'],
    ['EST', 'Esther', 'Esth', 17, 'ot'],
    ['JOB', 'Job', 'Job', 18, 'ot'],
    ['PSA', 'Psalms', 'Ps', 19, 'ot'],
    ['PRO', 'Proverbs', 'Prov', 20, 'ot'],
    ['ECC', 'Ecclesiastes', 'Eccl', 21, 'ot'],
    ['SNG', 'Song of Solomon', 'Song', 22, 'ot'],
    ['ISA', 'Isaiah', 'Isa', 23, 'ot'],
    ['JER', 'Jeremiah', 'Jer', 24, 'ot'],
    ['LAM', 'Lamentations', 'Lam', 25, 'ot'],
    ['EZK', 'Ezekiel', 'Ezek', 26, 'ot'],
    ['DAN', 'Daniel', 'Dan', 27, 'ot'],
    ['HOS', 'Hosea', 'Hos', 28, 'ot'],
    ['JOL', 'Joel', 'Joel', 29, 'ot'],
    ['AMO', 'Amos', 'Amos', 30, 'ot'],
    ['OBA', 'Obadiah', 'Obad', 31, 'ot'],
    ['JON', 'Jonah', 'Jonah', 32, 'ot'],
    ['MIC', 'Micah', 'Mic', 33, 'ot'],
    ['NAM', 'Nahum', 'Nah', 34, 'ot'],
    ['HAB', 'Habakkuk', 'Hab', 35, 'ot'],
    ['ZEP', 'Zephaniah', 'Zeph', 36, 'ot'],
    ['HAG', 'Haggai', 'Hag', 37, 'ot'],
    ['ZEC', 'Zechariah', 'Zech', 38, 'ot'],
    ['MAL', 'Malachi', 'Mal', 39, 'ot'],
    ['TOB', 'Tobit', 'Tob', 40, 'dc'],
    ['JDT', 'Judith', 'Jdt', 41, 'dc'],
    ['ESG', 'Esther (Greek)', 'Esth Gr', 42, 'dc'],
    ['WIS', 'Wisdom of Solomon', 'Wis', 43, 'dc'],
    ['SIR', 'Sirach', 'Sir', 44, 'dc'],
    ['BAR', 'Baruch', 'Bar', 45, 'dc'],
    ['LJE', 'Letter of Jeremiah', 'Ep Jer', 46, 'dc'],
    ['S3Y', 'Song of the Three Young Men', 'Pr Azar', 47, 'dc'],
    ['SUS', 'Susanna', 'Sus', 48, 'dc'],
    ['BEL', 'Bel and the Dragon', 'Bel', 49, 'dc'],
    ['DAG', 'Daniel (Greek)', 'Dan Gr', 50, 'dc'],
    ['MAN', 'Prayer of Manasseh', 'Pr Man', 51, 'dc'],
    ['1MA', '1 Maccabees', '1 Macc', 52, 'dc'],
    ['2MA', '2 Maccabees', '2 Macc', 53, 'dc'],
    ['3MA', '3 Maccabees', '3 Macc', 54, 'dc'],
    ['4MA', '4 Maccabees', '4 Macc', 55, 'dc'],
    ['1ES', '1 Esdras', '1 Esd', 56, 'dc'],
    ['2ES', '2 Esdras', '2 Esd', 57, 'dc'],
    ['PS2', 'Psalm 151', 'Ps 151', 58, 'dc'],
    ['PSS', 'Additional Psalms', 'Ps add', 59, 'dc'],
    ['MAT', 'Matthew', 'Matt', 60, 'nt'],
    ['MRK', 'Mark', 'Mark', 61, 'nt'],
    ['LUK', 'Luke', 'Luke', 62, 'nt'],
    ['JHN', 'John', 'John', 63, 'nt'],
    ['ACT', 'Acts', 'Acts', 64, 'nt'],
    ['ROM', 'Romans', 'Rom', 65, 'nt'],
    ['1CO', '1 Corinthians', '1 Cor', 66, 'nt'],
    ['2CO', '2 Corinthians', '2 Cor', 67, 'nt'],
    ['GAL', 'Galatians', 'Gal', 68, 'nt'],
    ['EPH', 'Ephesians', 'Eph', 69, 'nt'],
    ['PHP', 'Philippians', 'Phil', 70, 'nt'],
    ['COL', 'Colossians', 'Col', 71, 'nt'],
    ['1TH', '1 Thessalonians', '1 Thess', 72, 'nt'],
    ['2TH', '2 Thessalonians', '2 Thess', 73, 'nt'],
    ['1TI', '1 Timothy', '1 Tim', 74, 'nt'],
    ['2TI', '2 Timothy', '2 Tim', 75, 'nt'],
    ['TIT', 'Titus', 'Titus', 76, 'nt'],
    ['PHM', 'Philemon', 'Phlm', 77, 'nt'],
    ['HEB', 'Hebrews', 'Heb', 78, 'nt'],
    ['JAS', 'James', 'Jas', 79, 'nt'],
    ['1PE', '1 Peter', '1 Pet', 80, 'nt'],
    ['2PE', '2 Peter', '2 Pet', 81, 'nt'],
    ['1JN', '1 John', '1 John', 82, 'nt'],
    ['2JN', '2 John', '2 John', 83, 'nt'],
    ['3JN', '3 John', '3 John', 84, 'nt'],
    ['JUD', 'Jude', 'Jude', 85, 'nt'],
    ['REV', 'Revelation', 'Rev', 86, 'nt']
  ];

  // Everything a reader might type, beyond the name and short label above.
  // Space-separated, already in lookup form (lower case, no punctuation, a
  // leading numeral as a digit). Two-letter forms are the ones printed in the
  // margins of study Bibles; the older `Apoc`, `Cant` and `Ecclus` are here
  // because printed cross-references still use them.
  var ALIAS = {
    GEN: 'ge gn gen genesis',
    EXO: 'ex exo exod exodus',
    LEV: 'le lv lev levit leviticus',
    NUM: 'nu nm nb num numb numbers',
    DEU: 'dt de deu deut deut deuteronomy',
    JOS: 'jos josh jsh joshua',
    JDG: 'jg jdg jdgs judg judges',
    RUT: 'ru rth rut ruth',
    '1SA': '1s 1sa 1sm 1sam 1samuel 1kingdoms',
    '2SA': '2s 2sa 2sm 2sam 2samuel 2kingdoms',
    '1KI': '1k 1kg 1ki 1kgs 1kin 1kings 3kingdoms',
    '2KI': '2k 2kg 2ki 2kgs 2kin 2kings 4kingdoms',
    '1CH': '1ch 1chr 1chron 1chronicles',
    '2CH': '2ch 2chr 2chron 2chronicles',
    EZR: 'ezr ezra',
    NEH: 'ne neh nehemiah',
    EST: 'es est esth ester esther',
    JOB: 'jb job',
    PSA: 'ps psa psm psalm psalms psalter',
    PRO: 'pr prv pro prov proverb proverbs',
    ECC: 'ec ecc eccl eccles ecclesiastes qoh qoheleth',
    SNG: 'so sos sng song songs songofsongs songofsolomon canticles canticleofcanticles cant',
    ISA: 'is isa isai isaiah',
    JER: 'je jr jer jere jeremiah',
    LAM: 'la lam lament lamentations',
    EZK: 'eze ezk ezek ezekiel',
    DAN: 'da dn dan danl daniel',
    HOS: 'ho hos hosea',
    JOL: 'jl joe jol joel',
    AMO: 'am amo amos',
    OBA: 'ob oba obad obadiah',
    JON: 'jon jnh jonah',
    MIC: 'mc mic micah',
    NAM: 'na nam nah nahum',
    HAB: 'hab hb habakkuk',
    ZEP: 'zp zep zeph zephaniah',
    HAG: 'hg hag haggai',
    ZEC: 'zc zec zech zechariah',
    MAL: 'ml mal malachi',
    TOB: 'tb tob tobit tobias',
    JDT: 'jdt jth judith',
    ESG: 'esg gkest greekesther esthergreek addesth additionstoesther',
    WIS: 'ws wis wisd wisdom wisdomofsolomon',
    SIR: 'sir ecclus ecclesiasticus sirach bensira',
    BAR: 'br bar baruch',
    LJE: 'lje epjer letjer letterofjeremiah epistleofjeremiah',
    S3Y: 's3y prazar azariah prayerofazariah songofthree songofthethree songofthethreeyoungmen songofthethreechildren',
    SUS: 'sus susanna',
    BEL: 'bel belanddragon belandthedragon',
    DAG: 'dag gkdan greekdaniel danielgreek',
    MAN: 'man prman manasseh manasses prayerofmanasseh',
    '1MA': '1m 1ma 1mac 1macc 1maccabees',
    '2MA': '2m 2ma 2mac 2macc 2maccabees',
    '3MA': '3m 3ma 3mac 3macc 3maccabees',
    '4MA': '4m 4ma 4mac 4macc 4maccabees',
    '1ES': '1es 1esd 1esdr 1esdras',
    '2ES': '2es 2esd 2esdr 2esdras',
    PS2: 'ps2 psalm151 ps151',
    PSS: 'psadd psalmsadditional additionalpsalms apocryphalpsalms',
    MAT: 'mt mat matt matthew',
    MRK: 'mk mr mrk mar mark',
    LUK: 'lk lu luk luke',
    JHN: 'jn jhn joh john',
    ACT: 'ac act acts actsoftheapostles',
    ROM: 'ro rm rom roman romans',
    '1CO': '1c 1co 1cor 1corinthians',
    '2CO': '2c 2co 2cor 2corinthians',
    GAL: 'ga gal galatians',
    EPH: 'ep eph ephes ephesians',
    PHP: 'pp php phi phil philip philippians',
    COL: 'cl col colossians',
    '1TH': '1th 1thes 1thess 1thessalonians',
    '2TH': '2th 2thes 2thess 2thessalonians',
    '1TI': '1ti 1tim 1timothy',
    '2TI': '2ti 2tim 2timothy',
    TIT: 'ti tit titus',
    PHM: 'pm phm phlm phile philem philemon',
    HEB: 'heb hebr hebrews',
    JAS: 'jm jas jam jms james',
    '1PE': '1p 1pe 1pt 1pet 1peter',
    '2PE': '2p 2pe 2pt 2pet 2peter',
    '1JN': '1j 1jn 1jo 1joh 1john',
    '2JN': '2j 2jn 2jo 2joh 2john',
    '3JN': '3j 3jn 3jo 3joh 3john',
    JUD: 'jd jud jude',
    REV: 're rv rev apoc apocalypse revelation revelations revelationofjohn'
  };

  // One printed chapter, so a bare number after the name is a VERSE: Jude 5 is
  // the fifth verse. Every other book reads a bare number as a chapter.
  var ONE_CHAPTER = 'OBA PHM JUD 2JN 3JN LJE S3Y SUS BEL MAN PS2'.split(' ');

  // A leading numeral, however it is written.
  var ORD = { i: '1', ii: '2', iii: '3', first: '1', second: '2', third: '3',
              one: '1', two: '2', three: '3' };

  var TABLE = [];
  var BY_CODE = Object.create(null);
  var LOOKUP = Object.create(null);
  var RANK = Object.create(null);
  var ONE_CH = Object.create(null);
  var i, j;

  // The lookup form of a name: lower case, no punctuation and no spaces, with
  // Latin accents folded away so `Exodo` finds `Éxodo`. Letters outside ASCII
  // are KEPT — a Greek or Cyrillic name from opts.names must not collapse to
  // the empty string, because an empty key would then match every word.
  function key(s) {
    s = String(s).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[^0-9a-z\u00a1-\uffff]+/g, '');
  }

  // A USFM code always resolves to its own book — a pack that carries PSS must
  // be able to look PSS up — so codes are locked and no alias may take one.
  // Names and labels register next, and an alias may correct one of those but
  // never another alias. `pss` is therefore Additional Psalms, and the plural
  // of Psalms is reached by `ps`, `psa`, `psm`, `psalm`, `psalms`, `psalter`.
  function register(k, code, rank) {
    if (!k) return;
    if (LOOKUP[k] && RANK[k] <= rank) return;
    LOOKUP[k] = code;
    RANK[k] = rank;
  }

  for (i = 0; i < BOOKS.length; i++) {
    var b = BOOKS[i];
    TABLE.push({ code: b[0], name: b[1], abbr: b[2], order: b[3], sect: b[4] });
    BY_CODE[b[0]] = TABLE[i];
    register(key(b[0]), b[0], 0);
    register(key(b[1]), b[0], 2);
    register(key(b[2]), b[0], 2);
  }
  for (i = 0; i < BOOKS.length; i++) {
    var list = (ALIAS[BOOKS[i][0]] || '').split(' ');
    for (j = 0; j < list.length; j++) register(list[j], BOOKS[i][0], 1);
  }
  for (i = 0; i < ONE_CHAPTER.length; i++) ONE_CH[ONE_CHAPTER[i]] = true;

  var SPACE = /\s/;
  // hyphen, non-breaking hyphen, figure/en/em dash, minus, and the tilde some
  // printed cross-references use for a range.
  var DASH = '-\u2010\u2011\u2012\u2013\u2014\u2015\u2212~';

  // What a character is to this scanner. The default for anything outside
  // ASCII is a LETTER — a Chinese, Thai or Hebrew book name must tokenize
  // whole, and there is no list of the world's letters to check against. Only
  // marks the scanner has a use for, ASCII punctuation, and the two blocks
  // that hold everyone else's quotes and stops are anything else.
  function classify(c) {
    var x = c.charCodeAt(0);
    if (SPACE.test(c)) return ' ';
    if (x >= 48 && x <= 57) return 'n';
    if (x >= 65 && x <= 90) return 'w';
    if (x >= 97 && x <= 122) return 'w';
    if (c === ':' || x === 0xFF1A) return ':';
    if (c === ';' || c === '|' || x === 0xFF1B) return ';';
    if (c === ',' || x === 0xFF0C || x === 0x3001) return ',';
    if (c === '.' || x === 0x3002 || x === 0xFF0E) return '.';
    if (DASH.indexOf(c) >= 0) return '-';
    if (x < 128) return 'x';                                    // ASCII punctuation
    if (x >= 0x2000 && x <= 0x206F) return 'x';                 // general punctuation
    if (x >= 0x3000 && x <= 0x303F) return 'x';                 // CJK punctuation
    if ((x >= 0xFF01 && x <= 0xFF0F) || (x >= 0xFF1C && x <= 0xFF20)) return 'x';
    return 'w';
  }

  function tokenize(str) {
    var toks = [], n = str.length, i = 0, j, k;
    while (i < n) {
      k = classify(str.charAt(i));
      if (k === 'n' || k === 'w' || k === ' ') {
        for (j = i + 1; j < n && classify(str.charAt(j)) === k; j++) {}
        if (k === 'n') toks.push({ k: 'n', v: parseInt(str.slice(i, j), 10), s: i, e: j });
        else if (k === 'w') toks.push({ k: 'w', t: str.slice(i, j), s: i, e: j });
        else toks.push({ k: ' ', s: i, e: j });
        i = j; continue;
      }
      toks.push({ k: k, s: i, e: i + 1 });
      i++;
    }
    // A dot is a verse mark between two numbers (`jn3.16`) and an abbreviation
    // mark everywhere else (`Ps. 23`); `v`, `vs` and `vv` are the same mark
    // written out. Deciding it here keeps the reader below free of the
    // question, and keeps `raw` an exact slice of what the person typed.
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      var isDot = t.k === '.';
      var isV = t.k === 'w' && /^(v|vv|vs|vss)$/i.test(t.t);
      if (!isDot && !isV) continue;
      var before = prevSig(toks, i), after = nextSig(toks, i);
      if (before >= 0 && toks[before].k === 'n' && after >= 0 && toks[after].k === 'n') t.k = ':';
    }
    return toks;
  }

  function skippable(t) { return t.k === ' ' || t.k === '.' || t.k === 'x'; }
  function nextSig(toks, i) {
    for (i = i + 1; i < toks.length; i++) if (!skippable(toks[i])) return i;
    return -1;
  }
  function prevSig(toks, i) {
    for (i = i - 1; i >= 0; i--) if (!skippable(toks[i])) return i;
    return -1;
  }

  // The joined name of the significant tokens at [from, to), with a leading
  // numeral folded to a digit and its ordinal tail (`1st`) dropped.
  function joinKey(toks, idx) {
    var parts = [], k;
    for (var p = 0; p < idx.length; p++) {
      var t = toks[idx[p]];
      if (t.k === 'n') { parts.push(String(t.v)); continue; }
      k = t.t.toLowerCase();
      if (p === 0 && ORD[k]) { parts.push(ORD[k]); continue; }
      if (p === 1 && toks[idx[0]].k === 'n' && /^(st|nd|rd|th)$/.test(k)) continue;
      parts.push(k);
    }
    return key(parts.join(''));
  }

  var MAX_WORDS = 6;

  // The longest name that starts here, or null. A trailing number is never
  // part of a name — that is what keeps `Ps 151` a psalm and `1co13` a chapter.
  function matchBook(toks, at, lookup) {
    var idx = [], i = at;
    while (idx.length < MAX_WORDS && i >= 0 && i < toks.length) {
      if (toks[i].k !== 'w' && toks[i].k !== 'n') break;
      idx.push(i);
      i = nextSig(toks, i);
    }
    while (idx.length && toks[idx[idx.length - 1]].k === 'n') idx.pop();
    for (var len = idx.length; len >= 1; len--) {
      var k = joinKey(toks, idx.slice(0, len));
      var code = k && lookup[k];
      if (code) {
        var last = idx[len - 1];
        return { code: code, next: nextSig(toks, last), start: toks[at].s,
                 end: toks[last].e, words: len };
      }
    }
    return null;
  }

  function lookupFor(opts) {
    var names = opts && opts.names;
    if (!names) return LOOKUP;
    var map = Object.create(null), k;
    for (k in LOOKUP) map[k] = LOOKUP[k];
    // A translation's own names win over the English table: in a Spanish text
    // `Judas` is Jude, and nothing in the English table may outrank it.
    for (k in names) {
      if (!BY_CODE[k]) continue;
      var rec = names[k] || {}, nk;
      if (rec.name && (nk = key(rec.name))) map[nk] = k;
      if (rec.abbr && (nk = key(rec.abbr))) map[nk] = k;
    }
    return map;
  }

  function mk(code, chapter, verse, verseEnd, chapterEnd, raw) {
    return { code: code, chapter: chapter, verse: verse,
             verseEnd: verseEnd, chapterEnd: chapterEnd, raw: raw };
  }

  function parse(input, opts) {
    if (input == null) return [];
    var str = String(input);
    var toks = tokenize(str);
    var lookup = lookupFor(opts);
    var out = [];
    var i = 0;

    while (i >= 0 && i < toks.length) {
      var t = toks[i];
      if (t.k !== 'w' && t.k !== 'n') { i = nextSig(toks, i); continue; }
      var m = matchBook(toks, i, lookup);
      if (!m) { i = nextSig(toks, i); continue; }
      i = readNumbers(toks, m, str, out, lookup);
    }
    return out;
  }

  // Every reference the book at `m` governs: its own numbers, then each group
  // after a comma or semicolon until a new book name takes over.
  function readNumbers(toks, m, str, out, lookup) {
    var code = m.code;
    var i = m.next;
    var sep = null, lastChapter = null, lastHadVerse = false, first = true;
    var refStart = null;

    // `raw` runs from the book name for the first reference and from the
    // number for each continuation, so `Matt 5:3, 5:9` reports `5:9` plainly.
    while (true) {
      if (i < 0 || i >= toks.length || toks[i].k !== 'n') break;
      refStart = first ? m.start : toks[i].s;
      var g = readGroup(toks, i, code, sep, lastChapter, lastHadVerse);
      if (!g) break;
      out.push(mk(code, g.chapter, g.verse, g.verseEnd, g.chapterEnd,
                  str.slice(refStart, g.end)));
      lastChapter = g.chapter;
      lastHadVerse = g.verse != null;
      first = false;
      i = g.next;
      if (i < 0 || i >= toks.length) break;
      if (toks[i].k !== ',' && toks[i].k !== ';') break;
      sep = toks[i].k;
      i = nextSig(toks, i);
      if (i < 0) break;
      if ((toks[i].k === 'w' || toks[i].k === 'n') && matchBook(toks, i, lookup)) break;
    }

    if (first) {
      // No numbers at all — a whole book, but only when the reader wrote
      // enough of the name to mean it. Two letters (`is`, `so`, `am`) are
      // ordinary English words far more often than they are books.
      if (m.end - m.start >= 3 || m.words > 1) {
        out.push(mk(code, null, null, null, null, str.slice(m.start, m.end)));
      }
      return m.next;
    }
    return i;
  }

  function readGroup(toks, i, code, sep, lastChapter, lastHadVerse) {
    var n1 = toks[i].v, end = toks[i].e;
    var chapter = null, verse = null, verseEnd = null, chapterEnd = null;
    var j = nextSig(toks, i);
    // A colon with nothing after it is a half-typed reference, not a broken
    // one: `John 3:` is chapter 3 until the verse arrives.
    var k = (j >= 0 && toks[j].k === ':') ? nextSig(toks, j) : -1;

    if (k >= 0 && toks[k].k === 'n') {
      chapter = n1; verse = toks[k].v; end = toks[k].e;
      j = nextSig(toks, k);
    } else if (sep === ',' && lastHadVerse && lastChapter != null) {
      // `Exodus 13:2,12` — a comma after a verse lists another verse.
      chapter = lastChapter; verse = n1;
    } else if (ONE_CH[code]) {
      chapter = 1; verse = n1;
    } else {
      chapter = n1;
    }

    if (j >= 0 && toks[j].k === '-') {
      var a = nextSig(toks, j);
      if (a >= 0 && toks[a].k === 'n') {
        var afterA = nextSig(toks, a);
        if (afterA >= 0 && toks[afterA].k === ':') {
          var bTok = nextSig(toks, afterA);
          if (bTok >= 0 && toks[bTok].k === 'n') {
            // `2 Kings 6:31-7:20` — the range crosses a chapter line.
            chapterEnd = toks[a].v; verseEnd = toks[bTok].v; end = toks[bTok].e;
            j = nextSig(toks, bTok);
          }
        } else if (verse != null) {
          verseEnd = toks[a].v; end = toks[a].e; j = afterA;
        } else {
          chapterEnd = toks[a].v; end = toks[a].e; j = afterA;
        }
      }
    } else if (verse == null && j >= 0 && toks[j].k === 'n') {
      // `JOHN 3 16` — a space where a colon was meant.
      verse = toks[j].v; end = toks[j].e; j = nextSig(toks, j);
    }

    return { chapter: chapter, verse: verse, verseEnd: verseEnd,
             chapterEnd: chapterEnd, end: end, next: j };
  }

  function parseOne(input, opts) {
    var all = parse(input, opts);
    return all.length ? all[0] : null;
  }

  function nameOf(code, opts) {
    var rec = opts && opts.names && opts.names[code];
    var short = opts && opts.style === 'short';
    var t = BY_CODE[code];
    if (rec) {
      if (!short) return rec.name || rec.abbr || code;
      /* A pack's abbreviation is a mechanical truncation written by whatever
       * produced the source — the USFX packs all say "Jhn", "Psa", "Php" —
       * and it was going straight into the most prominent control on screen.
       * Where the pack names a book the same way this app does, the pack is
       * English and this app's abbreviation is the better one: John, Ps,
       * Phil. Where it does not, the pack is in another language and its own
       * labels are the only ones its reader has ever seen, so they win. */
      if (t && rec.name === t.name) return t.abbr;
      return rec.abbr || rec.name || code;
    }
    if (!t) return code;
    return short ? t.abbr : t.name;
  }

  function formatOne(ref, opts) {
    if (!ref || !ref.code) return '';
    var s = nameOf(ref.code, opts);
    if (ref.chapter == null) return s;
    // A one-chapter book prints no chapter — `Jude 5`, never `Jude 1:5`.
    var bare = ONE_CH[ref.code] && ref.chapter === 1 && ref.chapterEnd == null;
    if (ref.verse == null) {
      return s + ' ' + ref.chapter + (ref.chapterEnd != null ? '-' + ref.chapterEnd : '');
    }
    s += ' ' + (bare ? '' : ref.chapter + ':') + ref.verse;
    // A crossed chapter needs a verse on the far side to read back as the same
    // range, so a reference built by hand without one is printed from verse 1.
    if (ref.chapterEnd != null) s += '-' + ref.chapterEnd + ':' + (ref.verseEnd == null ? 1 : ref.verseEnd);
    else if (ref.verseEnd != null) s += '-' + ref.verseEnd;
    return s;
  }

  function format(ref, opts) {
    if (!ref) return '';
    if (Object.prototype.toString.call(ref) === '[object Array]') {
      var parts = [];
      for (var i = 0; i < ref.length; i++) parts.push(formatOne(ref[i], opts));
      return parts.join('; ');
    }
    return formatOne(ref, opts);
  }

  // The lookup key for a whole typed name, with `I`, `First` and `1st` folded
  // to a digit exactly as the scanner folds them.
  function keyOf(text) {
    var toks = tokenize(String(text)), idx = [];
    for (var i = 0; i < toks.length && idx.length < MAX_WORDS; i++) {
      if (toks[i].k === 'w' || toks[i].k === 'n') idx.push(i);
    }
    return idx.length ? joinKey(toks, idx) : key(text);
  }

  function book(nameOrCode) {
    if (nameOrCode == null) return null;
    return LOOKUP[keyOf(nameOrCode)] || LOOKUP[key(nameOrCode)] || null;
  }

  function books() {
    var out = [];
    for (var i = 0; i < TABLE.length; i++) {
      var t = TABLE[i];
      out.push({ code: t.code, name: t.name, abbr: t.abbr, order: t.order, sect: t.sect });
    }
    return out;
  }

  // What the reader may be part-way through typing. Ranked exact, then by
  // prefix, then by where the book sits on the shelf — so `phil` offers
  // Philippians (whose usual abbreviation it IS) before Philemon, and offers
  // Philemon at all, which a single answer could not.
  function suggest(partial, opts) {
    // `1 ki`, `I Cor`, `1st Sam` — fold the leading numeral the same way a
    // parsed name is folded.
    var q = partial == null ? '' : keyOf(partial);
    if (!q) return [];

    var lookup = lookupFor(opts), i;
    var keysFor = Object.create(null), k;
    for (k in lookup) (keysFor[lookup[k]] || (keysFor[lookup[k]] = [])).push(k);

    var hits = [];
    for (i = 0; i < TABLE.length; i++) {
      var code = TABLE[i].code, cands = keysFor[code] || [], score = -1;
      for (var j = 0; j < cands.length; j++) {
        if (cands[j] === q) { score = 0; break; }
        if (cands[j].indexOf(q) === 0) score = score < 0 ? 1 : Math.min(score, 1);
        else if (score < 0 && cands[j].indexOf(q) > 0) score = 2;
      }
      if (score >= 0) hits.push({ code: code, score: score, order: TABLE[i].order });
    }
    hits.sort(function (a, b) { return a.score - b.score || a.order - b.order; });
    var out = [];
    for (i = 0; i < hits.length; i++) out.push(hits[i].code);
    return out;
  }

  root.GifosRefs = {
    parse: parse, parseOne: parseOne, format: format,
    book: book, books: books, suggest: suggest,
    oneChapter: function (code) { return !!ONE_CH[code]; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
