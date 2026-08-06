// THE OFFLINE DESKTOP MUST BE WHOLE — every script index.html parses is in the
// service worker's precache.
//
// sw.js's CORE list is HAND-MAINTAINED, and its own header claims it precaches
// "every js/ module". A script added to the desktop and forgotten here is
// invisible until someone opens their computer on a plane: the page still
// parses, so nothing throws at build time and no browser test notices, but the
// module is simply absent and whatever it powers is quietly dead offline.
//
// That happened the day the Ed25519 fallback landed: js/gifos-ed.js was added
// to every shell page and to no cache list, so an offline desktop would have
// had no signature verification at all (gifos-sign.js resolves GifOS.ed
// lazily, and there would have been nothing to resolve).
//
// SCOPE, deliberately: index.html — THE desktop, the page whose whole promise
// is that it works with no network. run.html is precached as a PAGE but its
// meeting stack (gifos-net, mesh*) is deliberately NOT in CORE: a meeting needs
// a connection by definition, and dragging the mesh into every phone's shell
// buys nothing. If that ever changes, widen this guard with it.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };

const sw = fs.readFileSync(path.join(ROOT, 'site', 'sw.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');

const core = (sw.match(/var CORE = \[([\s\S]*?)\];/) || [])[1] || '';
check('sw.js exposes a CORE precache list', core.length > 50);

const scripts = [...new Set((idx.match(/src="(js\/[^"]+)"/g) || []).map((m) => m.replace(/^src="|"$/g, '')))];
check('index.html parses a plausible number of js modules', scripts.length >= 8, scripts.length);

const missing = scripts.filter((s) => core.indexOf("'/" + s + "'") === -1);
check('every js module the DESKTOP parses is precached (offline desktop is whole)',
  missing.length === 0, missing);

// The reverse direction is not an error — CORE legitimately holds modules other
// shell pages need (store.js, runtime.js) — but a CORE entry pointing at a file
// that no longer exists silently half-breaks the precache, so name those.
const stale = (core.match(/'\/js\/[^']+'/g) || [])
  .map((q) => q.slice(1, -1))
  .filter((p2) => !fs.existsSync(path.join(ROOT, 'site', p2.replace(/^\//, ''))));
check('every js module CORE names still exists', stale.length === 0, stale);

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
