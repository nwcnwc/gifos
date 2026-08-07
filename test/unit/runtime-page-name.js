// The runtime is run.html and there is NO meet.html — the shim died on the
// no-shims flag day (Nathan, 2026-08-05: "we are prelaunch, no compatibility
// shims"). This test used to pin the OPPOSITE deal (a permanent shim +
// loaders addressing snapshots as meet.html); it now pins the flag day, and
// every check is an ANTI-RESURRECTION guard: each would fail silently in a
// normal click-through and only surface as a stranger's dead link or a
// service worker that never installs.
//
// The flag day's deliberate losses, recorded so nobody "fixes" them back:
//  - Links minted as meet.html#… before the 2026-08-04 rename are dead
//    (404 → the router → home).
//  - Snapshots cut BEFORE 0.9.3 ship their runtime as meet.html and are no
//    longer loader-addressable (the loaders say run.html, PERIOD — a
//    per-version filename table is exactly the compat rot we refuse).
//    Prelaunch; nobody real is pinned.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// CODE only: comments legitimately discuss the dead meet.html by name (the
// flag day is documented in place). Strip comment lines before asserting, so
// these pins hit behavior, not prose.
const code = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|#|\*|<!--)/.test(l)).join('\n');

// ---- 1. the runtime, and the shim's grave ----------------------------------
check('run.html exists — it IS the runtime', fs.existsSync(path.join(SITE, 'run.html')));
check('meet.html does NOT exist at the root — the shim stays dead',
  !fs.existsSync(path.join(SITE, 'meet.html')));

// ---- 2. every channel loader addresses snapshots as run.html ---------------
// sign.html is in this list because it ships a loader, not because anyone
// remembered it: WHO ships one is discovered mechanically in
// test/unit/channel-loader.js, which also proves all four are the same code.
for (const page of ['site/index.html', 'site/boot.html', 'site/run.html', 'site/sign.html']) {
  const s = code(read(page));
  check(page + ': no code path builds a meet.html address', !/['"`]\/?meet\.html/.test(s));
  check(page + ': the loader builds run.html targets', /['"]\/run\.html#/.test(s) || /\/run\.html/.test(s));
}

// ---- 3. the offline shell and the router -----------------------------------
const sw = code(read('site/sw.js'));
check('sw.js precaches run.html (the runtime must open in airplane mode)', /'\/run\.html'/.test(sw));
check('sw.js does NOT precache meet.html (a dead precache URL fails the whole SW install)',
  !/meet\.html/.test(sw));
check('the 404 router emits run.html for pretty routes and never meet.html',
  /run\.html#v=/.test(read('site/404.html')) && !/['"`]\/?meet\.html/.test(code(read('site/404.html'))));

// ---- 4. the cut script neither requires nor ships a root shim --------------
const archive = read('scripts/archive-version.sh');
const required = (archive.match(/^REQUIRED=\(([^)]*)\)/m) || [, ''])[1];
check('archive-version.sh snapshots run.html', /\brun\.html\b/.test(required), required.trim());
check('archive-version.sh does not expect a root meet.html', !/\bmeet\.html\b/.test(required), required.trim());

// ---- 5. newly minted links use the real name -------------------------------
const runtime = read('site/js/runtime.js');
const build = code(runtime.slice(runtime.indexOf('function buildJoinUrl'), runtime.indexOf('GifOS.links =')));
check('buildJoinUrl mints run.html hash links, never the dead name',
  /run\.html#/.test(build) && !/meet\.html#/.test(build));

// ---- 6. frozen snapshots are untouched (their meet.html is THEIRS) ---------
const vdir = path.join(SITE, 'versions');
const snaps = fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((v) => fs.statSync(path.join(vdir, v)).isDirectory()) : [];
const withMeet = snaps.filter((v) => fs.existsSync(path.join(vdir, v, 'meet.html')));
check('pre-flag-day snapshots still ship their own meet.html untouched (frozen means frozen)',
  snaps.length === 0 || withMeet.length > 0, 'snapshots=' + snaps.length + ' with-meet=' + withMeet.length);

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
