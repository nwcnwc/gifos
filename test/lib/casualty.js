/*
 * casualty.js — A DEAD BROWSER IS NOT A VERDICT.
 *
 * WHAT THIS IS FOR, measured to the second. 03a-classmates-serial-pip, the
 * behaviour box, 2026-08-11:
 *
 *   t+42.6  em |   seated at 0/0.4
 *   t+44.9  em !   [CRASH] the renderer process died — everything this page
 *                  carried is gone
 *   t+50.6  em > jstate       … and every 2.5s for the next 250 seconds
 *
 * Four reds followed, every one of them about the mesh — "room converges to 5
 * for everyone", "the room never loses anyone while 4/5 are hidden" (18
 * violating samples), "reunion whole after the waves", "census … replies=4/5".
 * All four were TRUE of a room with four live members. None was a defect. The
 * box had 7.6 GB of RAM with 49 MB AVAILABLE and five Chromiums in swap.
 *
 * A suite that loses a browser it did not ask to lose has stopped measuring
 * GifOS and started measuring the kernel, so it must refuse to render a verdict
 * rather than publish one. Same doctrine as fleet.js ("this needs machines I
 * was not given") and need.js ("a missing dependency must never masquerade as a
 * failing assertion"), one layer lower: THIS CLIENT IS GONE.
 *
 * EXIT CODE 4 = NO VERDICT. release.sh reports it as its own verdict: not
 * green, not a product red, never retried (the box does not get roomier on the
 * second run), and it BLOCKS a cut, because a guard nobody could run is a guard
 * nobody has.
 *
 * Two users:
 *   - test/behavior/lib/cast.js — actors are meet.js children, so the death
 *     arrives as the '@@dead' sentinel (or an ssh-killed child).
 *   - test/lib/pw.js — 98 suites drive Playwright directly; wrapping
 *     chromium.launch there arms every one of them from a single place, since
 *     'Target crashed' out of a page.evaluate reads exactly like a product
 *     failure and got triaged as one for as long as the battery has existed.
 *
 * Deliberate deaths must be declared: deathExpected(browser) before you kill
 * one (test/drills/e2e-vanish-browser.js SIGKILLs a victim browser tree on
 * purpose — that is the drill, not a casualty).
 */
const fs = require('fs');
const { spawn } = require('child_process');

const NO_VERDICT = 4;

// The strings a dead browser actually produces, from real logs. Deliberately
// NOT 'Execution context was destroyed' (a reload says that) and not a timeout
// (a slow box says that): mistaking either for a casualty would refuse a
// verdict the suite could perfectly well have rendered.
const CASUALTY_RE = /Target crashed|renderer crashed|browser process vanished|browser has been closed|Browser closed|Target page, context or browser has been closed|killed: SIG(KILL|ABRT|SEGV|BUS)/i;
const isCasualty = (err) => !!err && CASUALTY_RE.test(String(err));

// Per-browser resident cost, MEASURED 2026-08-12 on an idle 16 GB box: a
// 5-phone cast (55 chrome processes) took MemAvailable from 14839 MB to
// 12888 MB — 1951 MB for five, ~390 MB each.
const MEM_PER_BROWSER_MB = 390;

// MemAvailable, deliberately NOT free+cached and NOT swap. A browser paged out
// to a Jetson's swapfile is precisely the client that gets OOM-killed halfway
// through a scenario, so counting swap as capacity would hide the one number
// that predicts a casualty. Never throws: this is evidence, not a gate.
function parseMeminfo(txt) {
  const g = (k) => { const m = new RegExp('^' + k + ':\\s+(\\d+)', 'm').exec(txt || ''); return m ? Math.round(parseInt(m[1], 10) / 1024) : null; };
  return { totalMb: g('MemTotal'), availMb: g('MemAvailable'), swapFreeMb: g('SwapFree') };
}
function memLocal() {
  try {
    const m = parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));
    m.cores = require('os').cpus().length;
    m.load = parseFloat(fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
    return m;
  } catch (e) { return {}; }
}
function memRemote(ssh) {
  return new Promise((res) => {
    const p = spawn('ssh', ['-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', ssh,
      'cat /proc/meminfo; echo LOAD $(cut -d" " -f1 /proc/loadavg) $(nproc)'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    const done = () => {
      const m = parseMeminfo(out);
      const l = /LOAD ([\d.]+) (\d+)/.exec(out);
      if (l) { m.load = parseFloat(l[1]); m.cores = parseInt(l[2], 10); }
      res(m);
    };
    p.on('exit', done);
    p.on('error', () => res({}));
    setTimeout(() => { try { p.kill(); } catch (e) {} res({}); }, 12000).unref();
  });
}
// one line per box: "clawbox: 5 browser(s) · 0 MB available (need ~1950) · load
// 5.4/6 · swap free 9359 MB — SHORT BY 1950 MB: …"
function capacityLine(host, n, m) {
  const need = n * MEM_PER_BROWSER_MB;
  if (!m || m.availMb == null) return host + ': ' + n + ' browser(s) · memory unknown';
  const short = m.availMb < need;
  return host + ': ' + n + ' browser(s) · ' + m.availMb + ' MB available (need ~' + need + ')'
    + (m.load != null ? ' · load ' + m.load.toFixed(2) + '/' + (m.cores || '?') : '')
    + (m.swapFreeMb != null ? ' · swap free ' + m.swapFreeMb + ' MB' : '')
    + (short ? '  — SHORT BY ' + (need - m.availMb) + ' MB: this cast runs from SWAP and a casualty is likely' : '');
}

// ---- the report, and the exit ----------------------------------------------
// Every line here answers a question the reader would otherwise have to guess
// at, because the whole failure mode was a reader who could not tell a starved
// box from a broken mesh.
function report(o) {
  o = o || {};
  console.log('');
  console.log('NO VERDICT — a BROWSER THIS SUITE WAS DRIVING DIED, so nothing here is a claim about GifOS.');
  console.log('');
  console.log('  CASUALTY: ' + (o.what || 'a browser') + ' — ' + String(o.why || 'died').slice(0, 200));
  if (o.where) console.log('  WHERE:    ' + o.where);
  console.log('  THE BOX:  ' + capacityLine(o.host || 'local', o.browsers || 1, o.mem || memLocal()));
  console.log('');
  console.log('  A browser that dies mid-run takes its page, its tracks and its answers');
  console.log('  with it, and every later check reads a room that is genuinely short a');
  console.log('  member. Those reds would be TRUE and MEANINGLESS — which is how 03a spent');
  console.log('  301s reporting "the room never loses anyone" as a mesh defect while its');
  console.log('  fifth renderer had been dead since t+44.9s.');
  console.log('');
  console.log('  NOT a product failure and NOT a flake, so it is not retried. If the box was');
  console.log('  short of RAM, give the suite a box that can hold it (or spread the clients');
  console.log('  over the farm). If the box was idle and roomy, THE CRASH IS THE BUG.');
  console.log('  A death you MEANT to cause must be declared: casualty.deathExpected(browser).');
  console.log('');
  console.log('NO-VERDICT — 0 PASSED, 0 FAILED, no verdict was reached, on purpose.');
}
function refuse(o) {
  report(o);
  process.exit(NO_VERDICT);
}

// ---- watching a Playwright browser -----------------------------------------
// One place arms all 98 direct-Playwright suites. Everything here is
// fail-safe: a throw inside the wrapper must never break a launch, because
// pw.js is required by every browser suite in the repo.
const expected = new WeakSet();   // deaths we asked for
const closing = new WeakSet();    // .close() was called: from here it is ours
let launched = 0;

// Declare a death BEFORE causing it (SIGKILLing a browser tree, navigating to
// chrome://crash). e2e-vanish-browser's whole subject is a browser that
// vanishes; without this it would refuse to render the verdict it exists for.
function deathExpected(target) {
  try { expected.add(target); if (target && target.context) expected.add(target.context()); } catch (e) {}
  try { if (target && target.browser && target.browser()) expected.add(target.browser()); } catch (e) {}
  return target;
}
function isExpected(target) {
  try { return expected.has(target) || closing.has(target); } catch (e) { return false; }
}

function armPage(page, browser) {
  try {
    page.on('crash', () => {
      if (isExpected(page) || isExpected(browser)) return;
      let url = '';
      try { url = page.url(); } catch (e) {}
      refuse({ what: 'a RENDERER crashed', why: 'the page and everything it carried is gone',
        where: url || undefined, browsers: launched });
    });
  } catch (e) {}
  return page;
}
function armContext(ctx, browser) {
  try { ctx.on('page', (p) => armPage(p, browser)); } catch (e) {}
  try { for (const p of ctx.pages()) armPage(p, browser); } catch (e) {}
  return ctx;
}
function watchBrowser(browser) {
  if (!browser) return browser;
  try {
    if (browser.__gifosWatched) return browser;
    browser.__gifosWatched = true;
    launched++;
    browser.on('disconnected', () => {
      if (isExpected(browser)) return;
      refuse({ what: 'a BROWSER PROCESS vanished', why: 'it was launched by this suite and it is gone (OOM kill, or it was reaped)',
        browsers: launched });
    });
    const close = browser.close.bind(browser);
    browser.close = (...a) => { closing.add(browser); return close(...a); };
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...a) => armContext(await newContext(...a), browser);
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...a) => armPage(await newPage(...a), browser);
    for (const c of (browser.contexts() || [])) armContext(c, browser);
  } catch (e) { /* never break a launch over this */ }
  return browser;
}

module.exports = {
  NO_VERDICT, CASUALTY_RE, isCasualty, MEM_PER_BROWSER_MB,
  parseMeminfo, memLocal, memRemote, capacityLine,
  report, refuse, watchBrowser, deathExpected, launchedCount: () => launched,
};
