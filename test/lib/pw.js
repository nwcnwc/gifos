/*
 * pw.js — resolve Playwright and a Chromium binary, on ANY box.
 *
 * Every suite used to hardcode `/opt/node22/lib/node_modules/playwright` and
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Those are true on the
 * pi and false everywhere else: <gate-box> keeps playwright in the repo's
 * node_modules and its browsers in ~/.cache/ms-playwright/chromium-1193|1208.
 * So the entire browser tier was unrunnable on the ONE machine with enough
 * cores to run it honestly — and a hardcoded path that has gone stale does not
 * announce itself, it just exits non-zero having asserted nothing, which is
 * indistinguishable from silence. That exact failure hid the app-in-a-meeting
 * drills for their whole life.
 *
 * Resolution is by SEARCH, newest build first, and a miss THROWS with the list
 * of places looked — never a silent skip.
 *
 *   const { chromium, CHROME } = require('../lib/pw');
 *
 * Overrides (either wins, checked first): PLAYWRIGHT_DIR, and for the browser
 * MEET_CHROME / SWARM_CHROME / GIFOS_CHROME.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

function tried(list) { return list.map((p) => '    ' + p).join('\n'); }

// ---- playwright -------------------------------------------------------------
function loadPlaywright() {
  const cands = [];
  if (process.env.PLAYWRIGHT_DIR) cands.push(process.env.PLAYWRIGHT_DIR);
  cands.push(
    path.join(__dirname, '..', '..', 'node_modules', 'playwright'), // the repo's own
    '/opt/node22/lib/node_modules/playwright',
    path.join(HOME, '.npm-global/lib/node_modules/playwright'),
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  );
  for (const c of cands) {
    try { return require(c); } catch (e) { /* next */ }
  }
  try { return require('playwright'); } catch (e) { /* fall through to throw */ }
  throw new Error('pw.js: cannot find playwright. Looked in:\n' + tried(cands.concat(['(bare) playwright'])));
}

// ---- chromium ---------------------------------------------------------------
// Playwright renamed the unpacked directory between builds (chrome-linux ->
// chrome-linux64), so try both spellings for every build we find.
function chromeCandidates(opts) {
  const out = [];
  if (!(opts && opts.ignorePins)) {
    for (const v of ['MEET_CHROME', 'SWARM_CHROME', 'GIFOS_CHROME']) {
      if (process.env[v]) out.push(process.env[v]);
    }
  }
  const roots = ['/opt/pw-browsers', path.join(HOME, '.cache/ms-playwright')];
  for (const root of roots) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { continue; }
    // newest build number first, so a box with several installs uses the newest
    names.filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10))
      .forEach((n) => {
        out.push(path.join(root, n, 'chrome-linux', 'chrome'));
        out.push(path.join(root, n, 'chrome-linux64', 'chrome'));
      });
  }
  // A real Chrome is a fine fallback — and for swarm bots it is PREFERRED, since
  // chrome-headless-shell can load the page yet never open the relay socket.
  out.push('/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  return out;
}

/*
 * findChrome({ ignorePins }) — the binary to launch.
 *
 * `ignorePins: true` skips MEET_CHROME/SWARM_CHROME/GIFOS_CHROME and takes the
 * NEWEST installed build. Exactly one kind of suite may want this: one testing a
 * platform API too new for the pinned build, where inheriting the pin does not
 * test the feature — it just reports the feature missing.
 *
 * That is not hypothetical. The release gate pins MEET_CHROME to chromium-1193
 * because browser/e2e and e2e-media-recovery red on newer builds. chromium-1193
 * is Chrome 140, which has NO `RTCRtpScriptTransform` (only the legacy
 * createEncodedStreams); the encoded-passthrough pipe lane needs it, so under
 * the pin browser/e2e-pipe reported `unsupported:true` and failed 8 assertions
 * that were never about the product (gate, 2026-08-05). The pin is right for the
 * suites it was added for and wrong for that one — so the requirement belongs on
 * the SUITE, not on the gate's single global pin.
 */
function findChrome(opts) {
  const cands = chromeCandidates(opts);
  for (const c of cands) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch (e) { /* next */ }
  }
  throw new Error('pw.js: no Chromium binary found. Set MEET_CHROME, or install one. Looked in:\n' + tried(cands));
}

/*
 * findEngine(name) — the same SEARCH doctrine, for the non-Chromium engines.
 *
 * Playwright's own `firefox.executablePath()` answers from PLAYWRIGHT_BROWSERS_PATH
 * (default ~/.cache/ms-playwright). On a box that keeps its browsers in
 * /opt/pw-browsers that answer is a path which does not exist — so a suite asking
 * "is firefox installed here?" is told NO on a box where firefox is installed and
 * working. That reads as a product red (or, worse, as silently reduced coverage)
 * for a purely environmental reason, which is the exact failure this file exists
 * to end.
 *
 * Returns a launchable path or null. The per-box pin (MEET_FIREFOX / MEET_WEBKIT)
 * wins, because it is what the fleet actually launches with — same rule as
 * MEET_CHROME above, and the same reason: the repo's playwright pin may name an
 * older revision than the box has (the pre-Ed25519 firefox trap, 2026-08-05).
 */
function engineCandidates(name) {
  const out = [];
  const pin = process.env['MEET_' + name.toUpperCase()];
  if (pin) out.push(pin);
  // <root>/<name>-<rev>/ : firefox ships firefox/firefox, webkit a pw_run.sh
  const leaf = name === 'firefox' ? ['firefox', 'firefox'] : ['pw_run.sh'];
  for (const root of ['/opt/pw-browsers', path.join(HOME, '.cache/ms-playwright')]) {
    let names = [];
    try { names = fs.readdirSync(root); } catch (e) { continue; }
    names.filter((n) => new RegExp('^' + name + '-\\d+$').test(n))
      .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10))
      .forEach((n) => out.push(path.join(root, n, ...leaf)));
  }
  try { const p = pw[name] && pw[name].executablePath(); if (p) out.push(p); } catch (e) { /* not installed per playwright */ }
  return out;
}
function findEngine(name) {
  if (name === 'chromium') { try { return findChrome(); } catch (e) { return null; } }
  for (const c of engineCandidates(name)) {
    try { if (fs.existsSync(c)) return c; } catch (e) { /* next */ }
  }
  return null;
}

const pw = loadPlaywright();
module.exports = { ...pw, chromium: pw.chromium, CHROME: findChrome(), findChrome, findEngine };
