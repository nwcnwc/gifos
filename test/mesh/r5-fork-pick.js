// r5-fork-pick.js — R5 / E5§2: multi-greeter HOME probe pauses for pick-one
// when greeters answer with TWO+ distinct genesis keys. Human (or test)
// chooses one; seat joins ONLY that meeting — never both, never a merge.
//
// Pure mesh.js (no browser). Usage: node test/mesh/r5-fork-pick.js
'use strict';
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
const mesh = globalThis.GifOS.mesh;

let fail = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) fail++;
};

const bus = new Map(); // peer -> seat
function mkEnv(onFork) {
  return {
    TICK: 0, HEALING: true, COMPACTION: false,
    send(from, to, m) {
      const t = bus.get(to);
      if (t) setTimeout(() => t.recv(JSON.parse(JSON.stringify(m))), 0);
    },
    knock() {}, wake() {},
    onFork: onFork || null,
  };
}

(async () => {
  // ---- A: two greeters, two genesis keys → onFork fires; chooseFork seats ----
  let forked = null;
  const envA = mkEnv((opts) => { forked = opts; });
  const joiner = new mesh.Seat('j_new', envA);
  bus.set(joiner.id, joiner);
  // Plant greeter A and B as "HOME" responders by intercepting WHOHOME:
  // simpler: drive the seat through GREETERS then inject HOME frames.
  joiner.join();
  joiner.recv({ t: 'GREETERS', list: ['g_a', 'g_b', 'g_c'] });
  check('multi-greeter starts fork probe', joiner.forkProbe === true && joiner.state === 1);
  // Three HOMEs: two share key KA, one has KB → two options.
  joiner.recv({ t: 'HOME', id: 'g_a', gkey: 'KA', roster: [{ k: 1, v: 'p_alice' }, { k: 2, v: 'p_bob' }] });
  joiner.recv({ t: 'HOME', id: 'g_b', gkey: 'KA', roster: [{ k: 1, v: 'p_alice' }, { k: 3, v: 'p_cara' }] });
  joiner.recv({ t: 'HOME', id: 'g_c', gkey: 'KB', roster: [{ k: 1, v: 'p_dan' }] });
  // Force settle (pending drained)
  joiner.forkPending = 0;
  joiner.maybeResolveFork();
  check('onFork fired with 2 options', forked && forked.length === 2, forked && forked.map((o) => o.gkey));
  check('seat is paused for pick-one', joiner.forkPaused === true && joiner.state === 1);
  check('not yet seated', joiner.state !== 3 && !joiner.hasCoord);

  const ok = joiner.chooseFork('KB');
  check('chooseFork(KB) accepted', ok === true);
  check('joined only KB (genKey)', joiner.genKey === 'KB');
  check('not paused after pick', joiner.forkPaused === false);
  // askSeat → state 2 searching
  check('entered admission (state search/ask)', joiner.state === 2 || joiner.state === 1, joiner.state);

  // ---- B: single genesis across greeters → no onFork, auto-accept ----
  let forkedB = null;
  const envB = mkEnv((opts) => { forkedB = opts; });
  const j2 = new mesh.Seat('j2', envB);
  bus.set(j2.id, j2);
  j2.join();
  j2.recv({ t: 'GREETERS', list: ['g1', 'g2'] });
  j2.recv({ t: 'HOME', id: 'g1', gkey: 'ONE', roster: [{ k: 1, v: 'p1' }, { k: 2, v: 'p2' }] });
  j2.recv({ t: 'HOME', id: 'g2', gkey: 'ONE', roster: [{ k: 1, v: 'p1' }, { k: 3, v: 'p3' }] });
  j2.forkPending = 0;
  j2.maybeResolveFork();
  check('single genesis: onFork NOT fired', forkedB === null);
  check('single genesis: auto-accepted ONE', j2.genKey === 'ONE' && j2.forkPaused === false);

  // ---- C: one greeter → classic path (no fork probe) ----
  const envC = mkEnv(() => { throw new Error('onFork should not fire'); });
  const j3 = new mesh.Seat('j3', envC);
  bus.set(j3.id, j3);
  j3.join();
  j3.recv({ t: 'GREETERS', list: ['only_g'] });
  check('single greeter: no fork probe', j3.forkProbe === false && j3.state === 1 && j3.gateway === 'only_g');

  // ---- D: no onFork callback + two keys → deterministic lowest gkey ----
  const envD = mkEnv(null);
  const j4 = new mesh.Seat('j4', envD);
  bus.set(j4.id, j4);
  j4.join();
  j4.recv({ t: 'GREETERS', list: ['ga', 'gb'] });
  j4.recv({ t: 'HOME', id: 'ga', gkey: 'ZZ', roster: [{ k: 1, v: 'pz' }] });
  j4.recv({ t: 'HOME', id: 'gb', gkey: 'AA', roster: [{ k: 1, v: 'pa' }] });
  j4.forkPending = 0;
  j4.maybeResolveFork();
  check('no UI: picks lowest gkey deterministically (AA < ZZ)', j4.genKey === 'AA' && !j4.forkPaused);

  console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS — R5 multi-greeter fork pick-one');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
