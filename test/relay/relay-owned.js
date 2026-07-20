// Owned-app host gate (protocol-level, no browser). An OWNED session id is
// "<room>.<verifier>"; only a host proving a secret whose SHA-256 begins with
// the verifier may hold the host slot. Guests can join but never take over.
// A dotless sid stays "anyone-owns" (self-healing, epoch-only). Runs against
// relay-local.js, which mirrors the Worker gate.
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const PORT = 8792;
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Connect a WS with the given role/params, resolve to the first message (or close).
function probe(sid, q, waitMs) {
  return new Promise((resolve) => {
    const params = new URLSearchParams(Object.assign({ role: 'host' }, q));
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + sid + '?' + params.toString());
    let out = { opened: false, err: null, closed: false };
    const done = () => { try { ws.close(); } catch (e) {} resolve(out); };
    const to = setTimeout(done, waitMs || 1200);
    ws.onopen = () => { out.opened = true; };
    ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.t === 'error') out.err = m.error; if (m.t === 'host-ready' || m.t === 'roster') out.hosted = true; } catch (_) {} };
    ws.onclose = () => { out.closed = true; clearTimeout(to); resolve(out); };
    ws.onerror = () => {};
  });
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(400);
  try {
    const secret = crypto.randomBytes(16).toString('hex');
    const verifier = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 24);
    const ownedSid = 'chess.' + verifier;

    const good = await probe(ownedSid, { adm: secret, epoch: '0', hostid: 'me' });
    check('owned host WITH the secret is accepted', !good.err);

    const wrong = await probe(ownedSid, { adm: 'deadbeef', epoch: '0', hostid: 'x' });
    check('owned host with a WRONG secret is rejected', /owned/.test(wrong.err || ''));

    const none = await probe(ownedSid, { epoch: '0', hostid: 'x' });
    check('owned host with NO secret is rejected', /owned/.test(none.err || ''));

    // takeover attempt: legit host up, attacker (link-holder, no secret) claims epoch+1
    const legit = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + ownedSid + '?role=host&adm=' + secret + '&epoch=0&hostid=me');
    await new Promise(r => { legit.onopen = r; setTimeout(r, 800); });
    await sleep(200);
    const attacker = await probe(ownedSid, { epoch: '1', hostid: 'evil' });
    check('a link-holder CANNOT take over an owned session (no secret)', /owned/.test(attacker.err || ''));

    // a guest CAN still join the owned session (token = verifier, no secret needed)
    const guest = await new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + ownedSid + '?role=client&token=' + verifier);
      let r = { joined: false, err: null };
      ws.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.t === 'joined') r.joined = true; if (m.t === 'error') r.err = m.error; } catch (_) {} };
      setTimeout(() => { try { ws.close(); } catch (e) {} resolve(r); }, 1000);
    });
    check('a guest can JOIN the owned session (no secret needed)', guest.joined && !guest.err);
    try { legit.close(); } catch (e) {}

    // a dotless (anyone-owns) sid needs no secret to host — self-healing preserved
    const openHost = await probe('plainroom', { epoch: '0', hostid: 'a' });
    check('a dotless (self-healing) sid hosts with no secret', !openHost.err);

    // Meeting admin (role=mesh) is now a SIGNATURE, not a socket property
    // (docs/meet-security.md §SIG; relay/src/relay.js — "no socket is 'an admin
    // socket'"). Joining role=mesh NEVER grants adminship: the `joined` frame
    // carries no admin flag. Adminship is instead proven per-order — the room's
    // verifier is SHA-256(admin PUBLIC KEY) carried in the sid, and a privileged
    // order (setpw, ban…) is honoured only when it bundles an Ed25519 proof
    // { sp, sig, pub } whose pub hashes to that verifier and whose signature over
    // the exact statement checks out. (The old model, where `?adm=<key>` made the
    // relay stamp admin:true on the joined frame, is RETIRED.) We pin the CURRENT
    // contract: no admin flag at the door; a correctly-signed setpw is honoured
    // (password broadcast to the room); an unsigned/forged one is rejected.
    const kp = crypto.generateKeyPairSync('ed25519');
    const pubB64 = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64');
    const mv = crypto.createHash('sha256').update(pubB64).digest('hex').slice(0, 24);
    const signOrder = (obj) => { const sp = JSON.stringify(obj); return { sp, sig: crypto.sign(null, Buffer.from(sp, 'utf8'), kp.privateKey).toString('base64'), pub: pubB64 }; };
    // Open a mesh socket on a fresh room (distinct prefix ⇒ isolated session
    // state), run fn(ws) once open, collect every frame, resolve the frames seen.
    const meshRun = (room, fn, waitMs) => new Promise((resolve) => {
      const params = new URLSearchParams({ role: 'mesh', peer: 'p' + Math.floor(Math.random() * 1e9), token: 't' });
      const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + room + '.' + mv + '?' + params.toString());
      const frames = [];
      ws.onmessage = (e) => { try { frames.push(JSON.parse(e.data)); } catch (_) {} };
      ws.onopen = () => { try { fn && fn(ws); } catch (_) {} };
      setTimeout(() => { try { ws.close(); } catch (e) {} resolve(frames); }, waitMs || 700);
    });

    const plain = await meshRun('lounge-a', null, 400);
    const joinedFrame = plain.find((f) => f.t === 'joined');
    check('meeting: joining role=mesh grants NO admin (joined frame has no admin flag)', !!joinedFrame && joinedFrame.admin === undefined);

    const okPw = 'sekret-' + crypto.randomBytes(3).toString('hex');
    const signed = await meshRun('lounge-b', (ws) => { ws.send(JSON.stringify({ t: 'setpw', pw: okPw, w: signOrder({ act: 'setpw', pw: okPw, ts: Date.now() }) })); });
    check('meeting: a correctly SIGNED setpw is honoured (pw broadcast, no error)',
      signed.some((f) => f.t === 'pw' && f.pw === okPw) && !signed.some((f) => f.t === 'error'));

    const forged = await meshRun('lounge-c', (ws) => { ws.send(JSON.stringify({ t: 'setpw', pw: 'rogue' })); });
    check('meeting: an UNSIGNED setpw is rejected (admins only, no pw broadcast)',
      forged.some((f) => f.t === 'error' && /admins only/.test(f.error || '')) && !forged.some((f) => f.t === 'pw'));
  } finally { relay.kill(); }
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
