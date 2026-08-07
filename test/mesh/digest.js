// digest.js — the V1 ROLLUP DIGEST gate for the BROWSER twin (site/js/mesh.js),
// healing-laws.md § G. The JS mirror of test/sim/repro-digest.sh.
//
// WHAT V1 IS. Every participant's status heartbeat rides a room-wide flood
// today (run.html fanOut -> meshNode.gossip), so every node receives every
// node's pulse every period: O(N) frames per node, the one per-node cost in
// the system that grows with room size. § G replaces it with a fold along the
// tree that already exists — <= C reports in and ONE out per node per pulse
// period, riding PHONE (up), its PONG (down) and S1SYNC (the Section-1 root
// fold). Nothing new is routed; only new payloads ride old edges.
//
// THE TWINS MUST NOT DIVERGE. test/sim/mesh.cpp + mesh_seat.inc are the source
// of truth and their gate (test/sim/repro-digest.sh, 47 assertions) is green.
// This file asserts the SAME laws against the JS port, over the same fabric
// mesh-harness.js gives the sim's scenarios.
//
// THE LEGS, each pinned to the law it guards:
//   1) TRUTH        — G8/§G: the root fold equals the room at EVERY observer,
//                     unanimously, from a one-level Section-1-only room (N=20,
//                     where rollup and flood coincide by construction) up
//                     through a deep multi-section room.
//   2) ON == OFF    — G0/G1, and the ACCEPTANCE TEST for the port: the rollup
//                     adds no frame, no timer and no decision, so a digests-ON
//                     run must be frame-for-frame, tick-for-tick identical to a
//                     digests-OFF run at the same seed — through join, a kill
//                     and the heal. Asserted two ways: the CANONICAL frame log
//                     (every emit, in order, with the digest payload stripped)
//                     is byte-identical, and the digest fields appear ONLY on
//                     the four frames § G names. If a digest ever actuated
//                     anything, this equality breaks.
//   3) REFUSALS     — G3: refusal counts propagate exactly and unanimously, and
//                     a LOSS fails toward MORE blur (partial rises), then
//                     clears once the mesh heals. Never toward consent.
//   4) O(C) GAUGES  — the V1 law itself: frames per node per tick and peak
//                     per-node digest state must be FLAT in N. A number that
//                     grows with N is the flood wearing a new hat.
//   5) LYING AGGR.  — G4/G5: a SUPPRESSING aggregator (the one dangerous
//                     direction — deflating refusals can unblur a room) is
//                     refuted by EXACTLY its structurally-designated checkers
//                     (its down-child, and the row-mates whose contribution it
//                     altered) and by nobody else; and nothing is evicted.
//
// Pure Node, no browser. Usage: node test/mesh/digest.js
'use strict';

// mesh-harness.js runs its S4 impostor battery at require time (it is the ONE
// shared fabric — see its export comment). Those PASS lines belong to that
// suite, not this one; swallow them so this file's count is its own.
const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
const { topo, ck, net } = H;
const C = net.SCALE.C;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const run = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };
// Per-leg wall clock, printed as the suite goes. The mesh tier gives a suite
// 900s (test/batteries/release.sh `run_tier mesh 900`); a leg that quietly
// grows past that turns a green guard into a timeout, so the budget is
// reported rather than assumed.
// (legAt starts NULL, not T0: the first leg() call lands in the same
// millisecond as T0, so a `legAt !== T0` test reads as "no leg started yet" and
// swallowed leg 1's duration entirely — measured, and the budget line is only
// worth printing if it accounts for every leg.)
const T0 = Date.now(); let legAt = null;
const leg = (title) => { const now = Date.now(); if (legAt !== null) console.log(`  [leg took ${((now - legAt) / 1000).toFixed(1)}s]`); legAt = now; console.log('\n=== ' + title + ' ==='); };

// ---------------------------------------------------------------------------
// The observer. No seat could compute any of this — that is the point: the
// gauge stands OUTSIDE the mesh and compares every seat's fold against ground
// truth, which is exactly the comparison no participant can make for itself.
function digStat(env) {
  let trueSeated = 0, trueRefuse = 0;
  for (const s of env.seats.values()) if (s.alive && s.state === 3) { trueSeated++; if (s.refuses) trueRefuse++; }
  let obs = 0, noroot = 0, exact = 0, part = 0, mism = 0;
  let rmin = Infinity, rmax = -1, fmin = Infinity, fmax = -1, dmax = 0;
  for (const s of env.seats.values()) {
    if (!s.alive || s.state !== 3) continue;
    mism += s.digMismatch;
    // Per-node DIGEST STATE: the Section-1 table plus a child row plus a
    // handful of scalars. C^2 + 2C + 4 is its structural bound, and N does not
    // appear in it anywhere.
    const d = s.rowKids.size + s.s1tab.size + 3; if (d > dmax) dmax = d;
    if (s.rootDig.at < 0) { noroot++; continue; }
    obs++;
    const n = s.rootDig.n, f = s.rootDig.refuse;
    if (n < rmin) rmin = n; if (n > rmax) rmax = n;
    if (f < fmin) fmin = f; if (f > fmax) fmax = f;
    if (n === trueSeated) exact++;
    if (s.rootDig.part) part++;
  }
  return { trueSeated, trueRefuse, obs, noroot, rmin: obs ? rmin : -1, rmax, exact, fmin: obs ? fmin : -1, fmax, part, mism, dmax };
}

// Join, then run to QUIESCENCE. runJoin stops at the first 64-tick sample that
// reads converged, which is BEFORE compaction has finished packing the tree —
// and a seat in transit is legitimately counted by two aggregators for a beat
// (law T dual-hold). Measured: at N=150 the fold reads +1 at tick 776 and is
// exact from 1176 on, permanently. The digest's claim is about a SETTLED room,
// so settle it; a fold that never converged would still fail every leg below.
function settledRoom(N, opts) {
  H.seedRng((opts && opts.seed) || 20260714);
  const env = H.makeFabric();
  env.DIGEST = !(opts && opts.digestOff);
  H.spawn(env, N);
  const jt = H.runJoin(env, N, 20000);
  run(env, (opts && opts.settle) !== undefined ? opts.settle : 1200);
  return { env, jt };
}

// ===========================================================================
leg('1) TRUTH — the root fold equals the room, at every observer');
// N=20 is G8's "small rooms degrade to today": everyone is in Section 1, the
// tree is one level, near field = the whole room, and rollup ≡ flood. N=150 is
// a genuinely deep multi-section room where they cannot coincide.
for (const N of [20, 150]) {
  const { env } = settledRoom(N);
  const c = H.counts(env), d = digStat(env);
  check(`N=${N} mesh converged (seated ${c.seated}/${N}, s1 ${c.s1}, dups ${c.dups})`,
    c.seated === N && c.dups === 0 && c.stranded === 0 && c.teleport === 0, c);
  check(`N=${N} every seated seat holds a root digest`, d.noroot === 0, { noroot: d.noroot, obs: d.obs });
  check(`N=${N} root n == true seated (${d.trueSeated}) at ALL ${d.obs} observers`, d.exact === d.obs && d.obs === N, { exact: d.exact, obs: d.obs, rmin: d.rmin, rmax: d.rmax });
  check(`N=${N} observers UNANIMOUS (min==max)`, d.rmin === d.rmax, { rmin: d.rmin, rmax: d.rmax });
  check(`N=${N} settled fold is complete (partial=0 ⇒ nothing fail-closed)`, d.part === 0, { partial: d.part });
  check(`N=${N} no refutations raised in an honest room`, d.mism === 0, { mismatch: d.mism });
}

// ===========================================================================
leg('2) ON == OFF — G0/G1 trajectory identity, frame for frame');
// The strongest statement available about a mechanism that must never actuate:
// record EVERY emit — tick, sender, recipient, and the frame itself with the
// digest payload stripped — and require the two logs to be byte-identical
// through join, a kill and the heal that follows. The digest may add bytes to
// four frames; it may not add a frame, drop a frame, reorder a frame, or change
// one field of any frame's meaning.
const DIG_FIELDS = ['dgUp', 'dgPub', 'dgEcho', 'dgRoot', 'digs'];
// Canonical form: keys sorted (the ON path builds PONG as an object then adds
// digest fields, so raw key ORDER differs while the frame does not), digest
// payload removed, and the volatile `to`/`from` the fabric stamps kept — they
// are part of the routing fact being compared.
function canon(m) {
  const seen = [];
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const k of Object.keys(v).sort()) { if (DIG_FIELDS.indexOf(k) >= 0) continue; out[k] = walk(v[k]); }
    return out;
  };
  seen.push(walk(m));
  return JSON.stringify(seen[0]);
}
// MEMORY IS PART OF THE GUARD. The first cut of this leg retained both arms'
// full frame logs — a quarter of a million strings twice — and on a loaded
// 6.5GB box the process was killed mid-leg: 12 assertions printed, no error,
// no verdict. That is the exact state the release doctrine calls the most
// dangerous there is ("exit non-zero with no assertions ... looks like
// silence"), and a guard that can die quietly in-gate is not a guard. So the
// arms are compared by a PER-FRAME 64-BIT FINGERPRINT (two independent FNV-1a
// words, ~8 bytes a frame instead of ~200; collision odds across 250k frames
// are ~1e-8), and the divergent frame's TEXT is recovered by re-running both
// arms capturing only that one index — which happens on the failure path only.
function fnv(s, seed) { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function trajectory(N, digestOn, seed, wantIdx) {
  H.seedRng(seed);
  const env = H.makeFabric();
  env.DIGEST = digestOn;
  const h1 = [], h2 = []; const digOn = { count: 0, types: new Set() }; let grabbed = null;
  const baseSend = env.send;
  env.send = (from, to, m) => {
    for (const f of DIG_FIELDS) if (m[f] !== undefined) { digOn.count++; digOn.types.add(m.t); break; }
    const s = env.TICK + '|' + from + '|' + to + '|' + canon(m);
    if (wantIdx !== undefined && h1.length === wantIdx) grabbed = s;
    h1.push(fnv(s, 2166136261)); h2.push(fnv(s, 0x811c9dc5 ^ 0x9e3779b9));
    baseSend(from, to, m);
  };
  H.spawn(env, N);
  const jt = H.runJoin(env, N, 20000);
  const nk = H.kill(env, N, 0.15, '');
  const kt = H.converge(env, N - nk, 40000);
  run(env, 600);
  const c = H.counts(env);
  return { h1, h2, n: h1.length, grabbed, jt, kt, nk, c, moves: env.moves, evict: env.evict, digFrames: digOn.count, digTypes: Array.from(digOn.types).sort() };
}
for (const seed of [20260714, 7]) {
  const A = trajectory(200, true, seed);
  const B = trajectory(200, false, seed);
  check(`seed ${seed}: same number of frames (${A.n})`, A.n === B.n, { on: A.n, off: B.n });
  let firstDiff = -1;
  for (let i = 0; i < Math.min(A.n, B.n); i++) if (A.h1[i] !== B.h1[i] || A.h2[i] !== B.h2[i]) { firstDiff = i; break; }
  let detail;
  if (firstDiff >= 0) {   // failure path only: pay a re-run to name the frame
    const A2 = trajectory(200, true, seed, firstDiff), B2 = trajectory(200, false, seed, firstDiff);
    detail = { atFrame: firstDiff, on: String(A2.grabbed).slice(0, 220), off: String(B2.grabbed).slice(0, 220) };
  }
  check(`seed ${seed}: digests ON is BYTE-IDENTICAL to OFF, frame for frame, through join+kill+heal`,
    firstDiff < 0, detail);
  check(`seed ${seed}: same convergence ticks, same moves, same evictions, same outcome`,
    A.jt === B.jt && A.kt === B.kt && A.moves === B.moves && A.evict === B.evict && A.nk === B.nk && JSON.stringify(A.c) === JSON.stringify(B.c),
    { on: { jt: A.jt, kt: A.kt, moves: A.moves, evict: A.evict, c: A.c }, off: { jt: B.jt, kt: B.kt, moves: B.moves, evict: B.evict, c: B.c } });
  // ...and the leg is not vacuous: the ON arm really did carry digests, and on
  // exactly the frames § G names. An equality that passed because the flag did
  // nothing would prove nothing at all.
  check(`seed ${seed}: the ON arm actually carried digests (${A.digFrames} frames)`, A.digFrames > 1000, { digFrames: A.digFrames });
  check(`seed ${seed}: G0 — digests rode ONLY existing frames: ${A.digTypes.join(',')}`,
    A.digTypes.length === 3 && A.digTypes.join(',') === 'PHONE,PONG,S1SYNC', { types: A.digTypes });
  check(`seed ${seed}: the OFF arm carried none`, B.digFrames === 0, { digFrames: B.digFrames });
}

// ===========================================================================
leg('3) REFUSALS — G3: exact, unanimous, and failing toward BLUR');
{
  const { env } = settledRoom(150);
  const live = () => [...env.seats.values()].filter((s) => s.alive && s.state === 3);
  // A tenth of the room refuses. `refuses` is each seat's OWN first-hand
  // consent state — never derived from a digest (G1).
  const all = live(); let want = 0;
  for (let i = 0; i < all.length; i++) if (i % 10 === 0) { all[i].refuses = true; want++; }
  run(env, 400);
  let d = digStat(env);
  check(`some seats refuse (${d.trueRefuse})`, d.trueRefuse === want && want > 0, { trueRefuse: d.trueRefuse, want });
  check('partial refusal propagates EXACTLY to the root', d.fmin === d.trueRefuse && d.fmax === d.trueRefuse, { fmin: d.fmin, fmax: d.fmax, truth: d.trueRefuse });
  check('…and UNANIMOUSLY (every observer agrees)', d.fmin === d.fmax, { fmin: d.fmin, fmax: d.fmax });
  for (const s of live()) s.refuses = true;
  run(env, 400); d = digStat(env);
  check('unanimous refusal == n', d.fmin === d.trueSeated && d.fmax === d.trueSeated, { fmin: d.fmin, fmax: d.fmax, n: d.trueSeated });
  for (const s of live()) s.refuses = false;
  run(env, 400); d = digStat(env);
  check('consent restored ⇒ refuse falls to 0 everywhere', d.fmax === 0, { fmax: d.fmax });
}
{
  // A LOSS must blur, then clear. A silent mass death (no LEAVE, no transport
  // event) is the case G3 exists for: the fold must go PARTIAL — blurred badge
  // — while the room does not yet know what happened, and recover once the mesh
  // heals. A loss that read as CONSENT would be the bug. The blur is a
  // TRANSIENT, so sample the whole window: pinning one instant would make this
  // leg a coin-flip the first time an unrelated horizon moved.
  const { env } = settledRoom(150, { seed: 4 });
  let d = digStat(env);
  check('before the kill: nothing fail-closed', d.part === 0 && d.fmax === 0, { partial: d.part, refuse: d.fmax });
  const victims = [...env.seats.values()].filter((s) => s.alive && s.state === 3).slice(0, 25);
  for (const v of victims) v.alive = false;   // SIGKILL: no LEAVE, nothing sent
  let maxPart = 0, dropped = 0;
  for (let w = 0; w < 12; w++) {
    run(env, 40); d = digStat(env);
    if (d.part > maxPart) maxPart = d.part;
    if (d.fmin < d.trueRefuse) dropped++;     // refusals below the truth = failing toward CONSENT
  }
  check(`during the loss the fold goes PARTIAL (peak ${maxPart} observers blurred)`, maxPart > 0, { maxPart });
  check('refusals NEVER fell below the truth anywhere in the loss (the fail-safe direction)', dropped === 0, { dropped });
  run(env, 4000); d = digStat(env);
  const c = H.counts(env);
  check('after the heal the blur clears', d.part === 0, { partial: d.part, seated: c.seated });
  check('…and the count is true again at every observer', d.exact === d.obs && d.obs === c.seated, { exact: d.exact, obs: d.obs, seated: c.seated, n: d.rmax });
  check('mesh healthy after the silent kill (dups 0, s1 full)', c.dups === 0 && c.s1 === Math.min(C * C, c.seated) && c.teleport === 0, c);
}

// ===========================================================================
leg('4) O(C) GAUGES — flat in N (the V1 law itself)');
// The bound that matters is N-INDEPENDENCE, so this is a RATIO test between a
// small room and a much larger one, plus the absolute C-derived cap. Note what
// framesPerTick counts: EVERY frame a node receives, not just digests — the
// honest subject of the V1 law. Leg 2 proves the digest adds none of it.
function gauge(N) {
  const { env } = settledRoom(N);
  const rx = new Map();
  const baseSend = env.send;
  env.send = (from, to, m) => { rx.set(to, (rx.get(to) || 0) + 1); baseSend(from, to, m); };
  const W = 400; run(env, W);
  const per = [];
  for (const s of env.seats.values()) if (s.alive && s.state === 3) per.push((rx.get(s.id) || 0) / W);
  per.sort((a, b) => a - b);
  const d = digStat(env);
  return { N, max: per[per.length - 1], p50: per[per.length >> 1], dstate: d.dmax, nodes: per.length };
}
{
  const S = gauge(100), B = gauge(500);
  const bound = C * C + 2 * C + 4;
  console.log(`  N=${S.N}  frames/node/tick max=${S.max.toFixed(4)} p50=${S.p50.toFixed(4)}  digState=${S.dstate}`);
  console.log(`  N=${B.N}  frames/node/tick max=${B.max.toFixed(4)} p50=${B.p50.toFixed(4)}  digState=${B.dstate}  (bound ${bound})`);
  check(`frames/node/tick MAX is flat in N (${S.max.toFixed(3)} -> ${B.max.toFixed(3)} over 5x N; O(N) would be 5x)`,
    B.max <= S.max * 2.0, { small: S.max, big: B.max, ratioN: B.N / S.N });
  check(`frames/node/tick p50 is flat in N (${S.p50.toFixed(3)} -> ${B.p50.toFixed(3)})`,
    B.p50 <= S.p50 * 2.0, { small: S.p50, big: B.p50 });
  check(`peak per-node digest state ${B.dstate} <= the C-derived bound ${bound}`, B.dstate <= bound, { dstate: B.dstate, bound });
  check('digest state does not see N at all', B.dstate === S.dstate, { small: S.dstate, big: B.dstate });
}

// ===========================================================================
leg('5) THE LYING AGGREGATOR — G4/G5');
// `lie = 1` publishes folds AND echoes with the refusals stripped: the
// strongest suppressor, and the ONE dangerous direction (deflating refusals can
// unblur a room). What must hold:
//   - it is REFUTED, and only by the structurally-designated checkers: its
//     DOWN-CHILD (already its C3-designated healer, and the sole author of its
//     subtree claim's only input) and the ROW-MATES whose own contribution it
//     altered. No votes, no bystanders.
//   - exactly ONE aggregator stands accused — the liar.
//   - G5: nothing is evicted. The room stays fully seated, dups 0.
{
  const { env } = settledRoom(300);
  const live = () => [...env.seats.values()].filter((s) => s.alive && s.state === 3);
  const all = live(); for (let i = 0; i < all.length; i++) if (i % 10 === 0) all[i].refuses = true;
  run(env, 400);
  let d = digStat(env);
  check('the honest fold was exact before the lie', d.fmin === d.trueRefuse && d.fmax === d.trueRefuse && d.mism === 0,
    { fmin: d.fmin, fmax: d.fmax, truth: d.trueRefuse, mismatch: d.mism });
  const honest = d.fmax;
  // A deep row HEAD with a subtree: it aggregates a row (its row-mates check
  // it) AND publishes a subtree claim to its owner (its down-child checks it).
  const liar = live().find((s) => s.coord.pc !== 0 && s.coord.i === 0 && s.occGet(ck(topo.down(s.coord))) != null
    && s.rowKids.size > 0 && s.myDig.refuse > 0);
  check('found a deep aggregator with a row AND a subtree to lie about', !!liar,
    liar ? { coord: ck(liar.coord), rowKids: liar.rowKids.size, subtreeRefuse: liar.myDig.refuse } : undefined);
  if (liar) {
    // Make BOTH checker classes have something to lose. Only the author whose
    // own contribution was suppressed can refute (G4.3 — "is my own
    // contribution still in there?"), so a liar whose row-mates and down-child
    // all contributed refuse=0 is correctly refuted by nobody: strip a zero and
    // nothing is missing. That is faithful, but it makes the leg prove only
    // half of G4.4. So put a refusal in a ROW-MATE's subtree and in the
    // DOWN-CHILD's, let the honest fold carry them, and then lie.
    const rowMate = live().find((s) => s.coord.pc === liar.coord.pc && s.coord.r === liar.coord.r && s.coord.i > 0);
    const downKid = live().find((s) => ck(s.coord) === ck(topo.down(liar.coord)));
    check('the liar has a row-mate AND a down-child to suppress', !!rowMate && !!downKid,
      { rowMate: rowMate ? ck(rowMate.coord) : null, downKid: downKid ? ck(downKid.coord) : null });
    if (rowMate) rowMate.refuses = true;
    if (downKid) downKid.refuses = true;
    run(env, 400);
    const before = H.counts(env);
    const accusations = [];
    for (const s of live()) { s.digMismatch = 0; s.onDigMismatch = (e) => accusations.push(e); }
    liar.lie = 1;
    run(env, 400);
    d = digStat(env);
    check(`the suppression LANDS (room-wide refusals ${honest} honest -> ${d.fmax} lied, truth ${d.trueRefuse}) — that is why it needs a checker`,
      d.fmax < d.trueRefuse, { lied: d.fmax, truth: d.trueRefuse });
    check(`the lie is REFUTED (${d.mism} refutations raised)`, d.mism > 0, { mismatch: d.mism });
    // Every refuter must be a DESIGNATED checker of the aggregator it accuses:
    // a row-mate (same section+row, i>0, aggregator at i==0), or the down-child
    // cell of (P,R,I) — section childPath(P,I), row R, column 0.
    const bad = accusations.filter((e) => {
      const m = e.me, a = e.agg;
      const rowmate = (m.pc === a.pc && m.r === a.r && m.i > 0 && a.i === 0);
      const downkid = (m.pc === topo.childPath(a.pc, a.i) && m.r === a.r && m.i === 0);
      return !rowmate && !downkid;
    });
    check('every refuter is a DESIGNATED checker (row-mate or down-child) — no votes, no bystanders',
      bad.length === 0, bad.length ? bad.slice(0, 3).map((e) => ({ me: e.me, agg: e.agg, arm: e.arm })) : { refutations: accusations.length });
    const accused = new Set(accusations.map((e) => e.aggId));
    check('exactly ONE aggregator is accused (the liar)', accused.size === 1 && accused.has(liar.id),
      { accused: accused.size, isLiar: accused.has(liar.id) });
    const victims = new Set(accusations.map((e) => e.meId));
    console.log(`  (${accusations.length} refutation frames from ${victims.size} distinct victims, arms ${[...new Set(accusations.map((e) => e.arm))].sort().join('+')})`);
    // BOTH structural checker classes must actually fire — the down-child on
    // the subtree claim, and the row-mate on the row sum. A leg where only one
    // ever fires proves only half of G4.4.
    check('the DOWN-CHILD refuted the subtree claim (its sole input was suppressed)',
      !!downKid && victims.has(downKid.id), { downKid: downKid ? ck(downKid.coord) : null });
    check('the ROW-MATE refuted the row sum (its own contribution was suppressed)',
      !!rowMate && victims.has(rowMate.id), { rowMate: rowMate ? ck(rowMate.coord) : null });
    run(env, 1000);
    const c = H.counts(env);
    check('G5: the lie evicted NOTHING — same seated count, dups 0, s1 full, no teleports',
      c.seated === before.seated && c.dups === 0 && c.s1 === C * C && c.teleport === 0, { before, after: c });
  }
}

console.log(`  [leg took ${((Date.now() - legAt) / 1000).toFixed(1)}s]`);
console.log(`\ntotal wall clock ${((Date.now() - T0) / 1000).toFixed(1)}s (mesh tier budget: 900s)`);
console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
