// Kindle-style span highlights: selecting words shows a floating colour bar.
//
// The assertions are STRUCTURAL — the bar is in the page, the painter can wrap
// a range, the store writes a span record. No verse text is asserted.
// The store merge is exercised for real (in-memory, no DOM).
//
// Run: node test/unit/bible-highlight.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const bible = path.join(root, 'apps', 'bible');
const read = (p) => fs.readFileSync(path.join(bible, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

const html = read('index.html');
const css = read('style.css');
const render = read('js/render.js');
const store = read('js/store.js');
const reader = read('js/reader.js');
const boot = read('js/boot.js');
const help = read('help.md');

ok(/id="hl-bar"/.test(html) && /data-hl="amber"/.test(html) && /data-act="copy"/.test(html),
   'the page carries a floating highlight bar with colours and Copy');
ok(/user-select:\s*text/.test(css) && /#hl-bar/.test(css) && /mark\.hl-span/.test(css),
   'the chapter is selectable and span marks have colour');
ok(/wrapOffsets:\s*wrapOffsets/.test(render) && /extractContents/.test(render) &&
   /function collectText/.test(render),
   'the painter wraps a character range as one mark, not one mark per word');
ok(/function wrapOffsetsAcross/.test(render) && /wrapOffsetsAcross:\s*wrapOffsetsAcross/.test(render),
   'a highlight that sits in neighbouring verses of one paragraph is one mark');
ok(/Store\.prototype\.setSpan/.test(store) && /kind: spec\.fn != null \? 'fn' : 'span'/.test(store),
   'the store writes a span record (and a footnote range as kind fn)');
ok(/verseEnd/.test(store) && /spanEndVerse/.test(store) && /mergeSpanBounds/.test(store),
   'a stored span may run from one verse into another');
ok(/selectionchange/.test(reader) && /showHighlightBar/.test(reader) &&
   /applySpanHighlights/.test(reader),
   'selecting text opens the bar, and painted verses wear saved spans');
ok(/spec\.verseEnd = ref1\.verse/.test(reader) && /_paintSpan/.test(reader),
   'a selection across verses becomes one spec and paints as one run');
ok(/rec\.kind === 'span' \|\| rec\.kind === 'fn'/.test(reader),
   'a span highlight does not also wash the whole verse (that stacked two opacities)');
ok(/keepScroll/.test(reader) && /keepScroll:\s*true/.test(boot),
   'rewriting a highlight holds the scroll position instead of jumping to the top');
ok(/select any words/.test(help) && /Kindle/.test(help) && /crosses a verse/.test(help),
   'Help says to select words, the way a Kindle does, across verses');

const reader3 = read('js/reader3.js');
ok(/id="sheet-colours"/.test(html) && /id="cn-amber"/.test(html) &&
   /id="colour-save"/.test(html),
   'the page has a highlight-names sheet with a field per colour and Save');
ok(/openSheet\('sheet-colours'\)/.test(reader3) && /saveColours/.test(reader3),
   'Rename opens the sheet and Save writes the names');
ok(!/prompt\(/.test(reader3),
   'renaming colours does not call prompt (the sandbox never shows it)');
ok(/write the names in the sheet/.test(help),
   'Help says the colour names are written in the sheet');
ok(/colour-save/.test(reader),
   'Save on the colour-names sheet is wired');

const g = { Date, Promise, Object, Math, String };
g.globalThis = g;
vm.runInNewContext(store, g);
const Store = g.GifosBibleStore.Store;
const base = { pack: 'engwebp', code: 'JHN', chapter: 1 };

function spansOf(s) {
  return s.marks().then((rows) => rows.filter((r) => r.kind === 'span'));
}

const s = new Store();
s.setSpan(Object.assign({ verse: 1, start: 10, verseEnd: 2, end: 15, quote: 'ab' }, base), 'amber')
  .then(() => spansOf(s))
  .then((rows) => {
    ok(rows.length === 1 && rows[0].verse === 1 && rows[0].verseEnd === 2 &&
       rows[0].start === 10 && rows[0].end === 15,
       'one selection that crosses a verse is stored as one span');
    return s.setSpan(Object.assign({ verse: 3, start: 0, end: 12, quote: 'c' }, base), 'amber');
  })
  .then(() => spansOf(s))
  .then((rows) => {
    ok(rows.length === 1 && rows[0].verse === 1 && rows[0].verseEnd === 3 &&
       rows[0].start === 10 && rows[0].end === 12,
       'the same colour on the next verse is swallowed into that one run');
    const s2 = new Store();
    return s2.setSpan(Object.assign({ verse: 1, start: 0, end: 8, quote: 'a' }, base), 'amber')
      .then(() => s2.setSpan(Object.assign({ verse: 3, start: 0, end: 8, quote: 'c' }, base), 'amber'))
      .then(() => spansOf(s2));
  })
  .then((rows) => {
    ok(rows.length === 2, 'a skipped verse stays two highlights');
    const s3 = new Store();
    return s3.setSpan(Object.assign({ verse: 1, start: 0, end: 20, quote: 'a' }, base), 'amber')
      .then(() => s3.setSpan(Object.assign({ verse: 1, start: 10, verseEnd: 2, end: 6, quote: 'ab' }, base), 'rose'))
      .then(() => spansOf(s3));
  })
  .then((rows) => {
    ok(rows.length === 1 && rows[0].colour === 'rose' && rows[0].verseEnd === 2,
       'a different colour on an overlapping run replaces it');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
