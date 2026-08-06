// entry-resume.js — ENTRY RESUME: the dance RATCHETS across socket deaths.
//
// The incident (2026-08-04, on a plane; docs/seating-under-flap-2026-08-04.md):
// the join dance is three door round trips, and a retry used to restart from
// the KNOCK. A socket whose continuous up-windows were shorter than the whole
// dance therefore never seated — measured at a fixed 33% uptime, 100s windows
// seat in 5.5s and 1.5s windows never seat — while an already-established
// media pc kept streaming. Video without a seat, for hours.
//
// The fix: a retry that still HOLDS a registry-fresh greeter list re-enters at
// the WHOHOME step instead of re-knocking, so each up-window has to carry only
// ONE round trip. It shipped in BOTH twins (site/js/mesh.js `resumeAsk`,
// test/sim/mesh.cpp + mesh_seat.inc) — AND NOTHING IN THE GATE RAN IT.
// test/tools/seat-flap-repro.js measures it, but test/tools/ is not a
// release.sh tier, so a regression here would have been silent. That is the
// gap this file closes.
//
// WHAT IS PINNED — the mechanism AND every bound that keeps a stale list from
// trapping an entrant, because the bounds are the dangerous half: a resume
// that never concedes is a livelock at the front door, which is strictly
// worse than the slow knock it replaced.
//   A. a fresh list re-enters at WHOHOME, and does NOT knock
//   B. an EXPIRED list (> RELAY_TTL) concedes to a knock
//   C. an empty/self-only list concedes to a knock
//   D. the knockless budget is finite (a dead list concedes after 6)
//   E. a fresh KNOCK re-arms the budget
//   F. a fork probe / pick-one pause suspends resume entirely (R5 is untouched)
//   G. THE POINT: under a flapping door that drops every reply, the seat still
//      seats the moment ONE window carries one round trip — and the classic
//      knock path, given the same single window, does not.
//
// Pure mesh.js — no browser, no relay. Usage: node test/mesh/entry-resume.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;
const topo = globalThis.GifOS.net.topo;

let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) fail++;
};

// The greeter registry's own entry lifetime — the horizon a held list is
// trusted for. Read from the module so this suite cannot drift from the law.
const RELAY_TTL = 500;

function mkEnv() {
  const env = {
    TICK: 0, HEALING: true, COMPACTION: false,
    knocks: 0, sent: [],
    knock() { env.knocks++; },
    send(from, to, m) { env.sent.push({ to, m }); },   // mesh.js emits env.send(FROM, to, msg) — three args
    wake() {},
  };
  return env;
}
// A seeker holding a fresh greeter list: knocked once, got its GREETERS reply,
// and is now retrying with the list still in hand.
function seekerWithList(list, ageTicks) {
  const env = mkEnv();
  const s = new mesh.Seat('k_seeker', env);
  s.join();                       // the real knock — sets state 0, arms the budget
  env.knocks = 0; env.sent = [];  // measure only what the RETRY does
  s.lastGreeters = list.slice();
  s.greetersAt = env.TICK - (ageTicks || 0);
  return { env, s };
}
const whohomes = (env) => env.sent.filter((x) => x.m && x.m.t === 'WHOHOME');

// ---- A: a fresh list re-enters at WHOHOME, and does not knock -------------
{
  const { env, s } = seekerWithList(['k_door1', 'k_door2'], 10);
  const ok = s.resumeAsk();
  check('A: a registry-fresh list resumes (one round trip, not three)', ok === true, { ok });
  check('A: …by emitting WHOHOME to a door from the held list', whohomes(env).length === 1
    && ['k_door1', 'k_door2'].includes(whohomes(env)[0].to), env.sent.map((x) => x.to + ':' + x.m.t));
  check('A: …and it did NOT re-knock the relay', env.knocks === 0, { knocks: env.knocks });
  check('A: …and it is waiting at the WHOHOME step (state 1)', s.state === 1, { state: s.state });
}

// ---- B: an EXPIRED list concedes ------------------------------------------
// The registry only promises an entry for RELAY_TTL; past that we cannot know
// the doors are still doors, and guessing would aim the entrant at corpses.
{
  const { env, s } = seekerWithList(['k_door1'], RELAY_TTL + 1);
  check('B: a list older than RELAY_TTL refuses to resume', s.resumeAsk() === false);
  check('B: …emitting no WHOHOME', whohomes(env).length === 0);
  const fresh = seekerWithList(['k_door1'], RELAY_TTL - 1);
  check('B: …while a list one tick INSIDE the horizon still resumes (the bound is not off by one)',
    fresh.s.resumeAsk() === true);
}

// ---- C: nothing to resume TO ----------------------------------------------
{
  check('C: an empty greeter list concedes', seekerWithList([], 0).s.resumeAsk() === false);
  const selfOnly = seekerWithList(['k_seeker'], 0);
  check('C: a list naming only MYSELF concedes (never WHOHOME my own door)',
    selfOnly.s.resumeAsk() === false);
}

// ---- D: the knockless budget is finite ------------------------------------
// A genuinely dead list must concede to a fresh knock rather than cycle
// forever. Six consecutive resumes without a landed HOME, mirroring
// seatTries<=6 on the classic path.
{
  const { env, s } = seekerWithList(['k_dead'], 0);
  let resumes = 0;
  for (let i = 0; i < 20; i++) { if (!s.resumeAsk()) break; resumes++; }
  check('D: a dead list stops resuming after a bounded number of tries', resumes === 6,
    { resumes, whohomes: whohomes(env).length });
  check('D: …and the next retry concedes (so a knock can refresh the list)', s.resumeAsk() === false);
}

// ---- E: a fresh knock re-arms the budget ----------------------------------
// Without this, one exhausted budget would make every later retry a knock for
// the rest of the session — the fix would decay to the bug it replaced.
{
  const { env, s } = seekerWithList(['k_dead'], 0);
  while (s.resumeAsk()) { /* burn the budget */ }
  check('E: budget exhausted', s.resumeAsk() === false);
  // The tick MUST advance first: join() paces out a same-tick call and returns
  // early WITHOUT re-arming, so knocking at a frozen tick proves nothing (this
  // assertion passed vacuously until the pacing guard was accounted for).
  env.TICK += 1;   // `s.TICK` is a getter over env.TICK — advance the clock, not the seat
  s.join();                                  // a real knock
  check('E: …a fresh KNOCK re-arms the knockless budget (resumeTries back to 0)',
    s.resumeTries === 0, { resumeTries: s.resumeTries });
  s.lastGreeters = ['k_door1'];              // …and it brings a fresh list
  s.greetersAt = s.TICK;
  check('E: …so the seeker can resume again', s.resumeAsk() === true);
}

// ---- F: forks suspend resume ---------------------------------------------
// R5 (pick-one) decides between two rooms from FRESH GREETERS replies. A
// resume skips that reply, so it must never run while a fork is being probed
// or the user is being asked — otherwise entry could silently pick a side.
{
  const a = seekerWithList(['k_door1'], 0); a.s.forkProbe = true;
  check('F: a live fork PROBE suspends resume', a.s.resumeAsk() === false);
  const b = seekerWithList(['k_door1'], 0); b.s.forkPaused = true;
  check('F: a pick-one PAUSE suspends resume', b.s.resumeAsk() === false);
}

// ---- G: THE POINT — one up-window is enough -------------------------------
// The incident shape, driven end to end: a door that swallows every reply
// while the socket is down, then one window in which a single round trip
// completes. The seat must seat. The control is the same seat with no held
// list — it can only knock, and one window does not finish the dance.
{
  const { env, s } = seekerWithList(['k_door1'], 0);
  // Six dead windows: each retry spends one resume, nothing answers.
  for (let w = 0; w < 6; w++) { s.resumeAsk(); env.TICK += 30; }
  check('G: the seeker is still un-seated after six dead windows', s.hasCoord !== true);
  // The window that carries a round trip: the door answers HOME with a live
  // Section-1 roster, the seeker asks that seat, and is placed.
  s.recv({ t: 'HOME', roster: [{ k: topo.ckey({ pc: 0, r: 0, i: 0 }), v: 'k_host' }] });
  const asked = env.sent.filter((x) => x.m && x.m.t === 'FIND');
  check('G: …one answered window carries it straight to the seat ask (FIND)', asked.length >= 1,
    { asked: asked.length, state: s.state });
  // `s4ok` is the S4 identity verdict the wire layer stamps (verifyFill is
  // fail-closed with no bypass); mesh-wire owns minting it, so a pure-mesh
  // harness supplies the verdict the same way the harness suites do.
  s.recv({ t: 'PLACE', coord: { pc: 0, r: 0, i: 1 }, owner: 'k_host', nbrs: [], s4ok: true });
  check('G: …and the seat lands', s.hasCoord === true && s.state === 3,
    { hasCoord: s.hasCoord, state: s.state });

  // THE CONTROL: identical single window, but no held list — the classic path
  // has to start at the knock, so the window buys a knock and nothing more.
  const ctl = mkEnv();
  const c = new mesh.Seat('k_control', ctl);
  c.join(); ctl.sent = [];
  c.lastGreeters = []; c.greetersAt = undefined;
  check('G(control): with no held list the retry cannot resume', c.resumeAsk() === false);
  check('G(control): …so the same window ends with no seat', c.hasCoord !== true,
    { state: c.state, whohomes: whohomes(ctl).length });
}

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILED');
process.exit(fail === 0 ? 0 : 1);
