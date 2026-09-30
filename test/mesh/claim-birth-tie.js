// claim-birth-tie.js — A CLAIM'S BIRTH CROSSES A LINK AS AN AGE (C5 + G0b).
//
// The S1SYNC tie-break lets a lower id win a simultaneous claim only if the
// claim was BORN within the last 600 ticks; an ancient claim is a ghost. The
// birth used to travel as the sender's absolute tick — and every browser
// counts ticks from its own page load. So:
//   - a ghost born long ago on a page whose tick runs AHEAD of mine read as
//     newborn, and won the tie;
//   - a genuine contender from a page that loaded after mine read as ancient
//     to any page older than 600 ticks (five minutes), and lost it.
// The sim and the harness share one clock, so no churn suite could see either.
// This one hands a Section-1 seat the two crafted entries directly.
//
// Pure Node. Usage: node test/mesh/claim-birth-tie.js
'use strict';
const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;
let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

H.seedRng(1);
const env = H.makeFabric(); env.DIGEST = true;
H.spawn(env, 30); H.runJoin(env, 30, 20000);
for (let t = 0; t < 900; t++) H.doTick(env);
const s1 = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord && s.coord.pc === 0);
const A = s1.find((s) => s.coord.r === 0 && s.coord.i === 0);   // the receiver
const B = s1.find((s) => s.coord.r === 0 && s.coord.i === 1);   // its rook peer, the carrier
const K = '0_2_3';                                               // a cell A holds by neither row nor column
const X = A.occ.get(K), curSeen = A.s1seen.get(K);
const rival = 'a' + String(X).slice(1);                          // sorts below X: the tie's winner, if the tie is allowed
check('the scene: a settled Section 1, a cell the receiver knows only by gossip', !!A && !!B && !!X && !A.firstHandLive(K) && A.TICK > 700, { tick: A.TICK });
const send = (ent) => A.recv({ t: 'S1SYNC', from: B.id, coord: B.coord, ent: [ent] });
const tie = { k: K, v: rival, age: A.TICK - 2 - curSeen, ch: null };

// 1. a GHOST: born 3000 ticks ago, carried by a page whose tick is 4000 ahead of mine
send(Object.assign({}, tie, { b: A.TICK + 4000 - 3000, ba: 3000 }));
check('an ancient claim never wins the tie, whatever the sender\'s clock reads', A.occ.get(K) === X, { holds: String(A.occ.get(K)).slice(0, 8) });
A.setOcc(K, X); A.s1seen.set(K, curSeen);

// 2. a genuine CONTENDER: born 10 ticks ago, on a page that loaded just before it claimed
send(Object.assign({}, tie, { b: 10, ba: 10 }));
check('a claim born ten ticks ago wins it, however young the sender\'s page', A.occ.get(K) === rival, { holds: String(A.occ.get(K)).slice(0, 8) });
const born = A.born.get(K);
check('…and its birth is kept on MY clock (ten ticks before now)', born === A.LT() - 10, { born, now: A.LT() });
A.setOcc(K, X); A.s1seen.set(K, curSeen);

// 3. a claim of UNKNOWN birth (an older client sends none) is allowed — the pre-C5 rule, the safe direction in a mixed room
send(Object.assign({}, tie, { b: 5 }));
check('an entry with no age is a claim of unknown birth: the tie is allowed', A.occ.get(K) === rival);

console.log(fails ? `\n${fails} FAIL` : '\nALL PASS');
process.exit(fails ? 1 : 0);
