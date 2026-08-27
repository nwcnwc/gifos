// GBX1 round-trip: the lexicon and interlinear packs the build wrote must
// open in the reader's own code, answer a Strong's number with its lemma,
// and address a verse the paired translation pack also addresses.
//
// No definition TEXT is asserted as scholarship — only that the fields exist,
// that TWOT gloss values from the Hebrew source XML never reached a packed
// field (the same wall build-lexicon.mjs enforces), and that a verse query
// returns words whose Strong's numbers look up.
//
// Run: node test/unit/bible-lexicon.js
'use strict';
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', '..');
const packs = join(root, 'site', 'apps', 'bible', 'packs');
const cache = join(root, 'apps', 'bible', '.cache', 'orig', 'strongs');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

require(join(root, 'apps', 'bible', 'js', 'pack.js'));
require(join(root, 'apps', 'bible', 'js', 'lexicon.js'));
const { open: openPack } = globalThis.GifosBiblePack;
const { open: openLex, normalize } = globalThis.GifosBibleLexicon;

(async () => {
  const loadLex = (f) => openLex(readFileSync(join(packs, f)));
  const loadPack = (id) => openPack(readFileSync(join(packs, id + '.gbp')));

  ok(normalize('00430', 'H') === 'H430' &&
     normalize('H0430') === 'H430' &&
     normalize('1254 a', 'H') === 'H1254' &&
     normalize('G0026') === 'G26',
     'Strong’s numbers fold to one spelling');

  const h = await loadLex('lex-strongs-h.gbx');
  const g = await loadLex('lex-strongs-g.gbx');
  ok(h.prefix === 'H' && h.header.kind === 'lexicon',
     `Hebrew lexicon opens (${h.header.count} entries)`);
  ok(g.prefix === 'G' && g.header.kind === 'lexicon',
     `Greek lexicon opens (${g.header.count} entries)`);
  ok(h.header.count > 8000 && g.header.count > 5000,
     'both dictionaries are the size Strong’s dictionaries are');

  const elohim = h.lookup('H430');
  ok(elohim && elohim.lemma && /אלהים|אֱלֹהִים/.test(elohim.lemma),
     'H430 is Elohim: ' + (elohim && elohim.lemma));
  ok(elohim && elohim.definition, 'H430 carries Strong’s own definition');

  const agape = g.lookup('G26');
  ok(agape && agape.lemma && agape.lemma.indexOf('ἀγ') >= 0,
     'G26 is agape: ' + (agape && agape.lemma));
  ok(g.lookup('26') && g.lookup('26').num === 'G26',
     'a number on a Greek lexicon is that Greek number');
  ok(h.lookup('G26') === null, 'a Greek number does not answer in the Hebrew dictionary');
  ok(h.search('god', 5).length > 0, 'an English hunt in the Hebrew dictionary hits');
  ok(g.search('love', 5).length > 0, 'an English hunt in the Greek dictionary hits');

  // THE TWOT WALL, re-checked against the source XML when the cache is here.
  const xmlPath = join(cache, 'StrongHebrewG.xml');
  if (existsSync(xmlPath)) {
    const xml = readFileSync(xmlPath, 'utf8');
    const values = new Set();
    for (const m of xml.matchAll(/\sgloss="([^"]*)"/g)) values.add(m[1]);
    let bad = 0;
    for (let i = 0; i < h.header.count; i++) {
      const e = h.at(i);
      for (const k of ['lemma', 'translit', 'pron', 'derivation', 'definition', 'kjv']) {
        const v = e[k];
        if (!v) continue;
        if (values.has(v) || /\bG:\d+\b/.test(v)) bad++;
      }
    }
    ok(values.size > 1000, `${values.size} TWOT gloss values in the source XML`);
    ok(bad === 0, 'none of those gloss values reached a packed Hebrew field');
  } else {
    ok(true, 'TWOT source XML is not cached here — wall checked at pack time');
  }

  const wlc = await loadLex('int-wlc.gbx');
  const byz = await loadLex('int-grcbyz.gbx');
  const tisch = await loadLex('int-grctisch.gbx');
  ok(wlc.header.kind === 'interlinear' && wlc.header.lang === 'hbo',
     'WLC interlinear opens, Hebrew, RTL pack: dir=' + wlc.dir);
  ok(byz.header.kind === 'interlinear' && byz.pairs === 'grcbyz',
     'Byzantine interlinear pairs with grcbyz');
  ok(tisch.header.kind === 'interlinear' && tisch.pairs === 'grc-tisch',
     'Tischendorf interlinear pairs with grc-tisch');

  const hbo = await loadPack('hboWLC');
  ok(wlc.verseCount === hbo.verseCount,
     `WLC interlinear and hboWLC share verseCount ${wlc.verseCount}`);
  ok(wlc.indexOfVerse('GEN', 1, 1) === hbo.indexOfVerse('GEN', 1, 1),
     'Genesis 1:1 is the same index in the interlinear and the translation');

  const gen1 = wlc.words('GEN', 1, 1);
  ok(gen1.length >= 6, `Genesis 1:1 has ${gen1.length} Hebrew words`);
  ok(gen1[0].surface && gen1[0].strong,
     'the first word carries a surface form and a Strong’s number: ' +
     gen1[0].surface + ' ' + gen1[0].strong);
  const firstH = h.lookup(gen1[0].strong);
  ok(!!firstH, gen1[0].strong + ' from Genesis 1:1 looks up in the Hebrew lexicon');
  ok(wlc.words('JHN', 1, 1).length === 0,
     'a New Testament verse in the WLC pack is empty, not borrowed');

  const jhn = byz.words('JHN', 1, 1);
  ok(jhn.length >= 10, `John 1:1 Byzantine has ${jhn.length} Greek words`);
  ok(jhn[0].parse, 'a Greek word carries a decoded parse: ' + jhn[0].parse);
  const firstG = g.lookup(jhn[0].strong);
  ok(!!firstG, jhn[0].strong + ' from John 1:1 looks up in the Greek lexicon');

  const tischJhn = tisch.words('JHN', 1, 1);
  ok(tischJhn.length >= 10, `John 1:1 Tischendorf has ${tischJhn.length} Greek words`);

  ok(wlc.attribution && /Open Scriptures/i.test(wlc.attribution),
     'the WLC pack carries the CC BY attribution the licence requires');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
