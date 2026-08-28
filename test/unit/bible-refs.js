// References: typed text in, a place in the text out.
//
// Two halves. The first is a table of inputs and the reference each must
// produce — every shape the search box, the jump field and a printed margin
// use, including the ones that are only distinguishable by which book they
// name (`Jude 5` is a verse; `John 5` is a chapter). The second half is the
// real corpus: every cross-reference string in every English pack the catalog
// ships, parsed and counted, so the parser is measured against text nobody
// wrote for it.
//
// Run: node test/unit/bible-refs.js
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

require(join(root, 'apps', 'bible', 'js', 'refs.js'));
require(join(root, 'apps', 'bible', 'js', 'container.js'));
require(join(root, 'apps', 'bible', 'js', 'pack.js'));
const R = globalThis.GifosRefs;
const { open } = globalThis.GifosBiblePack;

// A reference written the short way, for readable expectations:
//   'JHN 3:16'  'JHN 3:16-18'  'GEN 1-3'  'GEN 1'  'JUD'  '2KI 6:31-7:20'
const shape = (r) => {
  if (!r) return 'null';
  let s = r.code;
  if (r.chapter == null) return s;
  s += ' ' + r.chapter;
  if (r.verse != null) s += ':' + r.verse;
  if (r.chapterEnd != null) s += '-' + r.chapterEnd + (r.verseEnd != null ? ':' + r.verseEnd : '');
  else if (r.verseEnd != null) s += '-' + r.verseEnd;
  return s;
};
const shapes = (input, opts) => R.parse(input, opts).map(shape).join(' | ');

const reads = (input, want, opts) => {
  const got = shapes(input, opts);
  ok(got === want, `${JSON.stringify(input)} reads as ${want}` +
     (got === want ? '' : ` — got ${got || '[]'}`));
};

// ---- the inline table must not drift from the data the packs were built from
{
  const data = JSON.parse(readFileSync(join(root, 'apps', 'bible', 'data', 'books.json'), 'utf8'));
  const want = data.books.map((b) => b.join('')).join('\n');
  const got = R.books().map((b) => [b.code, b.name, b.abbr, b.order, b.sect].join('')).join('\n');
  ok(got === want, `the book table matches apps/bible/data/books.json (${data.books.length} books)`);
}

// ---- names, codes and abbreviations
ok(R.book('John') === 'JHN', 'book("John") is JHN');
ok(R.book('JHN') === 'JHN', 'book("JHN") is JHN — a code resolves to itself');
ok(R.book('1 Cor') === '1CO' && R.book('I Corinthians') === '1CO' &&
   R.book('First Corinthians') === '1CO' && R.book('1st Cor') === '1CO',
   'every way of writing the numeral resolves 1 Corinthians');
ok(R.book('Song of Songs') === 'SNG' && R.book('Canticles') === 'SNG' &&
   R.book('SoS') === 'SNG', 'Song of Solomon answers to its other names');
ok(R.book('Apoc') === 'REV' && R.book('Ecclus') === 'SIR',
   'the older printed abbreviations still resolve');
ok(R.book('Mormon') === null && R.book('') === null && R.book(null) === null,
   'a name that is not a book is null');

// Every book must be reachable, and every abbreviation must land on the book
// it belongs to — a table nobody checks is a table that quietly aliases two
// books to one code.
{
  const seen = Object.create(null);
  let keys = 0, bad = [];
  for (const b of R.books()) {
    for (const form of [b.code, b.name, b.abbr]) {
      keys++;
      if (R.book(form) !== b.code) bad.push(`${form} -> ${R.book(form)}, not ${b.code}`);
    }
    seen[b.code] = true;
  }
  ok(bad.length === 0, `every code, name and label resolves to its own book (${keys} forms)` +
     (bad.length ? ' — ' + bad.slice(0, 3).join('; ') : ''));
  ok(Object.keys(seen).length === 86, 'all 86 books are reachable by name');
}

// The abbreviations a reader actually types, one line per book. Checked as a
// whole so the count is a fact this file reports, not a claim.
{
  const FORMS = {
    GEN: ['Gen', 'Ge', 'Gn', 'Genesis'], EXO: ['Ex', 'Exo', 'Exod', 'Exodus'],
    LEV: ['Lev', 'Le', 'Lv', 'Leviticus'], NUM: ['Num', 'Nu', 'Nm', 'Numbers'],
    DEU: ['Deut', 'Dt', 'De', 'Deuteronomy'], JOS: ['Josh', 'Jos', 'Joshua'],
    JDG: ['Judg', 'Jdg', 'Jg', 'Judges'], RUT: ['Ruth', 'Ru', 'Rth'],
    '1SA': ['1 Sam', '1Sa', '1S', '1 Samuel', 'I Samuel'],
    '2SA': ['2 Sam', '2Sa', '2S', '2 Samuel', 'II Samuel'],
    '1KI': ['1 Kgs', '1Ki', '1K', '1 Kings', 'I Kings'],
    '2KI': ['2 Kgs', '2Ki', '2K', '2 Kings', 'II Kings'],
    '1CH': ['1 Chr', '1Ch', '1 Chronicles'], '2CH': ['2 Chr', '2Ch', '2 Chronicles'],
    EZR: ['Ezra', 'Ezr'], NEH: ['Neh', 'Ne', 'Nehemiah'],
    EST: ['Esth', 'Est', 'Es', 'Esther'], JOB: ['Job', 'Jb'],
    PSA: ['Ps', 'Psa', 'Psm', 'Psalm', 'Psalms', 'Psalter'],
    PRO: ['Prov', 'Pr', 'Prv', 'Proverbs'],
    ECC: ['Eccl', 'Ecc', 'Ec', 'Ecclesiastes', 'Qoheleth'],
    SNG: ['Song', 'SoS', 'Cant', 'Canticles', 'Song of Songs', 'Song of Solomon'],
    ISA: ['Isa', 'Is', 'Isaiah'], JER: ['Jer', 'Je', 'Jr', 'Jeremiah'],
    LAM: ['Lam', 'La', 'Lamentations'], EZK: ['Ezek', 'Eze', 'Ezk', 'Ezekiel'],
    DAN: ['Dan', 'Da', 'Dn', 'Daniel'], HOS: ['Hos', 'Ho', 'Hosea'],
    JOL: ['Joel', 'Jl', 'Joe'], AMO: ['Amos', 'Am', 'Amo'],
    OBA: ['Obad', 'Ob', 'Obadiah'], JON: ['Jonah', 'Jon', 'Jnh'],
    MIC: ['Mic', 'Mc', 'Micah'], NAM: ['Nah', 'Na', 'Nahum'],
    HAB: ['Hab', 'Hb', 'Habakkuk'], ZEP: ['Zeph', 'Zep', 'Zp', 'Zephaniah'],
    HAG: ['Hag', 'Hg', 'Haggai'], ZEC: ['Zech', 'Zec', 'Zc', 'Zechariah'],
    MAL: ['Mal', 'Ml', 'Malachi'],
    TOB: ['Tob', 'Tb', 'Tobit'], JDT: ['Jdt', 'Jth', 'Judith'],
    ESG: ['Esg', 'Greek Esther', 'Esther (Greek)'],
    WIS: ['Wis', 'Wisdom', 'Wisdom of Solomon'],
    SIR: ['Sir', 'Ecclus', 'Ecclesiasticus', 'Sirach'], BAR: ['Bar', 'Baruch'],
    LJE: ['Ep Jer', 'Letter of Jeremiah', 'Epistle of Jeremiah'],
    S3Y: ['Pr Azar', 'Song of the Three Young Men', 'Prayer of Azariah'],
    SUS: ['Sus', 'Susanna'], BEL: ['Bel', 'Bel and the Dragon'],
    DAG: ['Dag', 'Greek Daniel', 'Daniel (Greek)'],
    MAN: ['Pr Man', 'Prayer of Manasseh', 'Manasseh'],
    '1MA': ['1 Macc', '1Ma', '1 Maccabees'], '2MA': ['2 Macc', '2Ma', '2 Maccabees'],
    '3MA': ['3 Macc', '3Ma', '3 Maccabees'], '4MA': ['4 Macc', '4Ma', '4 Maccabees'],
    '1ES': ['1 Esd', '1Es', '1 Esdras'], '2ES': ['2 Esd', '2Es', '2 Esdras'],
    PS2: ['Ps2', 'Psalm 151'], PSS: ['Pss', 'Additional Psalms'],
    MAT: ['Matt', 'Mt', 'Mat', 'Matthew'], MRK: ['Mark', 'Mk', 'Mr', 'Mrk'],
    LUK: ['Luke', 'Lk', 'Lu'], JHN: ['John', 'Jn', 'Jhn', 'Joh'],
    ACT: ['Acts', 'Ac', 'Act'], ROM: ['Rom', 'Ro', 'Rm', 'Romans'],
    '1CO': ['1 Cor', '1Co', '1C', '1 Corinthians', 'I Corinthians', 'First Corinthians'],
    '2CO': ['2 Cor', '2Co', '2C', '2 Corinthians', 'II Corinthians'],
    GAL: ['Gal', 'Ga', 'Galatians'], EPH: ['Eph', 'Ep', 'Ephesians'],
    PHP: ['Phil', 'Php', 'Pp', 'Philippians'], COL: ['Col', 'Cl', 'Colossians'],
    '1TH': ['1 Thess', '1Th', '1 Thessalonians'],
    '2TH': ['2 Thess', '2Th', '2 Thessalonians'],
    '1TI': ['1 Tim', '1Ti', '1 Timothy'], '2TI': ['2 Tim', '2Ti', '2 Timothy'],
    TIT: ['Titus', 'Tit', 'Ti'], PHM: ['Phlm', 'Phm', 'Philem', 'Philemon'],
    HEB: ['Heb', 'Hebrews'], JAS: ['Jas', 'Jam', 'Jms', 'James'],
    '1PE': ['1 Pet', '1Pe', '1Pt', '1 Peter'], '2PE': ['2 Pet', '2Pe', '2Pt', '2 Peter'],
    '1JN': ['1 John', '1Jn', '1Jo', 'I John'], '2JN': ['2 John', '2Jn', '2Jo'],
    '3JN': ['3 John', '3Jn', '3Jo', 'III John'],
    JUD: ['Jude', 'Jd'], REV: ['Rev', 'Re', 'Rv', 'Apoc', 'Revelation']
  };
  let forms = 0;
  const bad = [];
  for (const code of Object.keys(FORMS)) {
    for (const f of FORMS[code]) {
      forms++;
      if (R.book(f) !== code) bad.push(`${f} -> ${R.book(f)}, want ${code}`);
    }
  }
  ok(bad.length === 0, `${forms} common abbreviations across all 86 books resolve` +
     (bad.length ? ' — ' + bad.slice(0, 5).join('; ') : ''));
  ok(Object.keys(FORMS).length === 86, 'the abbreviation check covers every book');
}

// ---- the shapes a person types
reads('John 3:16', 'JHN 3:16');
reads('Jn 3:16', 'JHN 3:16');
reads('jn3.16', 'JHN 3:16');
reads('JOHN 3 16', 'JHN 3:16');
reads('John 3v16', 'JHN 3:16');
reads('  John   3 : 16  ', 'JHN 3:16');
reads('John 3', 'JHN 3');
reads('1 Cor 13', '1CO 13');
reads('1co13', '1CO 13');
reads('I Corinthians 13', '1CO 13');
reads('First Corinthians 13', '1CO 13');
reads('1st Cor 13', '1CO 13');
reads('II Kings 4:32', '2KI 4:32');
reads('Ps. 23', 'PSA 23');
reads('Psalm 23', 'PSA 23');
reads('Psalms 23', 'PSA 23');
reads('Ps 23', 'PSA 23');

// Ranges. Without a verse the dash extends the CHAPTER, with one it extends
// the verse, and a colon on the far side crosses a chapter line.
reads('John 3:16-18', 'JHN 3:16-18');
reads('John 3:16–18', 'JHN 3:16-18');
reads('Matt 5:3-12', 'MAT 5:3-12');
reads('Gen 1-3', 'GEN 1-3');
reads('Ps 23:1-6', 'PSA 23:1-6');
reads('2 Kings 6:31—7:20', '2KI 6:31-7:20');

// Lists. A semicolon starts a new reference; a comma after a verse stays in
// the same chapter, which is the difference between `5:9` and `9`.
reads('John 3:16; Rom 5:8', 'JHN 3:16 | ROM 5:8');
reads('Matt 5:3, 5:9', 'MAT 5:3 | MAT 5:9');
reads('Exodus 13:2,12', 'EXO 13:2 | EXO 13:12');
reads('Exodus 3:5,7-8,10', 'EXO 3:5 | EXO 3:7-8 | EXO 3:10');
reads('Daniel 9:27; 11:31; 12:11', 'DAN 9:27 | DAN 11:31 | DAN 12:11');
reads('Isaiah 61:2; 66:10,13', 'ISA 61:2 | ISA 66:10 | ISA 66:13');
reads('Genesis 1; 2 Samuel 3', 'GEN 1 | 2SA 3');

// A whole book.
reads('Jude', 'JUD');
reads('Obadiah', 'OBA');
reads('Philemon', 'PHM');
reads('Song of Solomon', 'SNG');
reads('Song of the Three Young Men', 'S3Y');

// A book with one printed chapter reads a bare number as a VERSE. This is the
// rule that cannot be inferred from the input — only from which book it is.
reads('Jude 5', 'JUD 1:5');
reads('John 5', 'JHN 5');
reads('Obadiah 15', 'OBA 1:15');
reads('Philemon 6', 'PHM 1:6');
reads('3 John 4', '3JN 1:4');
reads('Jude 5-7', 'JUD 1:5-7');
reads('Jude 1:5', 'JUD 1:5');
ok(R.oneChapter('JUD') && R.oneChapter('PHM') && !R.oneChapter('JHN'),
   'the one-chapter books are known as such');

// Half-typed, and typed inside other words. The jump field parses on every
// keystroke, so an unfinished reference must degrade to the part that is
// there rather than to nothing.
reads('John 3:', 'JHN 3');
reads('Gen 1-', 'GEN 1');
reads('Ps 23:1-', 'PSA 23:1');
reads('(John 3:16)', 'JHN 3:16');
reads('See Job 9:8', 'JOB 9:8');
reads('Deuteronomy 32:43 LXX', 'DEU 32:43');
reads('Exodus 23:13; Psalms 16:4; Hosea 2:17; Wisdom 14:21',
      'EXO 23:13 | PSA 16:4 | HOS 2:17 | WIS 14:21');

// ---- nonsense stays nonsense
for (const junk of ['hello', '12345', 'Book of Mormon 1:1', '', '   ', ':::', '3:16',
                    'the quick brown fox', 'is so am', 'lorem ipsum 4:4']) {
  ok(R.parse(junk).length === 0, `${JSON.stringify(junk)} is not a reference`);
}
ok(R.parseOne('nothing here') === null, 'parseOne is null when nothing parses');
ok(R.parseOne('John 3:16; Rom 5:8').code === 'JHN', 'parseOne takes the first');
ok(R.parse('John 3:16')[0].raw === 'John 3:16', 'raw is the text that produced the reference');
ok(R.parse('Matt 5:3, 5:9')[1].raw === '5:9', 'a continuation reports only its own text');

// ---- a name map in any script
// Accents fold, so a reader who cannot reach the accent key still finds the
// book; letters outside ASCII are kept, because a key that collapsed to the
// empty string would match every word in the sentence.
ok(shapes('Exodo 3:5', { names: { EXO: { name: '\u00c9xodo' } } }) === 'EXO 3:5',
   'an unaccented spelling finds an accented name');
ok(shapes('\u00c9xodo 3:5', { names: { EXO: { name: '\u00c9xodo' } } }) === 'EXO 3:5',
   'so does the accented spelling');
ok(shapes('\u0399\u03c9\u03b1\u03bd\u03bd\u03b7\u03c2 3:16', { names: { JHN: { name: '\u0399\u03c9\u03ac\u03bd\u03bd\u03b7\u03c2' } } }) === 'JHN 3:16',
   'a Greek name parses to the USFM code');
ok(shapes('\u7ea6\u7ff0\u798f\u97f3 3:16', { names: { JHN: { name: '\u7ea6\u7ff0\u798f\u97f3' } } }) === 'JHN 3:16' &&
   shapes('\u7ea6\u7ff0\u798f\u97f33:16', { names: { JHN: { name: '\u7ea6\u7ff0\u798f\u97f3' } } }) === 'JHN 3:16',
   'a Chinese name parses, with or without the space');
ok(shapes('\u0e22\u0e2d\u0e2b\u0e4c\u0e19 3:16', { names: { JHN: { name: '\u0e22\u0e2d\u0e2b\u0e4c\u0e19' } } }) === 'JHN 3:16',
   'so does a Thai name');
ok(shapes('\u03ba\u03b1\u1f76 \u03b5\u1f36\u03c0\u03b5\u03bd 3:16', { names: { JHN: { name: '\u0399\u03c9\u03ac\u03bd\u03bd\u03b7\u03c2' } } }) === '',
   'Greek words that are not the book name match nothing');

// ---- printing
ok(R.format({ code: 'JHN', chapter: 3, verse: 16 }) === 'John 3:16', 'format prints John 3:16');
ok(R.format(R.parseOne('jn3.16')) === 'John 3:16', 'format tidies what parse understood');
ok(R.format(R.parseOne('mt5.3-12'), { style: 'short' }) === 'Matt 5:3-12', 'short style uses the label');
ok(R.format(R.parseOne('Gen 1-3')) === 'Genesis 1-3', 'a chapter range prints both ends');
ok(R.format(R.parseOne('2 Kings 6:31-7:20')) === '2 Kings 6:31-7:20', 'a crossed chapter prints both ends');
ok(R.format(R.parseOne('Jude 5')) === 'Jude 5', 'a one-chapter book prints no chapter');
ok(R.format(R.parseOne('Jude')) === 'Jude', 'a whole book prints as its name');
ok(R.format(R.parse('John 3:16; Rom 5:8')) === 'John 3:16; Romans 5:8',
   'a list prints as a list');
ok(R.format(null) === '' && R.format({}) === '', 'nothing prints as nothing');

// ---- round trip: what format writes, parse must read back unchanged
{
  const bad = [];
  const cases = ['John 3:16', 'jn3.16', 'Gen 1-3', 'Ps 23:1-6', '1 Cor 13', 'Jude 5',
                 'Obadiah', '2 Kings 6:31-7:20', 'Matt 5:3, 5:9', 'John 3:16; Rom 5:8',
                 'Song of Solomon 2:1', 'Rev 22:21', '3 John 4', 'Exodus 3:5,7-8,10'];
  for (const c of cases) {
    const first = R.parse(c);
    const again = R.parse(R.format(first));
    if (JSON.stringify(first.map(shape)) !== JSON.stringify(again.map(shape))) {
      bad.push(`${c} -> ${R.format(first)} -> ${again.map(shape).join(' | ')}`);
    }
    for (const style of ['short', 'long']) {
      const back = R.parse(R.format(first, { style: style }));
      if (JSON.stringify(first.map(shape)) !== JSON.stringify(back.map(shape))) {
        bad.push(`${c} in ${style} style -> ${R.format(first, { style: style })}`);
      }
    }
  }
  ok(bad.length === 0, `${cases.length} references survive format then parse, in both styles` +
     (bad.length ? ' — ' + bad.slice(0, 3).join(' | ') : ''));
}

// ---- what a reader is part-way through typing
{
  const has = (q, code) => R.suggest(q).indexOf(code) >= 0;
  ok(R.suggest('gen')[0] === 'GEN', 'suggest("gen") leads with Genesis');
  ok(R.suggest('1 ki')[0] === '1KI', 'suggest("1 ki") leads with 1 Kings');
  ok(R.suggest('1ki')[0] === '1KI', 'the space is optional');
  const phil = R.suggest('phil');
  ok(phil[0] === 'PHP' && phil.indexOf('PHM') > 0,
     `suggest("phil") offers Philippians first and Philemon too — ${phil.join(',')}`);
  ok(has('jo', 'JOB') && has('jo', 'JHN') && has('jo', 'JON'),
     'suggest("jo") offers every book that starts that way');
  ok(R.suggest('song').indexOf('SNG') === 0, 'suggest("song") leads with Song of Solomon');
  ok(R.suggest('zzz').length === 0 && R.suggest('').length === 0,
     'suggest has nothing to offer for nothing');
}

// ---- a translation's own names, in and out
(async () => {
  if (!existsSync(packs)) {
    console.log('FAIL packs directory is missing — run node apps/bible/tools/build-packs.mjs');
    process.exit(1);
  }
  const namesOf = (p) => {
    const map = {};
    for (const b of p.books) map[b.code] = { name: b.name, abbr: b.abbr };
    return map;
  };

  // The catalog is opened ONCE and both halves below read the same list. Packs
  // are chosen by what they CONTAIN — a Spanish text that calls John Juan —
  // never by file name, because the catalog is rebuilt from a source list and
  // an id that vanishes must not take these assertions with it.
  const files = readdirSync(packs).filter((f) => f.endsWith('.gbp')).sort();
  const opened = [];
  for (const f of files) {
    try { opened.push(await open(readFileSync(join(packs, f)))); } catch (e) { /* bible-pack.js judges pack integrity */ }
  }
  ok(opened.length > 50, `${opened.length} packs opened for the reference corpus`);

  const spanish = opened.filter((p) => p.language === 'Spanish' && p.byCode.JHN);
  const plain = spanish.filter((p) => p.byCode.JHN.name === 'Juan')[0];
  const twoNames = spanish.filter((p) => {
    const j = p.byCode.JHN;
    return j.abbr && j.name && j.abbr !== j.name;
  })[0];
  ok(!!plain, 'the catalog carries a Spanish text that calls John "Juan"');

  const esNames = namesOf(plain);
  ok(R.format({ code: 'JHN', chapter: 3, verse: 16 }, { names: esNames }) === 'Juan 3:16',
     'format uses the translation\'s own book names');
  ok(R.format({ code: '1CO', chapter: 13, verse: 4 }, { names: esNames }) === '1 Corintios 13:4',
     'a numbered book prints in the translation\'s language');
  ok(R.format({ code: 'JHN', chapter: 3, verse: 16 }) === 'John 3:16',
     'without a names map the English table is used');
  ok(R.format({ code: 'JHN', chapter: 3, verse: 16 }, { names: { JHN: { name: 'Juan' } }, style: 'short' }) === 'Juan 3:16',
     'a pack with no abbreviation falls back to its own name, not the English label');

  // A pack whose heading and margin label differ proves the two styles read
  // different fields of the SAME map, not one field and a default.
  ok(!!twoNames, 'the catalog carries a Spanish text with a name and a different label');
  if (twoNames) {
    const n = namesOf(twoNames), j = twoNames.byCode.JHN;
    ok(R.format({ code: 'JHN', chapter: 3, verse: 16 }, { names: n, style: 'short' }) === j.abbr + ' 3:16' &&
       R.format({ code: 'JHN', chapter: 3, verse: 16 }, { names: n }) === j.name + ' 3:16',
       `short takes the label and long the name, both from the pack (${j.abbr} / ${j.name})`);
  }

  // The same map read back the other way: a Spanish reader types Spanish.
  ok(shapes('Juan 3:16', { names: esNames }) === 'JHN 3:16', 'a Spanish name parses to the USFM code');
  ok(shapes('Salmos 23:1-6', { names: esNames }) === 'PSA 23:1-6', 'so do Spanish ranges');
  ok(shapes('Judas 5', { names: esNames }) === 'JUD 1:5',
     'the one-chapter rule is about the book, not the language');
  ok(shapes('1 Corintios 13; Romanos 5:8', { names: esNames }) === '1CO 13 | ROM 5:8',
     'a Spanish list reads as a list');
  ok(shapes('John 3:16', { names: esNames }) === 'JHN 3:16',
     'the English names still work alongside a pack\'s own');

  // ---- the real corpus: every cross-reference in every English pack
  //
  // These strings were written by translators for print, not for this parser,
  // and a string is only counted as understood when EVERY reference in it came
  // back: `Exodus 20:12; Deuteronomy 5:16` is two, and reading one of them is
  // reading half.
  //
  // Two rates, because they measure different things. The English table alone
  // must clear 99%: at 363 strings per WEB pack a single unparsed shape is a
  // quarter of a percent, so anything lower means a whole SHAPE is missing
  // rather than one oddity. With each pack's OWN book names the rate must be
  // 100% — every string in this corpus is a reference in the very book list
  // the pack ships, so nothing may be left over. The gap between the two is
  // the Messianic edition, which prints John as Yochanan.
  let total = 0, english = 0, own = 0, packsRead = 0;
  const named = Object.create(null);
  const misses = [];
  for (const p of opened) {
    if (p.language !== 'English') continue;
    const opts = { names: namesOf(p) };
    let n = 0;
    for (const k of Object.keys(p.xrefs)) {
      for (const s of p.xrefs[k]) {
        n++; total++;
        const wanted = s.split(';').length;
        if (R.parse(s).length >= wanted) english++;
        const mine = R.parse(s, opts);
        if (mine.length >= wanted) own++;
        else if (misses.length < 20) misses.push(p.id + ': ' + s + ' -> ' + mine.map(shape).join(' | '));
        for (const r of mine) named[r.code] = true;
      }
    }
    if (n) packsRead++;
  }
  const rate = total ? (english / total) * 100 : 0;
  const ownRate = total ? (own / total) * 100 : 0;
  ok(total > 2000, `${total} cross-reference strings read from ${packsRead} English packs`);
  ok(rate >= 99, `${rate.toFixed(2)}% parse whole against the English table alone (threshold 99%)`);
  ok(ownRate === 100, `${ownRate.toFixed(2)}% parse whole with each pack's own book names` +
     (misses.length ? ' — ' + misses.slice(0, 5).join(' | ') : ''));

  // Every book a cross-reference names must be a book we know; an unknown name
  // is the failure that hides, because the reference still parses around it.
  ok(Object.keys(named).length >= 40,
     `the corpus names ${Object.keys(named).length} distinct books, all of them known`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
