// A suite that wants "a default app I can mount" must never pick a SYSTEM
// launcher — and must not keep its own list of which those are.
//
// THE BUG THIS GUARDS, which has now bitten twice in one day. A system app's
// runApp is a page NAVIGATION (runtime.js SYSTEM_PAGES: meet/video -> run.html,
// broadcast -> run.html#bc=1, store -> store.html), not an app mounted into
// '#appmount iframe'. A suite that picks one waits 30s for an iframe on a page
// that has navigated away, then dies having produced ZERO assertions — DEAD, the
// colour that looks like silence.
//
// It reads as a FLAKE rather than a failure, which is why it survives: the
// picker takes the FIRST match of allFiles(), so enumeration order alone decides
// whether you get a mountable app or a launcher.
//
//   0584279 (2026-08-03 11:31) added 'appstore' to four hand-kept lists after
//   e2e-meeting-app flaked on the seeded App Store launcher.
//   45233de (2026-08-03 15:32) — FOUR HOURS LATER — seeded Broadcast, and every
//   one of those freshly-fixed lists was stale again the same day. e2e-app-room
//   and e2e-solo-app were never in the 0584279 sweep at all, and e2e-app-room
//   went DEAD in the gate on 2026-08-05.
//
// So the list is DERIVED from site/js/sample-apps.js (test/lib/apps.js
// systemAppIds), and this test exists to keep it that way: a hand-kept copy is
// the defect, not the stale contents of one.
const fs = require('fs');
const path = require('path');
const { systemAppIds } = require('../lib/apps');

const ROOT = path.join(__dirname, '..', '..');
const TESTS = path.join(ROOT, 'test');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra ? '  [' + extra + ']' : ''));
  if (!c) failures++;
};

// ---- 1. the derivation itself still finds the launchers ----------------------
const ids = systemAppIds();
check('systemAppIds() parses the seeded launchers', ids.length > 0, ids.join(','));

// Every manifest in the site source that declares `system:` must appear. This is
// the half that catches a NEW launcher: seed a fifth one and it lands here for
// free — no test edit, which is the whole point.
const sampleSrc = fs.readFileSync(path.join(ROOT, 'site', 'js', 'sample-apps.js'), 'utf8');
const declared = [];
const re = /manifest\(\s*'([^']+)'[^;]*?\{[^{}]*\bsystem\s*:/g;
let m;
while ((m = re.exec(sampleSrc))) declared.push(m[1]);
const missing = declared.filter((d) => !ids.includes(d));
check('every system: manifest in sample-apps.js is in the derived list',
  missing.length === 0, missing.length ? 'missing ' + missing.join(',') : declared.join(','));

// 'video' is a pre-rename seed's appId — not minted any more, so it can never be
// re-derived from source, but desktops seeded before the rename still carry it.
check("the legacy 'video' appId is still excluded", ids.includes('video'));

// ---- 2. nobody keeps a hand-written copy of the list -------------------------
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = walk(TESTS, []).filter((f) => f !== path.join(TESTS, 'lib', 'apps.js') &&
  f !== path.join(TESTS, 'unit', 'system-app-picker.js'));

// A hand-kept exclusion list, in either shape it has historically taken: an
// array literal of appIds, or an alternation regex over them.
const HANDKEPT = [
  /\[\s*'meet'\s*,\s*'video'/,          // ['meet', 'video', ...].includes(appId)
  /\/\^?\(\s*meet\s*\|\s*video/,        // /^(meet|video)$/.test(appId)
];
const offenders = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const pat of HANDKEPT) {
    if (pat.test(src)) { offenders.push(path.relative(ROOT, f)); break; }
  }
}
if (offenders.length) {
  for (const o of offenders) {
    console.log('FAIL — ' + o + ' hand-keeps the system-launcher list; ' +
      "use require('../lib/apps').systemAppIds() instead");
    failures++;
  }
} else {
  check('no suite hand-keeps the system-launcher list', true, files.length + ' files scanned');
}

// ---- 3. a suite that MOUNTS an app must go through the helper ----------------
// The invariant that actually matters: if you wait for '#appmount iframe' AND
// you choose a file out of allFiles() BY ELIMINATION, you must exclude the
// launchers. Caught e2e-app-room and e2e-solo-app, which the 0584279 sweep
// missed entirely.
//
// A picker that NAMES its app (`f.appId === 'bible'`) is exempt and must stay
// exempt: it cannot land on a launcher by accident, and enumeration order is
// irrelevant to it. e2e-meet-app-guest-perms and swarm/meet.js pick that way.
const unguarded = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const mounts = src.includes('#appmount iframe');
  const picks = /allFiles\(\)/.test(src) && /isApp/.test(src);
  const byName = /appId\s*===/.test(src);
  if (mounts && picks && !byName && !src.includes('systemAppIds')) unguarded.push(path.relative(ROOT, f));
}
if (unguarded.length) {
  for (const u of unguarded) {
    console.log('FAIL — ' + u + ' picks an app out of allFiles() and waits for ' +
      "'#appmount iframe', but does not exclude the SYSTEM launchers " +
      '(they navigate instead of mounting — the suite would go DEAD, not red)');
    failures++;
  }
} else {
  check('every suite that mounts a picked app excludes the system launchers', true);
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
