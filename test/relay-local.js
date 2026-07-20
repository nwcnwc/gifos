/*
 * relay-local.js — A dependency-free stand-in for the Cloudflare relay Worker,
 * used only for local end-to-end testing. It speaks the exact same message
 * protocol as relay/src/relay.js so the browser client/host code is unchanged.
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT, 10) : 8790;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// GREETER REGISTRY constants (R2/R3) — mirror relay/src/relay.js.
// TTL = RELAY_TTL(500 ticks) × the 500ms production tick > E3 worst case (200s).
const GREETER_TTL_MS = 250 * 1000, GBLOB_CAP = 4096;

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
  // Coded closes mirror the Worker: the client's reconnect policy keys on them
  // (4000 replaced / 4004 banned / 4007 voted-off are terminal — see
  // steadySocket's FATAL_CLOSES), so local tests must speak them too.
  close(code, reason) {
    try {
      if (code) {
        const r = Buffer.from(String(reason || '').slice(0, 120), 'utf8');
        const p = Buffer.alloc(2 + r.length);
        p.writeUInt16BE(code, 0); r.copy(p, 2);
        this.frame(0x8, p);
      } else this.frame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch (e) {}
  }
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

// AUTHORITY IS A SIGNATURE (docs/meet-security.md §SIG) — mirrors relay/src/relay.js:
// privileged mesh orders carry { sp, sig, pub }; verify Ed25519 over the
// exact signed string, and that the pubkey commits to the room verifier.
async function admProvenGet(av, w, act) {
  try {
    if (!av || !w || typeof w.sp !== 'string' || w.sp.length > 8192 || !w.sig || !w.pub) return null;
    const h = crypto.createHash('sha256').update(String(w.pub)).digest('hex');
    if (h.slice(0, 24) !== String(av).toLowerCase().slice(0, 24)) return null;
    const raw = (b) => Buffer.from(String(b), 'base64');
    const pub = await crypto.webcrypto.subtle.importKey('raw', raw(w.pub), 'Ed25519', false, ['verify']);
    if (!(await crypto.webcrypto.subtle.verify('Ed25519', pub, raw(w.sig), Buffer.from(w.sp, 'utf8')))) return null;
    const o = JSON.parse(w.sp);
    if (o.act !== act) return null;
    if (Math.abs(Date.now() - (+o.ts || 0)) > 300000) return null;
    return o;
  } catch (e) { return null; }
}
async function admProven(av, w, act, check) {
  const o = await admProvenGet(av, w, act);
  return !!(o && (!check || check(o)));
}

// ---- session hub (mirrors the Durable Object) ----
const sessions = new Map(); // id -> { host, token, meshToken, clients:Map }
// NOTE: no names map. Mirrors relay/src/relay.js — display names never reach
// the relay; they travel end-to-end sealed between clients (status/offer/
// answer), so the roster this test relay authors is peer ids only.
function getSession(id) { if (!sessions.has(id)) sessions.set(id, { host: null, token: null, meshToken: null, clients: new Map() }); return sessions.get(id); }

// TLS mode (RELAY_TLS_CERT + RELAY_TLS_KEY): serve WSS directly with a real cert
// (e.g. `tailscale cert <name>`), so a tailnet swarm + real users get a SECURE
// CONTEXT (WebCrypto room-key derivation needs it) without tailscale-serve's WS
// proxy (which doesn't upgrade) or insecure-origin hacks.
const RELAY_HANDLER = (req, res) => { res.writeHead(200); res.end('gifos relay (local)'); };
const useTLS = process.env.RELAY_TLS_CERT && process.env.RELAY_TLS_KEY;
const server = useTLS
  ? https.createServer({ cert: fs.readFileSync(process.env.RELAY_TLS_CERT), key: fs.readFileSync(process.env.RELAY_TLS_KEY) }, RELAY_HANDLER)
  : http.createServer(RELAY_HANDLER);

server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = new Conn(socket);
  // Feed any bytes already read past the HTTP upgrade (the `head` buffer) into
  // the frame parser. Over TLS / a real network the client can pipeline its
  // FIRST WebSocket frame in the same segment as the upgrade request, so that
  // frame arrives in `head`, never as a later 'data' event — dropping it silently
  // stalled the mesh socket (which sends its first frame immediately) while the
  // slower join socket, whose first frame arrived separately, worked. Localhost
  // rarely coalesces, which is why this only bit the TLS/tailnet swarm.
  if (head && head.length) { conn.buf = Buffer.concat([conn.buf, head]); conn.drain(); }

  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['s', id]
  if (parts[0] !== 's' || !parts[1]) { conn.send(JSON.stringify({ t: 'error', error: 'bad path' })); conn.close(); return; }
  const sess = getSession(parts[1]);
  const role = url.searchParams.get('role') || 'client';
  const token = url.searchParams.get('token') || '';
  const peer = url.searchParams.get('peer') || 'c_' + crypto.randomBytes(4).toString('hex');
  const ip = socket.remoteAddress || 'unknown';

  // Abuse guards — mirror the Worker's caps so tests exercise them.
  // C mirrors GIFOS_SCALE.C: a session is one SECTION (C² seats) plus C so
  // the stage can double-home into a full level-1 space. Never client-set.
  // RELAY_DEV=1 — DEV MODE: no abuse guards at all. The per-IP socket cap, the
  // join-rate cap and the session cap are PRODUCTION concerns (they exist to
  // blunt abuse of a shared, billed relay); a checkout on a workstation has no
  // abuser to blunt, and every dev box drives its whole bot fleet from ONE
  // address, so the per-IP cap of 8 is precisely wrong here. Leaving it on cost
  // real time: a swarm silently lost its bots to "too many connections from
  // your network" and the missing seats read as a mesh bug.
  // TRUSTED_IPS still works, but it is the brittle form — it fails the moment a
  // bot box's address isn't in the list. Prefer RELAY_DEV=1 locally.
  // RELAY_MAX_SOCKETS overrides the per-session cap on its own.
  const DEV = process.env.RELAY_DEV === '1';
  const C = 5;
  const MAX_SOCKETS_PER_SESSION = parseInt(process.env.RELAY_MAX_SOCKETS || '0', 10)
    || (DEV ? Infinity : C * C + C); // 30 in prod-mirroring mode
  // TRUSTED_IPS (env) bypasses the PER-IP caps for load tests — mirrors the
  // Worker. For a big LOCAL swarm, run: TRUSTED_IPS=127.0.0.1,::1,::ffff:127.0.0.1 node test/relay-local.js
  const TRUSTED = String(process.env.TRUSTED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const trusted = DEV || TRUSTED.includes(ip);
  // Connection tracing (RELAY_DEBUG=1). A swarm bot that "comes up but never
  // seats" is almost always a connection that never landed — rejected by a
  // cap, or aimed at a DIFFERENT session id than the one being watched. The
  // relay is the only place that can tell those apart, so it says so out loud.
  const clog = (...a) => { if (process.env.RELAY_DEBUG) console.log('[conn]', new Date().toISOString().slice(11, 23), ...a); };
  const rejectConn = (error) => { clog('REJECT sid=' + parts[1] + ' peer=' + peer + ' ip=' + ip + ' :: ' + error); conn.send(JSON.stringify({ t: 'error', error })); conn.close(); };
  const allConns = () => (sess.host ? 1 : 0) + sess.clients.size;
  if (allConns() >= MAX_SOCKETS_PER_SESSION) { rejectConn('this session is full'); return; }
  // The raw IP is used only TRANSIENTLY (rate-limit counting here); it is
  // never STORED on the connection. Mirrors relay/src/relay.js: a salted hash
  // is what rides the per-socket state, so a state/log dump yields opaque tags,
  // not addresses. Identity (name/IP) reaches peers only sealed under the room
  // key, which this relay never holds.
  const iph = crypto.createHash('sha256').update('gifos-relay-ip-tag|' + ip).digest('hex').slice(0, 24);
  let mine = 0;
  if (sess.host && sess.host.iph === iph) mine++;
  for (const c of sess.clients.values()) if (c.iph === iph) mine++;
  if (mine >= 8 && !trusted) { rejectConn('too many connections from your network'); return; }
  sess.joins = sess.joins || new Map();
  const nowJ = Date.now();
  const jlog = (sess.joins.get(ip) || []).filter((t) => nowJ - t < 60000);
  jlog.push(nowJ); sess.joins.set(ip, jlog);
  if (jlog.length > 120 && !trusted) { rejectConn('joining too fast — slow down'); return; }
  conn.iph = iph;
  clog('ACCEPT sid=' + parts[1] + ' peer=' + peer + ' role=' + role + ' ip=' + ip
    + (trusted ? ' (trusted)' : '') + ' sessConns=' + (allConns() + 1) + ' fromThisIp=' + (mine + 1));

  // Bandwidth + frame-rate guards — token buckets, mirror the Worker (media
  // must go P2P; tiny-frame loops get warned, then cut with 1013).
  const BURST = 1024 * 1024, REFILL = 48 * 1024;
  // Mirrors relay/src/relay.js — keep in step, these are what tests exercise.
  const FRAME_BURST = 6000, FRAMES_PER_SEC = 120, FRAME_STRIKES = 3;
  const meter = { tokens: BURST, frames: FRAME_BURST, last: Date.now(), warned: false, strikes: 0 };
  const allow = (data) => {
    msgRate.set(peer, (msgRate.get(peer) || 0) + 1); // RELAY_DEBUG: how fast do real clients actually talk?
    if (DEV) return true;   // RELAY_DEV: the bandwidth/frame meter is an abuse guard too
    const now = Date.now();
    const dt = (now - meter.last) / 1000;
    meter.tokens = Math.min(BURST, meter.tokens + dt * REFILL);
    meter.frames = Math.min(FRAME_BURST, meter.frames + dt * FRAMES_PER_SEC);
    meter.last = now;
    const len = Buffer.byteLength(data || '');
    if (len <= BURST && meter.tokens >= len && meter.frames >= 1) { meter.tokens -= len; meter.frames -= 1; meter.warned = false; return true; }
    if (!meter.warned) {
      meter.warned = true;
      meter.strikes++;
      clog('STRIKE ' + meter.strikes + '/' + FRAME_STRIKES + ' peer=' + peer
        + ' len=' + len + ' tokens=' + (meter.tokens | 0) + ' frames=' + meter.frames.toFixed(2));
      conn.send(JSON.stringify({ t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' }));
      if (meter.strikes >= FRAME_STRIKES) { clog('CUT peer=' + peer + ' (rate) — client will reconnect'); try { conn.close(1013, 'rate'); } catch (e) {} }
    }
    return false;
  };
  const roster = () => {
    const msg = { t: 'roster', peers: Array.from(sess.clients.keys()) };
    if (sess.host) msg.epoch = sess.hostEpoch || 0; // clients claim epoch+1 on takeover
    if (sess.mesh) {
      // Room-salted device tags only (for client-side ban/vote UI). NO ips —
      // network addresses travel sealed peer-to-peer; the relay never authors
      // them. Mirrors relay/src/relay.js.
      msg.devs = {}; for (const [p, c] of sess.clients) if (c.dev) msg.devs[p] = c.dev;
      if (sess.av) {
        msg.hasAdmin = true;
        // no admins[] — adminship is a signature peers verify themselves (§9)
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
    for (const c of sess.clients.values()) if (c.dev === dev && !c.isAdmin) { try { c.close(4004, 'banned'); } catch (e) {} }
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
        for (const c of Array.from(sess.clients.values())) if (c.dev === d) { try { c.close(4007, 'voted-off'); } catch (e) {} }
        roster();
      }
    }
  };
  const routePeer = (from, m) => {
    // no stamp — authority is a signature (docs/meet-security.md §SIG)
    const wrapped = JSON.stringify({ t: 'peer', from, msg: m.msg });
    const dest = m.to === 'host' ? sess.host : sess.clients.get(m.to);
    if (dest) { dest.send(wrapped); return; }
    // Explicit no-socket bounce (docs/meet-security.md §FWD): the target holds
    // no socket here (a seated deep seat — R2 greeting scope), so tell the
    // SENDER instead of dropping the frame silently; it falls back to
    // sponsor-forward immediately instead of retrying blind. Leaks nothing the
    // roster doesn't already broadcast (which peers hold sockets). Mirrors
    // relay/src/relay.js routePeer.
    const src = from === 'host' ? sess.host : sess.clients.get(from);
    if (src) src.send(JSON.stringify({ t: 'nosock', to: m.to }));
  };
  // ---- greeter registry (R2/R3) — mirrors relay/src/relay.js ----
  // State lives on the CONNECTIONS (occupancy), so it is forgotten when the room
  // empties. The relay holds only H(genesis key) + TTL'd SEALED addresses,
  // gates GENESIS (empty registry ⇒ first knocker founds), and hands newcomers
  // the opaque list. Zero-knowledge — it never holds the meeting-URL key.
  const genesisHash = () => {
    for (const c of sess.clients.values()) if (c.gkh) return c.gkh;
    return null;
  };
  const greeterList = (except) => {
    const now = Date.now(), out = [];
    for (const c of sess.clients.values()) {
      if (c === except) continue;
      if (c.gblob && (c.gexp || 0) > now) out.push(c.gblob);
    }
    return out;
  };
  const knock = (c, gk, gblob) => {
    const have = genesisHash();
    let founded = false, admitted = false;
    if (!have) { c.gkh = gk ? sha256hex(gk) : null; founded = admitted = !!c.gkh; } // empty ⇒ found (R3)
    else if (gk && sha256hex(gk) === have) { c.gkh = have; admitted = true; }       // key match ⇒ join pool
    if (admitted && gblob) { c.gblob = String(gblob).slice(0, GBLOB_CAP); c.gexp = Date.now() + GREETER_TTL_MS; }
    c.send(JSON.stringify({ t: 'greeters', list: greeterList(c), founded, admitted }));
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
      try { sess.host.close(4001, 'replaced by a new host'); } catch (e) {}
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
    // room without it can never have an admin). ADMINSHIP IS A SIGNATURE now
    // (docs/meet-security.md §SIG): no socket is admin; privileged orders arrive
    // individually signed and are verified per-frame (admProvenGet).
    const av = verifierOf(parts[1]); // verifier from the session id, not a query param
    if (sess.clients.size === 0) {
      sess.meshToken = token;
      sess.av = av || null;
      sess.ban = [];
      sess.mesh = true;
      // Admin rooms always start LOCKLESS at the door (nobody is admin at
      // join time): the admin re-asserts the lock with a SIGNED setpw right
      // after the roster. Plain rooms keep first-arriver seeding BY DESIGN —
      // the anarchy tier. Mirrors relay/src/relay.js.
      sess.pw = av ? null : ((url.searchParams.get('pw') || '') || null);
    }
    if (sess.meshToken !== token) { conn.send(JSON.stringify({ t: 'error', error: 'bad room token' })); conn.close(); return; }
    if (sess.pw && (url.searchParams.get('pw') || '') !== sess.pw) { rejectConn('password required'); return; }
    const dev = (url.searchParams.get('dev') || '').slice(0, 16);
    const gk = (url.searchParams.get('gk') || '').slice(0, 128); // genesis-key token (R3)
    if (dev && (sess.ban || []).some((b) => b.d === dev)) { rejectConn('banned'); return; }
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
    conn.dev = dev;
    // Parity with the Worker: one socket per peer id AND one slot per DEVICE. A
    // reload reuses its peer id and swaps silently; a NEW tab/session from the
    // same device gets a fresh peer id but the same device id — evict its ghost
    // and announce the departure so everyone drops the stale tile.
    for (const [p, c] of Array.from(sess.clients)) {
      if (p === peer || (dev && c.dev === dev)) {
        sess.clients.delete(p);
        try { c.close(4000, 'replaced'); } catch (e) {} // terminal for the evicted tab — no reconnect ping-pong
        if (p !== peer) { const s = JSON.stringify({ t: 'peer-leave', peer: p }); for (const cc of sess.clients.values()) cc.send(s); }
      }
    }
    sess.clients.set(peer, conn);
    conn.onmessage = async (data) => {
      if (!allow(data)) return;
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (process.env.RELAY_DEBUG) typeRate.set(m.t, (typeRate.get(m.t) || 0) + 1); // what is actually flooding the relay?
      if (m.t === 'peer') routePeer(peer, m);
      else if (m.t === 'knock') knock(conn, m.gk, m.gblob); // (re)register greeter / take-over empty room (R2/R3/R6)
      else if (m.t === 'gossip' && m.msg !== undefined) {
        // One inbound frame fans out to every other member as the ordinary
        // {t:'peer', from} shape (no stamp — §9) — mirrors relay/src/relay.js.
        const s = JSON.stringify({ t: 'peer', from: peer, msg: m.msg });
        for (const [p, c] of sess.clients) if (p !== peer) c.send(s);
      } else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Signed in admin rooms (§9): the relay verifies the same Ed25519
        // proof any peer would — mirrors relay/src/relay.js.
        if (sess.av && !(await admProven(sess.av, m.w, 'setpw', (o) => o.pw === m.pw))) {
          conn.send(JSON.stringify({ t: 'error', error: 'admins only: this room\'s password is managed by its admin' })); return;
        }
        sess.pw = m.pw.slice(0, 64) || null;
        const s = JSON.stringify({ t: 'pw', pw: sess.pw || '', by: (m.by || '').slice(0, 40) });
        for (const c of sess.clients.values()) c.send(s);
      } else if ((m.t === 'ban' || m.t === 'unban') && typeof m.dev === 'string') {
        if (!sess.av || !(await admProven(sess.av, m.w, m.t, (o) => o.dev === m.dev))) return;
        const d = m.dev.slice(0, 16);
        if (!d) return;
        sess.ban = (sess.ban || []).filter((b) => b.d !== d);
        if (m.t === 'ban') { sess.ban.push({ d, n: String(m.name || '').slice(0, BAN_NAME) }); if (sess.ban.length > BAN_CAP) sess.ban.shift(); }
        const s = JSON.stringify({ t: m.t, dev: d, name: String(m.name || '').slice(0, BAN_NAME), by: (m.by || '').slice(0, 40) });
        for (const c of sess.clients.values()) c.send(s);
        if (m.t === 'ban') for (const c of sess.clients.values()) if (c.dev === d) { try { c.close(4004, 'banned'); } catch (e) {} }
        roster();
      } else if (m.t === 'banlist' && Array.isArray(m.devs)) {
        // Signed re-seed; the SIGNED devs list is authoritative. Re-seed also
        // CUTS any listed device already on a socket — mirrors relay/src/relay.js.
        const o = sess.av ? await admProvenGet(sess.av, m.w, 'banlist') : null;
        if (!o || !Array.isArray(o.devs)) return;
        sess.ban = cleanBanList(o.devs);
        for (const c of sess.clients.values()) if (c.dev && sess.ban.some((b) => b.d === c.dev)) { try { c.close(4004, 'banned'); } catch (e) {} }
        roster();
      } else if (m.t === 'votekick' && !sess.av && Array.isArray(m.devs)) {
        conn.votes = cleanDevList(m.devs);
        tallyVotes();
      }
    };
    conn.onclose = () => {
      if (sess.clients.get(peer) !== conn) return;
      sess.clients.delete(peer);
      const s = JSON.stringify({ t: 'peer-leave', peer });
      for (const c of sess.clients.values()) c.send(s);
      tallyVotes();
      roster();
    };
    conn.send(JSON.stringify({ t: 'joined', peer }));
    conn.send(JSON.stringify({ t: 'whoami', ip })); // tell the socket its own address so it can seal it to peers
    knock(conn, gk, null); // KNOCK at connection (R2/R3): found if empty, else hand back the sealed greeter list
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

// Binds 127.0.0.1 by default (every e2e suite is same-host, unchanged). Set
// RELAY_HOST=0.0.0.0 to expose it on the LAN/tailnet for a multi-machine swarm
// (bots on other boxes point --relay ws://<this-box-ip>:PORT).
const HOST = process.env.RELAY_HOST || '127.0.0.1';
// RELAY_DEBUG rate meter: the relay's frame budget (FRAMES_PER_SEC) is only
// defensible against the rate real clients actually need, so measure it rather
// than guess. Every 10s, report each peer's observed msgs/sec.
const msgRate = new Map(), typeRate = new Map();
if (process.env.RELAY_DEBUG) setInterval(() => {
  if (!msgRate.size) return;
  const rates = Array.from(msgRate.entries()).map(([p, n]) => (n / 10).toFixed(1) + '/s ' + p.slice(0, 10));
  console.log('[rate] ' + rates.sort((a, b) => parseFloat(b) - parseFloat(a)).join('  '));
  if (typeRate.size) console.log('[kind] ' + Array.from(typeRate.entries())
    .sort((a, b) => b[1] - a[1]).map(([t, n]) => t + '=' + (n / 10).toFixed(1) + '/s').join('  '));
  msgRate.clear(); typeRate.clear();
}, 10000).unref();

server.listen(PORT, HOST, () => {
  console.log('gifos local relay on ' + (useTLS ? 'wss' : 'ws') + '://' + HOST + ':' + PORT);
  // Say which mode is in force — "why did my bots vanish?" should never again
  // require reading this file.
  if (process.env.RELAY_DEV === '1') console.log('  RELAY_DEV=1 — abuse guards OFF (no per-IP, join-rate or session cap)');
  else console.log('  prod-mirroring caps ON (8 sockets/IP, 30/session). Set RELAY_DEV=1 for unguarded local testing.');
});
