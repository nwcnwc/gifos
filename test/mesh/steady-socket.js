// steadySocket reconnect policy — the client half of the relay-cost fix.
// Every reconnect is a BILLED wake on the relay, so the socket must:
//   1. STOP on policy rejections (replaced/banned/bad-token → close 4xxx/1008):
//      retrying the same credentials can never succeed — the old blind retry
//      is what turned a same-device double-tab into a 45k-connection night.
//   2. Respect the backoff timer even while the app keeps send()ing (the 4s
//      meeting heartbeat used to cancel the timer and reconnect at heartbeat
//      cadence against a down relay).
//   3. Still self-heal ordinary network drops (1006) with backoff.
// Dependency-free: node's own WebSocket client + hand-rolled upgrade servers.
global.crypto = require('crypto').webcrypto;
global.addEventListener = () => {};
require('../../site/js/gifos-net.js');
const net = globalThis.GifOS.net;
const http = require('http');
const nodeCrypto = require('crypto');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// Minimal WS server: complete the upgrade, then run `onSock(socket)`.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsServer(port, onSock) {
  const srv = http.createServer();
  srv.on('upgrade', (req, socket) => {
    const accept = nodeCrypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    onSock(socket);
  });
  srv.listen(port);
  return srv;
}
// A server-sent close frame with a code + reason.
function closeFrame(code, reason) {
  const r = Buffer.from(reason || '', 'utf8');
  const p = Buffer.alloc(2 + r.length);
  p.writeUInt16BE(code, 0); r.copy(p, 2);
  return Buffer.concat([Buffer.from([0x88, p.length]), p]);
}

// Count every construction attempt without disturbing behavior.
let attempts = 0;
const RealWS = global.WebSocket;
global.WebSocket = function (url) { attempts++; return new RealWS(url); };

(async () => {
  // ---- 1. a policy rejection (4000 'replaced' — the incident) stops the loop ----
  const evictor = wsServer(8797, (sock) => { sock.write(closeFrame(4000, 'replaced')); sock.end(); });
  attempts = 0;
  const s1 = net.steadySocket(() => 'ws://127.0.0.1:8797/s/x?role=mesh');
  await sleep(3500);
  check('an evicted socket stops knocking (1 attempt, not a war)', attempts === 1, attempts + ' attempts in 3.5s');
  check('the rejection code is surfaced to the app layer', s1.rejected === 4000, 'rejected=' + s1.rejected);
  // ...and an EXPLICIT app-layer kick (a deliberate re-join) re-arms it.
  s1.kick();
  await sleep(600);
  check('s.kick() re-arms a rejected socket on purpose', attempts >= 2, attempts + ' attempts after kick');
  s1.close(); evictor.close();

  // ---- 2. send() must not defeat the backoff against a dead relay ----
  attempts = 0;
  const s2 = net.steadySocket(() => 'ws://127.0.0.1:8798/s/x'); // nothing listens here
  const pump = setInterval(() => s2.send({ t: 'peer', to: 'x', msg: { hb: 1 } }), 100); // a 10Hz "heartbeat"
  await sleep(3500);
  clearInterval(pump);
  // Backoff (500ms·2^n, capped) allows ~5 attempts in 3.5s; the old send()-kick
  // behavior produced one attempt per send once the socket died (~30).
  check('a chatty app cannot turn backoff into a reconnect hammer', attempts <= 8, attempts + ' attempts under a 10Hz sender for 3.5s');
  s2.close();

  // ---- 3. ordinary network drops still self-heal ----
  const flaky = wsServer(8799, (sock) => setTimeout(() => { try { sock.destroy(); } catch (e) {} }, 50)); // abnormal close (1006)
  attempts = 0;
  const s3 = net.steadySocket(() => 'ws://127.0.0.1:8799/s/x');
  await sleep(3000);
  check('network drops (1006) keep retrying with backoff', attempts >= 2 && attempts <= 8 && !s3.rejected, attempts + ' attempts, rejected=' + (s3.rejected || 0));
  s3.close(); flaky.close();

  // ---- 4. a FULL door backs off: accept, then close 1013 (the relay's crowd reject) ----
  // The relay turns a crowd away AFTER the upgrade completes, so every rejected
  // attempt fires onopen first. Resetting the backoff on open kept a full door
  // retried every ~0.5s forever (a 1,000-joiner flood: 66k attempts in 3 min).
  // Backoff 500·2^n (1013 caps it at 15s) allows 4 attempts in 6s; the reset-on-
  // open behavior produced ~11.
  const full = wsServer(8800, (sock) => { sock.write(closeFrame(1013, 'too many joining right now — try again in a moment')); sock.end(); });
  attempts = 0;
  const s4 = net.steadySocket(() => 'ws://127.0.0.1:8800/s/x?role=mesh');
  await sleep(6000);
  check('a full door (accept, then 1013) is retried with GROWING backoff, not a hammer', attempts >= 2 && attempts <= 5, attempts + ' attempts in 6s');
  check('1013 is a crowd code, not a policy rejection — the socket keeps trying', !s4.rejected, 'rejected=' + (s4.rejected || 0));
  s4.close(); full.close();

  // ---- 5. …while a socket that STAYS open still earns a fast reconnect ----
  // Three crowd rejections grow the backoff; the fourth attempt is admitted and
  // held past the stability window, then drops (1006). The reconnect after that
  // drop must be quick again, not the 4s+ the rejections had grown it to.
  let served = 0, droppedAt = 0, backAt = 0;
  const door = wsServer(8801, (sock) => {
    served++;
    if (served <= 3) { sock.write(closeFrame(1013, 'this session is full')); sock.end(); return; }
    if (served === 4) { setTimeout(() => { droppedAt = Date.now(); try { sock.destroy(); } catch (e) {} }, 6000); return; }
    if (!backAt) backAt = Date.now();
  });
  const s5 = net.steadySocket(() => 'ws://127.0.0.1:8801/s/x?role=mesh');
  for (let t = 0; t < 40 && !backAt; t++) await sleep(500);
  const gap = backAt && droppedAt ? backAt - droppedAt : -1;
  check('a socket that stayed open resets the backoff (fast reconnect after a later drop)', gap >= 0 && gap < 1500, 'reconnect ' + gap + 'ms after the drop');
  s5.close(); door.close();

  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
