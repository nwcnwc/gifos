// Relay reconnect-secret test (no browser). The relay replaces a socket that
// holds the same peer id or device tag — a reload's right, a ghost tab's cure.
// But both ids are broadcast in every roster, so any link holder could connect
// AS anyone and have them cut with a fatal 4000. Now a socket that presented a
// reconnect secret (`rs`, mesh-wire.js: a per-device token hashed with the
// room) may only be replaced by a socket presenting the same one; a stranger
// naming the id is refused with 4011 and the occupant stays. A socket that
// presented none (an older client) is replaced as before.
//
// Runs against relay-local.js (which mirrors the Worker's join logic).
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8791;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function join(q) {
  const c = { msgs: [], closed: false, closeCode: null };
  c.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/room-rs?' + new URLSearchParams(Object.assign({ role: 'mesh' }, q)).toString());
  c.ws.onmessage = (e) => { try { c.msgs.push(JSON.parse(e.data)); } catch (_) {} };
  c.ws.onclose = (e) => { c.closed = true; c.closeCode = e.code; };
  c.ready = new Promise((res) => { c.ws.addEventListener('open', res); c.ws.addEventListener('close', res); });
  c.roster = () => c.msgs.filter((m) => m.t === 'roster').slice(-1)[0] || null;
  return c;
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  await sleep(400);

  try {
    // Ann is in, with her secret.
    const ann = join({ peer: 'p_ann', dev: 'devAnn', rs: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    await ann.ready; await sleep(150);
    check('Ann is connected', !ann.closed);

    // A stranger connects AS Ann's peer id, with a different secret.
    const imp = join({ peer: 'p_ann', dev: 'devX', rs: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
    await imp.ready; await sleep(300);
    check('the impostor naming Ann\'s peer id is refused with 4011', imp.closed && imp.closeCode === 4011, imp.closeCode);
    check('Ann keeps her socket', !ann.closed);

    // …and AS Ann's device tag.
    const imp2 = join({ peer: 'p_other', dev: 'devAnn', rs: 'cccccccccccccccccccccccc' });
    await imp2.ready; await sleep(300);
    check('the impostor naming Ann\'s device tag is refused with 4011', imp2.closed && imp2.closeCode === 4011, imp2.closeCode);
    check('Ann still keeps her socket', !ann.closed);

    // …and with NO secret at all.
    const imp3 = join({ peer: 'p_ann', dev: 'devY' });
    await imp3.ready; await sleep(300);
    check('an impostor presenting no secret is refused too', imp3.closed && imp3.closeCode === 4011, imp3.closeCode);
    check('Ann still keeps her socket (3)', !ann.closed);

    // Ann reloads: same secret → the old socket is replaced, the new one stays.
    const ann2 = join({ peer: 'p_ann', dev: 'devAnn', rs: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    await ann2.ready; await sleep(300);
    check('Ann\'s own reload (same secret) replaces her old socket', ann.closed && ann.closeCode === 4000, ann.closeCode);
    check('…and the new socket stays', !ann2.closed);

    // An older client that never presented a secret is replaceable as before.
    const legacy = join({ peer: 'p_old', dev: 'devOld' });
    await legacy.ready; await sleep(150);
    const legacy2 = join({ peer: 'p_old', dev: 'devOld', rs: 'dddddddddddddddddddddddd' });
    await legacy2.ready; await sleep(300);
    check('a socket that presented no secret is replaced by any same-id socket', legacy.closed && legacy.closeCode === 4000, legacy.closeCode);
    check('…and its replacement stays', !legacy2.closed);
    const r = legacy2.roster();
    check('the room holds Ann and the replacement only', !!r && r.peers.length === 2 && r.peers.includes('p_ann') && r.peers.includes('p_old'), r && r.peers);

    ann2.ws.close(); legacy2.ws.close();
    await sleep(100);
  } finally {
    relay.kill();
  }

  console.log(failures ? ('\n' + failures + ' check(s) failed') : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
