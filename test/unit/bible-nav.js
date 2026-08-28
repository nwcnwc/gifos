// Jump history is not chapter-turn. Back/Forward retrace a Treasury link,
// a search hit, a book pick — ‹ › at the bottom still only turn chapters.
//
// Run: node test/unit/bible-nav.js
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
const reader = read('js/reader.js');
const reader2 = read('js/reader2.js');
const reader3 = read('js/reader3.js');
const help = read('help.md');

ok(/id="b-back"/.test(html) && /id="b-fwd"/.test(html) &&
   /id="b-prev"/.test(html) && /id="b-next"/.test(html),
   'the page has Back/Forward and chapter ‹ › as four distinct buttons');
ok(/id="hist"/.test(html) && /id="foot"/.test(html) &&
   html.indexOf('id="hist"') < html.indexOf('id="b-place"') &&
   html.indexOf('id="b-prev"') > html.indexOf('id="foot"'),
   'history sits in the header; chapter step sits in the footer');
ok(/\.hist-btn:disabled/.test(css),
   'Back and Forward look dim until there is a jump to retrace');

ok(/opts\.jump && !opts\.hist/.test(reader) && /recordJump/.test(reader),
   'go({jump:true}) records history; Back/Forward themselves do not');
ok(/Reader\.prototype\.step/.test(reader) &&
   !/prototype\.step[\s\S]{0,900}jump:\s*true/.test(reader),
   '‹ › calling step() do not record as jumps');
ok(/histLabel/.test(reader) && /if \(ref\.verse\) r\.verse = ref\.verse/.test(reader),
   'history labels omit verse 0 so a chapter landing is not “Jhn 1:0”');
ok(/altKey && ev\.key === 'ArrowLeft'/.test(reader) &&
   /altKey && ev\.key === 'ArrowRight'/.test(reader),
   'Alt+← / Alt+→ retrace jumps; bare arrows still turn chapters');
ok(/self\._back\.length\) self\.histBack/.test(reader),
   'the OS back button retraces a jump before it turns a chapter');

ok(/jump:\s*true/.test(reader) && /jump:\s*true/.test(reader2) &&
   /jump:\s*true/.test(reader3) && /jump:\s*true/.test(read('js/boot.js')),
   'picking a book, a search hit, a Treasury link, a mark, a plan, a launch — those jump');
ok(/silent:\s*true/.test(reader2) &&
   !/silent:\s*true[\s\S]{0,80}jump:\s*true/.test(reader2),
   'following a leader is silent and is not a jump');

ok(/Back and Forward/.test(help) && /not the next chapter/.test(help) &&
   /‹ and ›/.test(help),
   'Help names both navs and says they are not the same thing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
