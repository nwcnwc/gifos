// relay-worker.js — run the REAL Worker (relay/src/relay.js) in plain Node.
//
// relay-local.js is the protocol twin every suite drives; it cannot carry a
// defect that lives only in the Worker's own code (a ReferenceError on an
// early return, a close the platform never echoes). wrangler is not on every
// box, so this stubs the four platform objects the Durable Object touches —
// WebSocketPair, Response(101), the hibernation state, and the socket with its
// 2 KB attachment — and hands back a room whose Session is the production class.
// Nothing here models the network: a frame is a direct webSocketMessage call,
// a close is whatever the Worker itself does. A platform callback
// (webSocketClose) fires ONLY when a test calls room.clientClose(ws), so a
// suite can show what the object does without it.
import { Session } from '../../relay/src/relay.js';

const ATT_CAP = 2048; // the platform's serializeAttachment limit

export class FakeWs {
  constructor() { this.readyState = 1; this.sent = []; this.closed = null; this.att = null; this.attReads = 0; this.tags = []; }
  accept() {}
  send(s) { this.sent.push(typeof s === 'string' ? JSON.parse(s) : s); }
  close(code, reason) { if (this.closed) return; this.closed = { code, reason: String(reason || '') }; this.readyState = 2; }
  serializeAttachment(a) { const s = JSON.stringify(a); if (s.length > ATT_CAP) throw new Error('attachment too large'); this.att = s; }
  deserializeAttachment() { this.attReads++; return this.att ? JSON.parse(this.att) : null; }
  of(t) { return this.sent.filter((m) => m.t === t); }
}

// The globals the Worker reaches for. Node has crypto.subtle, atob, URL and
// TextEncoder; Response refuses status 101, so it is replaced for the module.
globalThis.WebSocketPair = class { constructor() { const c = new FakeWs(), s = new FakeWs(); c.pair = s; s.pair = c; this[0] = c; this[1] = s; } };
globalThis.Response = class { constructor(body, init) { this.body = body; this.status = (init && init.status) || 200; this.webSocket = init && init.webSocket; } };

export function makeRoom(env) {
  const state = {
    socks: [], aborted: null,
    acceptWebSocket(ws, tags) { ws.tags = tags || []; this.socks.push(ws); },
    getWebSockets() { return this.socks.slice(); },
    abort(reason) { this.aborted = reason; throw new Error('abort: ' + reason); },
    setWebSocketAutoResponse() {},
  };
  const session = new Session(state, env || {});
  const room = {
    state, session,
    // An upgrade. Returns { res, server, client, err } — `server` is the
    // socket the object holds (the one close codes land on), err the throw
    // out of fetch() if any.
    async connect(sid, q, ip) {
      const url = 'https://relay.test/s/' + sid + '?' + new URLSearchParams(q).toString();
      const headers = new Map([['Upgrade', 'websocket'], ['CF-Connecting-IP', ip || '203.0.113.' + ((state.socks.length % 200) + 1)]]);
      try {
        const res = await session.fetch({ url, headers });
        const client = res.webSocket, server = client && client.pair;
        return { res, client, server, err: null };
      } catch (err) { return { res: null, client: null, server: null, err }; }
    },
    async msg(ws, obj) { return session.webSocketMessage(ws, typeof obj === 'string' ? obj : JSON.stringify(obj)); },
    clientClose(ws, code, reason) { ws.readyState = 2; return session.webSocketClose(ws, code || 1000, reason || ''); },
    attReads() { return state.socks.reduce((n, ws) => n + ws.attReads, 0); },
  };
  return room;
}

// Freeze and move the Worker's clock: the grace windows are constants, and a
// suite that must outlive one cannot wait a minute per assertion.
export function fakeClock(start) {
  const real = Date.now;
  let now = start || real();
  Date.now = () => now;
  return { tick(ms) { now += ms; }, restore() { Date.now = real; }, get now() { return now; } };
}
