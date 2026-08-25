// ?run=<x> RESOLVES TO THE BYTES, NOT THE PAGE ABOUT THEM.
//
// resolveRunTarget (desktop.js handleRunParam) turns what a person pastes
// into the URL the GIF is actually fetched from. Three shapes must hold:
//   - a bare store slug → this origin's /apps/<slug>/<slug>.gif (the store's
//     one-copy layout; it resolves, never invents)
//   - a GitHub blob/raw link (what the address bar gives you) → the
//     raw.githubusercontent.com bytes, which carry CORS; the blob page is
//     HTML with no CORS and used to fail with "couldn't load that link"
//   - anything else is left exactly alone
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'js', 'desktop.js'), 'utf8');
const m = /\n  function resolveRunTarget\(raw\) \{[\s\S]*?\n  \}\n/.exec(src);
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
check('resolveRunTarget is in desktop.js', !!m);
const ctx = { location: { origin: 'https://gifos.app' } };
vm.createContext(ctx);
vm.runInContext(m[0] + '\nthis.resolveRunTarget = resolveRunTarget;', ctx);
const R = ctx.resolveRunTarget;
check('a store slug resolves to this origin\'s one copy', R('AnyRoad') === 'https://gifos.app/apps/anyroad/anyroad.gif', R('AnyRoad'));
const blob = 'https://github.com/nwcnwc/gifos/blob/main/site/apps/2048/2048.gif';
const raw = 'https://raw.githubusercontent.com/nwcnwc/gifos/main/site/apps/2048/2048.gif';
check('a GitHub blob link becomes the raw bytes link', R(blob) === raw, R(blob));
check('a GitHub /raw/ link becomes the raw bytes link too (its redirect loses CORS)',
  R('https://github.com/nwcnwc/gifos/raw/main/site/apps/2048/2048.gif') === raw);
check('www.github.com as well', R('https://www.github.com/nwcnwc/gifos/blob/main/x.gif') === 'https://raw.githubusercontent.com/nwcnwc/gifos/main/x.gif');
check('a branch with a slash keeps its whole path', R('https://github.com/o/r/blob/feat/x/y.gif') === 'https://raw.githubusercontent.com/o/r/feat/x/y.gif');
for (const u of [raw, 'https://example.com/my-app.gif', 'https://github.com/nwcnwc/gifos', 'https://github.com/nwcnwc/gifos/releases/download/v1/x.gif', 'https://gist.github.com/x/y']) {
  check('left alone: ' + u, R(u) === u, R(u));
}
check('a slug with a dot or slash is a URL, not a slug', R('example.com/x.gif') === 'example.com/x.gif');
console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
