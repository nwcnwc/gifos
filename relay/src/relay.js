/*
 * gifos relay — a stateless WebSocket message hub (Cloudflare Worker + Durable Object).
 *
 * One Durable Object instance per session id. It holds only live, in-memory
 * connection state for as long as peers are connected — it never persists app
 * data, GIFs, or DB contents. It routes control messages between browsers.
 *
 * BANDWIDTH GUARD — the relay is for CONTROL traffic only (DB ops, WebRTC
 * signaling). It hard-caps message size and per-connection throughput so
 * nobody can tunnel audio/video through it. High-bandwidth apps (video/voice)
 * MUST go peer-to-peer over WebRTC media; if P2P can't be established, they get
 * nothing here. This is enforced on the relay, not trusted to the app.
 *
 * Routing protocol (all messages are JSON text frames):
 *   client → relay : { t:'rpc', ... }                → host as { t:'from', from:<peer>, msg:{...} }
 *   host   → relay : { t:'to',   to:<peer>, msg:{} }  → that one client as msg
 *   host   → relay : { t:'bcast', msg:{} }            → every client as msg
 *   any    → relay : { t:'peer', to:<peer>, msg:{} }  → routed peer↔peer (mesh signaling)
 *   relay  → host  : { t:'peer-join'|'peer-leave', peer }
 *   relay  → all   : { t:'roster', peers:[...] }      → current participant ids (for mesh)
 *   relay  → client: { t:'joined', peer } / { t:'host-gone' } / { t:'error', error }
 */

const MAX_MSG_BYTES = 64 * 1024;        // 64 KB — generous for SDP/DB, far below media rate
const RATE_BYTES_PER_SEC = 256 * 1024;  // sustained cap: streaming video is Mbps, so it can't fit

function makeMeter() { return { winStart: Date.now(), bytes: 0, warned: false }; }
// Returns true if this message must be DROPPED (too big, or over the rate budget).
function overBudget(meter, len) {
  const now = Date.now();
  if (now - meter.winStart >= 1000) { meter.winStart = now; meter.bytes = 0; meter.warned = false; }
  meter.bytes += len;
  return len > MAX_MSG_BYTES || meter.bytes > RATE_BYTES_PER_SEC;
}

export class Session {
  constructor(state, env) {
    this.state = state;
    this.host = null;
    this.token = null;
    this.clients = new Map(); // peerId -> WebSocket
    this.meters = new WeakMap();
    this.peerId = new WeakMap();
  }

  // Enforce the bandwidth guard. Returns true if the message is allowed.
  allow(socket, data) {
    const meter = this.meters.get(socket);
    if (!meter) return true;
    if (overBudget(meter, (data && data.length) || 0)) {
      if (!meter.warned) {
        meter.warned = true;
        try { socket.send(JSON.stringify({ t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' })); } catch (e) {}
      }
      return false;
    }
    return true;
  }

  roster() {
    const peers = Array.from(this.clients.keys());
    const s = JSON.stringify({ t: 'roster', peers });
    if (this.host) { try { this.host.send(s); } catch (e) {} }
    for (const c of this.clients.values()) { try { c.send(s); } catch (e) {} }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'client';
    const token = url.searchParams.get('token') || '';
    const peer = url.searchParams.get('peer') || 'c_' + crypto.randomUUID().slice(0, 8);

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.meters.set(server, makeMeter());

    if (role === 'host') {
      this.host = server;
      this.token = token;
      this.peerId.set(server, 'host');
      server.addEventListener('message', (ev) => this.onHostMessage(server, ev));
      server.addEventListener('close', () => {
        if (this.host === server) { this.host = null; this.broadcast({ t: 'host-gone' }); }
      });
      server.send(JSON.stringify({ t: 'host-ready' }));
      for (const p of this.clients.keys()) server.send(JSON.stringify({ t: 'peer-join', peer: p }));
      this.roster();
    } else {
      if (!this.host) {
        server.send(JSON.stringify({ t: 'error', error: 'no host for this session' }));
        server.close(1011, 'no host');
        return new Response(null, { status: 101, webSocket: client });
      }
      if (this.token && token !== this.token) {
        server.send(JSON.stringify({ t: 'error', error: 'bad join token' }));
        server.close(1008, 'bad token');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.clients.set(peer, server);
      this.peerId.set(server, peer);
      server.addEventListener('message', (ev) => this.onClientMessage(peer, server, ev));
      server.addEventListener('close', () => {
        this.clients.delete(peer);
        if (this.host) this.host.send(JSON.stringify({ t: 'peer-leave', peer }));
        this.roster();
      });
      server.send(JSON.stringify({ t: 'joined', peer }));
      this.host.send(JSON.stringify({ t: 'peer-join', peer }));
      this.roster();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  onHostMessage(socket, ev) {
    if (!this.allow(socket, ev.data)) return;
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'to') {
      const c = this.clients.get(m.to);
      if (c) c.send(JSON.stringify(m.msg));
    } else if (m.t === 'bcast') {
      this.broadcast(m.msg);
    } else if (m.t === 'peer') {
      this.routePeer('host', m);
    }
  }

  onClientMessage(peer, socket, ev) {
    if (!this.allow(socket, ev.data)) return;
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'peer') {
      this.routePeer(peer, m);               // mesh signaling: client → any peer
    } else if (this.host) {
      this.host.send(JSON.stringify({ t: 'from', from: peer, msg: m }));
    }
  }

  // Route a peer-addressed message to the named peer (or 'host'), tagged with sender.
  routePeer(from, m) {
    const wrapped = JSON.stringify({ t: 'peer', from, msg: m.msg });
    const dest = m.to === 'host' ? this.host : this.clients.get(m.to);
    if (dest) { try { dest.send(wrapped); } catch (e) {} }
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const c of this.clients.values()) { try { c.send(s); } catch (e) {} }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return new Response('gifos relay ok', { status: 200 });
    if (parts[0] === 's' && parts[1]) {
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
