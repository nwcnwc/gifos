// Search finds what the page shows.
//
// A pack stores each verse with its marks INLINE — a note anchor, a red-letter
// boundary, a poetry break sit between the words. Search used to run over those
// stored bytes, so any phrase crossing a mark was unfindable: WEB Genesis 1:1
// is stored "In the beginning, God<NOTE> created…", and typing that sentence
// returned nothing. A third of WEB's verses and two thirds of KJV's carry at
// least one mark, so this was not an edge.
//
// The contract this pins: Render.searchable(body) has the SAME LINE COUNT as
// the body, and its line N is exactly the readable verse N normalised the same
// way. Both halves matter — the first is what makes a hit's line number a verse
// index, the second is what makes a visible phrase findable.
//
// Run: node test/unit/bible-search-marks.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'bible');
const PACKS = path.join(ROOT, 'site', 'apps', 'bible', 'packs');

// The marks a pack may carry inside a verse (render.js's vocabulary).
const MARK_CODES = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0e, 0x0f, 0x10, 0x11];
const MARKS = new RegExp('[' + MARK_CODES.map((c) => String.fromCharCode(c)).join('') + ']');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '\n      ' + detail : ''));
  if (!cond) failures++;
}

// ---- load render.js the way the app does ------------------------------------
const g = { console, Math, JSON, Object, String, RegExp };
g.window = g; g.globalThis = g;
vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(APP, 'js', 'render.js'), 'utf8'), g,
  { filename: 'render.js' });
const Render = g.GifosBibleRender;

check('render.js exports searchable()', typeof Render.searchable === 'function');
if (typeof Render.searchable !== 'function') { console.log('\n1 FAILED'); process.exit(1); }

// ---- read a GBP2 pack (pack.js's container, in node) ------------------------
function openPack(file) {
  const raw = fs.readFileSync(file);
  if (raw.subarray(0, 4).toString('latin1') !== 'GBP2') throw new Error('not GBP2: ' + file);
  const all = zlib.inflateRawSync(raw.subarray(4));
  const hlen = all.readUInt32LE(0);
  const header = JSON.parse(all.subarray(4, 4 + hlen).toString('utf8'));
  let at = 4 + hlen;
  const sec = {};
  for (const k of ['body', 'layout', 'heads', 'notes', 'xrefs']) {
    sec[k] = all.subarray(at, at + header.sec[k]).toString('utf8');
    at += header.sec[k];
  }
  return { header, body: sec.body };
}

// The two the app seals as builtins — the ones a stranger searches first. The
// full pack shelf is 139 files; walking all of them here would make a unit
// suite a minute long for no extra guarantee.
const BUILTIN = ['engwebp.gbp', 'eng-kjv2006.gbp'];
const packs = BUILTIN.filter((f) => fs.existsSync(path.join(PACKS, f)));
check('the sealed translations are present to search', packs.length === BUILTIN.length,
  'looked for ' + BUILTIN.join(', ') + ' in ' + PACKS);

// Sentences that were unfindable before searchable() existed. Each is checked
// two ways: findable now, and (where it is the mark that hid it) genuinely
// absent from the raw bytes, so the guard cannot pass vacuously.
const REGRESSIONS = {
  'engwebp.gbp': ['In the beginning, God created the heavens and the earth'],
  'eng-kjv2006.gbp': ['The LORD is my shepherd; I shall not want'],
};

for (const file of packs) {
  const { body } = openPack(path.join(PACKS, file));
  const hay = Render.searchable(body);

  const bodyLines = body.split('\n');
  const hayLines = hay.split('\n');
  check(file + ': the search body keeps the body\'s line count',
    bodyLines.length === hayLines.length,
    bodyLines.length + ' verses vs ' + hayLines.length + ' search lines');

  // Every verse, as the reader sees it, must BE its search line. This is the
  // whole guarantee; sampling would miss exactly the rare mark that caused it.
  let mismatch = null, marked = 0;
  for (let i = 0; i < bodyLines.length; i++) {
    if (MARKS.test(bodyLines[i])) marked++;
    if (mismatch) continue;
    const readable = Render.searchable(Render.plain(bodyLines[i]));
    if (readable !== hayLines[i]) {
      mismatch = 'verse ' + i + '\n      page:   ' + JSON.stringify(readable) +
                 '\n      search: ' + JSON.stringify(hayLines[i]);
    }
  }
  check(file + ': every verse reads the same on the page and in the search body',
    !mismatch, mismatch);
  check(file + ': inline marks are common enough that this matters', marked > bodyLines.length / 10,
    marked + ' of ' + bodyLines.length + ' verses');
  console.log('       (' + marked + ' of ' + bodyLines.length + ' verses carry an inline mark — ' +
    (100 * marked / bodyLines.length).toFixed(1) + '%)');

  for (const phrase of REGRESSIONS[file] || []) {
    const label = '"' + phrase.slice(0, 40) + '…"';
    check(file + ': ' + label + ' is findable',
      hay.indexOf(Render.searchable(phrase)) >= 0);
    check(file + ': ' + label + ' really was hidden by a mark (guard is not vacuous)',
      body.toLowerCase().indexOf(phrase.toLowerCase()) < 0,
      'the raw body already contained it — pick a phrase that crosses a mark');
  }
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
