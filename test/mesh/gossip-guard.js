// gossip-guard.js — THE DEDUP CACHE IS NOT A WEAPON, AND THE LINK HAS A NAME.
//
// mesh.js gossip (GSP/GSPS) dedups by message id (`gid`) in a per-seat seen
// set, budgets new messages per LINK and per author, and sweeps the seen set
// on a 600-tick horizon. Three things about that cache that a small-room
// suite never exercises, pinned here:
//
//   1. GID BINDING — a gid names its author (`<src>:<seq>`), and a frame whose
//      gid does not start with its own src is forged and dropped BEFORE it is
//      marked seen. Without this a member signs frames (as itself) carrying
//      the victim's next gids, every seat marks them seen, and the victim's
//      next messages are dropped room-wide as duplicates. Pinned at the seat
//      (_gspRecv), at the identity layer (verifyGossip) and end to end over
//      the harness fabric with signed frames.
//   2. SWEEP COST — the horizon sweep walks the seen set from its oldest entry
//      and stops at the first fresh one, so a receipt costs O(expired + 1) Map
//      steps, never a walk of the whole set (it was O(size) per receipt once
//      the set held more than 4,096 fresh entries: a lively room paid a
//      4,000-entry walk per incoming frame on the main thread).
//   3. THE LINK IS NAMED — the wire stamps the delivering peer onto a frame
//      that carries no `from` of its own (recvCtl(m, via)), so the per-link
//      flood budget keys on the real link and S1SYNC's want-whole path knows
//      whom to ask. The harness fabric always stamped it; production did not.
//
// Pure Node: mesh.js + mesh-identity.js + mesh-wire.js over the harness fabric
// and an unreachable relay URL (no server is needed; the wire's socket just
// backs off). Usage: node test/mesh/gossip-guard.js
'use strict';

const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-wire.js');
const mesh = globalThis.GifOS.mesh, ident = globalThis.GifOS.meshIdentity, wire = globalThis.GifOS.meshWire, net = globalThis.GifOS.net;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const run = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };

// A lone seat with the flood guard off: _gspRecv runs its dedup, sweep and
// app delivery without a coordinate (no links to forward over).
function loneSeat(id) {
  const env = { TICK: 0, HEALING: true, COMPACTION: false, GSP_GUARD: false, send() {}, knock() {}, wake() {} };
  const s = new mesh.Seat(id, env);
  return { env, s };
}

(async () => {
  console.log('=== 1) GID BINDING — a gid that does not name its src is forged');
  {
    const { s } = loneSeat('seatX');
    const heard = [];
    s.onGossip = (src, m) => { heard.push(src + ':' + JSON.stringify(m)); };
    // A signs (as itself: src = A) a frame carrying B's next gid.
    s.recv({ t: 'GSP', gid: 'B:1', src: 'A', m: { poison: 1 }, from: 'A' });
    check('the seat drops a frame whose gid names another author', heard.length === 0 && !(s.gseen && s.gseen.has('B:1')), { heard, seen: s.gseen ? [...s.gseen.keys()] : [] });
    check('…and counts it as forged', (s.gspForged || 0) === 1, { gspForged: s.gspForged || 0 });
    s.recv({ t: 'GSP', gid: 'B:1', src: 'B', m: { chat: 'hello' }, from: 'B' });
    check("B's own message with that gid still lands", heard.length === 1 && heard[0] === 'B:{"chat":"hello"}', heard);
    s.recv({ t: 'GSP', gid: 'A:1', src: 'A', m: { chat: 'mine' }, from: 'A' });
    check("A's own gid still lands (the rule binds, it does not block)", heard.length === 2, heard);
    s.recv({ t: 'GSP', gid: 7, src: 'A', m: { chat: 'num' }, from: 'A' });
    s.recv({ t: 'GSP', gid: 'A:2', m: { chat: 'nosrc' }, from: 'A' });
    check('a non-string gid or a missing src is dropped too', heard.length === 2 && (s.gspForged || 0) === 3, { heard: heard.length, gspForged: s.gspForged || 0 });
  }
  {
    // The identity layer: the signed statement commits to gid and author, and
    // verifyGossip refuses a valid signature over a gid that names another seat.
    const A = await ident.mint(), B = await ident.mint();
    const pins = ident.newPins();
    const bad = { t: 'GSP', gid: B.peerId + ':5', src: A.peerId, m: { poison: 1 } };
    bad.s4 = await ident.signGossip(A, bad);
    const vb = await ident.verifyGossip(pins, bad);
    check('verifyGossip refuses a well-signed frame whose gid names another author', !vb.ok, vb);
    const good = { t: 'GSP', gid: A.peerId + ':5', src: A.peerId, m: { chat: 1 } };
    good.s4 = await ident.signGossip(A, good);
    const vg = await ident.verifyGossip(pins, good);
    check('…and accepts the same signer over its own gid', vg.ok === true && vg.from === A.peerId, vg);
  }
  {
    // End to end over the fabric: a hostile seat in a settled room pre-poisons
    // the victim's next 20 gids on every link it has; the victim then says 20
    // lines; every seat must hear all 20.
    H.seedRng(20261003);
    const env = H.makeFabric(); env.DIGEST = true;
    const N = 30;
    H.spawn(env, N); H.runJoin(env, N, 20000); run(env, 600);
    const seated = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
    const victim = seated.find((s) => s.coord.pc === 0 && s.coord.r === 0);
    const bad = seated.find((s) => s.id !== victim.id && s.linkPeers().size >= 2);
    const K = 20;
    for (let i = 1; i <= K; i++) {
      const f = { t: 'GSP', gid: victim.id + ':' + ((victim.gseq || 0) + i), src: bad.id, m: { poison: i } };
      for (const p of bad.linkPeers()) bad.emit(p, Object.assign({}, f)); // signed by the fabric as bad's own (src === bad.id)
    }
    run(env, 40);
    const heard = new Map(); for (const s of seated) { heard.set(s.id, new Set()); s.onGossip = (src, m) => { if (m && m.line != null && src === victim.id) heard.get(s.id).add(m.line); }; }
    for (let i = 1; i <= K; i++) victim.gossip({ line: i });
    run(env, 120);
    for (const s of seated) s.onGossip = null;
    const short = seated.filter((s) => s.id !== victim.id && heard.get(s.id).size < K).length;
    const poisoned = seated.filter((s) => s.gseen && s.gseen.has(victim.id + ':' + ((victim.gseq || 0) - K + 1)) && s.id !== victim.id && heard.get(s.id).size < K).length;
    check(`N=${N}: after a signed gid pre-poison from a member, every seat still hears the victim's next ${K} lines (${seated.length - 1 - short}/${seated.length - 1})`, short === 0, { short, poisoned, forgedAtVictimLinks: [...bad.linkPeers()].map((p) => (env.seats.get(p).gspForged || 0)) });
  }

  console.log('\n=== 2) SWEEP COST — the horizon sweep stops at the first fresh entry');
  {
    // A Map that counts how many entries any iteration over it visits.
    class CountingMap extends Map {
      constructor() { super(); this.steps = 0; }
      [Symbol.iterator]() { const it = super[Symbol.iterator](); const self = this; return { next() { self.steps++; return it.next(); }, [Symbol.iterator]() { return this; } }; }
      entries() { return this[Symbol.iterator](); }
      keys() { const it = super.keys(); const self = this; return { next() { self.steps++; return it.next(); }, [Symbol.iterator]() { return this; } }; }
    }
    const { env, s } = loneSeat('seatG');
    const g = s.gseen = new CountingMap();
    let n = 0, delivered = 0; s.onGossip = () => { delivered++; };
    const PER_TICK = 30, TICKS = 200;                 // 6,000 fresh messages inside one horizon
    for (let t = 0; t < TICKS; t++) { env.TICK = t; for (let i = 0; i < PER_TICK; i++) { n++; s.recv({ t: 'GSP', gid: 'a' + (i % 7) + ':' + n, src: 'a' + (i % 7), m: { n }, from: 'L' + (i % 3) }); } }
    const liveSteps = g.steps, liveSize = g.size;
    env.TICK = TICKS + 601;                           // everything above is now past the 600-tick horizon
    for (let i = 0; i < 100; i++) { n++; s.recv({ t: 'GSP', gid: 'a0:' + n, src: 'a0', m: { n }, from: 'L0' }); }
    check(`${n} messages delivered once each`, delivered === n, { delivered, n });
    check(`Map steps while every entry is fresh stay linear (${liveSteps} steps for ${PER_TICK * TICKS} receipts; bound 2x)`, liveSteps <= 2 * PER_TICK * TICKS, { liveSteps, liveSize });
    check(`expired entries are swept once the horizon passes (size ${g.size} after 100 fresh receipts)`, g.size <= 100 + 16, { size: g.size, steps: g.steps });
    check('total Map steps stay within 3x the receipts', g.steps <= 3 * n, { steps: g.steps, n });
  }

  console.log('\n=== 3) THE LINK IS NAMED — the wire stamps the delivering peer');
  {
    const key = await net.deriveMeetKey('gossip-guard-room', '', '');
    const node = wire.createMeshNode({ relayUrl: 'ws://127.0.0.1:1', sid: 'gg-sid', tok: 'T', key, tickMs: 1000, sendDC: () => true });
    await node.whenReady;
    const got = [];
    node.seat.recv = (m) => { got.push(m); };
    node.recvCtl({ t: 'S1SYNC', ent: [] }, 'p_link');
    node.recvCtl({ t: 'WHOHOME', from: 'p_seeker', ttl: 1 }, 'p_door');
    node.recvCtl({ t: 'S1SYNC', ent: [] });
    check('a frame with no sender field is stamped with the delivering peer', got[0] && got[0].from === 'p_link', got[0]);
    check("a frame that names its own sender keeps it (WHOHOME's from is the seeker)", got[1] && got[1].from === 'p_seeker', got[1]);
    check('no via, no stamp (the legacy caller shape)', got[2] && got[2].from === undefined, got[2]);
    node.stop();
  }

  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS — gossip guard: gid binding, sweep cost, named links');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
