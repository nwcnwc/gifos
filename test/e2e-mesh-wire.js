// e2e-mesh-wire.js — END-TO-END test of the production mesh stack short of the
// browser: mesh.js (the ported sim brain) + mesh-wire.js (transport binding)
// against the REAL relay-local.js over REAL WebSockets with REAL AES-GCM
// sealing. What the browser adds on top is only WebRTC (here: an in-process
// "DC bus" standing in for DataChannels — reliable, ordered, black-holes to
// dead peers exactly like a channel whose far end crashed).
//
// Scenarios:
//   A. 20 nodes join one room (fake-DC control, relay carries knock/greeters
//      only — the production traffic shape): converge to all-seated, unique
//      coords, ONE genesis key; then 8 CRASH (no LEAVE) → survivors heal back
//      to a converged mesh.
//   B. R6 wrong password: a knocker whose key can't open the sealed greeter
//      blobs gets onLocked, never seats, never pollutes the pool.
//   C. 3 nodes with NO DC layer: all control rides sealed relay {t:'peer'}
//      frames — validates the fallback path + relay budgets end-to-end.
const { spawn } = require('child_process');
const path = require('path');
require('../site/js/gifos-net.js');
require('../site/js/mesh.js');
require('../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;

const PORT = 8797;
const RELAY = 'ws://127.0.0.1:' + PORT;
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function convergence(nodes) {
  const coords = new Map(); let seated = 0, dups = 0;
  for (const n of nodes) {
    const s = n.stats();
    if (s.state === 3 && s.coord) { seated++; const k = s.coord.pc + '_' + s.coord.r + '_' + s.coord.i; if (coords.has(k)) dups++; else coords.set(k, s.peer); }
  }
  let s1 = 0; for (const k of coords.keys()) if (k.startsWith('0_')) s1++;
  return { seated, dups, s1 };
}
async function waitConverged(nodes, N, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = convergence(nodes);
    if (c.seated === N && c.dups === 0) return c;
    await sleep(500);
  }
  return convergence(nodes);
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(600);

  // ---------- Scenario A: 20 nodes over the DC bus ----------
  {
    const key = await net.deriveMeetKey('wire-room-a', '', '');
    const bus = new Map(); // peer -> { node, dead }
    const sendDC = (to, m) => { // reliable in-order fake DC; black-holes to the dead
      const e = bus.get(to);
      if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (!e.dead) e.node.recvCtl(c); }, 5 + Math.random() * 20); }
      return true; // a channel "exists" either way — a crashed far end just never answers
    };
    const nodes = [];
    for (let i = 0; i < 20; i++) {
      const peer = 'a' + String(i).padStart(2, '0');
      const node = wire.createMeshNode({ relayUrl: RELAY, sid: 'wire-a-sid', tok: 'T', key, peer, tickMs: 25, sendDC });
      bus.set(peer, { node, dead: false });
      nodes.push(node);
      await sleep(25);
    }
    let c = await waitConverged(nodes, 20, 90000);
    check('A: 20 nodes all seated, no dups (s1=' + c.s1 + ')', c.seated === 20 && c.dups === 0, c);
    const keys = new Set(nodes.map((n) => n.seat.genKey)); keys.delete(null);
    check('A: one genesis key across the room', keys.size === 1, { distinct: keys.size });

    // CRASH 8 (no LEAVE, sockets die, DCs black-hole) → survivors heal.
    const dead = nodes.slice(12);
    for (const n of dead) { bus.get(n.peer).dead = true; n.stop(); }
    const survivors = nodes.slice(0, 12);
    c = await waitConverged(survivors, 12, 120000);
    check('A: 12 survivors re-converged after crash of 8 (s1=' + c.s1 + ')', c.seated === 12 && c.dups === 0, c);

    // ---------- Scenario B: wrong password on the SAME room ----------
    const badKey = await net.deriveMeetKey('wire-room-a', '', 'wrong-pw');
    let locked = false;
    const badNode = wire.createMeshNode({ relayUrl: RELAY, sid: 'wire-a-sid', tok: 'T', key: badKey, peer: 'evil1', tickMs: 25, onLocked: () => { locked = true; } });
    const t0 = Date.now();
    while (!locked && Date.now() - t0 < 20000) await sleep(250);
    check('B: wrong-password knocker gets onLocked (R6)', locked);
    check('B: wrong-password knocker never seats', badNode.stats().state !== 3, badNode.stats());
    badNode.stop();
    for (const n of survivors) n.stop();
  }

  // ---------- Scenario C: relay-only control (no DC layer) ----------
  {
    const key = await net.deriveMeetKey('wire-room-c', '', '');
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      nodes.push(wire.createMeshNode({ relayUrl: RELAY, sid: 'wire-c-sid', tok: 'T', key, peer: 'c' + i, tickMs: 300 }));
      await sleep(150);
    }
    const c = await waitConverged(nodes, 3, 90000);
    check('C: 3 nodes converge with ALL control over sealed relay frames', c.seated === 3 && c.dups === 0, c);
    for (const n of nodes) n.stop();
  }

  relay.kill();
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
