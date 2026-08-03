// requeue-pacing.js — the ENTRY-PACING INVARIANT: a paced-out (same-tick)
// join()/askSeat() defers the SEND, never the STATE.
//
// The wedge this guards (behavior 04a, 2026-08-03 gate, ray's forensics):
// requeue() clears hasCoord then calls join(); if join() already ran this
// TICK, its pacing guard used to return with the state STILL 3 — and tick()'s
// recovery branch (which consumes the deferred reJoin/reAsk) is gated on
// state !== 3, so the seat wedged forever: seated-looking, coordless, never
// knocking again. In production recv is EVENT-driven and the netDark hold
// freezes TICK, so a whole rescue→rejoin→requeue dance can share ONE tick at
// the radio-on edge — a 20s coverage blip left one phone solo for 3.5 minutes
// (relaySig frozen, state 3, coord null) until the NEXT blip re-fired the
// rescue at a fresh tick. The sim's bus tick-paces every round trip, so the
// C++ reference can't reach this ordering naturally; this suite drives it
// directly through mesh.js's real handlers.
//
// Pure mesh.js. Usage: node test/mesh/requeue-pacing.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;

let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) fail++;
};

function mkEnv() {
  const env = {
    TICK: 0, HEALING: true, COMPACTION: false,
    knocks: 0, sends: 0,
    knock() { env.knocks++; },
    send() { env.sends++; },
    wake() {},
  };
  return env;
}

// ---- A: the ray wedge — requeue()'s join() paced out at a frozen tick ------
// Genesis-seat at TICK 0, then (same frozen tick, exactly what the netDark
// hold produces) the lone-fragment rescue fires off a GREETERS reply and
// requeues. The requeue's join() collides with the genesis join's joinTick.
{
  const env = mkEnv();
  const s = new mesh.Seat('k_ray', env);
  s.join(); // knock #1 — joinTick = 0
  s.recv({ t: 'GREETERS', list: [] }); // R3: first in, mint genesis, take 0/0.0
  check('A: genesis seated (state 3, hasCoord)', s.state === 3 && s.hasCoord === true,
    { state: s.state, hasCoord: s.hasCoord });

  // Arm the split-off fragment self-rescue: long-isolated from every rook
  // neighbour while the pool lists another live greeter. take() stamped
  // rookSeenAt = TICK (= 0), so backdate it past the strand window.
  s.rookSeenAt = -(mesh.STRAND_TTL + 1);
  const knocksBefore = env.knocks;
  s.recv({ t: 'GREETERS', list: ['k_other'] }); // rescue → requeue() → join() PACED OUT (same tick)
  check('A: rescue requeued (seat vacated)', s.hasCoord === false, { hasCoord: s.hasCoord });

  // THE INVARIANT: a coordless seat must never read as seated. Pre-fix this
  // is exactly the wedge: state 3, hasCoord false, reJoin never consumable.
  check('A: paced-out rejoin leaves an HONEST state (state !== 3)', s.state !== 3,
    { state: s.state, reJoin: s.reJoin });

  // Liveness: the deferred knock actually fires once the tick clock moves.
  let ticks = 0;
  while (env.knocks === knocksBefore && ticks < 30) { env.TICK++; s.tick(); ticks++; }
  check('A: seat re-knocks within 30 ticks of the wedge window', env.knocks > knocksBefore,
    { knocks: env.knocks, before: knocksBefore, ticks });

  // Full recovery: the re-knock's empty pool re-mints genesis — seated again.
  s.recv({ t: 'GREETERS', list: [] });
  check('A: seat recovers to seated', s.state === 3 && s.hasCoord === true,
    { state: s.state, hasCoord: s.hasCoord });
}

// ---- B: the askSeat twin — reseatViaRoster()'s ask paced out ---------------
// Same invariant through the other vacate-and-rejoin path: an askSeat()
// earlier in the tick (askTick === TICK) paces out reseatViaRoster's re-ask.
{
  const env = mkEnv();
  const s = new mesh.Seat('k_rsv', env);
  s.join();
  s.recv({ t: 'GREETERS', list: [] });
  check('B: genesis seated', s.state === 3 && s.hasCoord === true);

  s.askTick = env.TICK; // an ask already fired this tick (event-driven recv)
  s.haveRoster = true; s.roster = [{ k: 1, v: 'k_peer' }];
  s.reseatViaRoster();
  check('B: reseat vacated the seat', s.hasCoord === false, { hasCoord: s.hasCoord });
  check('B: paced-out re-ask leaves an HONEST state (state !== 3)', s.state !== 3,
    { state: s.state, reAsk: s.reAsk, reJoin: s.reJoin });

  // Liveness: the deferred ask/knock fires once the tick clock moves.
  const traffic = () => env.knocks + env.sends;
  const before = traffic();
  let ticks = 0;
  while (traffic() === before && ticks < 30) { env.TICK++; s.tick(); ticks++; }
  check('B: seat re-enters (ask or knock) within 30 ticks', traffic() > before,
    { knocks: env.knocks, sends: env.sends, ticks });
}

console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS — entry pacing defers the send, never the state');
process.exit(fail ? 1 : 0);
