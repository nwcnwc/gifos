// gossip-bridge.js — a frame whose author is the uplink still crosses that uplink.
//
// The initial gossip forward does not hand the frame back to m.src. The
// re-fan used to mark that author full as well (tx 2), same as the link that
// just delivered it. In a row the author is often the only way out, so the
// frame circulated inside the sender's neighbourhood and died there. The
// pre-signing control in status-plane.js section 9 is that case: a deep seat
// injects a line in a Section-1 seat's name. Signed, the line reaches
// nobody. Unsigned, it has to reach the room, which means the named author
// gets one re-fan copy and forwards it. An honest hop has from === src, so
// that copy is still suppressed and a link still sees at most two copies.
'use strict';

const _log = console.log; console.log = () => {};
const H = require('./mesh-harness.js');
console.log = _log;

let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };
const run = (env, n) => { for (let t = 0; t < n; t++) H.doTick(env); };

function forgeRoom(signed) {
  H.seedRng(20260929);
  const env = H.makeFabric();
  env.DIGEST = true;
  env.S4_GOSSIP = signed;
  const N = 120;
  H.spawn(env, N);
  H.runJoin(env, N, 20000);
  run(env, 200);
  const seated = [...env.seats.values()].filter((s) => s.alive && s.state === 3 && s.hasCoord);
  const bad = seated.find((s) => s.coord.pc !== 0);
  const victim = seated.find((s) => s !== bad && s.coord.pc === 0);
  const heard = new Set();
  for (const s of seated) s.onGossip = (src, m) => { if (m && m.forged && src === victim.id) heard.add(s.id); };
  const forged = { t: 'GSP', gid: victim.id + ':forged', src: victim.id, m: { forged: 1 } };
  if (signed) H.signGossip(bad.identity, forged);
  for (const p of bad.linkPeers()) bad.emit(p, Object.assign({}, forged));
  run(env, 48);
  return { heard: heard.size, seats: seated.length, deep: !!bad, home: !!victim };
}

const on = forgeRoom(true);
check('signed: a line in the uplink seat\'s name reaches nobody', on.deep && on.home && on.heard === 0, on);
const off = forgeRoom(false);
check('unsigned: that line crosses the uplink and reaches more than half the room', off.deep && off.home && off.heard > off.seats / 2, off);
process.exit(fails ? 1 : 0);
