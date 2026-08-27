// Kindle-style span highlights: selecting words shows a floating colour bar.
//
// The assertions are STRUCTURAL — the bar is in the page, the painter can wrap
// a range, the store writes a span record. No verse text is asserted.
//
// Run: node test/unit/bible-highlight.js
'use strict';
const fs = require('fs');
const path = require('path');

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
const help = read('help.md');

ok(/id="hl-bar"/.test(html) && /data-hl="amber"/.test(html) && /data-act="copy"/.test(html),
   'the page carries a floating highlight bar with colours and Copy');
ok(/user-select:\s*text/.test(css) && /#hl-bar/.test(css) && /mark\.hl-span/.test(css),
   'the chapter is selectable and span marks have colour');
ok(/wrapOffsets:\s*wrapOffsets/.test(render) && /function collectText/.test(render),
   'the painter can wrap a character range, skipping verse numbers');
ok(/Store\.prototype\.setSpan/.test(store) && /kind: spec\.fn != null \? 'fn' : 'span'/.test(store),
   'the store writes a span record (and a footnote range as kind fn)');
ok(/selectionchange/.test(reader) && /showHighlightBar/.test(reader) &&
   /applySpanHighlights/.test(reader),
   'selecting text opens the bar, and painted verses wear saved spans');
ok(/select any words/.test(help) && /Kindle/.test(help),
   'Help says to select words, the way a Kindle does');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
