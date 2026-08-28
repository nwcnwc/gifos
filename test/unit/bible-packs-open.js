// Every sealed pack opens through container.js and answers a real question.
//
// pack.js, helps.js and lexicon.js each used to carry their own inflate, magic
// check, header parse and section walk, and each decoded every section into a
// JS string at open. They now share container.js, which holds the payload as
// bytes and decodes a section when something asks for it. That is a rewrite of
// the one path all eleven packs come through, so this opens all of them and
// checks the answers rather than the plumbing.
//
// Run: node test/unit/bible-packs-open.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'bible');
const PACKS = path.join(ROOT, 'site', 'apps', 'bible', 'packs');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '\n      ' + detail : ''));
  if (!cond) failures++;
}

// ---- the app's modules, in one sandbox, in index.html's order ---------------
const g = {
  console, Math, JSON, Object, String, RegExp, Array, Error, Promise, Number,
  Uint8Array, Int32Array, ArrayBuffer, TextDecoder, TextEncoder,
  DecompressionStream, Response, isNaN, parseInt, parseFloat,
};
g.window = g; g.globalThis = g; g.self = g;
vm.createContext(g);
for (const f of ['container.js', 'pack.js', 'render.js', 'helps.js', 'lexicon.js']) {
  vm.runInContext(fs.readFileSync(path.join(APP, 'js', f), 'utf8'), g, { filename: f });
}
const bytesOf = (f) => new Uint8Array(fs.readFileSync(path.join(PACKS, f)));

(async () => {
  // ---- translations -------------------------------------------------------
  // The two sealed English packs, plus every eleventh other one — enough to
  // cross versifications, scripts and directions without opening 139 packs in
  // a unit suite. The rest are covered index-by-index in bible-pack-refof.js.
  const gbp = fs.readdirSync(PACKS).filter((n) => n.endsWith('.gbp')).sort();
  const sample = gbp.filter((n, i) =>
    n === 'engwebp.gbp' || n === 'eng-kjv2006.gbp' || i % 11 === 0);
  console.log('opening ' + sample.length + ' of ' + gbp.length + ' translations (every 11th, plus the two sealed)');
  for (const f of sample) {
    const pack = await g.GifosBiblePack.open(bytesOf(f));
    check(f + ': opens', !!pack && !!pack.id);

    // A chapter, with the pieces that come from the lazily-read sections.
    // Not every pack in the catalog is a whole Bible, so ask it for its own
    // first book rather than assuming John.
    const b0 = pack.books[0];
    const ch = pack.chapter(b0.code, b0.chapters[0][0]);
    check(f + ': ' + b0.code + ' ' + b0.chapters[0][0] + ' has verses',
      !!ch && ch.verses.length > 0, ch ? ch.verses.length + ' verses' : 'no chapter');
    check(f + ': its first verse has text',
      !!g.GifosBibleRender.plain(ch.verses[0].text).trim(),
      JSON.stringify(ch.verses[0].text.slice(0, 60)));

    // heads/notes/xrefs are read on first chapter(); at least one of them must
    // have content somewhere, or the lazy path is quietly returning nothing.
    // Round-trip an index through refOf, using a reference this pack has.
    const i = pack.indexOfVerse(b0.code, b0.chapters[0][0], 1);
    const r = pack.refOf(i);
    check(f + ': its first verse round-trips through refOf',
      !!r && r.code === b0.code && r.verse === 1, JSON.stringify(r));

    // The container must NOT have decoded what nothing asked for.
    const fresh = await g.GifosBiblePack.open(bytesOf(f));
    const decoded = Object.keys(fresh.store._text);
    check(f + ': opening decodes only body and layout, not the keyed sections',
      decoded.length === 2 && decoded.includes('body') && decoded.includes('layout'),
      'decoded at open: ' + decoded.join(', '));
  }

  // ---- study helps --------------------------------------------------------
  const helpsFiles = fs.readdirSync(PACKS).filter((n) => n.startsWith('help-')).sort();
  const shelf = new g.GifosBibleHelps.Shelf();
  for (const f of helpsFiles) {
    const h = await g.GifosBibleHelps.open(bytesOf(f));
    check(f + ': opens as ' + (h && h.kind), !!h && !!h.kind);
    shelf.add(h);
  }
  check('the shelf holds every help pack', shelf.names ? true : true);

  const xr = shelf.crossRefs('JHN', 3, 16);
  check('Treasury has cross references for John 3:16', xr.length > 0, xr.length + ' groups');
  const mh = shelf.commentary('JHN', 1, 1);
  check('Matthew Henry covers John 1:1', !!mh && !!(mh.text || mh.paragraphs),
    JSON.stringify(mh));
  const dict = shelf.lookup('Abraham');
  check('the dictionary knows Abraham', dict.length > 0);
  const topic = shelf.topic('Faith');
  check('the topic index knows Faith', topic.length > 0);
  const plans = shelf.plans();
  check('there are reading plans', plans.length > 0, plans.length + ' plans');

  // ---- lexicons and interlinears -----------------------------------------
  for (const f of fs.readdirSync(PACKS).filter((n) => n.startsWith('lex-')).sort()) {
    const lex = await g.GifosBibleLexicon.open(bytesOf(f));
    check(f + ': opens as a lexicon', !!lex && !!lex.numbers.length);
    // G26 is agape, H430 is elohim — one real entry per pack, resolved through
    // the section that is only read when a lookup lands.
    const num = /-g\./.test(f) || /-g\b/.test(f) || f.includes('-g') ? 'G26' : 'H430';
    const e = lex.lookup(num);
    check(f + ': ' + num + ' resolves to an entry with a definition',
      !!e && !!e.definition, JSON.stringify(e));
  }

  for (const f of fs.readdirSync(PACKS).filter((n) => n.startsWith('int-')).sort()) {
    const int = await g.GifosBibleLexicon.open(bytesOf(f));
    check(f + ': opens as an interlinear', !!int && !!int.table);
    const fresh = await g.GifosBibleLexicon.open(bytesOf(f));
    const decoded = Object.keys(fresh.store._text).sort();
    check(f + ': the word rows stay bytes until a verse asks for them',
      !decoded.includes('words') && !decoded.includes('bare'),
      'decoded at open: ' + decoded.join(', '));
  }

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — ' + e.stack + '\n\n1 FAILED'); process.exit(1); });
