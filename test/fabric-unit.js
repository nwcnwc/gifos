/*
 * fabric-unit.js — unit tests for the sim's REAL transport fabric
 * (test/sim-fabric.js): the DS 'gifos-net-1' derivations, AES-256-GCM
 * sealed frames, Ed25519 signed orders, and the ported relay Session
 * semantics. Run: node test/fabric-unit.js
 */
'use strict';
const F = require('./sim-fabric.js');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else { fail++; console.log('  FAIL — ' + name); } };

// ---- derivations -------------------------------------------------------------
(() => {
  const a = F.deriveMeet('rustling-grove-42', '', '');
  const b = F.deriveMeet('rustling-grove-42', '', '');
  ok('deriveMeet is deterministic', a.sid === b.sid && a.tok === b.tok && a.key.equals(b.key));
  ok('sid is 20 hex chars for a plain room', /^[a-f0-9]{20}$/.test(a.sid));
  ok('token is 24 hex chars', /^[a-f0-9]{24}$/.test(a.tok));
  const c = F.deriveMeet('rustling-grove-42', 'ab12cd34ef56ab12cd34ef56', '');
  ok('admin verifier rides the sid tail after the last dot', c.sid.endsWith('.ab12cd34ef56ab12cd34ef56'));
  const locked = F.deriveMeet('rustling-grove-42', '', 'hunter2');
  ok('the DOOR LOCK IS CRYPTOGRAPHY: a password changes the E2E key…', !locked.key.equals(a.key));
  ok('…but never the routing identity (sid/token are password-free)', locked.sid === a.sid && locked.tok === a.tok);
  ok('pw proof is room-salted and never the password', F.meetPwProof('r1', '', 'pw') !== F.meetPwProof('r2', '', 'pw') && F.meetPwProof('r1', '', 'pw') !== 'pw');
})();

// ---- sealed frames -------------------------------------------------------------
(() => {
  const { key } = F.deriveMeet('sealed-room', '', '');
  const msg = { t: 'PHONE', coord: { path: '01', r: 3, i: 2 }, id: 'p00000042', kids: true };
  const env = F.seal(key, msg);
  ok('seal produces the {e:1, iv, ct} envelope shape', env.e === 1 && typeof env.iv === 'string' && typeof env.ct === 'string');
  ok('open round-trips the exact message', JSON.stringify(F.open(key, env)) === JSON.stringify(msg));
  const { key: other } = F.deriveMeet('other-room', '', '');
  ok('the wrong key opens NOTHING (silent null, no throw)', F.open(other, env) === null);
  const tampered = { e: 1, iv: env.iv, ct: Buffer.from(Buffer.from(env.ct, 'base64').map((b, i) => (i === 5 ? b ^ 1 : b))).toString('base64') };
  ok('a single flipped ciphertext bit is rejected (GCM tag)', F.open(key, tampered) === null);
  const pwKey = F.deriveMeetKey('sealed-room', '', 'secret');
  ok('without the password you cannot READ the locked room', F.open(pwKey, env) === null && F.open(key, F.seal(pwKey, msg)) === null);
})();

// ---- authority is a signature (§9) --------------------------------------------
(() => {
  const kp = F.edKeysFromSeedHex('a'.repeat(64));
  const kp2 = F.edKeysFromSeedHex('a'.repeat(64));
  ok('the admin keypair is deterministic from its seed', kp.pubB64 === kp2.pubB64 && kp.verifier === kp2.verifier);
  const order = JSON.stringify({ act: 'setpw', pw: 'newpw', ts: 1234567 });
  const sig = F.edSign(kp.priv, order);
  ok('a signed order verifies against the room verifier', F.edProven(kp.verifier, { pub: kp.pubB64, sig }, order));
  ok('a forged order does not', !F.edProven(kp.verifier, { pub: kp.pubB64, sig }, order.replace('newpw', 'evil')));
  const imposter = F.edKeysFromSeedHex('b'.repeat(64));
  ok('an imposter key fails the verifier commitment', !F.edProven(kp.verifier, { pub: imposter.pubB64, sig: F.edSign(imposter.priv, order) }, order));
})();

// ---- the relay: ported Session semantics ---------------------------------------
(() => {
  // a tiny tick world for the fabric
  let TICK = 0; const inbox = [];
  const fabric = F.makeFabric({
    tickRef: () => TICK,
    rnd: (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(),
    schedule: (d, fn) => inbox.push([TICK + d, fn]),
    wsFrame: (owner, sockId, m) => inbox.push([TICK + 1, () => (frames[owner] = frames[owner] || []).push(m)]),
    wsClosed: (owner, sockId, why) => inbox.push([TICK + 1, () => (closes[owner] = closes[owner] || []).push(why)]),
    dcFrame: () => {}, dcOpen: () => {}, dcClosed: () => {},
  });
  const frames = {}, closes = {};
  const run = (ticks) => { for (let e = 0; e < ticks; e++) { TICK++; for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i][0] <= TICK) { const [, fn] = inbox.splice(i, 1)[0]; fn(); } } };

  const { sid, tok } = F.deriveMeet('fabric-room', '', '');
  const sess = fabric.relay.session(sid);
  const a = sess.connect('A', { peer: 'pA', token: tok, pw: '' });
  run(5);
  ok('first arrival joins and re-establishes the token', !!a.sock && frames.A.some((m) => m.t === 'joined'));
  const bad = sess.connect('B', { peer: 'pB', token: 'wrong' });
  ok('a mismatched token is refused by the CURRENT OCCUPANTS (occupancy state, no storage)', !!bad.err);
  const b = sess.connect('B', { peer: 'pB', token: tok });
  run(5);
  ok('roster is authored by the relay: anonymous peer ids only', frames.B.some((m) => m.t === 'roster' && m.peers.includes('pA') && m.peers.includes('pB') && !JSON.stringify(m).includes('name')));
  sess.frame(b.sock.id, { t: 'peer', to: 'pA', msg: { e: 1, iv: 'x', ct: 'y' } });
  run(5);
  ok('{t:peer} routes a (sealed) frame to the named peer', frames.A.some((m) => m.t === 'peer' && m.from === 'pB' && m.msg && m.msg.e === 1));
  // frame-rate guard: hammer well past the burst → meter cuts the socket
  for (let k = 0; k < 700; k++) sess.frame(b.sock.id, { t: 'peer', to: 'pA', msg: { k } });
  run(5);
  ok('the frame meter warns then CUTS a hammering socket (3 strikes)', frames.B.some((m) => m.t === 'error'));
  // byte guard: one oversized frame is dropped outright
  const before = (frames.B || []).filter((m) => m.t === 'peer').length;
  sess.frame(a.sock.id, { t: 'peer', to: 'pB', msg: { blob: 'x'.repeat(1100 * 1024) } });
  run(5);
  ok('a frame over the burst budget never routes (relay is control-plane only)', (frames.B || []).filter((m) => m.t === 'peer').length === before);
})();

// ---- DCs: links as state --------------------------------------------------------
(() => {
  let TICK = 0; const inbox = []; const got = [];
  const fabric = F.makeFabric({
    tickRef: () => TICK,
    rnd: (() => { let s = 3; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(),
    schedule: (d, fn) => inbox.push([TICK + d, fn]),
    wsFrame: () => {}, wsClosed: () => {},
    dcFrame: (to, from, env) => got.push([to, from, env]),
    dcOpen: () => {}, dcClosed: () => {},
  });
  const run = (t) => { for (let e = 0; e < t; e++) { TICK++; for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i][0] <= TICK) { const [, fn] = inbox.splice(i, 1)[0]; fn(); } } };
  const { key } = F.deriveMeet('dc-room', '', '');
  ok('NO teleporting: send over an unestablished link is refused', fabric.dc.send('A', 'B', F.seal(key, { t: 'HELLO' })) === false);
  fabric.dc.establish('A', 'B');
  ok('a connecting link is still not a channel', fabric.dc.send('A', 'B', {}) === false);
  run(12);
  ok('after the connect delay the channel is open', fabric.dc.isOpen('A', 'B'));
  fabric.dc.send('A', 'B', F.seal(key, { t: 'HELLO', ck: '/0.0' }));
  run(5);
  ok('a sealed frame crosses and opens on the far side', got.length === 1 && F.open(key, got[0][2]).t === 'HELLO');
})();

console.log('fabric-unit: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
