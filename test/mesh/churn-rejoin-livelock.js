// churn-rejoin-livelock.js — END-TO-END regression drill for the 03c NOROOM
// livelock, on the REAL stack short of the browser: mesh.js + mesh-wire.js
// against relay-local over real WebSockets with real sealing.
//
// The shape (behavior battery 03c-classmates-flaky-pair, ~30% of draws in
// browsers): two members radio-churn (frames silently dropped BOTH ways, no
// close events — the meet.js radio lever) and requeue while dark, so their
// LEAVEs are swallowed and the room keeps their stale occ entries. Without
// local-evidence phantom detection (production has no env.peek) the S1
// frontier's designated admitter is a corpse entry and every greeter answers
// NOROOM to every seeker forever — the churned members never re-seat and a
// fresh entrant starves too. This drill wedged on its first draw pre-fix.
//
// Pass = after 3 churn rounds the flaky pair is re-seated AND a fresh 6th
// entrant seats, everyone on unique coords.
const { spawn } = require('child_process');
const path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;

const PORT = 8796;
const RELAY = 'ws://127.0.0.1:' + PORT;
const TICK_MS = 50;               // canonical 500ms compressed 10x
const DARK_TICKS = 100;           // > firstHandLive (60t) so the room's evidence lapses
const SETTLE_TICKS = 200;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepTicks = (t) => sleep(t * TICK_MS);

// ── the radio lever: silent drop BOTH ways, no close events ────────────────
const dark = new Set(); // peer ids currently radio-dark
const origSteady = net.steadySocket;
net.steadySocket = function (makeUrl) {
  const s = origSteady(makeUrl);
  const peerOf = () => { try { const m = /[?&]peer=([^&]*)/.exec(makeUrl()); return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; } };
  const origSend = s.send;
  s.send = (data) => { if (!dark.has(peerOf())) origSend(data); };
  let userOn = null;
  Object.defineProperty(s, 'onmessage', {
    configurable: true,
    get: () => (userOn ? (ev) => { if (!dark.has(peerOf())) userOn(ev); } : null),
    set: (fn) => { userOn = fn; },
  });
  return s;
};

// DC bus: a channel exists iff BOTH ends are seated (channels form after
// seating via signaling and die with churn); radio blackholes it silently.
const bus = new Map(); // peer -> node
const sendDC = (fromPeer) => (to, m) => {
  const src = bus.get(fromPeer), dst = bus.get(to);
  if (!src || !dst) return false;
  if (!(src.seat && src.seat.state === 3 && dst.seat && dst.seat.state === 3)) return false;
  if (dark.has(fromPeer) || dark.has(to)) return true; // channel "exists", frames vanish
  const c = JSON.parse(JSON.stringify(m));
  setTimeout(() => { if (!dark.has(fromPeer) && !dark.has(to)) dst.recvCtl(c); }, 3 + Math.random() * 10);
  return true;
};

const snap = (nodes) => nodes.map((n, i) => { const s = n.stats(); return 'n' + i + ':' + s.state + (s.coord ? '@' + s.coord.pc + '/' + s.coord.r + '.' + s.coord.i : ''); }).join(' ');
const seated = (nodes) => nodes.filter((n) => n.stats().state === 3).length;
const uniqueCoords = (nodes) => {
  const ks = nodes.map((n) => n.stats().coord).filter(Boolean).map((c) => c.pc + '_' + c.r + '_' + c.i);
  return new Set(ks).size === ks.length;
};

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(700);

  const sid = 'churn-livelock-' + process.pid;
  const key = await net.deriveMeetKey('churn-livelock-room-' + process.pid, '', '');
  const nodes = [];
  const mk = async () => {
    const opts = { relayUrl: RELAY, sid, tok: 'T', key, tickMs: TICK_MS, onGossip: () => {} };
    const node = wire.createMeshNode({ ...opts, sendDC: (to, m) => sendDC(node.peer)(to, m) });
    await node.whenReady;
    bus.set(node.peer, node);
    return node;
  };

  for (let i = 0; i < 5; i++) { nodes.push(await mk()); await sleepTicks(6); }
  let ok = false;
  for (let w = 0; w < 1200 && !ok; w += 10) { await sleepTicks(10); ok = seated(nodes) === 5; }
  check('5 nodes converge', ok, snap(nodes));

  // 3 radio-churn rounds on a flaky pair: dark -> requeue while dark (the
  // LEAVE is swallowed — the corpse-occ maker) -> radio back -> settle.
  const flaky = [nodes[3], nodes[4]];
  for (let round = 1; round <= 3; round++) {
    for (const f of flaky) dark.add(f.peer);
    await sleepTicks(40);
    for (const f of flaky) { try { f.seat.requeue(); } catch (e) {} }
    await sleepTicks(DARK_TICKS - 40);
    for (const f of flaky) dark.delete(f.peer);
    await sleepTicks(SETTLE_TICKS);
    console.log('  round ' + round + ' settled: ' + snap(nodes));
  }
  check('flaky pair re-seated after 3 churn rounds (pre-fix: state-2 livelock)',
    flaky.every((n) => n.stats().state === 3), snap(nodes));

  // the fresh 6th entrant must seat against whatever occ echoes remain
  const F = await mk();
  nodes.push(F);
  let fOk = false;
  for (let w = 0; w < 400 && !fOk; w += 10) { await sleepTicks(10); fOk = F.stats().state === 3; }
  check('fresh 6th entrant seats (pre-fix: NOROOM forever at the echo frontier)', fOk, snap(nodes));
  check('all seated on unique coords', seated(nodes) === 6 && uniqueCoords(nodes), snap(nodes));

  for (const n of nodes) { try { n.stop(); } catch (e) {} }
  relay.kill();
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
