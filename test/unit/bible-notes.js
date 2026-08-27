// A verse note is a sheet with a textarea. window.prompt is silent in the
// sandbox (no allow-modals), so that must not be the writing surface.
//
// Run: node test/unit/bible-notes.js
'use strict';
const fs = require('fs');
const path = require('path');

const bible = path.join(__dirname, '..', '..', 'apps', 'bible');
const read = (p) => fs.readFileSync(path.join(bible, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

const html = read('index.html');
const css = read('style.css');
const reader2 = read('js/reader2.js');
const reader = read('js/reader.js');
const storeSrc = read('js/store.js');
const help = read('help.md');

ok(/id="sheet-note"/.test(html) && /id="note-text"/.test(html) &&
   /id="note-save"/.test(html),
   'the page has a note sheet with a textarea and Save');
ok(/#note-text/.test(css) || /\.sheet textarea/.test(css),
   'the note box is styled as a writing surface');
ok(/Reader\.prototype\.editNote/.test(reader2) && /openSheet\('sheet-note'\)/.test(reader2),
   'Note opens the sheet, not a browser dialog');
ok(!/prompt\(/.test(reader2),
   'the verse-note path does not call prompt (the sandbox never shows it)');
ok(/saveNote/.test(reader) && /note-save/.test(reader),
   'Save on the note sheet is wired');
ok(/write in the sheet/.test(help),
   'Help says the note is written in the sheet that opens');
ok(/id="note-all-trans" checked/.test(html) &&
   /Every translation of this verse/.test(html),
   'Every translation is a checkbox, on by default');
ok(/Every translation of this\s+verse/.test(help),
   'Help says a note is on every translation unless you uncheck');

const vm = require('vm');
const g = { Date, Promise, Object, Math, String };
g.globalThis = g;
vm.runInNewContext(storeSrc, g);
const Store = g.GifosBibleStore.Store;
const noteText = g.GifosBibleStore.noteText;
const ref = { code: 'JHN', chapter: 3, verse: 16 };

const s = new Store();
s.setNote(ref, 'for the world')
  .then(() => s.marks())
  .then((rows) => {
    ok(rows.length === 1 && rows[0].note === 'for the world' && !rows[0].notes,
       'a note with the box ticked is on the verse, not a pack');
    ok(noteText(rows[0], 'engwebp') === 'for the world' &&
       noteText(rows[0], 'eng-kjv2006') === 'for the world',
       'that note is what every translation of the verse shows');
    return s.setNote(ref, 'WEB rendering', { pack: 'engwebp' });
  })
  .then(() => s.marks())
  .then((rows) => {
    ok(rows.length === 1 && rows[0].note === 'for the world' &&
       rows[0].notes.engwebp === 'WEB rendering',
       'unchecking keeps a this-translation overlay and leaves the others');
    ok(noteText(rows[0], 'engwebp') === 'WEB rendering' &&
       noteText(rows[0], 'eng-kjv2006') === 'for the world',
       'the overlay wins only on that translation');
    return s.setNote(ref, 'one note everywhere', { fromPack: 'engwebp' });
  })
  .then(() => s.marks())
  .then((rows) => {
    ok(rows.length === 1 && rows[0].note === 'one note everywhere' && !rows[0].notes,
       'ticking the box again is one note on every translation');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
