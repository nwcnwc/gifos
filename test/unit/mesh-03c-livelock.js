// mesh-03c-livelock.js — the 03c NOROOM livelock, deterministic and browserless.
// Root incident (behavior battery 03c-classmates-flaky-pair, ~30% of draws):
// a radio-churned member requeues while dark, so its LEAVE is swallowed and
// every live member keeps its old occ entries. Production has no env.peek, so
// occIsPhantom's requeued/moved branch — the defense the sim seats this shape
// with — NEVER RAN in a browser: the stale entries stayed "reserved", the
// frontier's designated admitter was a corpse, and every greeter answered
// NOROOM to every seeker until the reap (~150s+). The fix rebuilds phantom
// detection from LOCAL evidence: (1) knock-is-evidence — the serveFind seeker
// is at the door by construction, so occ entries naming it are stale;
// (2) moved-elsewhere — an id first-hand-live at a different cell makes its
// other entries pre-move echoes. This test drives a greeter Seat with the
// EXACT occ shape dumped from the wedged room (scratchpad repro, 2026-07-28)
// and asserts the door opens — and that the deliberate conservative boundary
// (an orphan corpse: dead reload-ghosts, ring-hold) still holds NOROOM.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const net = globalThis.GifOS.net, { Seat } = globalThis.GifOS.mesh;
const ck = net.topo.ckey;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// A production-shaped env: NO peek (that is the point), sends captured.
function mkGreeter(tick) {
  const sent = [];
  const env = { TICK: tick, HEALING: true, send: (from, to, m) => sent.push({ to, m }), knock: () => {}, wake: () => {} };
  const s = new Seat('A0', env);
  s.state = 3; s.hasCoord = true; s.coord = { pc: 0, r: 0, i: 0 };
  s.genKey = 'gk'; s.seatedAt = 0;
  return { s, sent, env };
}
const put = (s, k, id, liveAt, seenAt) => { s.occ.set(k, id); if (liveAt != null) s.live.set(k, liveAt); if (seenAt != null) s.s1seen.set(k, seenAt); };
const answer = (sent) => sent.filter((e) => e.m.t === 'PLACE' || e.m.t === 'NOROOM' || e.m.t === 'FIND').map((e) => e.m.t + (e.m.coord ? '@' + ck(e.m.coord) : '') + '->' + e.to);

// ── 1. knock-is-evidence: the wedged room verbatim (A0's dump, tick 1289) ──
// A3/A4 churned twice; row 0 reads full (3 live + their round-1 corpses with
// gossip-fresh s1seen), row 1 holds their round-2 corpses at the head cells.
// Pre-fix: NOROOM. The seeker IS A3 — its own entries must read phantom, and
// A0 (row-0 head, the designated admitter) must seat it at its front-row hole.
{
  const T = 1289;
  const { s, sent } = mkGreeter(T);
  put(s, '0_0_0', 'A0', T, T - 9);
  put(s, '0_0_1', 'A1', T - 5, T - 5);
  put(s, '0_0_2', 'A2', T - 5, T - 5);
  put(s, '0_0_3', 'A3', 336, T - 9);   // round-1 corpse; s1seen gossip-fresh
  put(s, '0_0_4', 'A4', 143, T - 9);
  put(s, '0_1_0', 'A3', null, 336);    // round-2 corpse at the ROW HEAD
  put(s, '0_1_1', 'A4', null, 332);
  s.recv({ t: 'FIND', nc: 'A3', ttl: 200 });
  const place = sent.find((e) => e.m.t === 'PLACE');
  check('knock-is-evidence: churned seeker is admitted at its own front-row hole',
    place && place.to === 'A3' && ck(place.m.coord) === '0_0_3', answer(sent));
  check('knock-is-evidence: no NOROOM', !sent.some((e) => e.m.t === 'NOROOM'), answer(sent));
}

// ── 2. moved-elsewhere: churned pair re-seated, fresh entrant knocks ──────
// A3/A4 are back (first-hand-live in row 0); their row-1 echoes remain. The
// fresh seeker F0 is not named by any entry — only rule (2) frees the row-1
// head, and A0 (head of the row above) admits at the frontier 0/1.0.
{
  const T = 1400;
  const { s, sent } = mkGreeter(T);
  put(s, '0_0_0', 'A0', T, T - 9);
  put(s, '0_0_1', 'A1', T - 5, T - 5);
  put(s, '0_0_2', 'A2', T - 5, T - 5);
  put(s, '0_0_3', 'A3', T - 5, T - 5); // live again, front row
  put(s, '0_0_4', 'A4', T - 5, T - 5);
  put(s, '0_1_0', 'A3', 336, 336);     // pre-requeue echoes, long stale
  put(s, '0_1_1', 'A4', 332, 332);
  s.recv({ t: 'FIND', nc: 'F0', ttl: 200 });
  const place = sent.find((e) => e.m.t === 'PLACE');
  check('moved-elsewhere: fresh entrant is admitted at the echo-held frontier head',
    place && place.to === 'F0' && ck(place.m.coord) === '0_1_0', answer(sent));
  check('moved-elsewhere: no NOROOM', !sent.some((e) => e.m.t === 'NOROOM'), answer(sent));
}

// ── 3. the conservative boundary holds: an orphan corpse stays reserved ───
// 'Z' is nobody's seeker and first-hand-live nowhere (a reload-ghost / silent
// death). Ring-hold doctrine: dead-without-LEAVE is NOT a free chair, and no
// devolution may fire on mere silence — the greeter must still say NOROOM
// rather than race a healer. (The ghost family is 12b/19a law-budgeted.)
{
  const T = 1400;
  const { s, sent } = mkGreeter(T);
  put(s, '0_0_0', 'A0', T, T - 9);
  put(s, '0_0_1', 'A1', T - 5, T - 5);
  put(s, '0_0_2', 'A2', T - 5, T - 5);
  put(s, '0_0_3', 'A3', T - 5, T - 5);
  put(s, '0_0_4', 'A4', T - 5, T - 5);
  put(s, '0_1_0', 'Z', 300, 300);      // orphan corpse at the row-1 head
  s.recv({ t: 'FIND', nc: 'F0', ttl: 200 });
  check('orphan corpse (no local evidence) still blocks: NOROOM, no PLACE',
    sent.some((e) => e.m.t === 'NOROOM') && !sent.some((e) => e.m.t === 'PLACE'), answer(sent));
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
