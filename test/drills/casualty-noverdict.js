'use strict';
/*
 * casualty-noverdict.js — the CASUALTY GATE, proven with a real browser death.
 *
 * WHY. On 2026-08-11 03a-classmates-serial-pip spent 301 seconds interrogating
 * a corpse: em's renderer crashed at t+44.9s, two seconds after it seated, and
 * the scenario reported FOUR reds about the mesh from a room that really did
 * have four members ("the room never loses anyone while 4/5 are hidden — 18
 * violating samples"). meet.js knew, and said so only to stderr.
 *
 * cast.js now renders NO VERDICT (exit 4) the moment an actor's browser dies
 * unasked. test/unit/behavior-casualty.js holds the wiring; this holds the
 * BEHAVIOUR, with a browser that actually dies:
 *
 *   ACT 1  two actors seat, one renderer is crashed with `crash`
 *          -> exit 4, a CASUALTY line naming the role, and ZERO ✘ — in
 *             particular the false red waiting one line later never happens.
 *   ACT 2  two actors seat, one is killed DELIBERATELY with `die`
 *          -> exit 0. A hair-trigger gate would refuse to render a verdict on
 *             12b-team-car-death and 18b-circle-abrupt-exit, whose whole
 *             subject is somebody vanishing. That is the failure mode of this
 *             fix, so it is guarded in the same file.
 *
 * Each act is a REAL scenario in its own process (written to /tmp, requiring
 * cast.js by absolute path so the battery never globs it). Stack: whatever is
 * already on :8099/:8790, else the scenarios spawn it themselves.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CAST = path.join(ROOT, 'test', 'behavior', 'lib', 'cast.js');
const TMP = fs.mkdtempSync('/tmp/casualty-drill-');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : ''));
  if (!cond) failures++;
};

function write(name, body) {
  const f = path.join(TMP, name + '.js');
  fs.writeFileSync(f, "'use strict';\nconst { scenario } = require(" + JSON.stringify(CAST) + ");\n" + body);
  return f;
}

function run(file, timeoutMs) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [file], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, timeoutMs || 240000);
    p.on('exit', (code, signal) => { clearTimeout(t); res({ code, signal, out }); });
  });
}

// ---- ACT 1: the uninvited death -------------------------------------------
// The two checks after `crash` are the FALSE REDS this gate exists to prevent.
// If the gate works the process is already gone and neither is ever evaluated;
// if it does not, they are exactly the reds 03a produced.
const CRASH_SCENARIO = write('act1-crash', `
scenario('drill-casualty-crash', { ana: {}, bo: {} }, async (cast, check) => {
  await cast.joinAll();
  await check.converged(2);
  await cast.get('bo').cmd('crash');
  await cast.sleep(6);
  await check.converged(2, { desc: 'MUST-NOT-BE-REACHED the room converges with a dead browser', within: 15 });
  check.assert(false, 'MUST-NOT-BE-REACHED the scenario ran on past a casualty');
}, { timeoutMin: 4 });
`);

// ---- ACT 2: the death we asked for ----------------------------------------
const DIE_SCENARIO = write('act2-die', `
scenario('drill-casualty-die', { ana: {}, bo: {} }, async (cast, check) => {
  await cast.joinAll();
  await check.converged(2);
  await cast.get('bo').cmd('die');
  await cast.sleep(4);
  check.assert(true, 'a DELIBERATE death is not a casualty — the scenario still gets to speak');
}, { timeoutMin: 4 });
`);

(async () => {
  console.log('ACT 1 — a renderer dies uninvited');
  const a1 = await run(CRASH_SCENARIO);
  const reds = (a1.out.match(/^ *✘/gm) || []);
  check('a crashed renderer exits NO_VERDICT (4), not 0 and not a red (1)', a1.code === 4,
    { code: a1.code, signal: a1.signal, tail: a1.out.split('\n').slice(-6).join(' | ') });
  check('it says NO VERDICT in as many words', /^NO VERDICT — an actor's BROWSER DIED/m.test(a1.out));
  check('the CASUALTY line names the role that died', /CASUALTY: bo /.test(a1.out),
    (a1.out.match(/ *CASUALTY:.*/) || [''])[0].trim());
  check('it reports what the box had (the first question a casualty raises)', /THE BOX: {2}\S+: 2 browser\(s\)/.test(a1.out),
    (a1.out.match(/ *THE BOX:.*/) || [''])[0].trim());
  check('NOT ONE product red was manufactured', reds.length === 0, reds);
  check('the checks after the casualty were never even reached', !/MUST-NOT-BE-REACHED/.test(a1.out));
  check('no PASS/FAIL verdict line pretends the scenario ran', !/^(PASS|FAIL) drill-casualty-crash/m.test(a1.out));

  console.log('ACT 2 — a death the scenario asked for');
  const a2 = await run(DIE_SCENARIO);
  check('a DELIBERATE die still renders a verdict (exit 0)', a2.code === 0,
    { code: a2.code, tail: a2.out.split('\n').slice(-6).join(' | ') });
  check('and it is NOT reported as a casualty', !/NO VERDICT/.test(a2.out) && !/CASUALTY/.test(a2.out));
  check('the scenario got to speak', /^PASS drill-casualty-die/m.test(a2.out));

  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(1); });
