/*
 * fork-detect.js — SEE A ROOM FORK WHILE IT IS HAPPENING.
 *
 * THE INCIDENT THIS EXISTS FOR (bug ledger 2026-08-05 §6). Monitor room `test`,
 * 17:30→00:34Z: two ONE-SEAT trees coexisted on a SINGLE relay session for
 * seven hours. The bot sat at `0/0.0 occ=1 links=0` believing it was alone;
 * the phone sat in its own tree with live video. Nothing in the product, and
 * nothing in the monitor's 5s snapshot record, could have told us — because
 * every field we recorded was a view from INSIDE one tree, and from inside a
 * one-seat tree a fork is indistinguishable from an empty room.
 *
 * THE OBSERVATION THAT BREAKS THE SYMMETRY — and it was on the wire the whole
 * time. The relay broadcasts `{t:'roster', peers:[…]}`: every socket attached
 * to THIS session, regardless of which tree (or no tree) its owner is in.
 * run.html already keeps it (`relaySocketed`) and already exposes it
 * (`__gifosVideo.relayReach()`). So:
 *
 *     a peer SOCKETED on my relay session that holds NO cell in my occupancy,
 *     for longer than an entry dance can possibly take, is a second tree.
 *
 * One relay session is one stadium (healing-laws R2/R3) — that is the whole
 * point of the derivation. So this is not a heuristic: two seats on one
 * session that cannot see each other IS the fork, by definition.
 *
 * WHY DWELL, AND WHY THIS LONG. Someone at the door is socketed and outside my
 * occupancy for the length of the entry dance (knock → GREETERS → WHOHOME →
 * HOME → FIND → PLACE — three round trips, plus the join loop's 20-tick retry
 * pacing and ENTRY RESUME's ≤6 knockless retries). Under a flapping socket
 * that legitimately takes tens of seconds (docs/seating-under-flap-2026-08-04).
 * The default dwell is 90s: comfortably past any lawful entry, far short of
 * seven hours. A joiner still outside after 90s is itself a bug worth the
 * alert — a fork and a stuck door are the same alarm, and both were silent.
 *
 * WHAT IT IS NOT. This is an OBSERVER, not a healer. It never dials, never
 * requeues, never touches the mesh — it turns an invisible state into a loud
 * one and stops there. Deciding what a fork should DO is healing-laws work
 * (the fragment-rescue chain in mesh-wire.js already owns the cases it can
 * see); this exists because the case it CANNOT see went unnoticed for 7h.
 *
 * Used by test/swarm/meet.js (every snapshot + the `door` command + the
 * monitor's jsonl record) and by test/drills/e2e-room-fork-live.js (the guard).
 */
'use strict';

// Evaluated IN THE PAGE. Returns only what the verdict needs, all of it from
// hooks run.html already publishes — no product change, and nothing here may
// throw into the page (a forensics probe that breaks the thing it watches is
// worse than no probe).
function forkProbeInPage() {
  const V = window.__gifosVideo;
  const g = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  if (!V || !V.debugDump) return { err: 'no __gifosVideo hook yet' };
  const d = g(() => V.debugDump(), {});
  const me = d.me || {};
  // IN MY TREE = holds a cell in my occupancy. Three independent witnesses,
  // unioned, because each is partial: roster carries a coord only for peers
  // whose status heartbeat also arrived, linkPeers is my neighbours only, and
  // `rows` is my own section's grid. Any one of them naming a peer is proof
  // it is inside; a fork claim needs ALL THREE silent.
  const inTree = [];
  for (const r of (d.roster || [])) if (r && r.coord && r.peer) inTree.push(String(r.peer));
  for (const p of g(() => V.meshLinks(), [])) if (p) inTree.push(String(p));
  for (const row of (d.rows || [])) for (const cell of (row || [])) if (cell) inTree.push(String(cell));
  return {
    me: { peer: me.peer || null, coord: me.coord || null, state: me.state == null ? null : me.state,
      occ: me.occ == null ? null : me.occ, links: me.links == null ? null : me.links },
    participants: d.participants == null ? null : d.participants,
    relayUp: g(() => !!V.relayUp(), false),
    reach: g(() => V.relayReach(), []).map(String),
    inTree,
    // The door's own account of itself: what onGreeters saw last (listLen /
    // decryptable / relay founded flag / admitted / branch taken). `adm:false`
    // on a seated Section-1 seat means the door is REFUSING my registrations —
    // I am not in the greeter pool and my half of the room is unreachable.
    trace: g(() => V.greeterTrace(), []).slice(-6),
  };
}

// makeForkWatch({ dwellMs }) — feed it a probe every sample; it keeps the
// dwell clocks and returns the verdict for that sample.
function makeForkWatch(opts) {
  const o = opts || {};
  const dwellMs = o.dwellMs == null ? 90000 : o.dwellMs;
  const since = new Map();      // orphan peer id -> first ms it was seen outside my tree
  let firstFireAt = 0;

  function feed(probe, nowMs) {
    const now = nowMs || Date.now();
    if (!probe || probe.err) { return { ok: false, err: (probe && probe.err) || 'no probe', fork: false }; }
    const me = probe.me || {};
    const myId = me.peer ? String(me.peer) : '';
    // A peer id in the relay roster is FULL; the witnesses above are truncated
    // (roster 12 chars, rows 8). Prefix match, never equality.
    const inside = (pid) => probe.inTree.some((t) => t && (pid === t || pid.indexOf(t) === 0 || t.indexOf(pid) === 0));
    const live = [];
    for (const pid of (probe.reach || [])) {
      if (!pid || pid === myId || (myId && pid.indexOf(myId) === 0)) continue;
      if (inside(pid)) { since.delete(pid); continue; }
      if (!since.has(pid)) since.set(pid, now);
      live.push(pid);
    }
    for (const pid of Array.from(since.keys())) if (live.indexOf(pid) === -1) since.delete(pid); // gone from the session — not a fork, just a departure
    const orphans = live.map((pid) => ({ peer: pid.slice(0, 12), forMs: now - since.get(pid) }))
      .sort((a, b) => b.forMs - a.forMs);
    const dwelled = orphans.filter((x) => x.forMs >= dwellMs);
    const seated = me.state === 3 && !!me.coord;
    // KIND says what the alarm means, because the response differs:
    //   solo-fork  I am a ONE-SEAT tree and somebody else is on my session —
    //              bug ledger §6 verbatim.
    //   split      my tree has members and someone socketed is outside it.
    //   door-stall I am the one who is outside: seats exist on this session
    //              and I am not in one. The joiner's view of the same illness.
    let kind = null;
    if (dwelled.length) kind = !seated ? 'door-stall' : ((me.occ == null || me.occ <= 1) ? 'solo-fork' : 'split');
    const fork = !!kind;
    if (fork && !firstFireAt) firstFireAt = now;
    if (!fork) firstFireAt = 0;
    const t = (probe.trace || [])[(probe.trace || []).length - 1] || null;
    return {
      ok: true, fork, kind,
      seated, coord: me.coord || null, state: me.state, occ: me.occ, links: me.links,
      reachN: (probe.reach || []).length,
      orphans, dwelled: dwelled.map((x) => x.peer), sinceMs: firstFireAt ? now - firstFireAt : 0,
      // The door line, verbatim, so a verdict carries its own evidence.
      door: t ? { action: t.action, listLen: t.listLen, open: t.open, founded: t.founded, adm: t.adm } : null,
    };
  }

  return { feed, dwellMs, state: () => Array.from(since.entries()).map(([p, at]) => ({ peer: p.slice(0, 12), at })) };
}

// One line, loud, for a stream or a log.
function forkLine(v) {
  if (!v || !v.ok) return 'fork? (' + ((v && v.err) || 'no data') + ')';
  if (!v.fork) return 'fork=no reach=' + v.reachN + (v.orphans.length ? ' outside=' + v.orphans.map((o) => o.peer + '@' + Math.round(o.forMs / 1000) + 's').join(',') : '');
  return 'FORK[' + v.kind + '] ' + Math.round(v.sinceMs / 1000) + 's  me=' + (v.coord || 'st' + v.state) + ' occ=' + v.occ + ' links=' + v.links
    + '  outside=' + v.orphans.map((o) => o.peer + '@' + Math.round(o.forMs / 1000) + 's').join(',')
    + (v.door ? '  door{' + v.door.action + ' list=' + v.door.listLen + ' open=' + v.door.open + ' founded=' + v.door.founded + ' adm=' + v.door.adm + '}' : '');
}

module.exports = { forkProbeInPage, makeForkWatch, forkLine };
