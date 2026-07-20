// meet-seal.js — pins the cryptographic core of the greeter-registry design
// (healing-laws R2/R3/R6): the greeter list is sealed under K = derive(url, pw)
// — the URL secret AND the password — so a wrong password can't DECRYPT it (the
// R6 "wrong password" signal), while routing identity (sid/tok) stays
// password-free (url+pw must NOT become a different room). Uses Node 22's
// global webcrypto, the same subtle API gifos-net.js calls in the browser.
require('../../site/js/gifos-net.js');
const net = globalThis.GifOS.net;
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };

(async () => {
  const ROOM = 'testroom-abc', AV = '';
  const addr = { peer: 'c_1a2b3c4d', coord: { pc: 0, r: 2, i: 3 }, v: 1 }; // a greeter's sealed address

  // Keys: unlocked, locked with the right pw, locked with a wrong pw.
  const kOpen = await net.deriveMeetKey(ROOM, AV, '');
  const kPw = await net.deriveMeetKey(ROOM, AV, 'hunter2');
  const kWrong = await net.deriveMeetKey(ROOM, AV, 'nope');

  // A locked-room greeter blob = Seal(K(url,pw), address).
  const blob = await net.seal(kPw, addr);
  check('greeter blob is a sealed envelope', net.isSealed(blob));

  // Right password → opens (round-trips the address).
  const got = await net.open(kPw, blob);
  check('right password decrypts the address', got && got.peer === addr.peer && got.coord.pc === 0 && got.coord.i === 3, got);

  // R6: wrong password (or no password) → open returns null. This IS the
  // "can't decrypt ⇒ wrong password ⇒ prompt" observable — the relay never gates.
  check('NO password cannot decrypt a locked list (R6)', (await net.open(kOpen, blob)) === null);
  check('WRONG password cannot decrypt a locked list (R6)', (await net.open(kWrong, blob)) === null);

  // Unlocked room still round-trips under its own key.
  const blob2 = await net.seal(kOpen, addr);
  check('unlocked room seals+opens', (await net.open(kOpen, blob2)).peer === addr.peer);

  // Routing identity (sid/tok) is password-FREE: url+pw must NOT be a new room.
  const mOpen = await net.deriveMeet(ROOM, AV);
  const mPw = await net.deriveMeet(ROOM, AV, 'hunter2');
  check('sid is password-free (same room locked or not)', mOpen.sid === mPw.sid, [mOpen.sid, mPw.sid]);
  check('tok is password-free', mOpen.tok === mPw.tok);
  // ...but the KEY differs, so the lock is cryptographic (meet-security §LOCK / R6).
  const probe = await net.seal(mPw.key, addr);
  check('the E2E key DOES change with the password', (await net.open(mOpen.key, probe)) === null);

  // Genesis key (R3): high-entropy, distinct per mint, carries no room linkage.
  const g1 = net.mintGenesisKey(), g2 = net.mintGenesisKey();
  check('mintGenesisKey is 24 bytes hex', /^[0-9a-f]{48}$/.test(g1), g1);
  check('two mints differ', g1 !== g2);

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
