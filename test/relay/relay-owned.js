// The door rejects the dead star roles (one-runtime, docs/one-runtime.md).
// role=host and role=client formed the deleted app-session star; the relay is
// a greeter + door for mesh rooms and nothing else. Any straggler presenting
// a star role must be told so and cut (4010) — never silently served. The
// owned-app gate this file used to test lives on in the ROOM mint
// (e2e-owned-app.js) and the lane's owner signatures (e2e-app-owner.js).
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8795; // own port — no longer collides with fake-keyapi (battery ordering constraint gone)
let fail = 0; const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(sid, q, waitMs) {
  return new Promise((resolve) => {
    const params = new URLSearchParams(q);
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + sid + '?' + params.toString());
    const out = { msgs: [], closed: false, code: 0 };
    const to = setTimeout(() => { try { ws.close(); } catch (e) {} resolve(out); }, waitMs || 1500);
    ws.onmessage = (ev) => { try { out.msgs.push(JSON.parse(ev.data)); } catch (e) {} };
    ws.onclose = (ev) => { out.closed = true; out.code = ev.code; clearTimeout(to); resolve(out); };
    ws.onerror = () => {};
  });
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: Object.assign({}, process.env, { RELAY_PORT: String(PORT) }), stdio: 'ignore',
  });
  await sleep(900);

  const host = await probe('someroom', { role: 'host', token: 't' });
  check('role=host is REJECTED with the greeter message',
    host.msgs.some((m) => m.t === 'error' && /greeter/.test(m.error || '')), JSON.stringify(host.msgs[0] || null));
  const client = await probe('someroom', { role: 'client', token: 't' });
  check('role=client is REJECTED too', client.msgs.some((m) => m.t === 'error'));
  const dflt = await probe('someroom', {});
  check('a role-less socket (old default: client) is rejected', dflt.msgs.some((m) => m.t === 'error'));
  const mesh = await probe('meshroom', { role: 'mesh', token: 't', peer: 'p_probe1', dev: 'd_probe1' });
  check('role=mesh is SERVED (joined + greeters flow)', mesh.msgs.some((m) => m.t === 'joined'), JSON.stringify(mesh.msgs.map((m) => m.t)));

  relay.kill();
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
