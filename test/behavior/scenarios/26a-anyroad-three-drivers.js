'use strict';
// USE CASE 26 — THREE PEOPLE DRIVING ROUND ONE CITY TOGETHER, each holding the
// controls a different way. Ada steers with the WHEEL, Ben with the STICK, Cyd
// by TILTING the phone. They are in one shared world, they can see each other's
// cars, and each of them can actually drive.
//
// Why it belongs in the BEHAVIOR battery and not only in the release gate:
// every other scenario here is a meeting, and this battery's premise is "real
// people, real phone realities, no monitors". Three friends in a car game is
// exactly that shape, and it is the only place the three steering schemes are
// exercised at once. A scheme nobody drives is a scheme that breaks for
// whichever player chose it — silently, while the other two are fine.
//
// This scenario does NOT use lib/cast.js. cast spawns test/swarm/meet.js per
// role and speaks the meeting's command vocabulary (join/chat/leave/die); an
// app room driven by pointer and orientation events is a different animal, and
// wrapping it in cast would mean teaching cast to drive a car. The suite that
// already builds this world lives in test/browser/e2e-anyroad-mp.js, so this
// runs THAT, in the app-as-room door, and translates its output into the
// battery's contract. One implementation, two front doors — a second copy of a
// 500-line three-browser harness would drift from the first within a month.
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_PORT = 8099;
const RELAY_PORT = 8790;

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(2500, () => { s.destroy(); resolve(false); });
  });
}

// Servers THIS scenario started, and only those. Someone else's stack on these
// ports is theirs to keep — the same rule release.sh follows, for the same
// reason: a run that knifes a stack it did not bring up invents failures in
// whatever was using it.
const spawned = [];
process.on('exit', () => { for (const c of spawned) { try { c.kill('SIGKILL'); } catch (e) {} } });

// Bring the stack up if it is idle, exactly as lib/cast.js's ensureStack does
// for every OTHER scenario in this battery.
//
// This scenario does not use cast (see the note above), so it inherited none of
// that and simply declared the prerequisite and skipped. That was wrong in a
// way that costs the next person a green gate: behavior.sh exits NON-ZERO when
// anything skips, so a scenario that quietly declines turns the whole behavior
// tier red — and a red behavior tier can never satisfy the release gate. It was
// filed as a "sanctioned skip" for two releases; it is not sanctioned, it is
// unwired. Started by hand the scenario PASSES (423s, 2026-08-10).
//
// A skip remains possible for a fixture we genuinely cannot create — that path
// still announces itself as SKIP rather than looking like a product red.
async function ensureStack() {
  if (!(await portOpen(BASE_PORT))) {
    console.log('  site :' + BASE_PORT + ' idle — spawning python http.server');
    spawned.push(spawn('python3', ['-m', 'http.server', String(BASE_PORT), '-d', 'site'],
      { cwd: ROOT, stdio: 'ignore' }));
  }
  if (!(await portOpen(RELAY_PORT))) {
    // RELAY_DEV=1 matches cast.js and release.sh: the shared dev relay lifts the
    // production per-IP socket cap that silently starves multi-client suites.
    console.log('  relay :' + RELAY_PORT + ' idle — spawning relay-local (RELAY_DEV=1)');
    spawned.push(spawn(process.execPath, [path.join(ROOT, 'test', 'servers', 'relay-local.js')],
      { env: Object.assign({}, process.env, { RELAY_DEV: '1' }), stdio: 'ignore' }));
  }
  for (let i = 0; i < 30; i++) {
    if ((await portOpen(BASE_PORT)) && (await portOpen(RELAY_PORT))) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  if (!(await ensureStack())) {
    console.log('SKIP: the stack (:' + BASE_PORT + ' + :' + RELAY_PORT + ') was idle and would not start here');
    process.exit(0);
  }

  // ROOM=app: the app IS the room, invited from a desktop icon with no call
  // layer. That is the door a group of friends actually uses for a game — the
  // meeting door is covered by the release gate, which runs both.
  // THREE ISOLATED MACHINES. The steering physics advances per rendered
  // frame; three Chromiums on one kernel cannot answer it (that is why
  // e2e-anyroad-mp calls needFleet(3) and has no one-box door). This
  // scenario used to force ANYROAD_MP_LOCAL=1 so the behavior battery could
  // "run" on one box — which then hung on the room-name field and scored as
  // a product red, while skipping the physics. The gate for three drivers
  // IS the fleet. Unset ANYROAD_MP_LOCAL so a leaked env cannot sneak a
  // one-box run back on if the door is ever reintroduced; without three
  // machines the suite refuses with exit 3.
  const env = Object.assign({}, process.env, { ROOM: 'app' });
  delete env.ANYROAD_MP_LOCAL;
  const child = spawn('node', ['test/browser/e2e-anyroad-mp.js'], { cwd: ROOT, env });

  let out = '';
  const relay = (buf) => {
    const s = buf.toString();
    out += s;
    // The battery greps for ✘ to print the first few reds under a FAIL line.
    for (const line of s.split('\n')) {
      if (/^FAIL/.test(line)) console.log('✘ ' + line.replace(/^FAIL\s*—?\s*/, ''));
      else if (line.trim()) console.log(line);
    }
  };
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);

  const code = await new Promise((resolve) => child.on('close', resolve));

  // A suite that exits non-zero having asserted NOTHING is the most dangerous
  // state there is — it looks like silence. Insist that it actually ran.
  const passes = (out.match(/^PASS/gm) || []).length;
  const fails = (out.match(/^FAIL/gm) || []).length;
  console.log(`\n26a: ${passes} passed, ${fails} failed (exit ${code})`);
  if (code === 3) process.exit(3); // needFleet — not a product red
  if (passes === 0) {
    console.log('✘ the driving suite asserted nothing at all — it did not run, it died');
    process.exit(1);
  }
  process.exit(code === 0 && fails === 0 ? 0 : 1);
})().catch((e) => { console.log('✘ scenario threw: ' + (e && e.message)); process.exit(1); });
