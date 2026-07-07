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
 * about a socket (role, peer id, name, ip, token, room password) rides in
 * its serialized attachment, which survives eviction but DIES WITH THE
 * CONNECTION — the relay persists nothing, ever. A room's token and password
 * are therefore properties of its CURRENT OCCUPANTS: the first arrival to an
 * empty room re-establishes them from their own session, and everyone after
 * that must match the people already inside. Per-socket rate meters are
 * in-memory and simply start fresh after a wake.
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

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Token bucket: a one-time BURST (delivering an App GIF) is fine, but SUSTAINED
// throughput is refilled far below any usable audio/video bitrate.
const BURST_BYTES = 1024 * 1024;        // 1 MB one-time burst (e.g. an App GIF)
const REFILL_BYTES_PER_SEC = 48 * 1024; // ~384 Kbps sustained — below even low-quality video

// Abuse guards (generous for humans, hostile to loops).
const MAX_SOCKETS_PER_SESSION = 64; // a "room" is a living room, not a stadium
const MAX_SOCKETS_PER_IP = 8;       // several devices behind one NAT are fine
const MAX_JOINS_PER_IP_MIN = 120;   // several flapping devices behind one NAT stay fine

// Ban lists ride in socket attachments (2KB serialized cap), so the LIVE list
// is bounded; participants keep the unbounded copy in their own storage and
// re-merge it, so the working set here only needs to cover what matters now.
const BAN_CAP = 20;
const BAN_NAME = 12;
const cleanBanList = (list) => (Array.isArray(list) ? list : []).slice(0, BAN_CAP)
  .map((e) => ({ d: String((e && e.d) || '').slice(0, 16), n: String((e && e.n) || '').slice(0, BAN_NAME) }))
  .filter((e) => e.d);

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
    const peers = [], names = {}, admins = [], devs = {}, ips = {};
    let admV = null, ban = null, adult = null, mesh = false;
    for (const ws of this.members()) {
      const a = this.att(ws);
      peers.push(a.peer);
      if (a.name) names[a.peer] = a.name;
      if (a.role === 'mesh') mesh = true;
      if (a.adm) admins.push(a.peer);
      if (a.dev) devs[a.peer] = a.dev;
      if (a.ip) ips[a.peer] = a.ip;
      if (!admV && a.av) admV = a.av;
      if (ban === null && a.ban) ban = a.ban;
      if (!adult && (a.aw || a.aq)) adult = { q: a.aq || '' };
    }
    const h = this.hostSock();
    const msg = { t: 'roster', peers, names };
    if (h) msg.epoch = this.att(h).epoch || 0; // clients claim epoch+1 on takeover
    if (mesh) {
      // Rooms are not anonymous BY DESIGN: everyone on a call can see
      // everyone's network address (they exchange it for P2P anyway) — the
      // client shows it under the status pill as an accountability record.
      msg.devs = devs; msg.ban = ban || []; msg.ips = ips;
      if (adult) msg.adult = adult;
      if (admV) { msg.hasAdmin = true; msg.admins = admins; }
    }
    const s = JSON.stringify(msg);
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
    // Reject without hibernating: accept plainly, explain, close. `extra`
    // lets a rejection carry data the client needs to retry (e.g. the
    // adults-only challenge question).
    const reject = (error, code, extra) => {
      server.accept();
      try { server.send(JSON.stringify(Object.assign({ t: 'error', error }, extra || {}))); server.close(code, error.slice(0, 120)); } catch (e) {}
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
      // The host slot is guarded by an EPOCH so self-healing takeover can't
      // split-brain: every takeover claims epoch+1, and a returning host with
      // a stale epoch is bounced (it rejoins as a guest instead of clobbering
      // the newer state). Same-epoch claims from a DIFFERENT machine are
      // rejected too (first claim wins the race); the same machine (hostid)
      // reconnecting just replaces its own dead socket. The epoch lives only
      // in the host socket's attachment — an empty session accepts any claim,
      // exactly like mesh tokens/passwords. Nothing is stored.
      const epoch = Math.max(0, parseInt(url.searchParams.get('epoch') || '0', 10) || 0);
      const hostid = (url.searchParams.get('hostid') || '').slice(0, 64);
      const prev = this.hostSock();
      if (prev) {
        const cur = this.att(prev);
        const curEpoch = cur.epoch || 0;
        if (epoch < curEpoch) return reject('host-stale', 4008);
        if (epoch === curEpoch && hostid && cur.hostid && hostid !== cur.hostid) return reject('host-taken', 4009);
      }
      for (const ws of this.state.getWebSockets('role:host')) { try { ws.close(4001, 'replaced by a new host'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:host', 'peer:host']);
      server.serializeAttachment({ role: 'host', peer: 'host', ip, tok: token, epoch, hostid });
      this.send(server, { t: 'host-ready', epoch });
      for (const ws of this.members()) this.send(server, { t: 'peer-join', peer: this.att(ws).peer });
      this.roster();
    } else if (role === 'mesh') {
      // Host-less ROOM: every participant is equal and the room lives at its
      // URL forever. Its token and password are whatever the CURRENT
      // occupants carry in their attachments — the first person to arrive at
      // an empty room re-establishes both from their own session, and
      // everyone after them has to match. No storage anywhere.
      //
      // ADMIN rooms: the verifier V is part of the ROOM'S IDENTITY (the
      // /call/<room>/<V> link everyone shares — the session id is the
      // room+V composite, so /call/<room> is a DIFFERENT room that can
      // NEVER have an admin). Joining an admin room is structural consent
      // to be administered. Admin power = knowledge of the password: the
      // client derives K from it (PBKDF2, room-salted) and presents K;
      // this room admits it as admin iff SHA-256(K) === V. Nothing is
      // claimed, nothing rotates, nothing is stored — V lives in the URL
      // forever, like the room id itself. Admin sockets get privileged
      // actions (setpw, ban/unban) and their routed signals are stamped
      // adm:true so receivers can trust group moderation. The ban list
      // rides in occupants' attachments (device ids are client-persisted
      // random tokens — honest limitation: wiping site data mints a new
      // device).
      const occupants = this.members();
      const first = occupants[0] ? this.att(occupants[0]) : null;
      if (first && (first.tok || '') !== token) return reject('bad room token', 1008);
      const offeredPw = url.searchParams.get('pw') || '';
      const roomPw = first ? (first.pw || '') : offeredPw;
      if (first && roomPw && offeredPw !== roomPw) return reject('password required', 4003);
      const av = (url.searchParams.get('av') || '').slice(0, 64);
      const admK = (url.searchParams.get('adm') || '').slice(0, 128);
      const isAdmin = !!(av && admK && (await sha256hex(admK)) === av);
      const dev = (url.searchParams.get('dev') || '').slice(0, 16);
      // ADULTS-ONLY GATE (admin rooms only): the room can carry an 18+
      // warning and an optional challenge question. Occupancy memory, like
      // the password: current occupants' attachments hold {aw, aq, ah};
      // whoever has passed the gate (their answer hash IS the room's) can
      // re-seed it at an empty room. Admins are exempt from their own gate.
      const aw = first ? !!first.aw : !!(av && url.searchParams.get('aw') === '1');
      const aq = (first ? (first.aq || '') : (av ? (url.searchParams.get('aq') || '') : '')).slice(0, 140);
      const ah = (first ? (first.ah || '') : (av ? (url.searchParams.get('ah') || '') : '')).slice(0, 64);
      if ((aw || aq) && !isAdmin) {
        if (url.searchParams.get('ack') !== '1') return reject('adults-only', 4005, { q: aq });
        if (ah && (url.searchParams.get('aa') || '').slice(0, 64) !== ah) return reject('adults-only-answer', 4006, { q: aq });
      }
      const ban = first ? (first.ban || []) : [];
      if (!isAdmin && dev && ban.some((b) => b.d === dev)) return reject('banned', 4004);
      for (const ws of occupants) if (this.att(ws).peer === peer) { try { ws.close(4000, 'replaced'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:mesh', 'peer:' + peer]);
      server.serializeAttachment({ role: 'mesh', peer, name, ip, tok: token, pw: roomPw, av, adm: isAdmin, dev, ban, aw: aw ? 1 : 0, aq, ah });
      this.send(server, { t: 'joined', peer, admin: isAdmin });
      this.roster();
    } else {
      const h = this.hostSock();
      if (!h) return reject('no host for this session', 1011);
      const tok = this.att(h).tok || '';
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
      if (m.t === 'peer') this.routePeer(a.peer, m, a.adm); // signaling only — admin sends are stamped
      else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Only someone already IN the room can reach this — that's the
        // authorization (and in an admin room, only an admin). The new
        // password is written into every current occupant's attachment (the
        // room's only "memory") and propagated so their sessions keep
        // working; empty removes the lock.
        if (this.meshAdmV() && !a.adm) return this.send(ws, { t: 'error', error: 'admins only: this room\'s password is managed by its admin' });
        const pw = m.pw.slice(0, 64);
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.pw = pw;
          try { ws2.serializeAttachment(a2); } catch (e) {}
        }
        this.broadcast({ t: 'pw', pw, by: (m.by || '').slice(0, 40) });
      } else if ((m.t === 'ban' || m.t === 'unban') && a.adm && typeof m.dev === 'string') {
        if (m.t === 'ban') this.banDevice(m.dev, m.name, m.by);
        else this.unbanDevice(m.dev, m.name, m.by);
      } else if (m.t === 'votekick' && !this.meshAdmV() && typeof m.target === 'string') {
        // Vote-off-the-island: no admin exists to ban bad actors, so the ROOM
        // does it. Each voter's picks ride in their attachment; the relay
        // tallies distinct voters and, at half the occupants (min 2), bans and
        // kicks the device — same ban machinery, consensus-driven. Occupancy
        // memory only: an emptied room forgets the votes and the ban.
        const tgt = m.target.slice(0, 64);
        const votes = new Set(a.votes || []);
        if (m.on === false) votes.delete(tgt); else votes.add(tgt);
        a.votes = Array.from(votes).slice(0, 64);
        try { ws.serializeAttachment(a); } catch (e) {}
        this.tallyVotes();
      } else if (m.t === 'banlist' && Array.isArray(m.devs) && (a.adm || !this.meshAdmV())) {
        // Admin rooms: an admin re-arriving to a (possibly re-emptied) room
        // re-seeds the ban list from their own device. PLAIN rooms: ANYONE'S
        // remembered bans MERGE in, and the merged list only ever grows —
        // every participant carries the room's bans away with them, so a
        // vote-ban outlives the emptied room through the people who saw it.
        // A banned device that sneaks back while nobody remembers gets cut
        // the moment one witness returns.
        const incoming = cleanBanList(m.devs);
        let ban;
        if (a.adm) ban = incoming;
        else {
          const cur = a.ban || [];
          const seen = new Set(cur.map((b) => b.d));
          ban = cur.concat(incoming.filter((e) => !seen.has(e.d))).slice(0, BAN_CAP);
        }
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.ban = ban;
          try { ws2.serializeAttachment(a2); } catch (e) {}
        }
        // merged bans apply NOW: cut any present device on the list
        for (const b of ban) {
          if (this.members().some((s) => { const a2 = this.att(s); return a2.dev === b.d && !a2.adm; })) {
            this.banDevice(b.d, b.n, 'an earlier ban');
          }
        }
        this.roster();
      } else if (m.t === 'setadult' && a.adm) {
        // Admin switches the adults-only gate (with optional challenge
        // question) on or off — written into every occupant's attachment,
        // exactly like the room password.
        const on = !!m.on;
        const q = on ? String(m.q || '').slice(0, 140) : '';
        const ah = on ? String(m.ah || '').slice(0, 64) : '';
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.aw = on ? 1 : 0; a2.aq = q; a2.ah = ah;
          try { ws2.serializeAttachment(a2); } catch (e) {}
        }
        this.broadcast({ t: 'adult', on, q, by: String(m.by || '').slice(0, 40) });
        this.roster();
      }
    } else if (a.role === 'client') {
      if (m.t === 'peer') this.routePeer(a.peer, m);
      else { const h = this.hostSock(); if (h) this.send(h, { t: 'from', from: a.peer, msg: m }); }
    }
  }

  // Route a peer-addressed message to the named peer (or 'host'), tagged with
  // sender — and, in admin rooms, with a relay-verified admin stamp receivers
  // can trust (clients themselves can't prove adminship to each other).
  routePeer(from, m, adm) {
    const dest = m.to === 'host' ? this.hostSock() : this.peerSock(m.to);
    if (dest) this.send(dest, adm ? { t: 'peer', from, adm: true, msg: m.msg } : { t: 'peer', from, msg: m.msg });
  }

  // Is this an admin room? The verifier rides in every occupant's attachment
  // (it's part of the room identity they all connected with).
  meshAdmV() {
    for (const ws of this.members()) { const v = this.att(ws).av; if (v) return v; }
    return null;
  }

  // Ban a device: written into every occupant's attachment (occupancy memory),
  // announced, and any matching non-admin socket is cut. Shared by admin bans
  // and consensus vote-kicks.
  banDevice(dev, name, by) {
    dev = String(dev || '').slice(0, 16);
    if (!dev) return;
    const entry = { d: dev, n: String(name || '').slice(0, BAN_NAME) };
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2);
      const ban = (a2.ban || []).filter((b) => b.d !== dev);
      ban.push(entry); if (ban.length > BAN_CAP) ban.shift(); // attachments cap at 2KB — keep it tiny
      a2.ban = ban;
      try { ws2.serializeAttachment(a2); } catch (e) {}
    }
    this.broadcast({ t: 'ban', dev, name: entry.n, by: String(by || '').slice(0, 40) });
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2);
      if (a2.dev === dev && !a2.adm) { try { ws2.close(4004, 'banned'); } catch (e) {} }
    }
    this.roster();
  }
  unbanDevice(dev, name, by) {
    dev = String(dev || '').slice(0, 16);
    if (!dev) return;
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2); a2.ban = (a2.ban || []).filter((b) => b.d !== dev);
      try { ws2.serializeAttachment(a2); } catch (e) {}
    }
    this.broadcast({ t: 'unban', dev, name: String(name || '').slice(0, 24), by: String(by || '').slice(0, 40) });
    this.roster();
  }

  // Count distinct voters per target across occupants, broadcast progress, and
  // ban anyone at/over threshold (half the room, minimum 2). Called on each
  // vote AND when occupancy changes (a departure can push a target over).
  tallyVotes() {
    if (this.meshAdmV()) return; // admin rooms don't vote-kick
    const occ = this.members();
    const tally = {};
    for (const s of occ) for (const t of (this.att(s).votes || [])) tally[t] = (tally[t] || 0) + 1;
    const need = Math.max(2, Math.ceil(occ.length / 2));
    this.broadcast({ t: 'votes', tally, need });
    for (const tgt in tally) {
      if (tally[tgt] >= need) {
        const victim = occ.find((s) => this.att(s).peer === tgt);
        if (victim) this.banDevice(this.att(victim).dev, this.att(victim).name || '', 'the room (vote)');
      }
    }
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
    if (a.role === 'mesh') { this.broadcast({ t: 'peer-leave', peer: a.peer }); this.tallyVotes(); }
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

// Which sites may use this relay. A browser sets Origin itself and page JS
// CANNOT forge or override it, so this reliably shuts out random websites
// freeloading on the relay as a free message bus. It is NOT a defense against
// non-browser clients (curl can send any Origin) — the per-IP + bandwidth
// caps handle those. Configure via the ALLOWED_ORIGINS env var (comma-list of
// exact origins and/or "*.host" suffix patterns); the built-in default covers
// gifos.app and its subdomains. A request with NO Origin header (native apps,
// same-origin navigations, curl) is allowed through — Origin gates browsers,
// which is the whole point.
const DEFAULT_ORIGINS = 'https://gifos.app,*.gifos.app';
export function originAllowed(origin, env) {
  if (!origin) return true; // no Origin = not a cross-site browser request
  let host, hostname;
  try { const u = new URL(origin); host = u.host; hostname = u.hostname; } catch (e) { return false; }
  // Localhost is always the developer's OWN machine: a remote site's page
  // carries ITS origin, never localhost, so this can't be exploited to
  // freeload — it just keeps local dev and the test suite working.
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;
  const rules = String((env && env.ALLOWED_ORIGINS) || DEFAULT_ORIGINS)
    .split(',').map((s) => s.trim()).filter(Boolean);
  for (const rule of rules) {
    if (rule === '*') return true;
    if (rule.startsWith('*.')) { const suf = rule.slice(1); if (host === rule.slice(2) || host.endsWith(suf)) return true; }
    else { let rh; try { rh = new URL(rule).host; } catch (e) { rh = rule; } if (host === rh) return true; }
  }
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return new Response('gifos relay ok', { status: 200 });
    if (parts[0] === 's' && parts[1]) {
      if (!originAllowed(request.headers.get('Origin'), env)) {
        return new Response('forbidden origin', { status: 403 });
      }
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (edgeLimited(ip)) return new Response('rate limited', { status: 429 });
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
