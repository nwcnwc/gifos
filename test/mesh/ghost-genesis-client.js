// ghost-genesis-client.js — THE CLIENT ARM OF R3a: a greeter SEALED OUT OF ITS
// OWN DOOR must notice, and re-enter.
//
// The relay side of R3a (the mint grace — see test/drills/e2e-ghost-genesis.js
// and healing-laws.md R3a) makes a blobless genesis claim LAPSE. This file
// guards the other half, which the field bug exposed and nothing acted on:
// the relay answers every knock with `admitted` — does the presented genesis
// key match the room's? — and a SEATED Section-1 greeter that is refused is in
// a state it can neither see nor fix by waiting: its E3/keepalive
// re-registrations are silently dropped (`if (admitted && gblob)`), the pool
// never lists it again, and from its own view the room merely looks empty.
// The greeterTrace recorded `adm` for forensics; no code path read it.
//
// THE RULE (mesh-wire onGreeters): a seated Section-1 greeter refused THREE
// registrations running, spanning at least 60 ticks, requeues through the
// front door — the join dance re-teaches the room's real current key, or its
// own re-mint finally sticks once the squatting claim lapses/leaves.
//
// THE SCENARIO, the exact field shape (prod room "test", 2026-07-29):
//   1. node A founds a room, seats at 0/0.0, registers as a greeter;
//   2. the relay bounces (DO eviction / deploy) — the registry is EMPTY;
//   3. a socket attaches carrying a key nobody will ever present again (the
//      CONNECT knock with a throwaway — here, an explicit ghost) and FOUNDS;
//   4. A reconnects: every re-registration now answers admitted:false. Before
//      the fix A sat "seated" at a door that would never list it, forever.
// Asserts: A's wire notices (greeterTrace 'ghost-genesis-requeue'), and once
// the ghost leaves, A re-founds and the door is MANNED again (a probe knock
// sees a non-empty greeter list).
const { spawn } = require('child_process');
const path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8797;
const RELAY = 'ws://127.0.0.1:' + PORT;
const TRUSTED = '127.0.0.1,::1,::ffff:127.0.0.1';
const TICK_MS = 10; // 60-tick span = 0.6s; E3 re-knocks land every 2-4s

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

let relay = null;
function startRelay() {
  relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: TRUSTED,
      // the ghost must HOLD its claim while we watch the client arm fire; the
      // escape in this scenario is the ghost socket leaving, not the grace
      RELAY_MINT_GRACE_MS: '120000' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
}
const stopRelay = () => { try { relay && relay.kill('SIGKILL'); } catch (e) {} };
process.on('exit', stopRelay);

// A raw door probe: knock with a throwaway key, return the reply.
function probeKnock(tag) {
  return new Promise((resolve) => {
    const ws = new WebSocket(RELAY + '/s/ggc-sid?role=mesh&token=T&peer=' + tag + '&dev=d_' + tag.slice(0, 13) + '&gk=probe_' + tag);
    const to = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(null); }, 4000);
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'greeters') { clearTimeout(to); try { ws.close(); } catch (e) {} resolve(m); }
    };
    ws.onerror = () => {};
  });
}

(async () => {
  startRelay();
  await sleep(700);

  const key = await net.deriveMeetKey('ggc-room', '', '');
  const node = wire.createMeshNode({ relayUrl: RELAY, sid: 'ggc-sid', tok: 'T', key, tickMs: TICK_MS, sendDC: () => true });
  await node.whenReady;

  // ---- 1. A founds and mans the door --------------------------------------
  let s = null;
  for (let i = 0; i < 400 && !(s && s.state === 3 && s.coord && s.coord.pc === 0); i++) { await sleep(25); s = node.stats(); }
  check('A founds the room and seats in Section 1', !!(s && s.state === 3 && s.coord && s.coord.pc === 0), s);
  const p0 = await probeKnock('p0');
  check('the door lists A (a registered greeter)', !!(p0 && (p0.list || []).length >= 1), p0 && { list: (p0.list || []).length, founded: p0.founded });

  // ---- 2. the relay bounces; a ghost founds the empty registry ------------
  stopRelay();
  await sleep(1200);
  // hot loop: grab the port the instant the relay returns, before A's
  // steadySocket backoff wins the race (the field shape: a mid-join client's
  // CONNECT knock with a throwaway key)
  let ghost = null;
  const ghostUp = new Promise((resolve) => {
    const dial = () => {
      const ws = new WebSocket(RELAY + '/s/ggc-sid?role=mesh&token=T&peer=ghost&dev=d_ghost&gk=GHOSTKEY'); // dev: a device tag is required at the door (4012)
      ws.onopen = () => { ghost = ws; try { ws.send(JSON.stringify({ t: 'knock', gk: 'GHOSTKEY' })); } catch (e) {} resolve(); };
      ws.onerror = () => { setTimeout(dial, 50); };
    };
    dial();
  });
  startRelay();
  await ghostUp;
  const pg = await probeKnock('pg');
  check('the ghost holds the genesis (probe not admitted, empty list, unfounded-for-others reply shape)',
    !!(pg && (pg.list || []).length === 0 && pg.admitted === false), pg && { list: (pg.list || []).length, admitted: pg.admitted, founded: pg.founded });

  // ---- 3. A's wire notices it is sealed out and requeues ------------------
  let fired = false;
  for (let i = 0; i < 1600 && !fired; i++) { await sleep(25); fired = node.greeterTrace().some((e) => e.action === 'ghost-genesis-requeue'); }
  check("A notices the door refuses it (greeterTrace 'ghost-genesis-requeue')", fired,
    { tail: node.greeterTrace().slice(-3).map((e) => e.action + '/adm=' + e.adm) });

  // ---- 4. the ghost leaves; A re-founds and the door is manned again ------
  try { ghost && ghost.close(); } catch (e) {}
  let healed = null;
  for (let i = 0; i < 1200; i++) {
    await sleep(25);
    const st = node.stats();
    if (st.state === 3 && st.coord && st.coord.pc === 0) {
      const pr = await probeKnock('p' + i);
      if (pr && (pr.list || []).length >= 1) { healed = { st, list: (pr.list || []).length }; break; }
    }
  }
  check('A re-founds once the squatter leaves, and the door lists a greeter again', !!healed, healed || node.stats());

  node.stop();
  stopRelay();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL — threw: ' + (e && e.stack || e)); stopRelay(); process.exit(1); });
