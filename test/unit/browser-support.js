// THE SUPPORT MATRIX IS DATA, AND THE PAGE MUST NOT DRIFT FROM IT.
//
// site/browser-support.json is the single source of truth for which browsers
// can run which parts of GifOS. Two consumers read it: the human page
// (site/browser-support.html, which fetches it at runtime and therefore cannot
// drift), and the ES5 preflight inlined at the top of site/run.html, which
// CANNOT fetch anything — it runs before everything, on browsers that may have
// no Promise to fetch with — and so carries a GENERATED copy of the numbers.
//
// A generated-but-committed artifact with no drift gate is just a second copy
// waiting to disagree with the first, and the disagreement here is silent: a
// stale number makes one sentence subtly wrong on a screen nobody re-reads.
// So this runs `scripts/build-browser-support.mjs --check` in the gate, the
// same way e2e-app-store.js runs the App Store catalog's own --check.
//
// It also guards the shape of the thing: that the version numbers appear in
// run.html ONLY inside the generated block (a hand-maintained table creeping
// back beside the generated one is exactly how these rot), that every feature
// the matrix claims to cover is really covered for every browser, and that
// "unknown" stays honest — an unknown carrying a version number is somebody
// having guessed, which is the one thing this file exists to prevent.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const JSON_PATH = path.join(ROOT, 'site', 'browser-support.json');
const RUN = path.join(ROOT, 'site', 'run.html');
const PAGE = path.join(ROOT, 'site', 'browser-support.html');

let failures = 0;
const check = (n, c, extra) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!c) failures++; };

// ---- the drift gate ---------------------------------------------------------
let checkOk = true, checkErr = '';
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-browser-support.mjs'), '--check'], { stdio: 'pipe' });
} catch (e) {
  checkOk = false;
  checkErr = String((e.stdout || '') + (e.stderr || '')).trim().split('\n').slice(0, 3).join(' | ');
}
check("run.html's copy table matches browser-support.json (build-browser-support.mjs --check)", checkOk, checkErr || undefined);

// ---- the data itself --------------------------------------------------------
let data = null;
try { data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); } catch (e) { /* reported below */ }
check('site/browser-support.json exists and parses', !!data);

if (data) {
  const feats = Object.keys(data.features || {});
  check('it covers the meeting AND the broadcast page', feats.includes('meet') && feats.includes('cast'), feats);
  check('meetings are gated on the requirement that actually sets the table (WebCrypto Ed25519)',
    data.features.meet.gatedBy === 'webcrypto-ed25519');
  check('a camera is NOT among the meeting requirements (view-only join is first class)',
    !(data.features.meet.requires || []).some((r) => /getusermedia|camera/i.test(r)) && !!data.features.meet.notRequired.getUserMedia);
  check('the Home Screen is listed and needs none of the meeting stack',
    !!data.features.desktop && !(data.features.desktop.requires || []).some((r) => /webrtc|ed25519/.test(r)));

  // Every browser answers for every feature — a matrix with holes reads as
  // "supported" to anyone skimming it.
  const holes = [];
  for (const b of data.browsers) for (const f of feats) if (!(b.support || {})[f]) holes.push(b.id + '.' + f);
  check('every browser has an answer for every feature (no silent holes)', holes.length === 0, holes);

  // The honesty rules the generator enforces, asserted here too so the shape is
  // guarded even if the generator is ever changed.
  const guessed = data.browsers.filter((b) => feats.some((f) => b.support[f].state !== 'supported' && b.support[f].min));
  check('nothing marked unknown/unsupported carries a version number (no guesses)', guessed.length === 0, guessed.map((b) => b.id));
  const numberless = data.browsers.filter((b) => feats.some((f) => b.support[f].state === 'supported' && !b.support[f].min));
  check('everything marked supported carries the version it is supported from', numberless.length === 0, numberless.map((b) => b.id));

  // The verified numbers this whole work-front turned on.
  const min = (id, f) => (data.browsers.find((b) => b.id === id) || { support: {} }).support[f];
  check('Chrome meet minimum is 137 (Ed25519, 2025-05 — the last engine to ship it)', (min('chrome', 'meet') || {}).min === '137');
  check('Edge meet minimum is 137', (min('edge', 'meet') || {}).min === '137');
  check('Firefox meet minimum is 129', (min('firefox', 'meet') || {}).min === '129');
  check('Safari meet minimum is 17, on the Mac and on the iPhone alike',
    (min('safari', 'meet') || {}).min === '17' && (min('safari-ios', 'meet') || {}).min === '17');
  check('broadcast carries the same numbers as meetings (it is the same page in a different skin)',
    ['chrome', 'edge', 'firefox', 'safari'].every((id) => min(id, 'cast').min === min(id, 'meet').min));

  // The Chromium skins are the deliberate unknowns: we quote the Chrome build
  // their own UA admits to rather than invent an Opera number.
  check('Chromium skins are honestly unknown, not guessed',
    ['opera', 'samsung'].every((id) => min(id, 'meet').state === 'unknown' && (data.browsers.find((b) => b.id === id) || {}).chromiumSkin === true));
  check('…and they are kept OUT of the preflight copy table (no copyKey)',
    ['opera', 'samsung', 'uc', 'in-app'].every((id) => !(data.browsers.find((b) => b.id === id) || {}).copyKey));
  check('an in-app browser is listed, since that is where this bites most', !!data.browsers.find((b) => b.id === 'in-app'));
}

// ---- run.html carries exactly ONE table, and it is the generated one --------
const run = fs.readFileSync(RUN, 'utf8');
const between = run.slice(run.indexOf('BEGIN GENERATED from site/browser-support.json'), run.indexOf('==== END GENERATED ===='));
check('run.html has the generated block', between.length > 100);
check('`var MIN =` appears exactly once in run.html, inside the generated block',
  (run.match(/var MIN =/g) || []).length === 1 && between.includes('var MIN ='));
check('`GENERIC_MINS` is assigned exactly once, inside the generated block',
  (run.match(/var GENERIC_MINS =/g) || []).length === 1 && between.includes('var GENERIC_MINS ='));
check('the generated block is ES5 (no let/const/arrow — it must parse on the browsers it exists to describe)',
  !/\b(?:let|const)\s|=>/.test(between));

// ---- the human page ---------------------------------------------------------
const page = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, 'utf8') : '';
check('site/browser-support.html exists (the human rendering)', !!page);
check('…and it READS the json rather than repeating it', page.includes('browser-support.json'));
check('…and it hard-codes no version numbers of its own',
  !/\b(?:Safari|Chrome|Firefox|Edge)\s+1[0-9]{1,2}\b/.test(page.replace(/<!--[\s\S]*?-->/g, '')));

// ---- A SNAPSHOT MUST ANSWER FOR ITSELF --------------------------------------
// This is the one that is easy to get backwards, and it was: the App Store
// catalog is CONTENT a pinned build should see grow, so a frozen build reads
// the live one. This file is a DESCRIPTION OF THE FROZEN CODE BESIDE IT. What
// a build requires stops changing the moment the build does, so the matrix
// freezes with it — otherwise raising the floor at the root tells a pinned
// user to update a browser that runs their build perfectly, and lowering it
// tells them they are fine when their frozen code still needs more. Both are
// the page lying with authority.
//
// Mechanically that means three things, each guarded here: the page fetches
// RELATIVELY (a snapshot injects <base href="/versions/<v>/">, so a relative
// fetch lands inside the snapshot), everything that LINKS to the page links
// relatively for the same reason, and archive-version.sh actually copies the
// json into the snapshot — a relative fetch at a path that was never
// snapshotted is just a 404 with extra steps.
const bodyOnly = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '');
check('the page fetches its data RELATIVELY, so a frozen build reads ITS OWN matrix',
  /fetch\(\s*'browser-support\.json'/.test(bodyOnly) && !/fetch\(\s*'\/browser-support\.json'/.test(bodyOnly));

const archive = fs.readFileSync(path.join(ROOT, 'scripts', 'archive-version.sh'), 'utf8');
check('archive-version.sh accounts for the page (or the next release cut aborts)',
  /OPTIONAL=\([^)]*browser-support\.html/.test(archive) || /REQUIRED=\([^)]*browser-support\.html/.test(archive));
check('…and copies the json in beside it, so the relative fetch resolves',
  /cp\s+"\$SITE\/browser-support\.json"\s+"\$DEST/.test(archive));

// ---- and something links to it ----------------------------------------------
const about = fs.readFileSync(path.join(ROOT, 'site', 'about.html'), 'utf8');
check('the About page links to it (a matrix nobody can reach is a private note)', /browser-support\.html/.test(about));
const desktop = fs.readFileSync(path.join(ROOT, 'site', 'js', 'desktop.js'), 'utf8');
check("the desktop's About panel links to it too", /browser-support\.html/.test(desktop));
const absLinks = [['about.html', about], ['desktop.js', desktop]]
  .filter(([, src]) => /href="\/browser-support\.html/.test(src)).map(([n]) => n);
check('…and every link to it is RELATIVE, so a pinned build reaches its own copy', absLinks.length === 0, absLinks);

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
