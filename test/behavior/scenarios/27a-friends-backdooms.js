'use strict';
// USE CASE 27 — FOUR FRIENDS PLAYING ONE GAME TOGETHER. Ada opens Backdooms
// from a desktop icon, presses Invite, and sends one link. Ben, Cyd and Dev
// open it. They wake in the same maze, they can see each other walking down
// the corridor, they can shoot each other, and when one of them closes the tab
// the others' halls empty out on their own.
//
// Why it belongs in the BEHAVIOR battery. This battery's premise is "real
// people, real phone realities, no monitors", and four friends in a shooter is
// exactly that shape. 26a covers three people in a car game; this is the other
// thing a group actually does with an app room, and it is the ONLY place four
// clients share one app's state at once. Four is not three with an extra body:
// the shared-state cost is superlinear in N (docs/app-services.md §4 — every
// write is owner-validated, Ed25519-signed over the WHOLE collection, and
// flooded, and every client then re-reads all N rows), so three players is a
// shape where a traffic regression can hide and four is where it shows.
//
// This scenario does NOT use lib/cast.js, for the same reason 26a does not.
// cast spawns test/swarm/meet.js per role and speaks the MEETING vocabulary
// (join/chat/leave/die); four people inside a first-person shooter's own
// sandbox is a different animal, and wrapping it in cast would mean teaching
// cast to walk down a corridor. The suite that builds this world lives in
// test/browser/e2e-backdooms-mp.js, so this runs THAT and translates its
// output into the battery's contract. One implementation, two front doors — a
// second copy of a four-browser harness would drift from the first in a month.
//
// FOUR ISOLATED MACHINES, and there is no one-box door. The app IS its
// animation loop: position rows are written from inside requestAnimationFrame,
// which Chromium throttles to about one frame a second in a backgrounded tab,
// so on one box only the tab in front publishes and the other three stand
// still in everyone else's halls. e2e-anyroad-mp measured precisely that and
// it reads as a product bug. Without four machines this exits 3, NEEDS-FLEET.
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
// ports is theirs to keep — a run that knifes a stack it did not bring up
// invents failures in whatever was using it.
const spawned = [];
process.on('exit', () => { for (const c of spawned) { try { c.kill('SIGKILL'); } catch (e) {} } });

// Bring the stack up if it is idle, exactly as lib/cast.js's ensureStack does
// for every other scenario here. A scenario that quietly declines turns the
// whole behaviour tier red (behavior.sh exits non-zero on a skip), which can
// never satisfy the release gate — that is 26a's history and it is not worth
// repeating.
//
// NOTE the bind address. The browsers are on OTHER MACHINES and dial the
// orchestrator over the network, so a stack listening only on 127.0.0.1 is a
// stack they cannot reach. When this scenario starts the site itself it binds
// 0.0.0.0; if a stack is ALREADY up it is left alone, and a loopback-only one
// will surface as the fleet suite failing to load the page rather than here.
async function ensureStack() {
  if (!(await portOpen(BASE_PORT))) {
    console.log('  site :' + BASE_PORT + ' idle — spawning python http.server on 0.0.0.0');
    spawned.push(spawn('python3', ['-m', 'http.server', String(BASE_PORT), '-d', 'site', '--bind', '0.0.0.0'],
      { cwd: ROOT, stdio: 'ignore' }));
  }
  if (!(await portOpen(RELAY_PORT))) {
    // RELAY_DEV=1 matches cast.js and release.sh: the shared dev relay lifts
    // the production per-IP socket cap that silently starves multi-client runs.
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

  const child = spawn('node', ['test/browser/e2e-backdooms-mp.js'], { cwd: ROOT, env: process.env });

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
  console.log('\n27a: ' + passes + ' passed, ' + fails + ' failed (exit ' + code + ')');
  if (code === 3) process.exit(3); // needFleet — not a product red
  if (passes === 0) {
    console.log('✘ the four-friend suite asserted nothing at all — it did not run, it died');
    process.exit(1);
  }
  process.exit(code === 0 && fails === 0 ? 0 : 1);
})().catch((e) => { console.log('✘ scenario threw: ' + (e && e.message)); process.exit(1); });
