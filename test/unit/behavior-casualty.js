// behavior-casualty.js — A DEAD BROWSER MAY NEVER BECOME A PRODUCT VERDICT.
//
// WHY THIS EXISTS, measured to the second. 03a-classmates-serial-pip, the
// behaviour box, 2026-08-11 23:36 (the 0.9.7 gate's one FLAKY):
//
//   t+42.6  em |   seated at 0/0.4
//   t+44.9  em !   [CRASH] the renderer process died — … everything this page
//                  carried is gone
//   t+50.6  em > jstate          … and every 2.5s for the next 250 seconds
//
// Then four reds, all of them about the mesh:
//
//   ✘ room converges to 5 for everyone (>62s) — em:Error: page.evaluate: Target crashed
//   ✘ the room never loses anyone while 4/5 are hidden — 18 violating samples
//   ✘ reunion whole after the waves (>62s)
//   ✘ census: ONE tree, 5 seats, no dups, no orphans (>61s) — replies=4/5
//
// Every one of those statements was TRUE of a room with four live members, and
// none of them was a defect. The box: 7.6 GB of RAM with 0 MB AVAILABLE (about
// 6.5 GB held by a resident GPU model), five Chromiums living in swap.
//
// The signal was not missing. meet.js printed the crash — to STDERR, which
// cast.js files into the per-run cast.log, which nobody reads unless they
// already suspect the answer. So the fix is not a smarter wait: it is putting
// the death on the channel the orchestrator reads ('@@dead'), stopping at once,
// and rendering NO VERDICT (exit 4) instead of a red.
//
// This guard holds the whole chain, because the bug was never in one link — it
// was a signal shouted into a channel with nobody at the other end.
process.env.BEHAVIOR_HOSTS = '/nonexistent/no-fleet-for-this-unit-test.json';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const cast = require('../behavior/lib/cast.js');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// ---- 1. the classifier, on strings that were actually observed -------------
// The positives are copied from real logs (the gate's own behavior.log, the
// actor-exit path, and meet.js's new sentinel). The negatives are the ordinary
// noise of a healthy run: mistaking any of them for a casualty would turn a
// slow box or a plain reload into "no verdict", which is its own kind of lie.
const CASUALTY = [
  'Error: page.evaluate: Target crashed',
  'page.evaluate: Target crashed',
  'renderer crashed — the page and everything it carried is gone',
  'browser process vanished (chromium)',
  'browser process vanished (firefox)',
  'Target page, context or browser has been closed',
  'browser has been closed',
  'actor exited null [killed: SIGKILL]',
  'actor exited null [killed: SIGSEGV]',
];
const NOT_CASUALTY = [
  '',
  'cmd timeout: jstate',
  'no state',
  'not seated',
  'actor exited 0',
  'actor exited 1',
  'Execution context was destroyed, most likely because of a navigation',
  'page.evaluate: Timeout 30000ms exceeded',
  'stack unreachable (site=http://127.0.0.1:8099 relay=ws://127.0.0.1:8790)',
];
check('every observed death string classifies as a casualty',
  CASUALTY.every((s) => cast.isCasualty(s)), CASUALTY.filter((s) => !cast.isCasualty(s)));
check('ordinary run noise does NOT classify as a casualty',
  NOT_CASUALTY.every((s) => !cast.isCasualty(s)), NOT_CASUALTY.filter((s) => cast.isCasualty(s)));

// ---- 2. a DELIBERATE death is not a casualty ------------------------------
// 12b-team-car-death, 18b-circle-abrupt-exit and every teardown kill a browser
// on purpose. If those counted, the battery would refuse to render a verdict on
// the scenarios whose whole subject is somebody vanishing.
check('leave/die/quit retire an actor', ['leave', 'die', 'quit', 'exit', 'q'].every((c) => cast.RETIRING_RE.test(c)));
check('ordinary commands do NOT retire an actor',
  ['jstate', 'hide', 'show', 'reload', 'radio off', 'battery 40', 'probe 4.5', 'waitseat 60']
    .every((c) => !cast.RETIRING_RE.test(c)));

// ---- 3. the gate itself, exercised (no browsers needed) -------------------
// new Cast() spawns nothing — placement and bookkeeping only — so the casualty
// rules can be driven directly. abortNoVerdict is stubbed because the real one
// exits the process, which is the point of it.
const c = new cast.Cast('unit-casualty', { ana: {}, bo: {}, cleo: {} }, {});
let aborts = 0;
c.abortNoVerdict = async () => { aborts++; };

c.noteCasualty(c.get('ana'), 'Target crashed');
check('a crashed actor trips the gate once', aborts === 1 && c.casualties.length === 1, { aborts, casualties: c.casualties.length });
c.noteCasualty(c.get('ana'), 'Target crashed again');
c.noteCasualty(c.get('bo'), 'browser process vanished (chromium)');
check('a second casualty does not re-abort (one report, not a cascade)', aborts === 1, { aborts });

const c2 = new cast.Cast('unit-casualty-retired', { ana: {}, bo: {} }, {});
let aborts2 = 0;
c2.abortNoVerdict = async () => { aborts2++; };
c2.get('ana').retired = true;
c2.noteCasualty(c2.get('ana'), 'browser has been closed');
check('a RETIRED actor\'s death is not a casualty (12b kills a car on purpose)', aborts2 === 0, { aborts2 });
c2.tearing = true;
c2.noteCasualty(c2.get('bo'), 'Target crashed');
check('a death during TEARDOWN is not a casualty', aborts2 === 0, { aborts2 });
check('hostCounts counts the browsers per box', c2.hostCounts().get('local') === 2, [...c2.hostCounts()]);
check('NO_VERDICT is exit code 4 (what the batteries branch on)', cast.NO_VERDICT === 4);

// ---- 4. the capacity snapshot ---------------------------------------------
// Not a gate — evidence. It answers the first question a casualty raises:
// could this box ever have held this cast?
const m2 = (a, b) => Object.assign({}, a, b);
// verbatim from the behaviour box, 2026-08-12: 7.6 GB of RAM, 49 MB of it usable
const MEMINFO = 'MemTotal:        7802536 kB\nMemFree:          123456 kB\nMemAvailable:      49784 kB\nSwapFree:       11111060 kB\n';
const m = cast.parseMeminfo(MEMINFO);
check('meminfo parses to MB', m.totalMb === 7620 && m.availMb === 49 && m.swapFreeMb === 10851, m);
const tight = cast.capacityLine('clawbox', 5, m2(m, { load: 5.36, cores: 6 }));
const roomy = cast.capacityLine('nvidia-laptop', 5, { totalMb: 16072, availMb: 14839, swapFreeMb: 8000, load: 0.1, cores: 8 });
check('a box that cannot hold the cast says so', /SHORT BY \d+ MB/.test(tight) && /SWAP/.test(tight), tight);
check('a box that can hold the cast does not cry wolf', !/SHORT BY/.test(roomy), roomy);
check('the per-browser cost is a MEASURED number, not a guess',
  cast.MEM_PER_BROWSER_MB > 200 && cast.MEM_PER_BROWSER_MB < 800, cast.MEM_PER_BROWSER_MB);

// ---- 5. THE CHANNEL. Every link, or the signal goes nowhere again. --------
const meet = read('test/swarm/meet.js');
const castSrc = read('test/behavior/lib/cast.js');
const behSh = read('test/batteries/behavior.sh');
const relSh = read('test/batteries/release.sh');

// STDOUT, not stderr. This is the whole bug: '@@dead' has to ride the sentinel
// channel cast.js parses, not the log stream it merely files away.
check('meet.js announces a death with console.log (the SENTINEL channel, not stderr)',
  /function noteActorDeath[\s\S]{0,600}?console\.log\('@@dead '/.test(meet));
check('meet.js reports a renderer CRASH', /page\.on\('crash'[\s\S]{0,400}?noteActorDeath\(/.test(meet));
check('meet.js reports a vanished BROWSER PROCESS',
  (meet.match(/browser\.on\('disconnected'[\s\S]{0,200}?noteActorDeath\(/g) || []).length >= 2);
// Without this, every teardown (cast.down sends `quit`) reports a casualty and
// the whole battery renders NO VERDICT — the failure mode of the fix itself.
check('meet.js marks its own drive-mode shutdown as intentional',
  (meet.match(/intentionalKill = true;[^\n]*\n?[^\n]*browser\.close\(\)/g) || []).length >= 2
  || (meet.match(/intentionalKill = true; try \{ if \(browser\)/g) || []).length >= 2, undefined);
check('cast.js reads the @@dead sentinel', /startsWith\('@@dead '\)[\s\S]{0,120}?noteCasualty/.test(castSrc));
check('cast.js keeps the string backstop for a death nobody announced',
  /isCasualty\(r\.err\)[\s\S]{0,60}?noteCasualty/.test(castSrc));
check('cast.js exits NO_VERDICT, and never turns a casualty into a red',
  /abortNoVerdict[\s\S]{0,3000}?process\.exit\(NO_VERDICT\)/.test(castSrc));
check('cast.js logs the capacity of every box before spawning',
  /capacity ' \+ capacityLine\(/.test(castSrc));

// The batteries have to KNOW about exit 4, or a no-verdict is silently a red
// again (behavior.sh) or silently retried until it happens to pass (release.sh).
check('behavior.sh has an exit-4 branch and propagates it',
  /rc -eq 4/.test(behSh) && /nov -ne 0 \] && exit 4/.test(behSh));
check('behavior.sh never puts a no-verdict scenario on the RETRY list',
  /no-verdict:\$novlist/.test(behSh) && !/failed="\$failed \$name"[\s\S]{0,40}nov=/.test(behSh));
check('release.sh scores exit 4 as NO-VERDICT for any suite', /"\$rc" -eq 4/.test(relSh) && /NO-VERDICT\\t/.test(relSh));
check('release.sh does NOT retry the behavior tier on exit 4', /rc -ne 0 \] && \[ \$rc -ne 4 \]/.test(relSh));
check('release.sh counts NO-VERDICT in the summary line', /NO-VERDICT %d/.test(relSh));
check('a NO-VERDICT blocks the cut', /novrd" -gt 0[\s\S]{0,200}?DO NOT CUT/.test(relSh));

// the two stub casts each opened a run dir; a unit test leaves no litter
for (const x of [c, c2]) { try { x.logFile.end(); fs.rmSync(x.runDir, { recursive: true, force: true }); } catch (e) {} }

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
