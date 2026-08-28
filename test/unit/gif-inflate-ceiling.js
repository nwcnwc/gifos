// Inflate ceiling: abort a small payload that expands (zip bomb). A large
// App GIF the person already downloaded may unpack in proportion to its size.
//
// Run: node test/unit/gif-inflate-ceiling.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-gif.js'), 'utf8');
const g = { Uint8Array, TextEncoder, TextDecoder, console };
g.window = g;
g.globalThis = g;
vm.createContext(g);
vm.runInContext(src, g, { filename: 'gifos-gif.js' });
const cap = g.GifOS.gif.inflateMaxBytes;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '  ' + detail : ''));
  if (!cond) failures++;
}

const MB = 1024 * 1024;
const FLOOR = 64 * MB;
const HARD = 2 * 1024 * 1024 * 1024 - 1;

check('a tiny payload is still capped at 64 MB (the bomb)',
  cap(1024) === FLOOR && cap(0) === FLOOR);
check('a 16 MB compressed payload may unpack up to 256 MB',
  cap(16 * MB) === 16 * 16 * MB);
check('a 500 MB GIF may unpack up to the 2 GB−1 hard cap, not 16×500 MB',
  cap(500 * MB) === HARD);
check('the 64 MB floor still covers every in-repo app',
  cap(3 * MB) === FLOOR);
check('inflateMaxBytes is exported so the ceiling can be asserted',
  typeof cap === 'function');

console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
process.exit(failures ? 1 : 0);
