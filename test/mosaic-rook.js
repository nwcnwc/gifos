// mosaic-rook.js — static verification of meet.html's Section-1 ROOK media
// routing (healing-laws W7, docs/media-plane.md). Replicates the exact routing
// rules coded in reconcileMosaic + the sga Stage data lane, against the W7
// topo contract: colMates(c) = {pc, r', i} for r' != r (pc==0 only; no
// transpose diagonal at Section 1). Proves, without a browser:
//   - every head pair has a DIRECT (column) + RELAY (x1 -> column carrier ->
//     sdrow) product path, link- and interior-node-disjoint (S3);
//   - any single seat death leaves a live product path for every pair;
//   - per-origin-row x2 slots never collide;
//   - every S1 non-head holds >=2 independent sd sources;
//   - the stg flood covers all 25 seats, and 24 under any single death;
//   - the sga data flood covers a 2-level room and strands nobody outside a
//     dead seat's own subtree.
// If meet.html's routing rules change, change the mirrored rules here too.
const C = 5;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };
const k = (r, i) => r + ',' + i;

// The W7 contract at Section 1.
const rowMates = (r, i) => Array.from({ length: C }, (_, j) => j).filter((j) => j !== i).map((j) => [r, j]);
const colMates = (r, i) => Array.from({ length: C }, (_, q) => q).filter((q) => q !== r).map((q) => [q, i]);
// Undirected S1 link set (row + column; NO transpose diagonal).
const linked = (a, b) => (a[0] === b[0] && a[1] !== b[1]) || (a[1] === b[1] && a[0] !== b[0]);

// ---- 1. sdrow delivery: for every ordered head pair (r -> q), the DIRECT
// path and the RELAY path exist, use only real links, and are link-disjoint.
{
  let allOk = true, disjointOk = true;
  for (let r = 0; r < C; r++) for (let q = 0; q < C; q++) {
    if (q === r) continue;
    // DIRECT: head_r --column0--> head_q   (colMates of a head are the heads)
    const direct = [[[r, 0], [q, 0]]];
    // RELAY (as coded): head_r ships x1 to mates (r,j) j=1..4; mate j with
    // dest = (j===r ? 0 : j) === q ships x2 to (q, j); (q,j) ships sdrow to head_q.
    let relay = null;
    for (let j = 1; j < C; j++) {
      const dest = (j === r) ? 0 : j;
      if (dest !== q) continue;
      relay = [[[r, 0], [r, j]], [[r, j], [q, j]], [[q, j], [q, 0]]];
    }
    if (!relay) { allOk = false; console.log('  no relay for ' + r + '->' + q); continue; }
    for (const [a, b] of [...direct, ...relay]) if (!linked(a, b)) { allOk = false; console.log('  nonlink hop ' + JSON.stringify([a, b])); }
    const ek = (a, b) => [k(...a), k(...b)].sort().join('~');
    const dset = new Set(direct.map((e) => ek(...e)));
    if (relay.some((e) => dset.has(ek(...e)))) disjointOk = false;
    // node-disjoint interior too (no shared seat besides the endpoints):
    const interior = relay.slice(1).map((e) => k(...e[0]));
    if (interior.includes(k(r, 0)) || interior.includes(k(q, 0))) disjointOk = false;
  }
  check('sdrow: every head pair (r->q) has a direct + a relay path over real links', allOk);
  check('sdrow: direct and relay paths are link-disjoint (and interior-node-disjoint)', disjointOk);
}

// ---- 2. sdrow single-failure survival: for every (r -> q), killing any ONE
// other seat leaves at least one of the two paths intact.
{
  let ok = true;
  for (let r = 0; r < C; r++) for (let q = 0; q < C; q++) {
    if (q === r) continue;
    let jj = null; for (let j = 1; j < C; j++) if (((j === r) ? 0 : j) === q) jj = j;
    const relayNodes = [k(r, jj), k(q, jj)];
    for (let kr = 0; kr < C; kr++) for (let ki = 0; ki < C; ki++) {
      const dead = k(kr, ki);
      if (dead === k(r, 0) || dead === k(q, 0)) continue; // endpoints out of scope
      const directUp = true;                        // direct is head->head, no interior
      const relayUp = !relayNodes.includes(dead);
      if (!(directUp || relayUp)) { ok = false; }
    }
  }
  check('sdrow: any single non-endpoint seat death leaves a live path for every pair', ok);
}

// ---- 3. x2 slot collisions: per-receiver, every incoming x2 has a distinct
// origin row (the per-origin-row slot fix) — and count receivers' load.
{
  const inbox = new Map(); // receiver -> [origin rows]
  for (let r = 0; r < C; r++) for (let j = 1; j < C; j++) {
    const dest = (j === r) ? 0 : j;
    const recv = k(dest, j);
    (inbox.get(recv) || inbox.set(recv, []).get(recv)).push(r);
  }
  let collide = false, maxIn = 0;
  for (const [recv, rows] of inbox) { if (new Set(rows).size !== rows.length) collide = true; maxIn = Math.max(maxIn, rows.length); }
  check('x2: per-origin-row slots never collide at any carrier/receiver', !collide, { maxPerReceiver: maxIn });
}

// ---- 4. sd second source at S1: with full occupancy every non-head receives
// sd from its own head AND from its cyclic column predecessor (nextColMate).
{
  const recvFrom = new Map();
  for (let r = 0; r < C; r++) for (let i = 1; i < C; i++) {
    // head r fans sd to row-mates: (r,i) gets it from (r,0)
    (recvFrom.get(k(r, i)) || recvFrom.set(k(r, i), []).get(k(r, i))).push(k(r, 0));
    // seat (r,i) holding sd ships to nextColMate = ((r+1)%C, i)
    const t = k((r + 1) % C, i);
    (recvFrom.get(t) || recvFrom.set(t, []).get(t)).push(k(r, i));
  }
  let ok = true;
  for (let r = 0; r < C; r++) for (let i = 1; i < C; i++) {
    const srcs = new Set(recvFrom.get(k(r, i)) || []);
    if (srcs.size < 2) { ok = false; console.log('  ' + k(r, i) + ' sources: ' + [...srcs]); }
  }
  check('sd: every S1 non-head has >=2 independent sd sources (head + column pred)', ok);
}

// ---- 5. stg flood coverage: from any entry seat, flooding row+col with
// streamId dedup reaches all 25 seats; and with any single seat dead, all 24.
{
  const flood = (entry, deadSet) => {
    const seen = new Set([entry]); const q2 = [entry];
    while (q2.length) {
      const cur = q2.shift(); const [r, i] = cur.split(',').map(Number);
      for (const [qr, qi] of [...rowMates(r, i), ...colMates(r, i)]) {
        const t = k(qr, qi);
        if (deadSet.has(t) || seen.has(t)) continue;
        seen.add(t); q2.push(t);
      }
    }
    return seen;
  };
  let full = true, oneDead = true;
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) {
    if (flood(k(r, i), new Set()).size !== 25) full = false;
    for (let dr = 0; dr < C; dr++) for (let di = 0; di < C; di++) {
      const dead = k(dr, di); if (dead === k(r, i)) continue;
      if (flood(k(r, i), new Set([dead])).size !== 24) oneDead = false;
    }
  }
  check('stg flood: reaches all 25 S1 seats from any entry', full);
  check('stg flood: still reaches all 24 with any single S1 seat dead', oneDead);
}

// ---- 6. sga data lane: flood over sgaTargets covers a full 2-level tree
// (S1 + 25 child sections), terminates, and survives any single seat death
// for all seats except the dead seat's own subtree-cut (tree edge).
{
  // Build seats: S1 (pc=0) 5x5 + each S1 seat (r,i) owns child section pc="c<r><i>"
  // with a head row of 5 (enough to exercise up/cross/down + head row fan).
  const seats = new Map(); // id -> {pc, r, i}
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) seats.set('s0_' + r + '_' + i, { pc: 0, r, i });
  for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) for (let j = 0; j < C; j++)
    seats.set('d_' + r + '_' + i + '_' + j, { pc: 'c' + r + i, r, i: j });
  const at = new Map(); for (const [id, c] of seats) at.set(c.pc + '|' + c.r + ',' + c.i, id);
  const occ = (pc, r, i) => at.get(pc + '|' + r + ',' + i) || null;
  const targets = (id) => {
    const c = seats.get(id); const out = new Set(); const add = (x) => { if (x && x !== id) out.add(x); };
    if (c.pc === 0) {
      for (const [qr, qi] of rowMates(c.r, c.i)) add(occ(0, qr, qi));
      for (const [qr, qi] of colMates(c.r, c.i)) add(occ(0, qr, qi));
      add(occ('c' + c.r + c.i, c.r, 0)); // down(pc,r,i) = (childPath(pc,i), r, 0) -> here child head
    } else {
      // deep: up (head->S1 owner) or my head; head fans row; crossLink transpose; down (none here)
      if (c.i === 0) { const [rr, ii] = [Number(c.pc[1]), Number(c.pc[2])]; add(occ(0, rr, ii)); for (let j2 = 1; j2 < C; j2++) add(occ(c.pc, c.r, j2)); }
      else { add(occ(c.pc, c.r, 0)); if (c.i !== c.r) add(occ(c.pc, c.i, c.r)); } // transpose (only same-section rows... single row here so mostly null)
    }
    return [...out];
  };
  // NOTE: deep sections here are a single row each, so transpose targets miss —
  // matching a 1-row child section; the tree edge (S1 seat -> child head) is the
  // only path down, exactly like production's depth-1 heads.
  const flood2 = (entry, dead) => {
    const seen = new Set([entry]); const q3 = [entry];
    while (q3.length) { const cur = q3.shift(); for (const t of targets(cur)) { if (t === dead || seen.has(t)) continue; seen.add(t); q3.push(t); } }
    return seen;
  };
  const all = flood2('d_2_3_1', null);
  check('sga: a deep client action floods to every seat in the 2-level room (' + all.size + '/' + seats.size + ')', all.size === seats.size);
  // single S1 death: everyone except the dead seat + its own child section (5) still reached
  const deadId = 's0_1_1';
  const got = flood2('s0_4_4', deadId);
  check('sga: with one S1 seat dead, only its own subtree is cut (' + got.size + '/' + (seats.size - 6) + ' + none stranded elsewhere)', got.size === seats.size - 6);
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails ? 1 : 0);
