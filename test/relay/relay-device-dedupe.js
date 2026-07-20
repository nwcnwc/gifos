// Relay device-dedupe test (no browser). A meeting is a host-less mesh room;
// each browser tab gets its own peer id (sessionStorage) but a device carries
// one stable device id (localStorage). A second tab — or a frozen mobile tab
// the relay hasn't reaped — must NOT linger as a ghost beside you. The relay
// evicts any same-device socket on join, closing the old one and broadcasting
// a peer-leave so the room converges on one slot per device.
//
// Runs against relay-local.js (which mirrors the Worker's mesh join logic).
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8791;
const URL = 'ws://127.0.0.1:' + PORT + '/s/room-dedupe?role=mesh';
let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A tiny mesh client: connects, records every message and its own close.
function join({ peer, dev, name }) {
  const c = { peer, msgs: [], closed: false, closeCode: null };
  const q = new URLSearchParams({ role: 'mesh', peer, dev, name: name || peer });
  c.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/room-dedupe?' + q.toString());
  c.ws.onmessage = (e) => { try { c.msgs.push(JSON.parse(e.data)); } catch (_) {} };
  c.ws.onclose = (e) => { c.closed = true; c.closeCode = e.code; };
  c.ready = new Promise((res) => { c.ws.onopen = res; });
  c.roster = () => c.msgs.filter((m) => m.t === 'roster').slice(-1)[0] || null;
  c.leaves = () => c.msgs.filter((m) => m.t === 'peer-leave').map((m) => m.peer);
  return c;
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  await sleep(400); // let it bind

  try {
    // Two DIFFERENT devices arrive — both are real guests, both stay.
    const a = join({ peer: 'p_a', dev: 'devA', name: 'Ann' });
    const b = join({ peer: 'p_b', dev: 'devB', name: 'Bob' });
    await Promise.all([a.ready, b.ready]);
    await sleep(200);
    const r0 = b.roster();
    check('two distinct devices → both present', r0 && r0.peers.length === 2 && r0.peers.includes('p_a') && r0.peers.includes('p_b'));
    check('neither distinct-device socket was closed', !a.closed && !b.closed);

    // Ann opens a SECOND tab: same device (devA), new peer id (p_a2). The old
    // tab must be evicted and the room must converge on one slot for devA.
    const a2 = join({ peer: 'p_a2', dev: 'devA', name: 'Ann' });
    await a2.ready;
    await sleep(300);

    check('same-device rejoin closes the old ghost tab', a.closed === true);
    const r1 = b.roster();
    check('room shows one slot per device (no ghost)', r1 && r1.peers.length === 2 && r1.peers.includes('p_a2') && r1.peers.includes('p_b') && !r1.peers.includes('p_a'));
    check('everyone hears the ghost leave', b.leaves().includes('p_a'));
    check('the surviving devA socket is the new tab', !a2.closed);
    check('Bob (other device) is untouched', !b.closed);

    // A plain reload REUSES the peer id — a silent swap, not a broadcast leave.
    const bReloadLeavesBefore = a2.leaves().filter((p) => p === 'p_b').length;
    const b2 = join({ peer: 'p_b', dev: 'devB', name: 'Bob' });
    await b2.ready;
    await sleep(300);
    const r2 = a2.roster();
    check('same-peer reload keeps one slot', r2 && r2.peers.filter((p) => p === 'p_b').length === 1);
    check('same-peer reload does NOT broadcast a spurious leave', a2.leaves().filter((p) => p === 'p_b').length === bReloadLeavesBefore);

    a2.ws.close(); b2.ws.close();
    await sleep(100);
  } finally {
    relay.kill();
  }

  console.log(failures ? ('\n' + failures + ' check(s) failed') : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
