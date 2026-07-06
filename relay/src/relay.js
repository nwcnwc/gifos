/*
 * gifos relay — a stateless WebSocket message hub (Cloudflare Worker + Durable Object).
 *
 * One Durable Object instance per session id. It holds only live connection
 * state — it never persists app data, GIFs, or DB contents. It routes control
 * messages between browsers.
 *
 * HIBERNATION — sockets are accepted through the WebSocket Hibernation API
 * (state.acceptWebSocket + webSocketMessage/webSocketClose handlers), so an
 * idle session or call room costs NOTHING while nobody is talking: the DO is
 * evicted from memory between messages and Cloudflare only bills actual
 * activity, not wall-clock call length. Everything a handler needs to know
 * about a socket (role, peer id, name, ip) rides in its serialized
 * attachment, which survives eviction; per-socket rate meters are in-memory
 * and simply start fresh after a wake.
 *
 * BANDWIDTH GUARD — the relay is for CONTROL traffic only (DB ops, WebRTC
 * signaling). It hard-caps message size and per-connection throughput so
 * nobody can tunnel audio/video through it. High-bandwidth apps (video/voice)
 * MUST go peer-to-peer over WebRTC; if P2P can't be established, they get
 * nothing here. This is enforced on the relay, not trusted to the app.
 *
 * ABUSE GUARDS — per-session socket cap, per-IP socket cap, per-IP join-rate
 * cap inside each session, and a best-effort per-IP upgrade limiter in the
 * outer Worker (per-isolate, catches hot loops at the edge PoP).
 *
 * Routing protocol (all messages are JSON text frames):
 *   client → relay : { t:'rpc', ... }                → host as { t:'from', from:<peer>, msg:{...} }
 *   host   → relay : { t:'to',   to:<peer>, msg:{} }  → that one client as msg
 *   host   → relay : { t:'bcast', msg:{} }            → every client as msg
 *   any    → relay : { t:'peer', to:<peer>, msg:{} }  → routed peer↔peer (mesh signaling)
 *   relay  → host  : { t:'peer-join'|'peer-leave', peer }
 *   relay  → all   : { t:'roster', peers:[...], names:{...} }
 *   relay  → client: { t:'joined', peer } / { t:'host-gone' } / { t:'error', error }
 *
 * Roles: 'host'/'client' form an app session (host's browser is the server);
 * 'mesh' forms a host-less ROOM (video calls) that lives at its URL forever —
 * with hibernation, an idle room literally costs nothing to keep alive.
 */

// Token bucket: a one-time BURST (delivering an App GIF) is fine, but SUSTAINED
// throughput is refilled far below any usable audio/video bitrate.
const BURST_BYTES = 1024 * 1024;        // 1 MB one-time burst (e.g. an App GIF)
const REFILL_BYTES_PER_SEC = 48 * 1024; // ~384 Kbps sustained — below even low-quality video

// Abuse guards (generous for humans, hostile to loops).
const MAX_SOCKETS_PER_SESSION = 64; // a "room" is a living room, not a stadium
const MAX_SOCKETS_PER_IP = 8;       // several devices behind one NAT are fine
const MAX_JOINS_PER_IP_MIN = 120;   // several flapping devices behind one NAT stay fine

function makeMeter() { return { tokens: BURST_BYTES, last: Date.now(), warned: false }; }
// Returns true if this message must be DROPPED (would overrun the budget).
function overBudget(meter, len) {
  const now = Date.now();
  meter.tokens = Math.min(BURST_BYTES, meter.tokens + ((now - meter.last) / 1000) * REFILL_BYTES_PER_SEC);
  meter.last = now;
  if (len > BURST_BYTES) return true;
  if (meter.tokens >= len) { meter.tokens -= len; meter.warned = false; return false; }
  return true;
}

export class Session {
  constructor(state, env) {
    this.state = state;
    this.meters = new Map();  // ws -> meter; in-memory, rebuilt after hibernation
    this.joinLog = new Map(); // ip -> [join timestamps]; best-effort, in-memory
  }

  // ---- socket bookkeeping (all derived from hibernation-surviving state) ----
  att(ws) { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } }
  open(ws) { return ws.readyState === 1; }
  all() { return this.state.getWebSockets().filter((ws) => this.open(ws)); }
  hostSock() { return this.state.getWebSockets('role:host').filter((ws) => this.open(ws))[0] || null; }
  members() { return this.all().filter((ws) => { const r = this.att(ws).role; return r === 'client' || r === 'mesh'; }); }
  peerSock(peer) { return this.members().find((ws) => this.att(ws).peer === peer) || null; }
  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {} }

  roster() {
    const peers = [], names = {};
    for (const ws of this.members()) {
      const a = this.att(ws);
      peers.push(a.peer);
      if (a.name) names[a.peer] = a.name;
    }
    const s = JSON.stringify({ t: 'roster', peers, names });
    const h = this.hostSock();
    if (h) this.send(h, s);
    for (const ws of this.members()) this.send(ws, s);
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.members()) this.send(ws, s);
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'client';
    const token = url.searchParams.get('token') || '';
    const peer = (url.searchParams.get('peer') || 'c_' + crypto.randomUUID().slice(0, 8)).slice(0, 64);
    const name = (url.searchParams.get('name') || '').slice(0, 40);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    // Reject without hibernating: accept plainly, explain, close.
    const reject = (error, code) => {
      server.accept();
      try { server.send(JSON.stringify({ t: 'error', error })); server.close(code, error.slice(0, 120)); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    };

    // ---- abuse guards ----
    const sockets = this.all();
    if (sockets.length >= MAX_SOCKETS_PER_SESSION) return reject('this session is full', 1013);
    let mine = 0;
    for (const ws of sockets) if (this.att(ws).ip === ip) mine++;
    if (mine >= MAX_SOCKETS_PER_IP) return reject('too many connections from your network', 1013);
    const now = Date.now();
    const log = (this.joinLog.get(ip) || []).filter((t) => now - t < 60000);
    log.push(now);
    this.joinLog.set(ip, log);
    if (log.length > MAX_JOINS_PER_IP_MIN) return reject('joining too fast — slow down', 1013);

    if (role === 'host') {
      await this.state.storage.put('token', token);
      // a new host replaces any previous host socket (Take Over / reconnect)
      for (const ws of this.state.getWebSockets('role:host')) { try { ws.close(4001, 'replaced by a new host'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:host', 'peer:host']);
      server.serializeAttachment({ role: 'host', peer: 'host', ip });
      this.send(server, { t: 'host-ready' });
      for (const ws of this.members()) this.send(server, { t: 'peer-join', peer: this.att(ws).peer });
      this.roster();
    } else if (role === 'mesh') {
      // Host-less ROOM: every participant is equal and the room lives at its
      // URL forever (the token persists in storage, so even a fully idle,
      // hibernated, or evicted room accepts the same link years later).
      let meshToken = await this.state.storage.get('meshToken');
      if (meshToken === undefined || meshToken === null) { meshToken = token; await this.state.storage.put('meshToken', token); }
      if (meshToken !== token) return reject('bad room token', 1008);
      // Optional room password: set by anyone INSIDE the room (see 'setpw'),
      // stored durably, demanded of every joiner while it's set.
      const roomPw = (await this.state.storage.get('pw')) || '';
      if (roomPw && (url.searchParams.get('pw') || '') !== roomPw) return reject('password required', 4003);
      for (const ws of this.members()) if (this.att(ws).peer === peer) { try { ws.close(4000, 'replaced'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:mesh', 'peer:' + peer]);
      server.serializeAttachment({ role: 'mesh', peer, name, ip });
      this.send(server, { t: 'joined', peer });
      this.roster();
    } else {
      const h = this.hostSock();
      if (!h) return reject('no host for this session', 1011);
      const tok = await this.state.storage.get('token');
      if (tok && token !== tok) return reject('bad join token', 1008);
      for (const ws of this.members()) if (this.att(ws).peer === peer) { try { ws.close(4000, 'replaced'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:client', 'peer:' + peer]);
      server.serializeAttachment({ role: 'client', peer, ip });
      this.send(server, { t: 'joined', peer });
      this.send(h, { t: 'peer-join', peer });
      this.roster();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- hibernation handlers (the DO may have been asleep between any two) ----
  webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    let meter = this.meters.get(ws);
    if (!meter) { meter = makeMeter(); this.meters.set(ws, meter); }
    if (overBudget(meter, data.length)) {
      if (!meter.warned) {
        meter.warned = true;
        this.send(ws, { t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' });
      }
      return;
    }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    const a = this.att(ws);
    if (a.role === 'host') {
      if (m.t === 'to') { const c = this.peerSock(m.to); if (c) this.send(c, m.msg); }
      else if (m.t === 'bcast') this.broadcast(m.msg);
      else if (m.t === 'peer') this.routePeer('host', m);
    } else if (a.role === 'mesh') {
      if (m.t === 'peer') this.routePeer(a.peer, m); // signaling only — no host to fall back to
      else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Only someone already IN the room can reach this — that's the
        // authorization. The new password propagates to every member so
        // their sessions keep working, and empty removes the lock.
        const pw = m.pw.slice(0, 64);
        if (pw) this.state.storage.put('pw', pw); else this.state.storage.delete('pw');
        this.broadcast({ t: 'pw', pw, by: (m.by || '').slice(0, 40) });
      }
    } else if (a.role === 'client') {
      if (m.t === 'peer') this.routePeer(a.peer, m);
      else { const h = this.hostSock(); if (h) this.send(h, { t: 'from', from: a.peer, msg: m }); }
    }
  }

  // Route a peer-addressed message to the named peer (or 'host'), tagged with sender.
  routePeer(from, m) {
    const dest = m.to === 'host' ? this.hostSock() : this.peerSock(m.to);
    if (dest) this.send(dest, { t: 'peer', from, msg: m.msg });
  }

  // With the Hibernation API the server must ECHO the close to complete the
  // handshake — otherwise the browser's socket hangs in CLOSING forever and
  // its onclose (and every reconnect built on it) never fires.
  webSocketClose(ws, code, reason) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, String(reason || '').slice(0, 120)); } catch (e) {}
    this.cleanup(ws);
  }
  webSocketError(ws) {
    try { ws.close(1011, 'error'); } catch (e) {}
    this.cleanup(ws);
  }
  cleanup(ws) {
    this.meters.delete(ws);
    const a = this.att(ws);
    if (!a.role) return;
    if (a.role === 'host') {
      // only a host with no replacement leaves the session headless
      if (!this.hostSock()) this.broadcast({ t: 'host-gone' });
      return;
    }
    // A reconnecting peer reuses its id; if a NEWER socket already replaced
    // this one, this stale close must not announce a departure.
    if (this.members().some((s) => s !== ws && this.att(s).peer === a.peer)) return;
    if (a.role === 'mesh') this.broadcast({ t: 'peer-leave', peer: a.peer });
    else { const h = this.hostSock(); if (h) this.send(h, { t: 'peer-leave', peer: a.peer }); }
    this.roster();
  }
}

// Best-effort per-IP upgrade limiter at the edge: per-isolate memory, so it's
// a burst damper (each PoP isolate counts separately), not a global ledger —
// the real per-session guards live in the Durable Object above.
const ipHits = new Map(); // ip -> [timestamps]
function edgeLimited(ip) {
  const now = Date.now();
  const log = (ipHits.get(ip) || []).filter((t) => now - t < 60000);
  log.push(now);
  ipHits.set(ip, log);
  if (ipHits.size > 10000) ipHits.clear(); // cap memory; it's best-effort anyway
  return log.length > 300;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return new Response('gifos relay ok', { status: 200 });
    if (parts[0] === 's' && parts[1]) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (edgeLimited(ip)) return new Response('rate limited', { status: 429 });
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
