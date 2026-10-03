// recv-authority.js — WHO MAY TELL A SEAT TO DISSOLVE, AND WHO MAY RE-KEY IT.
//
// Two frames read a seat's whole fate off the wire and used to take it from
// anyone who could reach the seat (a row-mate, a sponsor-forwarded stranger):
//
//   DRAIN (healing-laws E1) — "your anchor is dead; leave, and re-seat against
//     this roster". It fans DOWN a subtree, so one frame at a depth-1 head
//     dissolves every seat under it. The law names exactly one author: the
//     receiver's ANCHOR (the occupant of its owner cell). The frame is S4-
//     signed by its sender, `id` is bound to the signer, and recv() honours it
//     only from that anchor, only with a well-formed roster (a roster-less
//     DRAIN used to leave tick() throwing on `roster.length` forever).
//   HOME — the greeter's answer in the entry dance. A SEATED seat receives one
//     only as the reply to a WHOHOME it sent (drainOrReenter, E1). Unsolicited,
//     it re-keyed the seat's genesis key and replaced its roster: a seated
//     greeter presenting a bogus key is sealed out of its own door (R3a), and a
//     bogus roster steers its next drain at a ghost.
//
// Every leg runs over mesh-harness's S4 fabric (real Ed25519 identities,
// signFill on send, verifyDelivered on delivery): the attacker is a legit,
// seated member with its own key, exactly the "authenticated member" the
// security review named. Positive controls prove the honest paths still work.
'use strict';

const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
const { topo, ck, net } = H;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

// Push a frame onto the fabric bus EXACTLY as env.send does, minus the signing
// step: what an attacker that skips the signature (or a pre-S4 client) puts on
// the wire. doTick's delivery gate still runs.
function rawDeliver(env, from, to, m) {
  m.to = to; m.from = from; env.seq++;
  const at = env.TICK + 1; let q = env.bus.get(at); if (!q) { q = []; env.bus.set(at, q); }
  q.push(m);
}
// Advance n ticks; count tick() throws instead of letting one abort the run.
function run(env, n) { let threw = 0; for (let t = 0; t < n; t++) { try { H.doTick(env); } catch (e) { threw++; env.TICK++; } } return threw; }
const seatedAt = (s) => s.alive && s.state === 3 && s.hasCoord ? ck(s.coord) : null;
// The row a head OWNS (its rosterCells): the seats its DRAIN fans to.
function subtreeOf(env, head) {
  const rowPc = topo.childPath(head.coord.pc, head.coord.i); const out = [];
  for (const s of env.seats.values()) if (s.alive && s.state === 3 && s.hasCoord && s.coord.pc === rowPc && s.coord.r === head.coord.r) out.push(s);
  return out;
}
function s1Roster(env) { const out = []; for (const s of env.seats.values()) if (s.alive && s.state === 3 && s.hasCoord && s.coord.pc === 0) out.push({ k: ck(s.coord), v: s.id }); return out; }

(function main() {
  H.seedRng(20260714);
  const env = H.makeFabric();
  const N = 200;
  H.spawn(env, N); H.runJoin(env, N, 20000);
  let c = H.counts(env);
  check(`setup: JOIN N=${N} converged`, c.seated === N && c.s1 === 25 && c.dups === 0, c);
  // Q2 compaction is orthogonal background packing; its moves would blur
  // "every seat stayed in its cell", so isolate the legs from it (as the
  // harness's D5 legs do).
  env.COMPACTION = false;

  // Count DRAIN frames each seat puts on the wire — a refused DRAIN must not
  // be forwarded down either.
  const drainsBy = new Map();
  const baseSend = env.send;
  env.send = (from, to, m) => { if (m.t === 'DRAIN') drainsBy.set(from, (drainsBy.get(from) || 0) + 1); baseSend(from, to, m); };

  // The cast: a depth-1 head T with children, its anchor O (owner-cell
  // occupant), and a row-mate A of T (a seated member, NOT T's anchor).
  let T = null, A = null, O = null;
  for (const s of env.seats.values()) {
    if (!s.alive || s.state !== 3 || !s.hasCoord || s.coord.pc === 0 || s.coord.i !== 0 || topo.pcDepth(s.coord.pc) !== 1 || !s.hasChildren()) continue;
    const oid = s.occGet(ck(s.ownerCoord())); const o = oid != null ? env.seats.get(oid) : null;
    let a = null; for (const rm of topo.rowMates(s.coord)) { const x = s.occGet(ck(rm)); const sx = x != null ? env.seats.get(x) : null; if (sx && sx.alive && sx.state === 3) { a = sx; break; } }
    if (o && o.alive && o.state === 3 && a) { T = s; O = o; A = a; break; }
  }
  check('setup: a depth-1 head T with children, its anchor O and a row-mate A', !!(T && O && A), T ? { T: ck(T.coord), O: ck(O.coord), A: ck(A.coord), kids: subtreeOf(env, T).length } : null);
  if (!T) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
  const tCk = ck(T.coord);
  const kids = subtreeOf(env, T); const kidCk = new Map(kids.map((s) => [s.id, ck(s.coord)]));
  const bogus = [{ k: '0_0_0', v: 'k_0000000000000000000000000000000000000000' }];
  const stillSeated = () => seatedAt(T) === tCk && kids.every((s) => seatedAt(s) === kidCk.get(s.id));

  // ---- 1. an UNSIGNED DRAIN from a row-mate: never reaches recv ----------
  { const m0 = env.moves, d0 = drainsBy.get(T.id) || 0;
    rawDeliver(env, A.id, T.id, { t: 'DRAIN', roster: bogus, id: A.id });
    const threw = run(env, 100);
    check('1: unsigned DRAIN from a row-mate — T and its subtree keep their seats, nothing fans down', stillSeated() && (drainsBy.get(T.id) || 0) === d0 && threw === 0, { T: seatedAt(T), moves: env.moves - m0, fwd: (drainsBy.get(T.id) || 0) - d0, threw }); }

  // ---- 2. a SIGNED DRAIN from a row-mate (a real member, not my anchor) ---
  { const d0 = drainsBy.get(T.id) || 0;
    env.send(A.id, T.id, { t: 'DRAIN', roster: bogus, id: A.id });   // the fabric signs it with A's key
    const threw = run(env, 100);
    check('2: signed DRAIN from a row-mate (not the anchor) — refused, subtree intact', stillSeated() && (drainsBy.get(T.id) || 0) === d0 && threw === 0, { T: seatedAt(T), fwd: (drainsBy.get(T.id) || 0) - d0, threw }); }

  // ---- 3. a DRAIN wearing the anchor's id but signed by the row-mate ------
  { const d0 = drainsBy.get(T.id) || 0;
    env.send(A.id, T.id, { t: 'DRAIN', roster: bogus, id: O.id });
    const threw = run(env, 100);
    check('3: DRAIN forging the anchor\'s id under the row-mate\'s key — dropped at delivery', stillSeated() && (drainsBy.get(T.id) || 0) === d0 && threw === 0, { T: seatedAt(T), fwd: (drainsBy.get(T.id) || 0) - d0, threw }); }

  // ---- 4. HOME unsolicited: a seated greeter and a seated deep seat --------
  { let G = null; for (const s of env.seats.values()) if (s.alive && s.state === 3 && s.hasCoord && s.coord.pc === 0) { G = s; break; }
    const gk0 = G.genKey, r0 = G.roster, hr0 = G.haveRoster;
    rawDeliver(env, A.id, G.id, { t: 'HOME', gkey: 'x_bogus_key', roster: bogus, id: A.id });
    const tk0 = T.genKey, tr0 = T.roster;
    rawDeliver(env, A.id, T.id, { t: 'HOME', gkey: 'x_bogus_key', roster: bogus, id: A.id });
    const threw = run(env, 20);
    check('4: unsolicited HOME at a seated greeter — genesis key and roster unchanged', G.genKey === gk0 && G.roster === r0 && G.haveRoster === hr0 && threw === 0, { gkey: G.genKey === gk0, roster: G.roster === r0 });
    check('4: unsolicited HOME at a seated deep seat — genesis key and roster unchanged', T.genKey === tk0 && T.roster === tr0 && threw === 0, { gkey: T.genKey === tk0, roster: T.roster === tr0 });
    // and one the deep seat DID ask for (drainOrReenter's WHOHOME) with a
    // malformed roster: not adopted, never throws
    T.rosterAskAt = env.TICK;
    rawDeliver(env, A.id, T.id, { t: 'HOME', gkey: T.genKey, roster: [null, { k: 7 }, 'junk'], id: A.id });
    const threw2 = run(env, 20);
    check('4: solicited HOME with a malformed roster — not adopted, no throw', T.roster === tr0 && threw2 === 0 && stillSeated());
    // positive control: the solicited answer with a sane roster IS adopted
    T.rosterAskAt = env.TICK; const good = s1Roster(env);
    rawDeliver(env, A.id, T.id, { t: 'HOME', gkey: T.genKey, roster: good, id: A.id });
    const threw3 = run(env, 20);
    check('4: solicited HOME with a sane roster — adopted (the E1 re-seat path still works)', T.roster === good && T.haveRoster === true && threw3 === 0); }

  // ---- 5. a roster-less DRAIN from the REAL anchor: refused, tick() lives --
  { const d0 = drainsBy.get(T.id) || 0;
    env.send(O.id, T.id, { t: 'DRAIN', id: O.id });   // signed by O, no roster
    const threw = run(env, 100);
    check('5: roster-less DRAIN from the anchor — refused, tick() never throws, T seated', stillSeated() && threw === 0 && (drainsBy.get(T.id) || 0) === d0, { T: seatedAt(T), threw, fwd: (drainsBy.get(T.id) || 0) - d0 }); }

  // ---- 6. POSITIVE CONTROL: the anchor's signed DRAIN still dissolves -----
  { const d0 = drainsBy.get(T.id) || 0;
    env.send(O.id, T.id, { t: 'DRAIN', roster: s1Roster(env), id: O.id });
    let gone = -1; for (let t = 0; t < 60 && gone < 0; t++) { run(env, 1); if (seatedAt(T) !== tCk) gone = t; }
    check('6: the anchor\'s signed DRAIN with a sane roster — T vacates within 60 ticks and fans the DRAIN to its row', gone >= 0 && (drainsBy.get(T.id) || 0) > d0, { gone, fwd: (drainsBy.get(T.id) || 0) - d0 });
    let kidsGone = 0; for (let t = 0; t < 100; t++) run(env, 1); for (const s of kids) if (seatedAt(s) !== kidCk.get(s.id)) kidsGone++;
    check('6: every seat under T re-seated (left its old cell) — the E1 fan-down is intact', kidsGone === kids.length, { kidsGone, kids: kids.length });
    H.converge(env, N, 20000); c = H.counts(env);
    check('6: the room re-converges after the drain', c.seated === N && c.s1 === 25 && c.dups === 0 && c.stranded === 0 && c.teleport === 0, c); }

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
