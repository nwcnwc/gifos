// mesh-harness.js — a Node reference harness for site/js/mesh.js: it provides
// the SAME fabric the C++ sim models (an in-memory message bus + the modelled
// genesis-key relay registry) and replays the sim's scenarios (JOIN, 50%-kill,
// s1row, s1all), asserting the sim's convergence targets (dups=0, s1 = 25/25).
// Since we deleted the Node sim, mesh.js + this harness ARE the JS reference:
// the production seating/healing brain and its regression test, one artifact.
require('../site/js/gifos-net.js'); // net.topo + SCALE
require('../site/js/mesh.js');      // GifOS.mesh.Seat
const net = globalThis.GifOS.net, mesh = globalThis.GifOS.mesh;
const topo = net.topo, ck = topo.ckey;
const RELAY_TTL = mesh.RELAY_TTL, RELAY_CAP = mesh.RELAY_CAP, keyHash = mesh.keyHash;

// A shared, seeded RNG for fabric-level nondeterminism (relay shuffle + spawn
// plan) — separate from each seat's own PRNG, mirroring the sim's grnd/rng split.
let GSEED = 20260714 >>> 0;
const grnd = () => { GSEED = (Math.imul(GSEED, 1103515245) + 12345) & 0x7fffffff; return GSEED / 2147483648; };
const seedRng = (s) => { GSEED = s >>> 0; IDC = 0; }; // reset per scenario ⇒ each is independent + reproducible
const pairKey = (a, b) => (String(a) < String(b) ? a + '#' + b : b + '#' + a);

// ── S4 identity, run ON in the harness (synchronous Node Ed25519) ────────────
// We test identity-based security AT SCALE, no bypass: every seat has a REAL
// keypair, its id IS H(pubkey), fills are SIGNED on send and VERIFIED on
// delivery (m.s4ok stamped) — and mesh.js's verifyFill is fail-closed, so an
// unsigned/forged/tampered fill is dropped. Mirrors site/js/mesh-identity.js's
// statement binding exactly, but synchronous + deterministic (keys derived from
// the seeded RNG, so scenarios stay reproducible).
const ncrypto = require('crypto');
const H_SIGNED = new Set(['FINDLEAF', 'PLACE', 'CLAIM', 'HELLO']);
const ED_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const sha40 = (s) => 'k_' + ncrypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 40);
function mintId(seed32) {
  const priv = ncrypto.createPrivateKey({ key: Buffer.concat([ED_PKCS8_PREFIX, seed32]), format: 'der', type: 'pkcs8' });
  const pub = ncrypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64');
  return { priv, pub, peerId: sha40(pub) };
}
const idSign = (priv, str) => ncrypto.sign(null, Buffer.from(str), priv).toString('base64');
const idVerify = (pubB64, sigB64, str) => { try { return ncrypto.verify(null, Buffer.from(str), ncrypto.createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(sigB64, 'base64')); } catch (e) { return false; } };
const fillKeyOf = (m) => m.hole ? 'h:' + ck(m.hole) : (m.coord ? 'c:' + ck(m.coord) : (m.ck ? 'k:' + m.ck : '-'));
const statement = (from, m) => JSON.stringify({ v: 1, t: m.t, k: fillKeyOf(m), id: (m.id != null ? m.id : null), from });
function newPins() { const map = new Map(); return { pin(id, pub) { const c = map.get(id); if (c === undefined) { map.set(id, pub); return true; } return c === pub; } }; }
function signFill(identity, m) { const sp = statement(identity.peerId, m); m.s4 = { sp, sig: idSign(identity.priv, sp), pub: identity.pub }; }
// Verify a delivered SIGNED fill against the RECEIVER's pins; return ok (caller
// stamps m.s4ok / drops). Same rejects as mesh-identity.verifyFill.
function verifyDelivered(pins, m) {
  const s = m.s4; if (!s || typeof s.sp !== 'string' || !s.sig || !s.pub) return false;
  let sp; try { sp = JSON.parse(s.sp); } catch (e) { return false; }
  const from = sp.from; if (!from) return false;
  if (sha40(s.pub) !== from) return false;             // id bound to key
  if (statement(from, m) !== s.sp) return false;       // no cross-frame replay / tamper
  if (m.id != null && m.id !== from) return false;     // occupant frame signed BY that occupant
  if (!idVerify(s.pub, s.sig, s.sp)) return false;     // signer holds the private key
  return pins.pin(from, s.pub);                        // TOFU: reject a key-swap
}
// Deterministic per-seat seed from the scenario RNG (reproducible).
function seatSeed() { return ncrypto.createHash('sha256').update('s4id|' + GSEED + '|' + (IDC++)).digest().subarray(0, 32); }
let IDC = 0;

// Owned-link transport classifier (the sim's classifyEmit): every frame is a
// NEIGHBOR hop (to occupies one of from's owned-link coords, per FROM's own occ
// view — that is its DataChannel peer), a RELAY hop (both endpoints socketed —
// joining or Section-1 — the greeting scope), BOOTSTRAP (an unseated endpoint),
// or a TELEPORT (seated non-adjacent, nothing could carry it) — a routing BUG.
// The sim detonates on teleports; here we count them and assert 0.
function classifyEmit(env, from, to, m) {
  const sf = env.seats.get(from), st = env.seats.get(to);
  if (!sf || !st) { env.emitBootstrap++; return; }
  if (from === to) { env.emitNeighbor++; return; } // self-delivery (a routed frame at its own cell) — local
  if (!sf.hasCoord || !st.hasCoord) { env.emitBootstrap++; return; }
  for (const olc of topo.ownedLinks(sf.coord)) if (sf.occGet(ck(olc)) === to) { env.emitNeighbor++; return; }
  if (sf.socketed() && st.socketed()) { env.emitRelay++; return; } // legit: relay between two socketed peers (greeting scope)
  env.emitTeleport++;
  if (env.teleportLog.length < 8) env.teleportLog.push({ t: m.t, from, to, routing: !!m.routing, direct: !!m.direct });
}

function makeFabric() {
  const env = {
    TICK: 0, HEALING: true,
    seats: new Map(), bus: new Map(), openPairs: new Set(), seq: 0,
    relayGenesisKey: null, relayGreeters: new Map(),
    moves: 0, evict: 0,
    emitNeighbor: 0, emitRelay: 0, emitBootstrap: 0, emitTeleport: 0, teleportLog: [],
    bumpMoves() { env.moves++; }, bumpEvict() { env.evict++; }, wake() {},
    // The sim's global peer view — lets Seat.emit enforce owned-link delivery
    // (route a seated non-neighbour over the mesh instead of teleporting).
    peek(id) { const s = env.seats.get(id); if (!s) return null; return { hasCoord: s.hasCoord, coord: s.coord, socketed: s.socketed(), gateway: s.gateway }; },
    send(from, to, m) {
      if (H_SIGNED.has(m.t) && !m.s4) { const sf = env.seats.get(from); if (sf && sf.identity) signFill(sf.identity, m); }
      classifyEmit(env, from, to, m);
      const pk = pairKey(from, to); let d;
      if (env.openPairs.has(pk)) d = 1 + (env.seq & 1);
      else { env.openPairs.add(pk); d = 4 + (env.seq % 5); }
      m.to = to; m.from = from; env.seq++;
      const at = env.TICK + d; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
      q.push(m);
    },
    knock(id, presentedKey) {
      const R = env.relayGreeters;
      for (const [sid, exp] of R) { const s = env.seats.get(sid); if (exp < env.TICK || !s || !s.alive) R.delete(sid); }
      if (R.size === 0) env.relayGenesisKey = null;
      const out = []; for (const sid of R.keys()) if (sid !== id) out.push(sid);
      for (let k = out.length - 1; k > 0; k--) { const j = (grnd() * (k + 1)) | 0; const t = out[k]; out[k] = out[j]; out[j] = t; }
      const at = env.TICK + 1; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
      q.push({ t: 'GREETERS', list: out, to: id, from: null });
      if (R.size === 0) { env.relayGenesisKey = keyHash(presentedKey); R.set(id, env.TICK + RELAY_TTL); }
      else if (keyHash(presentedKey) === env.relayGenesisKey && R.size < RELAY_CAP) { R.set(id, env.TICK + RELAY_TTL); }
    },
  };
  return env;
}

function counts(env) {
  const at = new Map(); let seated = 0, dups = 0, stranded = 0; const s1 = new Set();
  for (const s of env.seats.values()) {
    if (!s.alive) continue;
    if (s.stranded) stranded++;
    if (s.state !== 3) continue; seated++;
    const k = ck(s.coord); if (at.has(k)) dups++; else at.set(k, s.id);
    if (s.coord.pc === 0) s1.add(k);
  }
  return { seated, dups, s1: s1.size, stranded, teleport: env.emitTeleport };
}

function doTick(env) {
  const q = env.bus.get(env.TICK);
  if (q) { for (const m of q) { const s = env.seats.get(m.to); if (!s || !s.alive) continue; if (H_SIGNED.has(m.t)) { if (!verifyDelivered(s.pins, m)) continue; m.s4ok = true; } s.recv(m); } env.bus.delete(env.TICK); }
  for (const s of env.seats.values()) if (s.alive) s.tick();
  env.TICK++;
}

// Advance until FULLY converged (seated==N && s1 full && dups==0) or cap. Unlike
// the sim's batch print (which stops at a good-window and reports transient
// dups), we run past the transient so the test asserts the settled dups=0 state.
function converge(env, N, cap) {
  const tgt = Math.min(25, N); const start = env.TICK;
  while (env.TICK < start + cap) {
    doTick(env);
    if (env.TICK % 64 === 0) { const c = counts(env); if (c.seated === N && c.s1 === tgt && c.dups === 0) return env.TICK; }
  }
  return env.TICK;
}

// Spawn N seats over a join window (random arrival ticks), like the sim.
function spawn(env, N) {
  const win = Math.max(1, Math.min(Math.floor(N * 0.25), 2000));
  const plan = []; for (let t = 0; t <= win; t++) plan.push([]);
  for (let k = 0; k < N; k++) plan[(grnd() * win) | 0].push(k);
  env._plan = plan; env._spawned = 0; env._N = N;
}
function spawnOne(env) { env._spawned++; const idn = mintId(seatSeed()); const s = new mesh.Seat(idn.peerId, env); s.identity = idn; s.pins = newPins(); env.seats.set(idn.peerId, s); s.alive = true; s.join(); return s; }
function spawnDue(env) {
  const plan = env._plan; if (env.TICK < plan.length) { for (const k of plan[env.TICK]) { const idn = mintId(seatSeed()); const s = new mesh.Seat(idn.peerId, env); s.identity = idn; s.pins = newPins(); env.seats.set(idn.peerId, s); s.join(); env._spawned++; } }
}
// Drive ticks including spawns until everyone has arrived + FULLY converged.
function runJoin(env, N, cap) {
  const tgt = Math.min(25, N); const start = env.TICK;
  while (env.TICK < start + cap) {
    spawnDue(env); doTick(env);
    if (env.TICK % 64 === 0 && env._spawned === N) { const c = counts(env); if (c.seated === N && c.s1 === tgt && c.dups === 0) return env.TICK; }
  }
  return env.TICK;
}

function kill(env, N, frac, mode) {
  const ids = []; for (const s of env.seats.values()) if (s.alive) ids.push(s.id);
  const nk = Math.floor(N * frac); const ks = new Set();
  while (ks.size < nk && ks.size < ids.length) ks.add(ids[(grnd() * ids.length) | 0]);
  if (mode === 's1row') { const rr = (grnd() * net.SCALE.C) | 0; for (const s of env.seats.values()) if (s.alive && s.hasCoord && s.coord.pc === 0 && s.coord.r === rr) ks.add(s.id); }
  if (mode === 's1all') { for (const s of env.seats.values()) if (s.alive && s.hasCoord && s.coord.pc === 0) ks.add(s.id); }
  for (const id of ks) env.seats.get(id).leave();
  return ks.size;
}

// ---- scenarios ----
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

// Gossip coverage: one seat floods; every other live seated seat must hear it
// exactly once (dedup) within a few hundred ticks.
function gossipCheck(env, label) {
  let got = 0, dupDeliveries = 0; const seen = new Set();
  let src = null;
  for (const s of env.seats.values()) { if (!s.alive) continue; if (!src && s.state === 3) src = s; s.onGossip = () => { got++; if (seen.has(s.id)) dupDeliveries++; seen.add(s.id); }; }
  const expect = [...env.seats.values()].filter((s) => s.alive && s.state === 3).length - 1;
  src.gossip({ hello: 1 });
  for (let t = 0; t < 400; t++) doTick(env);
  check(`${label}: gossip reached ${got}/${expect}, redelivered ${dupDeliveries}`, got === expect && dupDeliveries === 0, { got, expect });
  for (const s of env.seats.values()) s.onGossip = null;
}

function scenario(N, killSpec) {
  seedRng(20260714); // per-scenario reset ⇒ independent + reproducible (one fresh fabric per scenario — the sim footgun)
  const env = makeFabric();
  spawn(env, N);
  const jt = runJoin(env, N, 20000);
  let c = counts(env);
  const tgt = Math.min(25, N);
  check(`JOIN N=${N}: seated ${c.seated}/${N}, s1 ${c.s1}/${tgt}, dups ${c.dups}, stranded ${c.stranded}, teleport ${c.teleport} @${jt}`,
    c.seated === N && c.s1 === tgt && c.dups === 0 && c.stranded === 0 && c.teleport === 0, c);
  if (!killSpec) gossipCheck(env, `GOSSIP N=${N}`);
  if (killSpec) {
    const nk = kill(env, N, killSpec.frac || 0, killSpec.mode || '');
    const nowN = N - nk;
    const kt = converge(env, nowN, 40000);
    c = counts(env);
    const tgt2 = Math.min(25, nowN);
    check(`${killSpec.label} (killed ${nk}): seated ${c.seated}/${nowN}, s1 ${c.s1}/${tgt2}, dups ${c.dups}, stranded ${c.stranded}, teleport ${c.teleport} @${kt}`,
      c.seated === nowN && c.s1 === tgt2 && c.dups === 0 && c.stranded === 0 && c.teleport === 0, c);
    gossipCheck(env, `GOSSIP after ${killSpec.label}`);
  }
  if (env.emitTeleport) console.log('  TELEPORTS:', JSON.stringify(env.teleportLog));
}

// ---- S4 attack-rejection (the security gate, asserted here too) ----
function impostorCheck() {
  seedRng(20260714);
  const V = mintId(seatSeed()), E = mintId(seatSeed()); // legit occupant vs attacker
  const coord = { pc: 0, r: 1, i: 2 };
  const legit = { t: 'CLAIM', ck: ck(coord), id: V.peerId }; signFill(V, legit);
  check('S4: legit signed fill ACCEPTED', verifyDelivered(newPins(), legit) === true);
  const un = { t: 'CLAIM', ck: ck(coord), id: V.peerId }; // unsigned
  check('S4: unsigned fill REJECTED', verifyDelivered(newPins(), un) === false);
  const imp = { t: 'CLAIM', ck: ck(coord), id: V.peerId }; signFill(E, imp); // E claims V's seat
  check('S4: attacker claiming occupant V REJECTED', verifyDelivered(newPins(), imp) === false);
  const swap = { t: 'CLAIM', ck: ck(coord), id: E.peerId }; signFill(E, swap); swap.s4.pub = V.pub; // V pubkey + E sig
  check('S4: V pubkey + E signature REJECTED', verifyDelivered(newPins(), swap) === false);
  const tam = { t: 'FINDLEAF', hole: { pc: 0, r: 2, i: 3 } }; signFill(V, tam); tam.hole = { pc: 0, r: 2, i: 4 }; // coord rewritten post-sign
  check('S4: tampered fill REJECTED', verifyDelivered(newPins(), tam) === false);
  const ks = { t: 'CLAIM', ck: ck(coord), id: E.peerId }; signFill(E, ks); const kp = newPins(); kp.pin(E.peerId, V.pub);
  check('S4: key-swap vs TOFU pin REJECTED', verifyDelivered(kp, ks) === false);
  const seat = new mesh.Seat('k_gate', makeFabric());
  check('S4 gate: verifyFill FAIL-CLOSED (no s4ok ⇒ reject)', seat.verifyFill({ t: 'CLAIM' }) === false && seat.verifyFill({ t: 'CLAIM', s4ok: true }) === true);
}
impostorCheck();

// ---- D5 early-probe scenarios (healing-laws D5: transport loss is first-hand
// evidence). The harness models the transport layer exactly like production
// wiring: every seat that believes a peer occupies one of its owned-link coords
// holds a "DataChannel" to it; when the peer dies ungracefully that channel is
// observed dead a few ticks later (the real DC close lands in ~1-5s) and the
// seat's transportLost() intake fires. A severed link additionally DROPS frames
// between the pair while both stay alive.
function coordSeat(env, c) { const k = ck(c); for (const s of env.seats.values()) if (s.alive && s.state === 3 && s.hasCoord && ck(s.coord) === k) return s; return null; }
function fireTranslost(env, deadId) {
  for (const s of env.seats.values()) {
    if (!s.alive || !s.hasCoord || s.id === deadId) continue;
    for (const olc of topo.ownedLinks(s.coord)) if (s.occGet(ck(olc)) === deadId) { s.transportLost(deadId); break; }
  }
}
function d5Scenario() {
  seedRng(20260714);
  const env = makeFabric();
  // scenario severance support: frames between a severed pair are dropped (the
  // link is dead, both seats live) — checked after classify, like the sim.
  env.severed = new Set();
  const baseSend = env.send;
  env.send = (from, to, m) => { if (env.severed.has(pairKey(from, to))) return; baseSend(from, to, m); };
  const N = 500;
  spawn(env, N); runJoin(env, N, 20000);
  let c = counts(env);
  check(`D5 setup: JOIN N=${N} converged`, c.seated === N && c.s1 === 25 && c.dups === 0, c);

  // --- 1. CRASH: a Section-1 row cell dies ungracefully (no LEAVE) ----------
  const vc = { pc: 0, r: 0, i: 2 }; const vk = ck(vc);
  const victim = coordSeat(env, vc);
  victim.alive = false;                       // SIGKILL: nothing sent
  for (let t = 0; t < 3; t++) doTick(env);    // the DC close lands a few ticks later
  fireTranslost(env, victim.id);
  let healedAt = -1; const t0 = env.TICK;
  for (let t = 0; t < 400 && healedAt < 0; t++) { doTick(env); const h = coordSeat(env, vc); if (h && h.id !== victim.id) healedAt = env.TICK - t0; }
  check(`D5 crash: seat healed in ~probe-time (${healedAt} ticks, horizon would be 220+)`, healedAt > 0 && healedAt <= 40, { healedAt });
  for (let t = 0; t < 600; t++) doTick(env);
  c = counts(env);
  check('D5 crash: room re-converged, no dups', c.seated === N - 1 && c.s1 === 25 && c.dups === 0 && c.stranded === 0 && c.teleport === 0, c);

  // --- 2. SLOW PEER: one severed link, occupant ALIVE — probe answers, no evict
  const head = coordSeat(env, { pc: 0, r: 1, i: 0 });
  const slowC = { pc: 0, r: 1, i: 2 };
  const slow = coordSeat(env, slowC);
  check('D5 sever setup: head + cell found', !!head && !!slow);
  const pkS = pairKey(head.id, slow.id);
  env.severed.add(pkS);                       // the link dies; BOTH seats live
  head.transportLost(slow.id);                // both ends observe the transport death
  slow.transportLost(head.id);
  const evict0 = env.evict;
  // 150 severed ticks — inside the RING_HOLD horizon, way past EARLY_HOLD: an
  // early confirm would evict within ~15 ticks; the answered probe must not.
  for (let t = 0; t < 150; t++) doTick(env);
  check('D5 sever: the slow-but-alive peer keeps its seat (probe answered around the dead link)',
    slow.alive && slow.state === 3 && ck(slow.coord) === ck(slowC) && env.evict === evict0, { evict: env.evict - evict0, coord: slow.hasCoord ? ck(slow.coord) : null });
  env.severed.delete(pkS);                    // link recovers inside the horizon — E2/D3: no churn at all
  for (let t = 0; t < 200; t++) doTick(env);
  c = counts(env);
  check('D5 sever: room stays converged after recovery', c.seated === N - 1 && c.s1 === 25 && c.dups === 0, c);

  // --- 3. BLACKHOLE: silent death, NO transport event — horizon unchanged ---
  const bc = { pc: 0, r: 2, i: 2 }; const bvictim = coordSeat(env, bc);
  bvictim.alive = false;                      // no LEAVE, no DC-close observed
  let earlyHealed = false; const tb = env.TICK;
  for (let t = 0; t < 100; t++) { doTick(env); const h = coordSeat(env, bc); if (h && h.id !== bvictim.id) { earlyHealed = true; break; } }
  check('D5 blackhole: NO early heal without a transport event (horizon is the backstop)', !earlyHealed);
  let bHealedAt = -1;
  for (let t = 0; t < 1400 && bHealedAt < 0; t++) { doTick(env); const h = coordSeat(env, bc); if (h && h.id !== bvictim.id) bHealedAt = env.TICK - tb; }
  check(`D5 blackhole: horizon still heals it eventually (@${bHealedAt} ticks)`, bHealedAt > 100, { bHealedAt });
}

// Robust regime is N>=500: at small N the S1 fill is arrival-rng-sensitive.
// We pin the sim's numbers: JOIN converges, then kill {0.4, 0.5} + the
// S1-targeted kills heal back to seated=all, s1=25/25, dups=0, stranded=0,
// teleport=0 (the sim's CHECK PASS line).
const N = process.env.N ? parseInt(process.env.N, 10) : 0;
if (process.env.D5_ONLY) { d5Scenario(); } // just the D5 early-probe scenarios (debug convenience)
else if (N) { scenario(N, process.env.KILL === '40' ? { frac: 0.4, label: '40%-kill' } : process.env.KILL === '50' ? { frac: 0.5, label: '50%-kill' } : process.env.KILL === 's1row' ? { mode: 's1row', label: 's1row' } : process.env.KILL === 's1all' ? { mode: 's1all', label: 's1all' } : null); }
else {
  scenario(500);
  scenario(1000);
  scenario(500, { frac: 0.4, label: '40%-kill' });
  scenario(500, { frac: 0.5, label: '50%-kill' });
  scenario(500, { mode: 's1row', label: 's1row' });
  scenario(500, { mode: 's1all', label: 's1all' });
  d5Scenario();
}
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
