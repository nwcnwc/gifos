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
// RELAY_URL=ws://… floods a relay that is already running (e.g. the real Worker
// under test/servers/relay-dev.sh, started with --var TRUSTED_IPS for loopback).
const RELAY = process.env.RELAY_URL || 'ws://127.0.0.1:' + PORT;
// FLOOD_TICK_MS: the mesh tick. 25 ms (default) runs the protocol 20x faster than
// the browser's 500 ms (run.html) — fine against the in-process relay-local, but
// against the real Worker it is the relay traffic of 20x as many people.
const TICK_MS = parseInt(process.env.FLOOD_TICK_MS || '25', 10);

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
  const relay = process.env.RELAY_URL ? { pid: -1, kill() {} }
    : spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: TRUSTED }, stdio: 'ignore' });
  if (!process.env.RELAY_URL) await sleep(700);
  // A fresh room per run: a Durable Object remembers a room between runs.
  const ROOM = 'flood-' + Math.random().toString(36).slice(2, 8);
  const key = await net.deriveMeetKey(ROOM, '', '');
  const bus = new Map();
  const sendDC = (to, m, from) => { const e = bus.get(to); if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (!e.dead) e.node.recvCtl(c, from, true); }, 5 + Math.random() * 20); } return true; }; // lands as run.html hands a DataChannel frame over: from the pair, direct

  console.log('BURST: creating ' + N + ' nodes in one synchronous loop, ZERO stagger…');
  const nodes = [];
  for (let i = 0; i < N; i++) {
    // No `peer` passed: S4 is mandatory, so the wire MINTS a per-participant
    // identity (node.peer = H(pubkey)) — the id it actually routes on.
    const node = wire.createMeshNode({ relayUrl: RELAY, sid: ROOM, tok: 'T', key, tickMs: TICK_MS, sendDC });
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
  // FLOOD_STALL_S / FLOOD_CEILING_S: a slow relay host (the real Worker under
  // wrangler dev on a small ARM box) needs a longer stall window to tell slow from stuck.
  const STALL_S = parseInt(process.env.FLOOD_STALL_S || '15', 10), CEILING_S = parseInt(process.env.FLOOD_CEILING_S || '180', 10);
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
  // RELAY MEMORY CEILING. A relay whose per-join work grows with the room shows
  // up here before anything else: the old roster (every socket sent to every
  // socket on every connect) buffered 13 GB of frames at N=700 and left 699
  // nodes silently waiting on it. Peak RSS (VmHWM), Linux only; elsewhere the
  // check says so and does not judge.
  let relayMb = null;
  try { const st = require('fs').readFileSync('/proc/' + relay.pid + '/status', 'utf8'); const m = /VmHWM:\s+(\d+) kB/.exec(st); if (m) relayMb = Math.round(+m[1] / 1024); } catch (e) {}
  relay.kill();
  const CEIL_MB = parseInt(process.env.FLOOD_RELAY_MB || '512', 10);
  console.log('relay peak RSS: ' + (relayMb == null ? 'unmeasured (no /proc)' : relayMb + ' MB') + ' — ceiling ' + CEIL_MB + ' MB');
  if (relayMb != null && relayMb > CEIL_MB) {
    console.log('FAIL — the relay peaked at ' + relayMb + ' MB for ' + N + ' joiners: its per-join work grows with the room');
    process.exit(1);
  }
  if (converged) {
    console.log('PASS — all ' + N + ' burst-joined seats took, no duplicates, one genesis key');
    process.exit(0);
  }
  console.log('FAIL — DEADLOCK: seated=' + last.seated + '/' + N + ' unseated=' + last.unseated + ' dups=' + last.dups
    + ' — and STILL for ' + STALL_S + 's, so it is not a slow box. The flood is REAL.');
  process.exit(1);
})();
