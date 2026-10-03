// deep-door.js — a PLACE from below Section 1 must reach the joiner.
//
// A seat under Section 1 drops its relay socket 20 ticks after it sits.
// The joiner is unseated, so it has no DataChannel, and PLACE / NOROOM / HOME
// leave through that socket. sendRaw reopens the socket and queues the frame.
// The drop clock used to keep the seating tick, so the next mesh tick closed
// the new socket before the handshake and the queue died with it. The
// admitter kept the vouch. The joiner saw SITPING and never PLACE.
// Past a full Section 1, seating froze.
//
// The handshake here is held longer than one mesh tick. On a quiet box the
// real handshake beats that tick, and the bug hides. steadySocket queues
// while readyState is CONNECTING and flushes from onopen. A close before
// that open discards the queue.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh.js');
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = parseInt(process.env.DEEP_DOOR_PORT || '8827', 10);
const TICK_MS = 25;
const HOLD_MS = 80;
let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

// New sockets stay CONNECTING for HOLD_MS. Close before the timer cancels
// the handshake, which is what the mesh tick does when deepSince is stale.
function holdHandshakes() {
  const OrigWS = globalThis.WebSocket;
  function HeldWS(url, proto) {
    let real = null, timer = null, userOpen = null, userMsg = null, userClose = null, userErr = null;
    const self = {
      readyState: OrigWS.CONNECTING,
      binaryType: 'arraybuffer',
      send(data) { if (real && real.readyState === OrigWS.OPEN) real.send(data); },
      close() {
        if (timer) { clearTimeout(timer); timer = null; }
        self.readyState = OrigWS.CLOSED;
        if (real) real.close();
      },
      set onopen(fn) { userOpen = fn; },
      get onopen() { return userOpen; },
      set onmessage(fn) { userMsg = fn; if (real) real.onmessage = fn; },
      get onmessage() { return userMsg; },
      set onclose(fn) { userClose = fn; if (real) real.onclose = fn; },
      get onclose() { return userClose; },
      set onerror(fn) { userErr = fn; if (real) real.onerror = fn; },
      get onerror() { return userErr; },
    };
    timer = setTimeout(() => {
      timer = null;
      if (self.readyState === OrigWS.CLOSED) return;
      real = proto === undefined ? new OrigWS(url) : new OrigWS(url, proto);
      real.binaryType = self.binaryType;
      real.onmessage = (ev) => { if (userMsg) userMsg(ev); };
      real.onerror = () => { if (userErr) userErr(); };
      real.onclose = (ev) => { self.readyState = OrigWS.CLOSED; if (userClose) userClose(ev); };
      real.onopen = () => {
        if (self.readyState === OrigWS.CLOSED) { try { real.close(); } catch (e) {} return; }
        self.readyState = OrigWS.OPEN;
        if (userOpen) userOpen();
      };
    }, HOLD_MS);
    return self;
  }
  HeldWS.prototype = OrigWS.prototype;
  HeldWS.CONNECTING = OrigWS.CONNECTING;
  HeldWS.OPEN = OrigWS.OPEN;
  HeldWS.CLOSING = OrigWS.CLOSING;
  HeldWS.CLOSED = OrigWS.CLOSED;
  globalThis.WebSocket = HeldWS;
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: 'ignore',
  });
  await sleep(400);
  const ROOM = 'dd-' + Math.random().toString(36).slice(2, 8);
  const key = await net.deriveMeetKey(ROOM, '', '');
  const RELAY = 'ws://127.0.0.1:' + PORT;
  const bus = new Map();
  const sendDC = (to, m) => {
    const e = bus.get(to);
    if (e && !e.dead) {
      const c = JSON.parse(JSON.stringify(m));
      setTimeout(() => { if (!e.dead) e.node.recvCtl(c); }, 5);
    }
    return true;
  };
  const nodes = [];
  for (let i = 0; i < 2; i++) nodes.push(wire.createMeshNode({ relayUrl: RELAY, sid: ROOM, tok: 'T', key, tickMs: TICK_MS, sendDC }));
  await Promise.all(nodes.map((n) => n.whenReady));
  for (const n of nodes) bus.set(n.peer, { node: n, dead: false });
  let seated = false;
  for (let t = 0; t < 40; t++) {
    await sleep(250);
    if (nodes.every((n) => { const s = n.stats(); return s.state === 3 && s.coord; })) { seated = true; break; }
  }
  check('two seats are up before the deep admitter drops its socket', seated);
  const deep = nodes[1];
  const home = nodes[0].peer;
  deep.seat.take({ pc: 1, r: 0, i: 0 }, home, [{ k: '0_0_0', v: home }]);
  let dropped = false;
  for (let t = 0; t < 40; t++) {
    await sleep(100);
    if (!deep.relayUp() && deep.stats().coord && deep.stats().coord.pc !== 0) { dropped = true; break; }
  }
  check('the deep seat dropped its relay socket', dropped, { relayUp: deep.relayUp(), coord: deep.stats().coord });
  holdHandshakes();
  const joiner = wire.createMeshNode({ relayUrl: RELAY, sid: ROOM, tok: 'T', key, tickMs: TICK_MS, sendDC });
  await joiner.whenReady;
  bus.set(joiner.peer, { node: joiner, dead: false });
  let fromDeep = 0;
  const orig = joiner.seat.recv.bind(joiner.seat);
  joiner.seat.recv = (m) => {
    if (m.t === 'PLACE' && m.owner === deep.peer) fromDeep++;
    return orig(m);
  };
  for (let t = 0; t < 30 && !joiner.relayUp(); t++) await sleep(50);
  deep.seat.emit(joiner.peer, {
    t: 'PLACE', coord: { pc: 6, r: 0, i: 0 }, owner: deep.peer, nbrs: [], nc: joiner.peer,
  });
  for (let t = 0; t < 20 && fromDeep === 0; t++) await sleep(50);
  check('a PLACE emitted by the socketless deep seat reaches the joiner', fromDeep >= 1, { fromDeep, joinerUp: joiner.relayUp() });
  for (const n of nodes) n.stop();
  joiner.stop();
  relay.kill();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERR', e); process.exit(2); });
