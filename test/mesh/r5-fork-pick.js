// r5-fork-pick.js — R5 / E5§2 door pick-one.
//
// Real split-room case: ONE genesis key, greeters from two torn halves return
// disjoint S1 rosters — only the newcomer at the door sees both. Also covers
// multi-genesis (rare). Faces prefer Stage, else Stadium, else roster.
//
// Pure mesh.js. Usage: node test/mesh/r5-fork-pick.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;

let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) fail++;
};

const bus = new Map();
function mkEnv(onFork, homeFaces) {
  return {
    TICK: 0, HEALING: true, COMPACTION: false,
    send(from, to, m) {
      const t = bus.get(to);
      if (t) setTimeout(() => t.recv(JSON.parse(JSON.stringify(m))), 0);
    },
    knock() {}, wake() {},
    onFork: onFork || null,
    homeFaces: homeFaces || null,
  };
}

(async () => {
  // ---- A: same genesis, DISJOINT rosters → two options (the real tear) ----
  let forked = null;
  const envA = mkEnv((opts) => { forked = opts; });
  const jA = new mesh.Seat('jA', envA);
  bus.set(jA.id, jA);
  jA.join();
  jA.recv({ t: 'GREETERS', list: ['g_left', 'g_right'] });
  check('multi-greeter starts fork probe', jA.forkProbe === true && jA.state === 1);
  // Same gkey, no shared peers → two clusters
  jA.recv({
    t: 'HOME', id: 'g_left', gkey: 'SAME',
    roster: [{ k: 1, v: 'p_alice' }, { k: 2, v: 'p_bob' }],
    stage: ['p_alice'], stadium: ['p_alice', 'p_bob', 'p_cara'],
  });
  jA.recv({
    t: 'HOME', id: 'g_right', gkey: 'SAME',
    roster: [{ k: 1, v: 'p_dan' }, { k: 2, v: 'p_eve' }],
    stage: [], stadium: ['p_dan', 'p_eve'],
  });
  jA.forkPending = 0;
  jA.maybeResolveFork();
  check('same-key disjoint rosters → onFork with 2 options', forked && forked.length === 2, forked && forked.map((o) => o.gateway));
  check('left option prefers Stage faces', forked && forked.some((o) => o.tier === 'stage' && o.faces.includes('p_alice')));
  check('right option falls back to Stadium (empty stage)', forked && forked.some((o) => o.tier === 'stadium' && o.faces.includes('p_dan')));
  check('paused for pick-one', jA.forkPaused === true);

  const right = forked.find((o) => o.faces.includes('p_dan'));
  check('chooseFork by option id', jA.chooseFork(right.id) === true);
  check('joined right half only (gateway)', jA.gateway === 'g_right');
  check('same genesis key kept', jA.genKey === 'SAME');
  check('not paused after pick', jA.forkPaused === false);

  // ---- B: same genesis, OVERLAPPING rosters → one cluster, no pick ----
  let forkedB = null;
  const jB = new mesh.Seat('jB', mkEnv((o) => { forkedB = o; }));
  bus.set(jB.id, jB);
  jB.join();
  jB.recv({ t: 'GREETERS', list: ['g1', 'g2'] });
  jB.recv({ t: 'HOME', id: 'g1', gkey: 'ONE', roster: [{ k: 1, v: 'p1' }, { k: 2, v: 'p2' }], stage: ['p1'], stadium: ['p1', 'p2'] });
  jB.recv({ t: 'HOME', id: 'g2', gkey: 'ONE', roster: [{ k: 1, v: 'p1' }, { k: 3, v: 'p3' }], stage: ['p1'], stadium: ['p1', 'p3'] });
  jB.forkPending = 0;
  jB.maybeResolveFork();
  check('overlapping same-key: no onFork', forkedB === null);
  check('overlapping same-key: auto-join ONE', jB.genKey === 'ONE' && !jB.forkPaused);

  // ---- C: two genesis keys still pick-one ----
  let forkedC = null;
  const jC = new mesh.Seat('jC', mkEnv((o) => { forkedC = o; }));
  bus.set(jC.id, jC);
  jC.join();
  jC.recv({ t: 'GREETERS', list: ['ga', 'gb'] });
  jC.recv({ t: 'HOME', id: 'ga', gkey: 'KA', roster: [{ k: 1, v: 'pa' }], stage: ['pa'], stadium: ['pa'] });
  jC.recv({ t: 'HOME', id: 'gb', gkey: 'KB', roster: [{ k: 1, v: 'pb' }], stage: [], stadium: ['pb'] });
  jC.forkPending = 0;
  jC.maybeResolveFork();
  check('multi-genesis: onFork with 2', forkedC && forkedC.length === 2);

  // ---- D: single greeter classic path ----
  const jD = new mesh.Seat('jD', mkEnv(() => { throw new Error('no fork'); }));
  bus.set(jD.id, jD);
  jD.join();
  jD.recv({ t: 'GREETERS', list: ['only'] });
  check('single greeter: no fork probe', jD.forkProbe === false && jD.gateway === 'only');

  // ---- E: forkFaceList helper Stage > Stadium > roster ----
  const fl1 = mesh.Seat.forkFaceList({ stage: ['s1'], stadium: ['m1'], faces: ['r1'] });
  const fl2 = mesh.Seat.forkFaceList({ stage: [], stadium: ['m1'], faces: ['r1'] });
  const fl3 = mesh.Seat.forkFaceList({ stage: [], stadium: [], faces: ['r1'] });
  check('face list: Stage wins', fl1.tier === 'stage' && fl1.faces[0] === 's1');
  check('face list: Stadium when no Stage', fl2.tier === 'stadium' && fl2.faces[0] === 'm1');
  check('face list: roster last', fl3.tier === 'roster' && fl3.faces[0] === 'r1');

  // ---- F: DARK GREETERS must not hold the newcomer for the full ceiling ----
  // The probe fans WHOHOME to up to 5 greeters and waits for every HOME. A
  // greeter whose socket died silently (a NAT zombie the watchdog has not
  // dropped yet) never answers, so the probe used to idle to its 30-tick
  // ceiling (15 s at the production tick) before seating on the HOMEs it
  // already held. Now a short grace after the LAST HOME resolves it: the
  // honest greeters' answers arrive within a round trip of each other, and a
  // sample that is still missing after that is a dark door, not a slow one.
  // Clock-driven: env.TICK advances and the seat ticks, exactly as the fabric
  // drives it; no forkPending is poked.
  {
    const envF = mkEnv(() => { throw new Error('no fork'); });
    envF.sent = [];
    envF.send = (from, to, m) => { envF.sent.push({ at: envF.TICK, to, m }); };
    const jF = new mesh.Seat('jF', envF);
    const tickTo = (n) => { while (envF.TICK < n) { jF.tick(); envF.TICK++; } };
    jF.join();
    jF.recv({ t: 'GREETERS', list: ['g1', 'g2', 'g3'] });
    check('F: three greeters → probe fans WHOHOME to all three', jF.forkProbe === true && envF.sent.filter((x) => x.m.t === 'WHOHOME').length === 3);
    tickTo(2);
    const rosterF = [{ k: 1, v: 'p1' }, { k: 2, v: 'p2' }];
    jF.recv({ t: 'HOME', id: 'g1', gkey: 'ONE', roster: rosterF, stage: ['p1'], stadium: ['p1', 'p2'] });
    const firstHomeAt = envF.TICK;
    // g2 and g3 never answer. (Two samples already resolve at once; it is the
    // ONE-sample probe that used to sit at the ceiling.)
    let findAt = -1;
    for (let t = 0; t < 60 && findAt < 0; t++) { jF.tick(); const f = envF.sent.find((x) => x.m.t === 'FIND'); if (f) findAt = f.at; envF.TICK++; }
    check('F: with the other greeters dark, the seat-ask goes out within 10 ticks of the only HOME', findAt >= 0 && findAt - firstHomeAt <= 10, { findAt, firstHomeAt, wait: findAt - firstHomeAt });
    check('F: …to a roster seat from the one cluster (no pick-one)', findAt >= 0 && ['p1', 'p2'].includes(envF.sent.find((x) => x.m.t === 'FIND').to) && jF.forkPaused === false);
  }

  // ---- G: EVERY probed greeter dark → the retry fires the tick the probe gives up ----
  // No HOME at all means the probe concedes at its ceiling; it used to park
  // retryAt so that the state-1 retry waited a further 20 ticks (10 s) on top.
  {
    const envG = mkEnv(() => { throw new Error('no fork'); });
    envG.sent = []; envG.knocks = 0;
    envG.send = (from, to, m) => { envG.sent.push({ at: envG.TICK, to, m }); };
    envG.knock = () => { envG.knocks++; };
    const jG = new mesh.Seat('jG', envG);
    jG.join();
    jG.recv({ t: 'GREETERS', list: ['d1', 'd2', 'd3'] });
    envG.sent = []; envG.knocks = 0;
    let gaveUpAt = -1, retryAt = -1;
    for (let t = 0; t < 80 && retryAt < 0; t++) {
      jG.tick();
      if (gaveUpAt < 0 && !jG.forkProbe) gaveUpAt = envG.TICK;
      if (gaveUpAt >= 0 && (envG.knocks > 0 || envG.sent.some((x) => x.m.t === 'WHOHOME'))) retryAt = envG.TICK;
      envG.TICK++;
    }
    check('G: a probe with no HOME concedes at its ceiling (30 ticks)', gaveUpAt >= 0 && gaveUpAt <= 31, { gaveUpAt });
    check('G: …and the next WHOHOME or knock fires within 2 ticks of conceding', retryAt >= 0 && retryAt - gaveUpAt <= 2, { gaveUpAt, retryAt, wait: retryAt - gaveUpAt });
  }

  console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS — R5 same-key tear + Stage/Stadium faces');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
