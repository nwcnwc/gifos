// door-peers.js — doorPeers (run.html, §FWD sponsor fallback) is bounded work.
//
// A greeter holds the relay's FULL socket list — in a join wave, every joiner
// in flight — and sponsorSend calls doorPeers on EVERY forwarded frame (each
// offer, answer and ICE candidate, each control beat) BEFORE the per-target
// throttle. The list is read only up to the fan (6 doors), yet the function
// scanned every socketed peer twice and deduplicated with Array.includes over
// the whole growing result: O(S²) per frame on the room's front door, which
// at a few thousand socketed joiners is millions of comparisons per frame on
// the exact seats a join storm already loads. This guard runs the real
// function out of run.html against 5,000 socketed peers and holds it to a
// bounded result and bounded time, with the documented door ORDER intact:
// (1) socketed claimants of the target, sorted; (2) structural neighbours;
// (3) gateway, greeters, then other socketed peers — and never myId or the
// target itself.
const fs = require('fs');
const path = require('path');
require('../../site/js/gifos-net.js');
const net = globalThis.GifOS.net;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

const run = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');
const a = run.indexOf('function doorPeers'), b = run.indexOf('function sponsorSend');
check('doorPeers and sponsorSend are found in run.html', a > 0 && b > a);
const src = run.slice(a, b);

// The reverse index (target -> peers that report a link to it) is what makes
// step (1) cheap; every write to connsOf must go through the one helper that
// keeps the index in step, or a claimant goes unseen.
const setSites = (run.match(/connsOf\.set\(/g) || []).length;
const delSites = (run.match(/connsOf\.delete\(/g) || []).length;
check('connsOf is written through one helper (setConns) and cleared through one (forgetConns)',
  /function setConns\(/.test(run) && /function forgetConns\(/.test(run) && setSites === 1 && delSites === 1, { setSites, delSites });

const S = 5000;
const relaySocketed = new Set();
const connsOf = new Map(), claimantsOf = new Map();
const ids = []; for (let i = 0; i < S; i++) ids.push('p' + i);
for (const id of ids) relaySocketed.add(id);
const myId = 'p2', to = 'p100';
// every socketed peer reports nine links; three of them (p4000, p3000, p2000) report the target
for (let i = 0; i < S; i++) {
  const conns = []; for (let j = 1; j <= 9; j++) { const c = 'p' + ((i * 7 + j * 131) % S); conns.push(c === to ? 'p101' : c); }
  if (i === 4000 || i === 3000 || i === 2000) conns.push(to);
  connsOf.set(ids[i], conns);
  for (const c of conns) { let set = claimantsOf.get(c); if (!set) claimantsOf.set(c, (set = new Set())); set.add(ids[i]); }
}
const seat = { gateway: 'p7', lastGreeters: ['p9', 'p8'], occGet: () => null };
const doorPeers = new Function('net', 'meshSeat', 'myId', 'relaySocketed', 'connsOf', 'claimantsOf', 'coordKeyOf', src + '\nreturn doorPeers;')(
  net, () => seat, myId, relaySocketed, connsOf, claimantsOf, () => null);

const out = doorPeers(to, null);
check('the result is bounded (at most 8 doors; sponsorSend fans to at most 6)', out.length <= 8 && out.length >= 6, { n: out.length });
check('claimants of the target come first, sorted', out[0] === 'p2000' && out[1] === 'p3000' && out[2] === 'p4000', out.slice(0, 4));
check('then the gateway and the greeter pool', out[3] === 'p7' && out[4] === 'p9' && out[5] === 'p8', out.slice(3, 6));
check('never myId or the target, no duplicates', !out.includes(myId) && !out.includes(to) && new Set(out).size === out.length);
const CALLS = 200;
const t0 = Date.now();
for (let i = 0; i < CALLS; i++) doorPeers(to, null);
const ms = Date.now() - t0;
check(CALLS + ' calls against ' + S + ' socketed peers finish inside 1s (O(S²) took seconds)', ms < 1000, { ms });

console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
process.exit(fails ? 1 : 0);
