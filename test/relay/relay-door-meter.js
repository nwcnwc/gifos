// relay-door-meter.js — A DOOR IS A SOCKET WITH A LIVE CLAIM, AND THE METER FOLLOWS THE CLAIM.
//
// A door (a registered greeter, or a founder inside its mint grace) is metered
// by bytes only and never cut: its traffic grows with the crowd at the door
// (relay/src/relay.js DOOR_BURST_BYTES). The door set used to be forever: a
// socket that FOUNDED a fresh room id and never registered kept the bytes-only
// meter and the never-cut rule for the socket's life — an unlimited tiny-frame
// loop (every frame a billed wake) from any client that opened a room of its
// own. Now the door right lapses with the claim (relay.js doorLive; mirrored
// in test/servers/relay-local.js allow()).
//
// What this pins, against relay-local.js under RELAY_PROD=1 (the meter is a
// production guard, off in dev mode) with the mint grace collapsed:
//   1. inside the mint grace a founder's burst draws no frame-rate warning;
//   2. past the grace, an unconverted founder is frame-metered like any
//      socket: a burst over FRAME_BURST draws the warning;
//   3. a live registered greeter's burst draws none.
// The Worker's own lines are pinned by relay-worker-contract.js leg 3.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8803;
const RELAY = 'ws://127.0.0.1:' + PORT;
const MINT = 800; // RELAY_MINT_GRACE_MS
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(sid, peer, gk) {
  const ws = new WebSocket(RELAY + '/s/' + sid + '?role=mesh&token=T&peer=' + peer + '&dev=' + peer + 'd' + (gk ? '&gk=' + gk : ''));
  ws.msgs = []; ws.closedCode = null;
  ws.ready = new Promise((res) => ws.addEventListener('open', () => res()));
  ws.addEventListener('message', (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } ws.msgs.push(m); });
  ws.addEventListener('close', (e) => { ws.closedCode = e.code; });
  ws.of = (t) => ws.msgs.filter((m) => m.t === t);
  ws.knock = (k, gblob) => ws.send(JSON.stringify({ t: 'knock', gk: k, gblob }));
  // 700 tiny frames at once: over FRAME_BURST (600) for a metered socket.
  ws.burst = () => { for (let i = 0; i < 700; i++) ws.send(JSON.stringify({ t: 'peer', to: 'nobody', msg: { i } })); };
  return ws;
}
const warned = (ws) => ws.of('error').some((m) => /control messages only/.test(m.error || ''));

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')],
    { env: { ...process.env, RELAY_PORT: String(PORT), RELAY_PROD: '1', TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1', RELAY_MINT_GRACE_MS: String(MINT) },
      stdio: ['ignore', 'ignore', 'pipe'] });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(700);

  const sid = 'door-' + Math.random().toString(36).slice(2, 8);
  const F = open(sid, 'F', 'genesis-key-F'); await F.ready; await sleep(150); // founds, never registers
  check('the first knocker founds', F.of('greeters')[0] && F.of('greeters')[0].founded === true, F.of('greeters')[0]);
  F.burst(); await sleep(500);
  check('inside the mint grace a founder is a door: a 700-frame burst draws no warning', !warned(F) && F.closedCode === null, F.of('error'));

  await sleep(MINT); // the mint lapsed unconverted
  F.burst(); await sleep(500);
  check('past the mint grace an unconverted founder is frame-metered: the burst draws the warning', warned(F), F.of('error').length);

  const sid2 = 'door-' + Math.random().toString(36).slice(2, 8);
  const G = open(sid2, 'G', 'genesis-key-G'); await G.ready; await sleep(150);
  G.knock('genesis-key-G', 'SEALED(g)'); await sleep(150);
  await sleep(MINT + 200); // well past a mint grace: the registration, not the mint, is what holds
  G.burst(); await sleep(500);
  check('a live registered greeter stays a door: no warning, not cut', !warned(G) && G.closedCode === null, G.of('error'));

  [F, G].forEach((w) => { try { w.close(); } catch (_) {} });
  await sleep(150);
  relay.kill();
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
