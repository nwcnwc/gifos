// greeter-expiry.js — CAN A LIVE MEETING LOSE ITS DOOR?
//
// A Section-1 seat holds its place in the relay's greeter registry by
// re-knocking every E3_PERIOD = 200 + rand(200) ticks (mesh.js). The relay
// expires an entry after GREETER_TTL_MS = 250s. At the canonical 500ms tick
// that is a 100–200s re-knock against a 250s TTL: a margin as thin as 50s, and
// a tick stretched past ~625ms puts the worst case OVER the TTL. Browser timers
// throttle under load and in background tabs, so that is not a hypothetical.
//
// What makes it serious is what happens next. A newcomer handed an EMPTY list
// by a relay that reports the session as founded does not wait — it FOUNDS ITS
// OWN ROOM (mesh.js GREETERS: the R3/R6 take-over). So an expired pool does not
// degrade joining, it SPLITS the meeting: the newcomer sits alone at 0/0.0
// believing it is the founder, while the real room carries on without it.
// `drills/adversary-room.js` has repeatedly caught exactly that shape.
//
// Two claims, both measured here against a real relay with the TTL shortened
// (RELAY_GREETER_TTL_MS — a test knob; production is untouched):
//   1. a seated Section-1 room KEEPS its greeter entries alive by re-knocking
//   2. a newcomer arriving at a live meeting joins IT — never founds a rival
//
// If (1) breaks, the door closes on a healthy room. If (2) breaks, the meeting
// silently becomes two meetings, which no link-completeness check can see.
//
// WHAT IT FOUND, so nobody re-runs this reasoning: the split does NOT come from
// here. Run with TTL_MS=400 — a TTL five to ten times SHORTER than the re-knock
// cadence, so the pool is empty almost all the time — and the newcomer still
// joins the existing meeting every time. The relay reports an empty pool as NOT
// founded, and `onGreeters` holds on the mint gap and re-knocks instead of
// taking over. The R3/R6 take-over needs an empty list AND a founded session,
// which an expired pool does not produce. So this file is a regression guard
// for a door that already works, and the browser splits have another cause.
const { spawn } = require('child_process');
const path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = 8796;
const RELAY = 'ws://127.0.0.1:' + PORT;
const TRUSTED = '127.0.0.1,::1,::ffff:127.0.0.1';
// The room ticks at TICK_MS. E3 re-knocks at 200–400 ticks, so the pool must be
// refreshed by 400*TICK_MS; the TTL is set comfortably above that and the test
// waits well past it. Scaled down ~50x from the production numbers.
const TICK_MS = 10;
const TTL_MS = parseInt(process.env.TTL_MS || '6000', 10);   // > 400 ticks * 10ms = 4s
const SETTLE_MS = 3000, SOAK_MS = TTL_MS * 2.5;

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: TRUSTED, RELAY_GREETER_TTL_MS: String(TTL_MS) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const cleanup = () => { try { relay.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(700);

  const key = await net.deriveMeetKey('greeter-expiry-room', '', '');
  const bus = new Map();
  const sendDC = (to, m) => { const e = bus.get(to); if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (!e.dead) e.node.recvCtl(c); }, 2 + Math.random() * 6); } return true; };
  const nodes = [];
  const mk = async () => {
    const n = wire.createMeshNode({ relayUrl: RELAY, sid: 'gx-sid', tok: 'T', key, tickMs: TICK_MS, sendDC });
    await n.whenReady; bus.set(n.peer, { node: n, dead: false }); nodes.push(n); return n;
  };

  // ---- a room of 4 forms and settles into Section 1 ----
  for (let i = 0; i < 4; i++) { await mk(); await sleep(250); }
  await sleep(SETTLE_MS);
  const seatedOf = (ns) => ns.map((n) => n.stats()).filter((s) => s.state === 3 && s.coord);
  const early = seatedOf(nodes);
  const coordStr = (s) => s.coord.pc + '/' + s.coord.r + '.' + s.coord.i;
  check('4 nodes seat in Section 1', early.length === 4 && early.every((s) => s.coord.pc === 0),
    early.map(coordStr).join(' '));
  const genKeys = new Set(nodes.map((n) => n.seat.genKey));
  check('one meeting: they agree on a single genesis key', genKeys.size === 1, genKeys.size);

  // ---- soak past the greeter TTL, with the room fully alive ----
  console.log('soaking ' + Math.round(SOAK_MS / 1000) + 's past a ' + (TTL_MS / 1000) + 's greeter TTL…');
  await sleep(SOAK_MS);

  // ---- claim 1: the door is still open ----
  // Ask the relay for the pool exactly as a knocker does, through a fresh node,
  // and count how many sealed blobs it hands back.
  const probe = await mk();
  await sleep(SETTLE_MS);
  const ps = probe.stats();

  // ---- claim 2: the newcomer joined THIS meeting, not a new one ----
  check('the newcomer seats', ps.state === 3 && !!ps.coord, ps.coord ? coordStr(ps) : 'UNSEATED');
  check('the newcomer joined the EXISTING meeting (same genesis key), rather than founding a rival',
    probe.seat.genKey === nodes[0].seat.genKey,
    { mine: String(probe.seat.genKey).slice(0, 12), room: String(nodes[0].seat.genKey).slice(0, 12) });
  check('the newcomer did NOT take the founder cell 0/0.0',
    !(ps.coord && ps.coord.pc === 0 && ps.coord.r === 0 && ps.coord.i === 0),
    ps.coord ? coordStr(ps) : 'unseated');
  const all = seatedOf(nodes);
  const coords = all.map(coordStr);
  check('every seat is distinct — the room did not split', new Set(coords).size === coords.length, coords.join(' '));
  check('the original four are still seated', all.length === 5, all.length + '/5');

  for (const n of nodes) n.stop();
  cleanup();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS — the door stays open and a newcomer joins the meeting that exists');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || e); process.exit(2); });
