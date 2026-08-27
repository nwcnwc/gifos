// The apparatus glue: given gifos.assets that returns the real packs, a verse
// query yields TSK, Matthew Henry, and — where the original-language text
// exists — an interlinear line whose Strong’s numbers look up.
//
// Run: node test/unit/bible-apparatus.js
'use strict';
const { readFileSync } = require('node:fs');
const { join, basename } = require('node:path');

const root = join(__dirname, '..', '..');
const packs = join(root, 'site', 'apps', 'bible', 'packs');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

globalThis.gifos = {
  assets(path) {
    const b = readFileSync(join(packs, basename(path)));
    return Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
};

require(join(root, 'apps', 'bible', 'js', 'helps.js'));
require(join(root, 'apps', 'bible', 'js', 'lexicon.js'));
require(join(root, 'apps', 'bible', 'js', 'apparatus.js'));
const App = globalThis.GifosBibleApparatus;

function waitUntil(fn, ms) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      if (fn()) return resolve();
      if (Date.now() - t0 > ms) return reject(new Error('timeout waiting for packs'));
      setTimeout(tick, 40);
    })();
  });
}

function sectionsFor(ref) {
  const got = [];
  App.forVerse(ref, (s) => got.push(s));
  return new Promise((resolve) => {
    waitUntil(() => App.shelf.has('xrefs') && App.shelf.has('mhcc') &&
                    App.lexicons.length >= 2 && App.interlinears.length >= 3, 30000)
      .then(() => setTimeout(() => resolve(got), 50));
  });
}

(async () => {
  App.start();
  await waitUntil(() => App.shelf.has('plans') && App.lexicons.length >= 2 &&
                        App.interlinears.length >= 3, 30000);

  ok(App.plans().length >= 3, App.plans().length + ' reading plans on the shelf');
  ok(App.planDay('mcheyne', 1) && App.planDay('mcheyne', 1).readings.length > 0,
     "M'Cheyne day 1 has readings");
  ok(App.lookup('Aaron').length > 0, 'dictionary lookup through the apparatus');
  ok(App.lookupStrong('H430') && App.lookupStrong('G26'),
     'both Strong’s dictionaries answer through lookupStrong');

  const jhn = await sectionsFor({ code: 'JHN', chapter: 1, verse: 1 });
  const ids = jhn.map((s) => s.id);
  ok(ids.indexOf('xrefs') >= 0, 'John 1:1 has Treasury of Scripture Knowledge');
  ok(ids.indexOf('mhcc') >= 0, 'John 1:1 has Matthew Henry');
  ok(ids.some((id) => id.indexOf('int-') === 0), 'John 1:1 has an interlinear line');
  ok(ids.some((id) => id.indexOf('str-') === 0), "John 1:1 has Strong’s numbers");
  const tsk = jhn.find((s) => s.id === 'xrefs');
  ok(tsk && tsk.items.some((it) => it.ref), 'TSK items include tap-able references');

  const gen = await sectionsFor({ code: 'GEN', chapter: 1, verse: 1 });
  const wlc = gen.find((s) => s.id === 'int-wlc');
  ok(!!wlc, 'Genesis 1:1 has the WLC interlinear');
  ok(wlc && /Open Scriptures/i.test(wlc.items.map((i) => i.text).join(' ')),
     'the WLC section carries the CC BY attribution');

  const empty = [];
  App.forVerse({ code: 'GEN', chapter: 1, verse: 1 }, (s) => empty.push(s.id));
  ok(empty.indexOf('xrefs') >= 0, 'a second query is answered from packs already open');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
