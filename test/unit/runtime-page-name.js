// The runtime is run.html; meet.html is a PERMANENT shim. Both halves of that
// deal are load-bearing and both fail SILENTLY, so pin them here.
//
// Background: the runtime page was named meet.html until it stopped being only a
// meeting (one-runtime made the same page the solo app runner, the app-room host
// and the broadcast skin). Renaming it to run.html leaves two traps:
//
//  1. meet.html must keep existing and must redirect RELATIVELY. Invite links in
//     the wild point at it — buildJoinUrl's non-prod form is
//     <origin>/meet.html#j=<code>&relay=…, handed to every user on a CUSTOM RELAY
//     (a pretty /join/… path has nowhere to carry &relay=) and to every
//     self-hosted deploy. A '/run.html' absolute redirect would work at the root
//     and silently escape a /versions/<x.y.z>/ snapshot to the edge build.
//
//  2. The channel loaders must keep addressing SNAPSHOTS as meet.html. A rename
//     cannot reach into a FROZEN build: every snapshot ever cut ships its runtime
//     as meet.html, and 0.8.x additionally ships an OLD, unrelated run.html (the
//     pre-one-runtime app runner). A loader that "helpfully" says run.html would
//     404 a pinned 0.9.x user and load the WRONG PAGE for a pinned 0.8.x user —
//     with nothing anywhere saying why.
//
// Neither trap raises an error at build time or in a normal local click-through;
// they only show up as a stranger's dead invite link. Hence a unit pin.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

const read = (p) => fs.readFileSync(path.join(SITE, p), 'utf8');

// ---- 1. the runtime itself -------------------------------------------------
check('run.html exists — it IS the runtime', fs.existsSync(path.join(SITE, 'run.html')));
check('meet.html still exists — invite links in the wild point at it',
  fs.existsSync(path.join(SITE, 'meet.html')));

const shim = read('meet.html');
// The redirect must be RELATIVE. Inside /versions/<x.y.z>/ this is the whole
// difference between staying on the frozen build and jumping to the edge one.
check('the shim redirects to a RELATIVE run.html (never /run.html)',
  /location\.replace\(\s*['"]run\.html['"]/.test(shim) && !/location\.replace\(\s*['"]\/run\.html/.test(shim),
  (shim.match(/location\.replace\([^)]*\)/) || [''])[0]);
check('the shim carries the hash across — every invite capability lives there',
  /location\.hash/.test(shim));
check('the shim carries the query across', /location\.search/.test(shim));
// A scraper runs no JS, so the shim never redirects for it: it must unfurl on
// its own or a shared meet.html link previews as a blank page.
check('the shim keeps a link-preview card (scrapers never follow the redirect)',
  /og:image/.test(shim) && /og:title/.test(shim));
check('the shim is tiny — a redirect, not a second copy of the runtime',
  shim.length < 6000, shim.length + ' bytes');

// ---- 2. snapshots are addressed as meet.html, in EVERY channel loader ------
// The loaders build `here`, and to() prefixes /versions/<v> onto it. Whatever
// filename appears there must exist inside a frozen build.
for (const page of ['index.html', 'boot.html', 'run.html']) {
  const src = read(page);
  const loader = src.slice(src.indexOf('function pinTarget'), src.indexOf('window.gifosPinTarget'));
  check(page + ': the channel loader was found', loader.length > 200);
  check(page + ": snapshot targets say meet.html (a frozen build has no run.html)",
    /['"]\/meet\.html#/.test(loader));
  check(page + ': the loader never sends a pinned user to /versions/<v>/run.html',
    !/['"]\/run\.html/.test(loader));
}

// The root pages are reachable as real files; a pinned user lands on
// /versions/<v>/meet.html, so the archive script must snapshot BOTH names.
const archive = fs.readFileSync(path.join(ROOT, 'scripts', 'archive-version.sh'), 'utf8');
const required = (archive.match(/^REQUIRED=\(([^)]*)\)/m) || [, ''])[1];
check('archive-version.sh snapshots run.html', /\brun\.html\b/.test(required), required.trim());
check('archive-version.sh snapshots the meet.html shim too — pinned invite links need it',
  /\bmeet\.html\b/.test(required), required.trim());

// ---- 3. the offline shell serves both ---------------------------------------
const sw = fs.readFileSync(path.join(SITE, 'sw.js'), 'utf8');
const core = sw.slice(sw.indexOf('var CORE = ['), sw.indexOf('];', sw.indexOf('var CORE = [')));
check('sw.js precaches run.html (the runtime must open in airplane mode)', /'\/run\.html'/.test(core));
check('sw.js precaches meet.html (an old invite link must open offline too)', /'\/meet\.html'/.test(core));

// ---- 4. newly minted links use the new name ---------------------------------
const runtime = fs.readFileSync(path.join(SITE, 'js', 'runtime.js'), 'utf8');
// CODE only: the comments in here legitimately discuss the legacy meet.html#…
// form (that is what the shim exists for), so strip // lines before asserting —
// otherwise this pins prose instead of behavior.
const build = runtime
  .slice(runtime.indexOf('function buildJoinUrl'), runtime.indexOf('GifOS.links ='))
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
check('buildJoinUrl mints run.html hash links, not the legacy name',
  /run\.html#/.test(build) && !/meet\.html#/.test(build));

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
