/*
 * relay-local.js — A dependency-free stand-in for the Cloudflare relay Worker,
 * used only for local end-to-end testing. It speaks the exact same message
 * protocol as relay/src/relay.js so the browser client/host code is unchanged.
 */
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT, 10) : 8790;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---- minimal RFC6455 connection ----
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (chunk) => { this.buf = Buffer.concat([this.buf, chunk]); this.drain(); });
    socket.on('close', () => this.onclose && this.onclose());
    socket.on('error', () => {});
  }
  drain() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (this.buf.length < off + 4) return; mask = this.buf.slice(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (masked) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
      this.buf = this.buf.slice(off + len);
      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.frame(0xA, payload); continue; } // ping -> pong
      // Browsers fragment big messages at the WS layer (FIN=0 + continuation
      // frames). Buffer pieces until FIN — real WS stacks (and the Worker) do.
      if (opcode === 0x1 || opcode === 0x0) {
        this.parts = this.parts || [];
        this.parts.push(payload);
        if (fin) {
          const whole = this.parts.length === 1 ? this.parts[0] : Buffer.concat(this.parts);
          this.parts = [];
          if (this.onmessage) this.onmessage(whole.toString('utf8'));
        }
      }
    }
  }
  frame(opcode, data) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | opcode, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) {}
  }
  send(text) { this.frame(0x1, text); }
  close() { try { this.frame(0x8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} }
}

// A session id "<room>.<verifier>" carries its verifier after the LAST dot
// (hex, 16–64 chars). One derivation for BOTH the app host gate and the
// meeting admin check — mirrors the Worker's verifierOf.
function verifierOf(sid) {
  const dot = String(sid || '').lastIndexOf('.');
  if (dot <= 0) return '';
  const v = sid.slice(dot + 1);
  return /^[a-f0-9]{16,64}$/.test(v) ? v : '';
}

// ---- session hub (mirrors the Durable Object) ----
const sessions = new Map(); // id -> { host, token, meshToken, clients:Map, names:Map }
function getSession(id) { if (!sessions.has(id)) sessions.set(id, { host: null, token: null, meshToken: null, clients: new Map(), names: new Map() }); return sessions.get(id); }

const server = http.createServer((req, res) => { res.writeHead(200); res.end('gifos relay (local)'); });

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = new Conn(socket);

  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['s', id]
  if (parts[0] !== 's' || !parts[1]) { conn.send(JSON.stringify({ t: 'error', error: 'bad path' })); conn.close(); return; }
  const sess = getSession(parts[1]);
  const role = url.searchParams.get('role') || 'client';
  const token = url.searchParams.get('token') || '';
  const peer = url.searchParams.get('peer') || 'c_' + crypto.randomBytes(4).toString('hex');
  const ip = socket.remoteAddress || 'unknown';

  // Abuse guards — mirror the Worker's caps so tests exercise them.
  const rejectConn = (error) => { conn.send(JSON.stringify({ t: 'error', error })); conn.close(); };
  const allConns = () => (sess.host ? 1 : 0) + sess.clients.size;
  if (allConns() >= 64) { rejectConn('this session is full'); return; }
  let mine = 0;
  if (sess.host && sess.host.ip === ip) mine++;
  for (const c of sess.clients.values()) if (c.ip === ip) mine++;
  if (mine >= 8) { rejectConn('too many connections from your network'); return; }
  sess.joins = sess.joins || new Map();
  const nowJ = Date.now();
  const jlog = (sess.joins.get(ip) || []).filter((t) => nowJ - t < 60000);
  jlog.push(nowJ); sess.joins.set(ip, jlog);
  if (jlog.length > 120) { rejectConn('joining too fast — slow down'); return; }
  conn.ip = ip;

  // Bandwidth guard — token bucket, mirrors the Worker (media must go P2P).
  const BURST = 1024 * 1024, REFILL = 48 * 1024;
  const meter = { tokens: BURST, last: Date.now(), warned: false };
  const allow = (data) => {
    const now = Date.now();
    meter.tokens = Math.min(BURST, meter.tokens + ((now - meter.last) / 1000) * REFILL);
    meter.last = now;
    const len = Buffer.byteLength(data || '');
    if (len <= BURST && meter.tokens >= len) { meter.tokens -= len; meter.warned = false; return true; }
    if (!meter.warned) { meter.warned = true; conn.send(JSON.stringify({ t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' })); }
    return false;
  };
  const roster = () => {
    const names = {}; for (const [p, n] of sess.names) names[p] = n;
    const msg = { t: 'roster', peers: Array.from(sess.clients.keys()), names };
    if (sess.host) msg.epoch = sess.hostEpoch || 0; // clients claim epoch+1 on takeover
    if (sess.mesh) {
      msg.devs = {}; for (const [p, c] of sess.clients) if (c.dev) msg.devs[p] = c.dev;
      msg.ips = {}; for (const [p, c] of sess.clients) if (c.ip) msg.ips[p] = c.ip;
      if (sess.av) {
        msg.hasAdmin = true;
        msg.admins = Array.from(sess.clients.entries()).filter(([, c]) => c.isAdmin).map(([p]) => p);
        msg.ban = sess.ban || [];
      }
    }
    const s = JSON.stringify(msg);
    if (sess.host) sess.host.send(s);
    for (const c of sess.clients.values()) c.send(s);
  };
  const BAN_CAP = 20, BAN_NAME = 12;
  const cleanBanList = (list) => (Array.isArray(list) ? list : []).slice(0, BAN_CAP)
    .map((e) => ({ d: String((e && e.d) || '').slice(0, 16), n: String((e && e.n) || '').slice(0, BAN_NAME) }))
    .filter((e) => e.d);
  const banDevice = (dev, name, by) => {
    dev = String(dev || '').slice(0, 16); if (!dev) return;
    sess.ban = (sess.ban || []).filter((b) => b.d !== dev);
    sess.ban.push({ d: dev, n: String(name || '').slice(0, BAN_NAME) }); if (sess.ban.length > BAN_CAP) sess.ban.shift();
    const s = JSON.stringify({ t: 'ban', dev, name: String(name || '').slice(0, 24), by: String(by || '').slice(0, 40) });
    for (const c of sess.clients.values()) c.send(s);
    for (const c of sess.clients.values()) if (c.dev === dev && !c.isAdmin) { try { c.close(); } catch (e) {} }
    roster();
  };
  const cleanDevList = (list) => (Array.isArray(list) ? list : []).slice(0, 64)
    .map((d) => String(d || '').slice(0, 16)).filter(Boolean);
  const tallyVotes = () => {
    if (sess.av) return; // admin rooms don't vote-kick
    const occ = Array.from(sess.clients.values());
    const pop = new Set(), votersFor = {};
    for (const c of occ) {
      if (c.dev) pop.add(c.dev);
      for (const d of (c.votes || [])) {
        if (!d || d === c.dev) continue;
        (votersFor[d] = votersFor[d] || new Set()).add(c.dev || 'x');
      }
    }
    const tally = {};
    for (const d in votersFor) tally[d] = votersFor[d].size;
    const need = Math.max(2, Math.floor((pop.size || occ.length) / 2) + 1);
    const s = JSON.stringify({ t: 'votes', tally, need });
    for (const c of occ) c.send(s);
    for (const d in tally) {
      if (tally[d] >= need) {
        const b = JSON.stringify({ t: 'ban', dev: d, name: '', by: 'the room (vote)' });
        for (const c of sess.clients.values()) c.send(b);
        for (const c of Array.from(sess.clients.values())) if (c.dev === d) { try { c.close(); } catch (e) {} }
        roster();
      }
    }
  };
  const routePeer = (from, m, adm) => {
    const wrapped = JSON.stringify(adm ? { t: 'peer', from, adm: true, msg: m.msg } : { t: 'peer', from, msg: m.msg });
    const dest = m.to === 'host' ? sess.host : sess.clients.get(m.to);
    if (dest) dest.send(wrapped);
  };

  if (role === 'host') {
    // Owned-app gate (mirrors the Worker): a sid "<room>.<verifier>" gates the
    // host slot by a secret whose SHA-256 begins with the verifier — only the
    // creator (who holds the secret) may host; guests join but can't take over.
    const verifier = verifierOf(parts[1]);
    if (verifier) {
      const adm = url.searchParams.get('adm') || '';
      const proven = adm && crypto.createHash('sha256').update(adm).digest('hex').slice(0, verifier.length) === verifier;
      if (!proven) { rejectConn('this app link is owned — only its creator can host it'); return; }
    }
    // Epoch-guarded host slot (mirrors the Worker): a takeover claims epoch+1;
    // a stale returning host is bounced to rejoin as a guest; a same-epoch
    // claim from a different machine loses the race. Same hostid = reconnect.
    const epoch = Math.max(0, parseInt(url.searchParams.get('epoch') || '0', 10) || 0);
    const hostid = (url.searchParams.get('hostid') || '').slice(0, 64);
    if (sess.host) {
      const curEpoch = sess.hostEpoch || 0;
      if (epoch < curEpoch) { rejectConn('host-stale'); return; }
      if (epoch === curEpoch && hostid && sess.hostHostid && hostid !== sess.hostHostid) { rejectConn('host-taken'); return; }
      try { sess.host.close(); } catch (e) {}
    }
    sess.host = conn; sess.token = token; sess.hostEpoch = epoch; sess.hostHostid = hostid;
    conn.onmessage = (data) => {
      if (!allow(data)) return;
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'to') { const c = sess.clients.get(m.to); if (c) c.send(JSON.stringify(m.msg)); }
      else if (m.t === 'bcast') { for (const c of sess.clients.values()) c.send(JSON.stringify(m.msg)); }
      else if (m.t === 'peer') { routePeer('host', m); }
    };
    conn.onclose = () => { if (sess.host === conn) { sess.host = null; for (const c of sess.clients.values()) c.send(JSON.stringify({ t: 'host-gone' })); } };
    conn.send(JSON.stringify({ t: 'host-ready', epoch }));
    for (const p of sess.clients.keys()) conn.send(JSON.stringify({ t: 'peer-join', peer: p }));
    roster();
  } else if (role === 'mesh') {
    // Host-less ROOM (mirrors the Worker): equal participants, lives forever.
    // Token + password + ban list are occupancy state; the admin verifier is
    // part of the ROOM IDENTITY (the &av= every occupant's URL carries — a
    // room without it can never have an admin). Admin = presenting a key K
    // whose SHA-256 equals the room's verifier.
    const av = verifierOf(parts[1]); // verifier from the session id, not a query param
    const admK = (url.searchParams.get('adm') || '').slice(0, 128);
    const admOffer = admK ? crypto.createHash('sha256').update(admK).digest('hex') : null;
    if (sess.clients.size === 0) {
      sess.meshToken = token;
      sess.pw = (url.searchParams.get('pw') || '') || null;
      sess.av = av || null;
      sess.ban = [];
      sess.mesh = true;
    }
    if (sess.meshToken !== token) { conn.send(JSON.stringify({ t: 'error', error: 'bad room token' })); conn.close(); return; }
    if (sess.pw && (url.searchParams.get('pw') || '') !== sess.pw) { rejectConn('password required'); return; }
    const isAdmin = !!(sess.av && admOffer && admOffer.slice(0, sess.av.length) === sess.av); // V is 24-hex now; prefix-compare also fits legacy 64
    const dev = (url.searchParams.get('dev') || '').slice(0, 16);
    if (!isAdmin && dev && (sess.ban || []).some((b) => b.d === dev)) { rejectConn('banned'); return; }
    // Standing-votes gate (plain rooms): a majority of the devices already
    // here (min 2, counting the arriver) with this device on their personal
    // vote-off list keeps the door shut.
    if (!sess.av && dev) {
      const voters = new Set(), pop = new Set([dev]);
      for (const c of sess.clients.values()) {
        if (c.dev) pop.add(c.dev);
        if ((c.votes || []).includes(dev)) voters.add(c.dev || 'x');
      }
      if (voters.size >= Math.max(2, Math.floor(pop.size / 2) + 1)) { rejectConn('voted-off'); return; }
    }
    conn.isAdmin = isAdmin; conn.dev = dev;
    // Parity with the Worker: one socket per peer id AND one slot per DEVICE. A
    // reload reuses its peer id and swaps silently; a NEW tab/session from the
    // same device gets a fresh peer id but the same device id — evict its ghost
    // and announce the departure so everyone drops the stale tile.
    for (const [p, c] of Array.from(sess.clients)) {
      if (p === peer || (dev && c.dev === dev)) {
        sess.clients.delete(p); sess.names.delete(p);
        try { c.close(); } catch (e) {}
        if (p !== peer) { const s = JSON.stringify({ t: 'peer-leave', peer: p }); for (const cc of sess.clients.values()) cc.send(s); }
      }
    }
    const name = (url.searchParams.get('name') || '').slice(0, 40);
    if (name) sess.names.set(peer, name);
    sess.clients.set(peer, conn);
    conn.onmessage = (data) => {
      if (!allow(data)) return;
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'peer') routePeer(peer, m, conn.isAdmin);
      else if (m.t === 'setpw' && typeof m.pw === 'string') {
        if (sess.av && !conn.isAdmin) { conn.send(JSON.stringify({ t: 'error', error: 'admins only: this room\'s password is managed by its admin' })); return; }
        sess.pw = m.pw.slice(0, 64) || null;
        const s = JSON.stringify({ t: 'pw', pw: sess.pw || '', by: (m.by || '').slice(0, 40) });
        for (const c of sess.clients.values()) c.send(s);
      } else if ((m.t === 'ban' || m.t === 'unban') && conn.isAdmin && typeof m.dev === 'string') {
        const d = m.dev.slice(0, 16);
        if (!d) return;
        sess.ban = (sess.ban || []).filter((b) => b.d !== d);
        if (m.t === 'ban') { sess.ban.push({ d, n: String(m.name || '').slice(0, BAN_NAME) }); if (sess.ban.length > BAN_CAP) sess.ban.shift(); }
        const s = JSON.stringify({ t: m.t, dev: d, name: String(m.name || '').slice(0, BAN_NAME), by: (m.by || '').slice(0, 40) });
        for (const c of sess.clients.values()) c.send(s);
        if (m.t === 'ban') for (const c of sess.clients.values()) if (c.dev === d && !c.isAdmin) { try { c.close(); } catch (e) {} }
        roster();
      } else if (m.t === 'banlist' && conn.isAdmin && Array.isArray(m.devs)) {
        sess.ban = cleanBanList(m.devs);
        roster();
      } else if (m.t === 'votekick' && !sess.av && Array.isArray(m.devs)) {
        conn.votes = cleanDevList(m.devs);
        tallyVotes();
      }
    };
    conn.onclose = () => {
      if (sess.clients.get(peer) !== conn) return;
      sess.clients.delete(peer); sess.names.delete(peer);
      const s = JSON.stringify({ t: 'peer-leave', peer });
      for (const c of sess.clients.values()) c.send(s);
      tallyVotes();
      roster();
    };
    conn.send(JSON.stringify({ t: 'joined', peer, admin: isAdmin }));
    roster();
  } else {
    if (!sess.host) { conn.send(JSON.stringify({ t: 'error', error: 'no host' })); conn.close(); return; }
    if (sess.token && token !== sess.token) { conn.send(JSON.stringify({ t: 'error', error: 'bad token' })); conn.close(); return; }
    sess.clients.set(peer, conn);
    conn.onmessage = (data) => {
      if (process.env.RELAY_DEBUG) console.log('[client ' + peer + '] msg len=' + Buffer.byteLength(data) + ' allow=' + (meter.tokens | 0));
      if (!allow(data)) { if (process.env.RELAY_DEBUG) console.log('[client ' + peer + '] DROPPED (budget)'); return; }
      let m; try { m = JSON.parse(data); } catch (e) { if (process.env.RELAY_DEBUG) console.log('[client ' + peer + '] UNPARSEABLE'); return; }
      if (m.t === 'peer') { routePeer(peer, m); }
      else if (sess.host) sess.host.send(JSON.stringify({ t: 'from', from: peer, msg: m }));
    };
    conn.onclose = () => { if (sess.clients.get(peer) !== conn) return; sess.clients.delete(peer); if (sess.host) sess.host.send(JSON.stringify({ t: 'peer-leave', peer })); roster(); };
    conn.send(JSON.stringify({ t: 'joined', peer }));
    sess.host.send(JSON.stringify({ t: 'peer-join', peer }));
    roster();
  }
});

server.listen(PORT, '127.0.0.1', () => console.log('gifos local relay on ws://127.0.0.1:' + PORT));
