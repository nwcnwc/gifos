// EVERY SHIPPED SCRIPT PARSES. Nothing clever — it compiles each .js file the
// site serves and fails on the first one a browser could not read.
//
// This exists because mesh-pipe.js shipped to the live edge build unparseable
// (2026-08-11). Its worker source is a template literal spanning ~260 lines,
// and a comment added inside it wrote a word in `backticks` — which closed the
// string early and turned the rest of the comment into code. The media pipe was
// dead on gifos.app, and NOTHING caught it:
//
//   * Review cannot see it. Backticks in a comment are correct JavaScript
//     everywhere except inside a template literal, and the opening backtick was
//     250 lines up the file.
//   * The suite that owns that file, test/unit/mesh-pipe.js, went RED in the
//     most dangerous way there is — `require` threw at load, so it exited
//     non-zero having asserted NOTHING. Exactly the "cannot LAUNCH is red, not
//     absent" case in CLAUDE.md. It also hid a second rot: a source-scan pinned
//     to literals a refactor had replaced months earlier.
//   * Every browser suite still passed. A page whose script dies loads fine;
//     it just quietly does less, and only the feature that needed that file
//     notices — in a live room, on someone else's phone.
//
// Cheap enough to never think about again: no servers, no browser, ~60 files.
// site/versions/ is deliberately skipped — those are FROZEN archived builds,
// and a release cut long ago is not something this gate may fail on.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '../../site');
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + x : '')); if (!c) fails++; };

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'versions') walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(ROOT, []).sort();
check('there are shipped scripts to check at all', files.length > 20, files.length + ' file(s)');

// Compiling is parsing WITHOUT running: new vm.Script throws on a syntax error
// and executes nothing, so a file that touches window at load is still safe to
// check here. Classic-script goal, which is what the site serves (no ES module
// is loaded from site/js — a bare `export` here would be a real finding).
const broken = [];
for (const f of files) {
  const rel = path.relative(ROOT, f);
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: rel }); }
  catch (e) { broken.push(rel + ' — ' + String((e && e.message) || e)); }
}
check('every script the site serves parses', broken.length === 0, broken.join(' | ') || files.length + ' file(s) clean');

console.log(fails ? ('\n' + fails + ' FAILURE(S)') : '\nALL PASS');
process.exit(fails ? 1 : 0);
