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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
