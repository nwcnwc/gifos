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

(async () => {
  // A missing fixture must announce itself as a missing fixture. The battery
  // reads a leading "SKIP:" and counts it apart from a pass — the one thing it
  // must never do is look like a product red.
  for (const [port, what] of [[BASE_PORT, 'a static server on 8099 (python3 -m http.server 8099 -d site)'],
                              [RELAY_PORT, 'the local relay on 8790 (node test/servers/relay-local.js)']]) {
    if (!(await portOpen(port))) {
      console.log('SKIP: ' + what + ' is not up');
      process.exit(0);
    }
  }

  // ROOM=app: the app IS the room, invited from a desktop icon with no call
  // layer. That is the door a group of friends actually uses for a game — the
  // meeting door is covered by the release gate, which runs both.
  const env = Object.assign({}, process.env, { ROOM: 'app' });
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
  if (passes === 0) {
    console.log('✘ the driving suite asserted nothing at all — it did not run, it died');
    process.exit(1);
  }
  process.exit(code === 0 && fails === 0 ? 0 : 1);
})().catch((e) => { console.log('✘ scenario threw: ' + (e && e.message)); process.exit(1); });
