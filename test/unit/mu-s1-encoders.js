// mu-s1-encoders.js — how many encoders a Section-1 seat keeps HOT.
//
// Two findings of the 3 Oct 2026 audit, both the ONE-PIPE law broken at the
// producer (docs/media-plane.md):
//   * A Section-1 stager flooded its own camera to all 8 row+column
//     neighbours, and every neighbour preferred the stager's own copy, so up
//     to 8 camera encoders ran hot on one device.
//   * A Section-1 head shipped its x1 and sdxc backup legs born ACTIVE, and
//     no receiver ever parked them: up to 8 idle encoders per head.
// This file lifts the real decisions out of site/run.html (prefCand, the
// STG-DIRECT and CHAIN-PARK helpers) and runs them on a modelled full
// Section 1 at C=5. RUN_HTML=<path> points it at another copy of run.html, to
// measure the code before the fix. No browser starts here.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.env.RUN_HTML || path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function slice(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + startMark.length);
  return a > 0 && b > a ? html.slice(a, b) : null;
}

const C = 5;
const pid = (r, i) => 'p' + r + i;
const coordOf = (p) => ({ r: +p[1], i: +p[2] });
const seats = [];
for (let r = 0; r < C; r++) for (let i = 0; i < C; i++) seats.push(pid(r, i));
const rowMates = (p) => { const c = coordOf(p); const out = []; for (let i = 0; i < C; i++) if (i !== c.i) out.push(pid(c.r, i)); return out; };
const colMates = (p) => { const c = coordOf(p); const out = []; for (let r = 0; r < C; r++) if (r !== c.r) out.push(pid(r, c.i)); return out; };
const s1peers = (p) => [...rowMates(p), ...colMates(p)];

// ---- A. the stager's own camera -------------------------------------------
{
  const stgSrc = slice('    // STG-DIRECT\n', '    // END-STG-DIRECT');
  check('STG-DIRECT helpers exist in run.html', !!stgSrc);
  const helpers = stgSrc
    ? new Function(stgSrc + '\nreturn { stgDirectSet, stgRank, stgOwnStandby };')()
    // the code before the fix: every neighbour is a direct receiver
    : { stgDirectSet: (rowPids, colPids) => new Set([...rowPids, ...colPids]), stgRank: null, stgOwnStandby: () => null };
  const prefSrc = slice('    function prefCand(rk, cand) {', '    function claimRedun(');
  check('prefCand lifts', !!prefSrc);
  const mosIn = new Map();
  const prefCand = new Function('meshCoord', 'mosIn', 'stgRank', 'net', 'occPid', prefSrc + '\nreturn prefCand;')(
    () => ({ pc: 0, r: 0, i: 0 }), { get: (k) => mosIn.get(k) }, helpers.stgRank, null, null);

  // Run the S1 flood + claim to a fixed point. held[p] = { from, h } is the
  // copy seat p holds as its primary; p re-floods it at h + 1 (stgHop).
  function settle(owner, dead) {
    const alive = (p) => !dead.has(p);
    const direct = helpers.stgDirectSet(rowMates(owner).filter(alive), colMates(owner).filter(alive), alive);
    const held = new Map();
    const rk = 'stg:' + owner;
    const candFor = (x) => {
      const cand = [];
      if (s1peers(owner).includes(x)) {
        const ann = direct.has(x) ? { h: 0 } : { h: 0, sb: 1 };
        cand.push({ from: owner, key: rk, sid: 'own>' + x, ann, live: true });
      }
      for (const y of s1peers(x)) {
        if (y === owner || !alive(y) || !held.has(y)) continue;
        cand.push({ from: y, key: rk, sid: 'rel:' + y + '>' + x, ann: { h: held.get(y).h + 1 }, live: true });
      }
      return cand;
    };
    let rounds = 0, moved = true;
    while (moved && rounds < 60) {
      moved = false; rounds++;
      for (const x of seats) {
        if (x === owner || !alive(x)) continue;
        const cand = candFor(x);
        const cur = held.get(x);
        mosIn.clear();
        if (cur) mosIn.set(rk, { via: cur.from, streamId: cur.sid });
        const pick = prefCand(rk, cand) || (cur && cand.find((c) => c.from === cur.from && c.sid === cur.sid)) || cand[0];
        if (!pick) continue;
        if (!cur || cur.from !== pick.from || cur.sid !== pick.sid) {
          held.set(x, { from: pick.from, sid: pick.sid, h: pick.ann.h });
          moved = true;
        }
      }
    }
    const hot = [...held.entries()].filter(([, v]) => v.from === owner).map(([k]) => k);
    const std = new Map();
    for (const x of s1peers(owner)) {
      if (!alive(x) || !held.has(x)) continue;
      const cur = held.get(x);
      std.set(x, helpers.stgOwnStandby(rk, candFor(x), { via: cur.from, streamId: cur.sid }));
    }
    return { held, hot, rounds, stable: !moved, direct, std };
  }

  for (const owner of [pid(0, 0), pid(2, 3)]) {
    const s = settle(owner, new Set());
    const announced = s1peers(owner).length; // the flood itself is unchanged: one announced copy per neighbour
    console.log(`  MEASURE stager ${owner}: announced copies ${announced} + down leg 1 (audio only), HOT camera encoders ${s.hot.length} [${s.hot.join(',')}], settled in ${s.rounds} rounds`);
    check(owner + ': the flood settles', s.stable, s.rounds);
    check(owner + ': every S1 seat holds the stager', seats.every((x) => x === owner || s.held.has(x)));
    check(owner + ': every neighbour still holds an announced copy (W7 flood kept)', announced === 8);
    check(owner + ': at most 2 hot camera encoders at the stager (was 8)', s.hot.length <= 2, s.hot);
    check(owner + ': the hot pair is one row-mate and one column-mate', s.hot.length === 2
      && s.hot.some((x) => rowMates(owner).includes(x)) && s.hot.some((x) => colMates(owner).includes(x)), s.hot);
    const relayed = s1peers(owner).filter((x) => !s.hot.includes(x));
    check(owner + ': every other neighbour rides a one-hop relay', relayed.every((x) => s.held.get(x).h === 1 && s.held.get(x).from !== owner), relayed.map((x) => [x, s.held.get(x)]));
    check(owner + ': each relayed neighbour keeps the stager\'s own copy as its parked standby',
      relayed.every((x) => s.std.get(x) && s.std.get(x).from === owner), relayed.map((x) => [x, s.std.get(x) && s.std.get(x).from]));

    // FAILOVER: a direct receiver dies. Its relay dependants wake their
    // standby (the stager's own copy, one replaceTrack) — the same one-hop
    // wake as before — and the room re-settles with a new direct receiver.
    const dRow = s.hot.find((x) => rowMates(owner).includes(x));
    const deps = relayed.filter((x) => s.held.get(x).from === dRow);
    check(owner + ': a direct receiver\'s dependants have a standby that does not pass through it',
      deps.length > 0 && deps.every((x) => s.std.get(x) && s.std.get(x).from === owner), deps);
    const s2 = settle(owner, new Set([dRow]));
    console.log(`  MEASURE stager ${owner} after ${dRow} dies: HOT camera encoders ${s2.hot.length} [${s2.hot.join(',')}]`);
    check(owner + ': after the death every live seat still holds the stager', seats.every((x) => x === owner || x === dRow || s2.held.has(x)));
    check(owner + ': after the death still at most 2 hot camera encoders', s2.hot.length <= 2, s2.hot);
  }

  // An old receiver (no sb support) or an old stager (no sb sent) behaves as
  // before: a direct receiver of an un-tagged copy prefers the stager.
  mosIn.clear();
  const own = { from: 'S', key: 'stg:S', sid: 'o', ann: { h: 0 }, live: true };
  const rel = { from: 'R', key: 'stg:S', sid: 'r', ann: { h: 1 }, live: true };
  check('an un-tagged direct copy still wins', prefCand('stg:S', [rel, own]) === own);
  if (helpers.stgRank) {
    const sbOwn = { from: 'S', key: 'stg:S', sid: 'o', ann: { h: 0, sb: 1 }, live: true };
    const far = { from: 'F', key: 'stg:S', sid: 'f', ann: { h: 2 }, live: true };
    check('an sb copy loses to a one-hop relay', prefCand('stg:S', [sbOwn, rel]) === rel);
    check('an sb copy beats a two-hop relay', prefCand('stg:S', [sbOwn, far]) === sbOwn);
  }
}

// ---- B. the head's x1 and sdxc backup legs ---------------------------------
{
  const chainSrc = slice('    // CHAIN-PARK\n', '    // END-CHAIN-PARK');
  check('CHAIN-PARK helpers exist in run.html', !!chainSrc);
  const sent = [];
  const mosIn = new Map();
  const api = chainSrc
    ? new Function('mosIn', 'demand', chainSrc + '\nreturn { chainBornParked, chainDemandUp };')(mosIn, (via, key, sid, want) => sent.push([via, key, sid, want]))
    // the code before the fix: only the sdnm mirror is born parked
    : { chainBornParked: (key) => key.indexOf('sdnm:') === 0, chainDemandUp: () => {} };

  // A full-S1 head (row 0, seat 0) at C=5: its jobs as the sweep ships them.
  const jobs = [];
  for (let q = 1; q < C; q++) jobs.push({ key: 'sdrow:0', to: pid(q, 0), upKey: null, watched: true }); // the 1-hop primaries, each a receiver's hot pipe
  for (let j = 1; j < C; j++) jobs.push({ key: 'x1', to: pid(0, j), upKey: null, watched: false });
  for (let i = 1; i < C; i++) jobs.push({ key: 'sdxc', to: 'carrier' + i, upKey: null, watched: false });
  for (let i = 1; i < C; i++) jobs.push({ key: 'sdnm:x' + i, to: 'm' + i, upKey: null, watched: false });
  // Steady state: a receiver demands its primary hot; a structural slot never
  // demands anything, so an unwatched job keeps the state it was born with.
  const hotIdle = jobs.filter((j) => !j.watched && !api.chainBornParked(j.key, j.upKey));
  const xs = jobs.filter((j) => j.key === 'x1' || j.key === 'sdxc');
  console.log(`  MEASURE S1 head: x1+sdxc backup encoders HOT at rest ${xs.filter((j) => !api.chainBornParked(j.key, j.upKey)).length} of ${xs.length}`);
  check('no idle backup encoder is hot at a head (was 8)', hotIdle.length === 0, hotIdle.map((j) => j.key + '>' + j.to));
  check('the relay hops of both chains are born parked',
    api.chainBornParked('x2', 'x1') && api.chainBornParked('sdrow:0', 'x2:0') && api.chainBornParked('sdx^x', 'sdxc:3'));
  check('a direct sdrow, sdx, sdn and stg ship are NOT born parked',
    !api.chainBornParked('sdrow:0', undefined) && !api.chainBornParked('sdx', undefined) && !api.chainBornParked('sdn', 'sdx') && !api.chainBornParked('stg:a', 'stg:a'));

  // FAILOVER: the receiving head wants its relayed sdrow copy. Each hop
  // passes the want to the hop it relays, so the x1 encoder wakes in one
  // cascade of DC frames (no sweep wait).
  mosIn.set('x2:0', { via: 'M', streamId: 's-x2' });
  mosIn.set('x1', { via: 'H', streamId: 's-x1' });
  mosIn.set('sdxc:3', { via: 'H', streamId: 's-xc' });
  mosIn.set('stg:a', { via: 'A', streamId: 's-a' });
  api.chainDemandUp({ key: 'sdrow:0', upKey: 'x2:0' }, true);
  api.chainDemandUp({ key: 'x2', upKey: 'x1' }, true);
  api.chainDemandUp({ key: 'sdx^x', upKey: 'sdxc:3' }, false);
  api.chainDemandUp({ key: 'stg:a', upKey: 'stg:a' }, true);
  api.chainDemandUp({ key: 'sdrow:1', upKey: undefined }, true);
  check('a want on the relayed sdrow is passed to the x2 hop', JSON.stringify(sent[0]) === JSON.stringify(['M', 'x2', 's-x2', true]), sent);
  check('a want on x2 is passed to the head\'s x1', JSON.stringify(sent[1]) === JSON.stringify(['H', 'x1', 's-x1', true]), sent);
  check('an idle on sdx^x is passed to the head\'s sdxc', JSON.stringify(sent[2]) === JSON.stringify(['H', 'sdxc', 's-xc', false]), sent);
  check('stg and direct ships pass nothing upstream (claimRedun owns those)', sent.length === 3, sent);
}

// ---- C. wiring --------------------------------------------------------------
check('the mx-want handler passes a wake upstream', /setJobActive\(m\.key \+ '>' \+ p\.id, true\); chainDemandUp\(jw, true\);/.test(html));
check('the mx-idle handler passes a park upstream', /setJobActive\(m\.key \+ '>' \+ p\.id, false\); chainDemandUp\(ji, false\);/.test(html));
check('a fresh ship asks chainBornParked', /if \(chainBornParked\(key, upKey\)\) \{ setJobActive\(jk, false\); renegotiate\(p\); \}/.test(html));
check('the mx receiver keeps the sb tag', /mosAnn\.set\(ak, \{[^\n]*sb: \(m\.sb === 1 \? 1 : undefined\)/.test(html));
check('the stager tags non-direct copies sb:1', /shipMos\(key, t, stream, \(direct && !direct\.has\(t\)\) \? hmSb : hm, key\)/.test(html));
check('the standby pick asks stgOwnStandby first', /\(stgOwnStandby\(rk, cand, pri\) \|\|/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
console.log(fail ? `${fail} FAILED` : 'ALL PASS');
process.exit(fail ? 1 : 0);
