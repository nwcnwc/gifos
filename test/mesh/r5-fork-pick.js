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

  console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS — R5 same-key tear + Stage/Stadium faces');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
