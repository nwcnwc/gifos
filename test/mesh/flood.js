// flood.js — the SIMULTANEOUS-connect stress the staggered e2e masks: N mesh
// nodes hit a FRESH relay in one synchronous burst (no stagger), the way a
// swarm relaunch or a real "everyone clicks join at once" does. Asserts they
// still all seat with one genesis. Proves (or breaks) the genesis-flood claim.
const { spawn } = require('child_process');
const path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
require('../../site/js/mesh-identity.js'); // S4 is MANDATORY: the wire throws without it (load before mesh-wire.js; the wire mints each node's per-participant identity)
require('../../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const N = parseInt(process.argv[2] || '20', 10);
const PORT = 8795;
const TRUSTED = '127.0.0.1,::1,::ffff:127.0.0.1';
const RELAY = 'ws://127.0.0.1:' + PORT;

function census(nodes) {
  const coords = new Map(); let seated = 0, dups = 0, unseated = 0;
  for (const n of nodes) {
    const s = n.stats();
    if (s.state === 3 && s.coord) { seated++; const k = s.coord.pc + '_' + s.coord.r + '_' + s.coord.i; if (coords.has(k)) dups++; else coords.set(k, s.peer); }
    else unseated++;
  }
  return { seated, dups, unseated };
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: TRUSTED }, stdio: 'ignore' });
  await sleep(700);
  const key = await net.deriveMeetKey('flood-room', '', '');
  const bus = new Map();
  const sendDC = (to, m) => { const e = bus.get(to); if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (!e.dead) e.node.recvCtl(c); }, 5 + Math.random() * 20); } return true; };

  console.log('BURST: creating ' + N + ' nodes in one synchronous loop, ZERO stagger…');
  const nodes = [];
  for (let i = 0; i < N; i++) {
    // No `peer` passed: S4 is mandatory, so the wire MINTS a per-participant
    // identity (node.peer = H(pubkey)) — the id it actually routes on.
    const node = wire.createMeshNode({ relayUrl: RELAY, sid: 'flood-sid', tok: 'T', key, tickMs: 25, sendDC });
    nodes.push(node);
  } // <-- no await between them: all sockets open together, all connect-knock at once
  // Once each node's keypair is minted, key the DC bus by the MINTED id so
  // sendDC(to) resolves (mint is a brief local async step; the burst — the
  // simultaneous relay connect+knock — already fired above).
  await Promise.all(nodes.map((n) => n.whenReady));
  for (const n of nodes) bus.set(n.peer, { node: n, dead: false });

  // This suite used to exit(0) unconditionally — it printed "DEADLOCK … the
  // flood is REAL" and still scored GREEN, so the burst-join guard could never
  // fail the release gate and reported 0 assertions while doing it. Record the
  // verdict and exit on it.
  // WAIT FOR PROGRESS TO STOP, NOT FOR A CLOCK TO RUN OUT.
  //
  // This used to be a flat 40s ceiling, and it flaked the 0.9.7 gate at
  // seated=19/20 — one node short, on a box that was running ~160 other suites.
  // 40 seconds is not a product promise; nobody ships "a burst join converges
  // inside 40s". The claim is that it converges AT ALL, and the failure this
  // suite is named for is a DEADLOCK — a flood that has stopped making
  // progress. So measure that directly: keep waiting while the census is still
  // improving, and declare deadlock only once it has been STILL for STALL_S.
  //
  // Strictly sharper in both directions. A real deadlock now fails in ~15s
  // instead of 40, and a slow box converges instead of reporting a deadlock
  // that is not there. CEILING_S is only a forward-progress backstop.
  const STALL_S = 15, CEILING_S = 180;
  let converged = false, last = null, best = -1, stillFor = 0;
  for (let t = 0; t < CEILING_S; t++) {
    await sleep(1000);
    const c = census(nodes); last = c;
    const gks = new Set(nodes.map((n) => n.seat.genKey)); gks.delete(null);
    // "Progress" is the whole census getting closer to converged, not just the
    // seat count: collapsing rival genesis keys and shedding dups both count.
    const score = c.seated - c.dups - (gks.size > 1 ? gks.size : 0);
    if (score > best) { best = score; stillFor = 0; } else { stillFor++; }
    console.log('t+' + (t + 1) + 's  seated=' + c.seated + '/' + N + ' unseated=' + c.unseated + ' dups=' + c.dups + ' genKeys=' + gks.size + (stillFor ? '  (still for ' + stillFor + 's)' : ''));
    // One genesis key, or the burst founded rival rooms — a split-brain the old
    // seated/dups check alone would have called convergence.
    if (c.seated === N && c.dups === 0 && gks.size === 1) { converged = true; console.log('\nCONVERGED — the flood is survivable, no stagger needed.'); break; }
    if (stillFor >= STALL_S) { console.log('\nSTALLED — no progress for ' + STALL_S + 's; this is the deadlock, not a slow box.'); break; }
  }
  for (const n of nodes) n.stop();
  relay.kill();
  if (converged) {
    console.log('PASS — all ' + N + ' burst-joined seats took, no duplicates, one genesis key');
    process.exit(0);
  }
  console.log('FAIL — DEADLOCK: seated=' + last.seated + '/' + N + ' unseated=' + last.unseated + ' dups=' + last.dups
    + ' — and STILL for ' + STALL_S + 's, so it is not a slow box. The flood is REAL.');
  process.exit(1);
})();
