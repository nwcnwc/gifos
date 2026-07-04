/*
 * gifos relay — a stateless WebSocket message hub (Cloudflare Worker + Durable Object).
 *
 * One Durable Object instance per session id. It holds only live, in-memory
 * connection state for as long as peers are connected — it never persists app
 * data, GIFs, or DB contents. It just routes messages between the host browser
 * (which owns the database) and client browsers that joined the session.
 *
 * Routing protocol (all messages are JSON text frames):
 *   client → relay : { t:'rpc', ... }                → delivered to host as { t:'from', from:<peer>, msg:{...} }
 *   host   → relay : { t:'to',   to:<peer>, msg:{} }  → delivered to that one client as msg
 *   host   → relay : { t:'bcast', msg:{} }            → delivered to every client as msg
 *   relay  → host  : { t:'peer-join', peer }          when a client joins
 *   relay  → host  : { t:'peer-leave', peer }         when a client leaves
 *   relay  → client: { t:'joined', peer }             on successful join
 *   relay  → client: { t:'host-gone' }                if the host disconnects
 *   relay  → *     : { t:'error', error }             on rejection
 */

export class Session {
  constructor(state, env) {
    this.state = state;
    this.host = null;
    this.token = null;
    this.clients = new Map(); // peerId -> WebSocket
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

    if (role === 'host') {
      // Last host wins (supports snapshot failover: a new browser can take over the session id).
      this.host = server;
      this.token = token;
      server.addEventListener('message', (ev) => this.onHostMessage(ev));
      server.addEventListener('close', () => {
        if (this.host === server) { this.host = null; this.broadcast({ t: 'host-gone' }); }
      });
      server.send(JSON.stringify({ t: 'host-ready' }));
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
      server.addEventListener('message', (ev) => this.onClientMessage(peer, ev));
      server.addEventListener('close', () => {
        this.clients.delete(peer);
        if (this.host) this.host.send(JSON.stringify({ t: 'peer-leave', peer }));
      });
      server.send(JSON.stringify({ t: 'joined', peer }));
      this.host.send(JSON.stringify({ t: 'peer-join', peer }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  onHostMessage(ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'to') {
      const c = this.clients.get(m.to);
      if (c) c.send(JSON.stringify(m.msg));
    } else if (m.t === 'bcast') {
      this.broadcast(m.msg);
    }
  }

  onClientMessage(peer, ev) {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (this.host) this.host.send(JSON.stringify({ t: 'from', from: peer, msg: m }));
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const c of this.clients.values()) { try { c.send(s); } catch (e) { /* ignore */ } }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['s', '<sessionId>']
    // CORS/health for non-ws probes
    if (parts.length === 0) return new Response('gifos relay ok', { status: 200 });
    if (parts[0] === 's' && parts[1]) {
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
