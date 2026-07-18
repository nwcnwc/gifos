// Admin ban surface — the RELAY side of §SIG (docs/meet-security.md): in a
// verifier room the ban list is the admin's, and the SIGNATURE is the entire
// authority. Pins:
//   * an UNSIGNED (forged) ban is ignored;
//   * a SIGNED ban cuts the device's live socket (4004) and the door refuses
//     its return;
//   * a SIGNED unban readmits it (the undo path);
//   * a SIGNED banlist re-seed (the admin re-arriving to a fresh DO) both
//     installs the list and CUTS any listed device already on a socket;
//   * a PLAIN room has no ban list at all — even a correctly signed ban is
//     ignored there (exclusion in plain rooms is only ever the vote majority).
// Runs against relay-local.js, which mirrors the Worker (relay/src/relay.js).
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const PORT = 8895;
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function occupant(sid, peer, dev) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + sid + '?role=mesh&peer=' + peer + '&token=t' + (dev ? '&dev=' + dev : ''));
  const o = { ws, frames: [], closed: null, joined: false, err: null };
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      o.frames.push(m);
      if (m.t === 'joined') o.joined = true;
      if (m.t === 'error') o.err = m.error;
    } catch (_) {}
  };
  ws.onclose = (e) => { o.closed = { code: e.code, reason: e.reason }; };
  ws.onerror = () => {};
  o.send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch (e) {} };
  o.close = () => { try { ws.close(); } catch (e) {} };
  return o;
}
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { if (fn()) return true; await sleep(50); } return fn(); };

(async () => {
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(400);
  try {
    // The admin keypair: V commits to the PUBLIC key (meet-security §SIG).
    const kp = crypto.generateKeyPairSync('ed25519');
    const pubB64 = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    const V = crypto.createHash('sha256').update(pubB64).digest('hex').slice(0, 24);
    const signed = (obj) => { const sp = JSON.stringify(Object.assign({ ts: Date.now() }, obj)); return { sp, sig: crypto.sign(null, Buffer.from(sp, 'utf8'), kp.privateKey).toString('base64'), pub: pubB64 }; };

    const sid = 'banroom-' + Math.random().toString(36).slice(2, 8) + '.' + V;
    const A = occupant(sid, 'pA', 'devA');
    const B = occupant(sid, 'pB', 'devB');
    await until(() => A.joined && B.joined);
    check('admin room up (verifier rides the sid)', A.joined && B.joined);

    // forged (unsigned) ban → ignored
    A.send({ t: 'ban', dev: 'devB' });
    await sleep(500);
    check('an UNSIGNED ban is ignored (no boot, no broadcast)',
      !B.closed && !A.frames.some((f) => f.t === 'ban'));

    // signed ban → the device's socket is cut and announced
    A.send({ t: 'ban', dev: 'devB', name: 'Ben', by: 'Ada', w: signed({ act: 'ban', dev: 'devB' }) });
    await until(() => !!B.closed, 4000);
    check('a SIGNED ban cuts the banned device\'s live socket (4004)', !!B.closed && B.closed.code === 4004);
    check('the ban is broadcast, attributed', A.frames.some((f) => f.t === 'ban' && f.dev === 'devB' && f.by === 'Ada'));

    // the door refuses the banned device
    const B2 = occupant(sid, 'pB2', 'devB');
    await until(() => B2.err !== null || B2.joined, 3000);
    check('the door refuses a banned device (banned, 4004)', /banned/.test(B2.err || '') && !B2.joined);

    // signed unban → readmitted (the undo path)
    A.send({ t: 'unban', dev: 'devB', name: 'Ben', by: 'Ada', w: signed({ act: 'unban', dev: 'devB' }) });
    await until(() => A.frames.some((f) => f.t === 'unban' && f.dev === 'devB'), 3000);
    const B3 = occupant(sid, 'pB3', 'devB');
    await until(() => B3.joined || B3.err !== null, 3000);
    check('after a SIGNED unban the device is admitted again', B3.joined && !B3.err);

    // signed banlist re-seed installs the list AND cuts the listed occupant
    A.send({ t: 'banlist', devs: [{ d: 'devB', n: 'Ben' }], w: signed({ act: 'banlist', devs: [{ d: 'devB', n: 'Ben' }] }) });
    await until(() => !!B3.closed, 4000);
    check('a SIGNED banlist re-seed cuts a listed device already on a socket', !!B3.closed && B3.closed.code === 4004);
    const B4 = occupant(sid, 'pB4', 'devB');
    await until(() => B4.err !== null || B4.joined, 3000);
    check('…and the re-seeded list gates the door', /banned/.test(B4.err || '') && !B4.joined);
    A.close();

    // a PLAIN room ignores even a correctly signed ban — no ban list exists
    const plain = 'plainroom-' + Math.random().toString(36).slice(2, 8);
    const P = occupant(plain, 'pP', 'devP');
    const Q = occupant(plain, 'pQ', 'devQ');
    await until(() => P.joined && Q.joined);
    P.send({ t: 'ban', dev: 'devQ', w: signed({ act: 'ban', dev: 'devQ' }) });
    await sleep(600);
    check('a PLAIN room has no ban list — even a signed ban is ignored', !Q.closed && !P.frames.some((f) => f.t === 'ban'));
    P.close(); Q.close();
  } finally { relay.kill(); }
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
