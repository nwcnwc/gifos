// e2e-vanish.js — THE MONEY TEST for healing-laws D5 (early-probe): measures
// vanish-to-seat-freed time per departure mode over the PRODUCTION wire stack
// (mesh.js + mesh-wire.js + the real relay + real AES-GCM sealing + real S4
// identities), with an in-process DC bus standing in for WebRTC DataChannels —
// reliable, ordered, black-holes to dead peers, and (like the real browser
// plumbing in meet.html) OBSERVES a peer's death: ~2 ticks after an ungraceful
// crash every survivor that "held a channel" gets seat.transportLost(dead),
// exactly what meet.html's dc.onclose / failed-persist handlers feed.
//
// Modes measured (ticks; 1 production tick = 500ms — tickMs shrinks time, not
// tick counts, so ticks x 0.5s IS the production-equivalent wall time):
//   GRACEFUL  leave() on tab close (beforeunload/pagehide) -> ~instant (D2)
//   CRASH     SIGKILL: no LEAVE, transports observed dead  -> ~EARLY_HOLD (D5)
//   BLACKHOLE frames vanish, NO transport event:
//               recovers inside the horizon -> seat KEPT, zero evictions
//               never recovers             -> old horizon frees it (backstop)
const { spawn } = require('child_process');
const path = require('path');
require('../site/js/gifos-net.js');
require('../site/js/mesh.js');
require('../site/js/mesh-identity.js');
require('../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire, mesh = globalThis.GifOS.mesh;
const topo = net.topo, ck = topo.ckey;

const PORT = 8798;
const RELAY = 'ws://127.0.0.1:' + PORT;
const TICK_MS = 40;          // fast clock; tick COUNTS match production
const PROD_TICK_S = 0.5;     // 1 tick = 500ms in production (mesh-wire.js)
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const secs = (ticks) => (ticks < 0 ? '?' : (ticks * PROD_TICK_S).toFixed(1) + 's');

(async () => {
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(600);

  const key = await net.deriveMeetKey('vanish-room', '', '');
  // The DC bus: per-peer entry {node, dead, holed}. dead = process gone (crash /
  // graceful close alike: frames black-hole). holed = network blackhole (frames
  // vanish BOTH ways but the process lives).
  const bus = new Map();
  const cut = (a, b) => { const ea = bus.get(a), eb = bus.get(b); return (ea && (ea.dead || ea.holed)) || (eb && (eb.dead || eb.holed)); };
  const sendDC = (to, m) => {
    const e = bus.get(to);
    if (e && !cut(to, m && m.__from)) { const c = JSON.parse(JSON.stringify(m)); delete c.__from; setTimeout(() => { if (!e.dead && !e.holed) e.node.recvCtl(c); }, 5 + Math.random() * 15); }
    return true; // a channel "exists" either way — a crashed far end just never answers
  };
  const N = 12;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const node = wire.createMeshNode({
      relayUrl: RELAY, sid: 'vanish-sid', tok: 'T', key, tickMs: TICK_MS,
      sendDC: (to, m) => { const e2 = bus.get(node.peer); if (e2 && (e2.dead || e2.holed)) return true; m.__from = node.peer; const r = sendDC(to, m); delete m.__from; return r; },
    });
    await node.whenReady;
    bus.set(node.peer, { node, dead: false, holed: false });
    nodes.push(node);
    await sleep(30);
  }
  const live = () => nodes.filter((n) => { const e = bus.get(n.peer); return !e.dead; });
  const converged = () => {
    const coords = new Map(); let seated = 0, dups = 0;
    for (const n of live()) { const s = n.stats(); if (s.state === 3 && s.coord) { seated++; const k = s.coord.pc + '_' + s.coord.r + '_' + s.coord.i; if (coords.has(k)) dups++; else coords.set(k, n.peer); } }
    return { seated, dups };
  };
  {
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) { const c = converged(); if (c.seated === live().length && c.dups === 0) break; await sleep(300); }
    const c = converged();
    check('setup: ' + N + ' nodes seated over the wire stack, no dups', c.seated === N && c.dups === 0, c);
  }
  const atCoord = (c) => live().find((n) => n.seat.hasCoord && n.seat.state === 3 && ck(n.seat.coord) === ck(c)) || null;
  // "seat freed": no LIVE survivor that holds a DIRECT owned link to the coord
  // still maps it to the dead peer — the corpse is out of every ENFORCING
  // neighbour's occupancy (the head's roster + every rook mate). Far seats'
  // stale roster hints expire on their own and enforce nothing.
  const linksTo = (n, vk) => n.seat && n.seat.hasCoord && topo.ownedLinks(n.seat.coord).some((c) => ck(c) === vk);
  const freedFor = (vk, deadPeer) => live().every((n) => !linksTo(n, vk) || n.seat.occGet(vk) !== deadPeer);
  // fhFreedFor: no enforcing neighbour still counts the corpse FIRST-HAND
  // alive at the coord — the E2/tenure-relevant liveness (a non-first-hand occ
  // entry is a routing hint: it cannot keep a phantom seated or block a fill).
  const fhFreedFor = (vk, deadPeer) => live().every((n) => !linksTo(n, vk) || n.seat.occGet(vk) !== deadPeer || !n.seat.firstHandLive(vk));
  const tickOf = () => Math.max(...live().map((n) => n.env.TICK));
  async function measureFreed(vk, deadPeer, capTicks, fn) {
    const test = fn || freedFor;
    const start = tickOf();
    while (tickOf() - start < capTicks) { if (test(vk, deadPeer)) return tickOf() - start; await sleep(TICK_MS); }
    return -1;
  }

  // ---------- 1. GRACEFUL: leave() (what beforeunload/pagehide fire) ----------
  {
    const victim = atCoord({ pc: 0, r: 0, i: 4 });
    check('graceful: victim found at 0/0.4', !!victim);
    const vk = ck(victim.seat.coord), vp = victim.peer;
    victim.leave(); bus.get(vp).dead = true;
    // D2: the LEAVE frees the seat at every neighbour instantly (occ+live
    // deleted). A stale S1SYNC echo may re-add a non-first-hand occ HINT for a
    // while (pre-existing, harmless: hints have no tenure), so the honest
    // instant-free signal is first-hand liveness.
    const freed = await measureFreed(vk, vp, 80, fhFreedFor);
    check('GRACEFUL close -> seat freed in ' + freed + ' ticks (' + secs(freed) + ' production)', freed >= 0 && freed <= 8, { ticks: freed });
    console.log('  MEASURE graceful: vanish->seat-freed = ' + freed + ' ticks = ' + secs(freed) + ' production wall time');
  }

  // ---------- 2. CRASH (SIGKILL): no LEAVE; transports observed dead ----------
  {
    const victim = atCoord({ pc: 0, r: 0, i: 2 });
    check('crash: victim found at 0/0.2', !!victim);
    const vk = ck(victim.seat.coord), vp = victim.peer;
    bus.get(vp).dead = true; victim.stop();       // SIGKILL: nothing sent, timers gone
    const start = tickOf();
    // the "DataChannel closes within ~1-5s": survivors holding a link observe it
    setTimeout(() => { for (const n of live()) { try { n.seat.transportLost(vp); } catch (e) {} } }, 2 * TICK_MS);
    const freed = await measureFreed(vk, vp, 400);
    const freedAt = freed < 0 ? -1 : freed;
    check('CRASH (SIGKILL) -> seat freed in ' + freedAt + ' ticks (' + secs(freedAt) + ' production; target <=20 ticks = 10s; horizon was 60-220+)',
      freedAt >= 0 && freedAt <= 20, { ticks: freedAt });
    console.log('  MEASURE crash: vanish->seat-freed = ' + freedAt + ' ticks = ' + secs(freedAt) + ' production wall time (was ~60+ ticks / 30s+ pre-D5)');
    await sleep(80 * TICK_MS);
    const c = converged();
    check('crash aftermath: room converged, no dups', c.seated === live().length && c.dups === 0, c);
  }

  // ---------- 3. BLACKHOLE that RECOVERS inside the horizon: seat kept ----------
  {
    const victim = atCoord({ pc: 0, r: 1, i: 1 }) || live().find((n) => n.seat.hasCoord && n.seat.coord.i !== 0);
    check('blackhole: victim found', !!victim);
    const vk = ck(victim.seat.coord), vp = victim.peer;
    bus.get(vp).holed = true;                     // frames vanish both ways; NO transport event fires
    await sleep(50 * TICK_MS);                    // 50 ticks dark — far past EARLY_HOLD, inside the 60-tick liveness horizon
    const keptDuring = !freedFor(vk, vp);         // nobody freed the seat while dark
    bus.get(vp).holed = false;                    // network recovers
    await sleep(60 * TICK_MS);
    const still = victim.seat.hasCoord && victim.seat.state === 3 && ck(victim.seat.coord) === vk;
    check('BLACKHOLE recovering inside the horizon -> peer NOT evicted, seat kept', keptDuring && still, { keptDuring, still });
    console.log('  MEASURE blackhole(recovered @50 ticks/25s): seat kept, zero evictions — unchanged behavior');
  }

  // ---------- 4. BLACKHOLE forever: the old horizon remains the backstop ----------
  {
    const victim = atCoord({ pc: 0, r: 1, i: 2 }) || live().find((n) => n.seat.hasCoord && n.seat.coord.i !== 0);
    check('blackhole-forever: victim found', !!victim);
    const vk = ck(victim.seat.coord), vp = victim.peer;
    bus.get(vp).dead = true; victim.stop();       // silent forever; NO transport event modeled
    const freed = await measureFreed(vk, vp, 500, fhFreedFor);
    check('BLACKHOLE forever -> freed by the HORIZON at ' + freed + ' ticks (' + secs(freed) + ' production) — must stay SLOW (>40 ticks: no early confirm without a transport event)',
      freed > 40, { ticks: freed });
    console.log('  MEASURE blackhole-forever: vanish->seat-freed = ' + freed + ' ticks = ' + secs(freed) + ' production wall time (the unchanged D3/D4 backstop)');
  }

  for (const n of live()) n.stop();
  relay.kill();
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
