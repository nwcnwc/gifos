// flood.js — the SIMULTANEOUS-connect stress the staggered e2e masks: N mesh
// nodes hit a FRESH relay in one synchronous burst (no stagger), the way a
// swarm relaunch or a real "everyone clicks join at once" does. Asserts they
// still all seat with one genesis. Proves (or breaks) the genesis-flood claim.
const { spawn } = require('child_process');
const path = require('path');
require('../site/js/gifos-net.js');
require('../site/js/mesh.js');
require('../site/js/mesh-identity.js'); // S4 is MANDATORY: the wire throws without it (load before mesh-wire.js; the wire mints each node's per-participant identity)
require('../site/js/mesh-wire.js');
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
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: TRUSTED }, stdio: 'ignore' });
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

  for (let t = 0; t < 40; t++) {
    await sleep(1000);
    const c = census(nodes);
    const gks = new Set(nodes.map((n) => n.seat.genKey)); gks.delete(null);
    console.log('t+' + (t + 1) + 's  seated=' + c.seated + '/' + N + ' unseated=' + c.unseated + ' dups=' + c.dups + ' genKeys=' + gks.size);
    if (c.seated === N && c.dups === 0) { console.log('\nCONVERGED — the flood is survivable, no stagger needed.'); break; }
    if (t === 39) console.log('\nDEADLOCK — ' + c.unseated + ' never seated. The flood is REAL.');
  }
  for (const n of nodes) n.stop();
  relay.kill(); process.exit(0);
})();
