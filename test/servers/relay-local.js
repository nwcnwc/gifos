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
// RELAY_GREETER_TTL_MS shortens the TTL for tests ONLY — the margin between
// this TTL and the E3 re-knock is what a suite wants to exercise, and waiting
// 250s per assertion is not a test. Default is the production value.
const GREETER_TTL_MS = parseInt(process.env.RELAY_GREETER_TTL_MS || String(250 * 1000), 10), GBLOB_CAP = 1024; // relay/src/relay.js GBLOB_CAP
// A mint must become a real greeter within this, or the claim lapses (the
// ghost-genesis rule — see relay/src/relay.js). NEVER above the greeter TTL: a
// blobless claim must be WEAKER than a registered greeter's, never stronger,
// and suites that shorten the TTL (zombie-genesis) are asserting exactly when
// an unconverted claim lets go. RELAY_MINT_GRACE_MS overrides for tests.
const MINT_GRACE_MS = parseInt(process.env.RELAY_MINT_GRACE_MS || String(Math.min(60 * 1000, GREETER_TTL_MS)), 10);
// Mirrors relay/src/relay.js CLAIM_GRACE_MS — how long a genesis claim survives
// with no live registration behind it, measured from the registration's EXPIRY.
// Overridable so a test can collapse the window instead of sleeping 60s.
const CLAIM_GRACE_MS = parseInt(process.env.RELAY_CLAIM_GRACE_MS || String(Math.min(60 * 1000, GREETER_TTL_MS)), 10);

// RELAY_GREETDEBUG=1 — narrate the greeter registry (R2/R3) on every knock.
// The registry is the door: when a live room hands a knocker an EMPTY list the
// only way to see WHY is from in here, because the client is told `list` and
// `founded` but never WHO holds the genesis or WHY it was not admitted. One
// line per knock (who knocked, with which key, what the room's genesis is,
// admitted/founded, list length) plus a dump of every connection's registry
// state. Off by default; costs nothing when unset.
const GREETDEBUG = process.env.RELAY_GREETDEBUG === '1';
const kfp = (h) => (h ? String(h).slice(0, 8) : '-');
function greetLog(sess, sid, c, o) {
  const now = Date.now();
  const rows = [];
  for (const [p, k] of sess.clients.entries()) {
    const liveBlob = !!(k.gblob && (k.gexp || 0) > now);
    const seenAge = k.gseen ? ((now - k.gseen) / 1000).toFixed(0) + 's' : '-';
    rows.push(p.slice(0, 8) + '{gkh=' + kfp(k.gkh) + ' blob=' + (k.gblob ? (liveBlob ? 'live' : 'EXPIRED') : '-')
      + ' seen=' + seenAge + (k === c ? ' *' : '') + '}');
  }
  console.log('[greet] sid=' + String(sid).slice(0, 16) + ' knock by=' + String(c.peer || '?').slice(0, 8)
    + ' gk=' + kfp(o.gk && sha256hex(o.gk)) + ' blob=' + (o.gblob ? 'yes' : 'no')
    + ' | have=' + kfp(o.have) + ' founded=' + o.founded + ' admitted=' + o.admitted + ' list=' + o.listLen
    + ' || ' + rows.join(' '));
}

// ---- minimal RFC6455 connection ----
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (chunk) => { this.buf = Buffer.concat([this.buf, chunk]); this.drain(); });
    // A hard-killed peer's kernel sends FIN; without ending our side the socket
    // sits half-open and 'close' never fires until the NEXT WRITE hits the dead
    // peer and RSTs — which is the room's ≤12s status beat. That made every
    // SIGKILL vanish measure read "0-12s (beat phase) + confirm" instead of the
    // relay's actual instant observation, and it is a parity bug: the Worker's
    // edge closes on FIN. End our side on FIN → 'close' fires promptly →
    // peer-leave broadcasts the moment the socket dies.
    socket.on('end', () => { try { socket.end(); } catch (e) {} });
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
      // A binary frame is metered like any other (it bills a wake in the
      // Worker) and then dropped — the relay carries text only.
      if (opcode === 0x2) { if (this.onbinary) this.onbinary(payload); continue; }
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
// (hex, 24–64 chars). The floor is 24: admProven compares that many hash
// chars, so a shorter tail could never be administered. Mirrors verifierOf
// in relay/src/relay.js.
function verifierOf(sid) {
  const dot = String(sid || '').lastIndexOf('.');
  if (dot <= 0) return '';
  const v = sid.slice(dot + 1);
  return /^[a-f0-9]{24,64}$/.test(v) ? v : '';
}

// AUTHORITY IS A SIGNATURE (docs/meet-security.md §SIG) — mirrors relay/src/relay.js:
// privileged mesh orders carry { sp, sig, pub }; verify Ed25519 over the
// exact signed string, and that the pubkey commits to the room verifier.
async function admProvenGet(av, w, act) {
  try {
    if (!av || !w || typeof w.sp !== 'string' || w.sp.length > 8192 || !w.sig || !w.pub) return null;
    const rawPub = Buffer.from(String(w.pub), 'base64');
    if (rawPub.length !== 32) return null;
    const h = crypto.createHash('sha256').update(rawPub).digest('hex'); // over the RAW key bytes — mirrors relay.js keyHex / gifos-net keyId
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
// The newest ts applied per act — mirrors relay/src/relay.js orderIsNew/markOrder.
function orderIsNew(sess, act, ts) { sess.admTs = sess.admTs || {}; return (+ts || 0) > (sess.admTs[act] || 0); }

// ---- session hub (mirrors the Durable Object) ----
const sessions = new Map(); // id -> { host, token, meshToken, clients:Map }
// RELAY_DEBUG rate samples. Declared here so a refusal and a close can
// drop entries. The 10s printer stays at the bottom. Unset RELAY_DEBUG
// never writes these maps: a gate relay lives for the whole browser tier.
const msgRate = new Map(), typeRate = new Map();
// NOTE: no names map. Mirrors relay/src/relay.js — display names never reach
// the relay; they travel end-to-end sealed between clients (status/offer/
// answer), so the roster this test relay authors is peer ids only.
function getSession(id) { if (!sessions.has(id)) sessions.set(id, { host: null, token: null, meshToken: null, clients: new Map() }); return sessions.get(id); }

// TLS mode (RELAY_TLS_CERT + RELAY_TLS_KEY): serve WSS directly with a real cert
// (e.g. `tailscale cert <name>`), so a tailnet swarm + real users get a SECURE
// CONTEXT (WebCrypto room-key derivation needs it) without tailscale-serve's WS
// proxy (which doesn't upgrade) or insecure-origin hacks.
const RELAY_HANDLER = (req, res) => {
  // RELAY_STATS=1 is a test probe: counts only, never a peer id or an address.
  if (process.env.RELAY_STATS === '1' && (req.url || '').split('?')[0] === '/_stats') {
    let clients = 0;
    for (const s of sessions.values()) clients += s.clients.size;
    const body = JSON.stringify({ sessions: sessions.size, clients, msgRate: msgRate.size });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(body);
    return;
  }
  res.writeHead(200); res.end('gifos relay (local)');
};
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
  const token = (url.searchParams.get('token') || '').slice(0, 64); // mirrors relay/src/relay.js: bounded before it lands in state
  const peer = url.searchParams.get('peer') || 'c_' + crypto.randomBytes(4).toString('hex');
  const ip = socket.remoteAddress || 'unknown';

  // Abuse guards — mirror the Worker's caps so tests exercise them.
  // DEV MODE IS THE DEFAULT — no abuse guards. The byte and frame meters are
  // PRODUCTION concerns (they exist to blunt abuse of a shared, billed
  // relay); a checkout on a workstation has no abuser to blunt. A tool that
  // lives in test/servers/ defaults to TEST semantics. Neither mode has a
  // per-address cap: production removed its per-address socket cap, join-rate
  // cap and edge limiter on 3 Oct 2026, because hundreds of people behind one
  // office or carrier NAT share one address (test/relay/relay-shared-address.js).
  //
  // RELAY_PROD=1 opts back into the production-mirroring guards — for the
  // suites that ASSERT them (e2e-relay spawns its own on a private port).
  // Ban / eviction / owned-slot semantics are CORE session logic, not abuse
  // guards, and are always active in both modes.
  // RELAY_DEV=1 is accepted for compatibility (it is now the default).
  const DEV = process.env.RELAY_PROD !== '1';
  // No session cap in EITHER mode — production has none (relay/src/relay.js):
  // a meeting that starts at 10:00 is a burst of every attendee, and the door
  // must take them all. The roster is scoped to the greeters, so a connect or
  // close costs the relay O(greeters), not O(sockets). RELAY_MAX_SOCKETS stays
  // as an experiment knob only.
  const MAX_SOCKETS_PER_SESSION = parseInt(process.env.RELAY_MAX_SOCKETS || '0', 10) || Infinity;
  // Connection tracing (RELAY_DEBUG=1). A swarm bot that "comes up but never
  // seats" is almost always a connection that never landed — rejected by a
  // cap, or aimed at a DIFFERENT session id than the one being watched. The
  // relay is the only place that can tell those apart, so it says so out loud.
  const clog = (...a) => { if (process.env.RELAY_DEBUG) console.log('[conn]', new Date().toISOString().slice(11, 23), ...a); };
  // POLICY CLOSE CODES — mirror the Worker exactly. This closed with NO code
  // until 2026-08-06, and that is not a cosmetic gap: gifos-net's steadySocket
  // keys its reconnect policy on the close code (FATAL_CLOSES = 1008, 4000,
  // 4001, 4003, 4004, 4007, 4008, 4009, 4010), and until 2026-09-28 it RESET its
  // backoff on every onopen (now only once a socket stays open 5s). A codeless
  // refusal read as a transient blip, so a locally
  // refused client re-knocked about twice a second FOREVER — every browser suite
  // was exercising the wrong reconnect policy for a refusal, and a fatal
  // rejection looked survivable. The table is production's, verbatim
  // (relay/src/relay.js reject() call sites); anything not in it closes
  // uncoded, exactly as production does.
  const REJECT_CODES = {
    'too many joining right now — try again in a moment': 1013,
    'the relay is a greeter — app sessions ride the room mesh now': 4010,
    'bad room token': 1008,
    'password required': 4003,
    'banned': 4004,
    'voted-off': 4007,
    'that id is in use from another device': 4011,
    'a device tag is required': 4012,
  };
  // Production has no session cap. The string exists only while the
  // RELAY_MAX_SOCKETS experiment knob is finite (see the banner).
  if (Number.isFinite(MAX_SOCKETS_PER_SESSION)) REJECT_CODES['this session is full'] = 1013;
  const rejectConn = (error) => {
    clog('REJECT sid=' + parts[1] + ' peer=' + peer + ' ip=' + ip + ' :: ' + error);
    try { conn.send(JSON.stringify({ t: 'error', error })); } catch (e) {}
    conn.close(REJECT_CODES[error] || 0, error);
    // A refusal never sat in sess.clients. Drop the room if this upgrade
    // was the only reason getSession created it.
    if (sess.clients.size === 0) sessions.delete(parts[1]);
  };
  const allConns = () => sess.clients.size;
  if (allConns() >= MAX_SOCKETS_PER_SESSION) { rejectConn('this session is full'); return; }
  // The raw IP is used only for the one-time whoami frame; it is never STORED
  // on the connection, nor any hash of it. Mirrors relay/src/relay.js.
  clog('ACCEPT sid=' + parts[1] + ' peer=' + peer + ' role=' + role + ' ip=' + ip
    + ' sessConns=' + (allConns() + 1));

  // Bandwidth + frame-rate guards — token buckets, mirror the Worker (media
  // must go P2P; tiny-frame loops get warned, then cut with 1013).
  const BURST = 1024 * 1024, REFILL = 48 * 1024;
  // Mirrors relay/src/relay.js — keep in step, these are what tests exercise.
  const FRAME_BURST = 600, FRAMES_PER_SEC = 3, FRAME_STRIKES = 3;
  // A DOOR (a greeter blob or a founder's mint) is metered by BYTES only, on a
  // 4x bucket, and is never cut: its traffic grows with the crowd at the door,
  // and cutting it mid-burst takes the room's registration with it. Mirrors
  // relay/src/relay.js DOOR_BURST_BYTES.
  const DOOR_BURST = 4 * BURST, DOOR_REFILL = 4 * REFILL;
  const meter = { tokens: BURST, frames: FRAME_BURST, last: Date.now(), warned: false, strikes: 0 };
  const allow = (data) => {
    if (process.env.RELAY_DEBUG) msgRate.set(peer, (msgRate.get(peer) || 0) + 1); // how fast do real clients actually talk?
    if (DEV) return true;   // RELAY_DEV: the bandwidth/frame meter is an abuse guard too
    const now = Date.now();
    const dt = (now - meter.last) / 1000;
    // A door only while its claim is live — a registration inside its grace,
    // or a founder's mint inside MINT_GRACE_MS (mirrors relay.js doorLive).
    const door = conn.gblob ? (conn.gexp || 0) + CLAIM_GRACE_MS > now : !!(conn.gmint && conn.gmint + MINT_GRACE_MS > now);
    const cap = door ? DOOR_BURST : BURST;
    meter.tokens = Math.min(cap, meter.tokens + dt * (door ? DOOR_REFILL : REFILL));
    meter.frames = Math.min(FRAME_BURST, meter.frames + dt * FRAMES_PER_SEC);
    meter.last = now;
    const len = Buffer.byteLength(data || '');
    if (door) { // bytes only; an overrun is dropped, never struck or cut
      if (len <= cap && meter.tokens >= len) { meter.tokens -= len; return true; }
      meter.doorDrops = (meter.doorDrops || 0) + 1;
      if (meter.doorDrops % 100 === 1) clog('DOOR-DROP peer=' + peer + ' drops=' + meter.doorDrops + ' tokens=' + (meter.tokens | 0));
      return false;
    }
    if (len <= BURST && meter.tokens >= len && meter.frames >= 1) {
      // Mirrors relay.js overBudget: a frame bucket refilled to FRAME_BURST has
      // been inside the budget, so the strike count starts over.
      if (meter.frames >= FRAME_BURST) meter.strikes = 0;
      meter.tokens -= len; meter.frames -= 1; meter.warned = false; return true;
    }
    if (!meter.warned) {
      meter.warned = true;
      meter.strikes++;
      clog('STRIKE ' + meter.strikes + '/' + FRAME_STRIKES + ' peer=' + peer
        + ' len=' + len + ' tokens=' + (meter.tokens | 0) + ' frames=' + meter.frames.toFixed(2));
      conn.send(JSON.stringify({ t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' }));
      // Mirrors relay/src/relay.js: throttle frame overruns, sever only when the
      // BYTE bucket is drained (real media abuse). Cutting a bursty joiner
      // destroyed the signaling that would have moved it onto a DataChannel.
      if (meter.strikes >= FRAME_STRIKES) { clog('CUT peer=' + peer + ' (bytes) — sustained volume'); try { conn.close(1013, 'rate'); } catch (e) {} }
    }
    return false;
  };
  // THE ROSTER IS SCOPED TO THE DOOR — mirrors relay/src/relay.js roster().
  // A GREETER (a socket holding a registered greeter blob) routes for everyone
  // at the door, so it gets the FULL socket list once and then per-socket
  // `peer-join` / `peer-leave` deltas. Everyone else — joiners, and new seats
  // still wiring — needs only the doors: a `scope:'door'` roster of the
  // greeters, sent on connect and again only when the greeter set changes.
  // Anyone may PULL the full list once per WHO_MIN_MS with {t:'who'}.
  // The old rule re-sent the whole list to every socket on every connect and
  // close: a burst of N joiners cost ~N³/3 list entries (13 GB of buffered
  // frames at N=700), and the 30-socket session cap existed only to hide it.
  // A live registration only (mirrors relay.js isGreeter): the blob stays
  // after gexp for genesisHash's re-register grace, but is not a door.
  const isGreeter = (c) => !!c.gblob && (c.gexp || 0) > Date.now();
  const WHO_MIN_MS = 5000;
  const rosterMsg = (full) => {
    const msg = { t: 'roster', scope: full ? 'full' : 'door', peers: [] };
    for (const [p, c] of sess.clients) if (full || isGreeter(c)) msg.peers.push(p);
    if (sess.mesh) {
      // Room-salted device tags only (for client-side ban/vote UI). NO ips —
      // network addresses travel sealed peer-to-peer; the relay never authors
      // them. Mirrors relay/src/relay.js.
      msg.devs = {}; for (const [p, c] of sess.clients) if (c.dev && (full || isGreeter(c))) msg.devs[p] = c.dev;
      if (sess.av) {
        // no admins[] — adminship is a signature peers verify themselves (§9)
        msg.ban = sess.ban || [];
        // Door-gate state (2026-07-29): in an admin room the gate is set ONLY
        // by a signed setpw, so `locked` tells a client whether the door it
        // just passed was VOUCHING for its password proof (gated ⇒ an admin
        // set this) or open (an unsigned stored password confers nothing).
        // Zero-knowledge: a boolean the door already enforces behaviorally.
        msg.locked = !!sess.pw;
      }
    }
    return JSON.stringify(msg);
  };
  // Every socket, each its own scope — for a ban/lock change (rare); never on
  // an ordinary connect or close; a greeter-set change is doorsChanged().
  const roster = () => {
    const full = rosterMsg(true), door = rosterMsg(false);
    sess.whoCache = { at: Date.now(), s: full };
    for (const c of sess.clients.values()) c.send(isGreeter(c) ? full : door);
  };
  const rosterTo = (c, full) => c.send(rosterMsg(full || isGreeter(c)));
  const WHO_CACHE_MS = 1000;
  const fullRosterForPull = () => { // the pulled list is built at most once per WHO_CACHE_MS — mirrors relay.js
    const nowC = Date.now();
    if (!sess.whoCache || nowC - sess.whoCache.at >= WHO_CACHE_MS) sess.whoCache = { at: nowC, s: rosterMsg(true) };
    return sess.whoCache.s;
  };
  // The greeter SET changed: every non-greeter gets the new door list, the
  // newly registered greeter alone the full list once; existing greeters hold
  // an exact list by deltas already — mirrors relay.js doorsChanged.
  const doorsChanged = (newGreeter) => {
    const door = rosterMsg(false);
    for (const c of sess.clients.values()) {
      if (c === newGreeter) rosterTo(c, true);
      else if (!isGreeter(c)) c.send(door);
    }
  };
  const toGreeters = (s) => { for (const c of sess.clients.values()) if (isGreeter(c)) c.send(s); };
  const BAN_CAP = 20;
  // THE 2 KB ATTACHMENT, EMULATED. The Worker keeps every occupant's join
  // state in a socket attachment the platform caps at 2 KB (relay.js
  // saveAtt); this process has no such cap, which is exactly how an overflow
  // hid from every suite. Build the same shape, JSON-serialise it, apply the
  // same limit, and answer the way the Worker does: a join that does not fit
  // is refused, a later write that does not fit is dropped and logged (to
  // stderr — the suites ignore this relay's stdout).
  const ATT_CAP = 2048;
  const attOf = (c, extra) => Object.assign({ role: 'mesh', peer: c.peer, tok: token, pw: sess.pw, av: sess.av, dev: c.dev, ban: sess.ban, rs: c.rs,
    gkh: c.gkh, gblob: c.gblob, gexp: c.gexp, gseen: c.gseen, gmint: c.gmint, admTs: sess.admTs }, extra || {});
  const attFits = (att, what) => {
    const n = JSON.stringify(att).length;
    if (n <= ATT_CAP) return true;
    console.error('attachment overflow (' + what + ') ' + n + ' > ' + ATT_CAP + ' — the Worker would refuse this write (relay.js saveAtt)');
    return false;
  };
  const attFitsAll = (what) => { for (const c of sess.clients.values()) if (!attFits(attOf(c), what)) return false; return true; };
  const cleanBanList = (list) => (Array.isArray(list) ? list : []).slice(0, BAN_CAP)
    .map((e) => ({ d: String((e && e.d) || '').slice(0, 16) })) // a device tag, never a name — mirrors relay/src/relay.js
    .filter((e) => e.d);
  const banDevice = (dev, name, by) => {
    dev = String(dev || '').slice(0, 16); if (!dev) return;
    const prevBan = sess.ban;
    sess.ban = (sess.ban || []).filter((b) => b.d !== dev);
    sess.ban.push({ d: dev }); if (sess.ban.length > BAN_CAP) sess.ban.shift();
    if (!attFitsAll('ban')) sess.ban = prevBan;
    const s = JSON.stringify({ t: 'ban', dev, by: String(by || '').slice(0, 64) });
    for (const c of sess.clients.values()) c.send(s);
    for (const c of sess.clients.values()) if (c.dev === dev) { try { c.close(4004, 'banned'); } catch (e) {} }
    roster();
  };
  const cleanDevList = (list) => (Array.isArray(list) ? list : []).slice(0, 24) // relay/src/relay.js cleanDevList — 24 x 16 chars fits the 2 KB attachment
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
    // Only a room with standing votes (or whose last vote just lapsed) hears
    // the tally: this runs on every close, and an empty tally re-sent to every
    // socket on every close was another per-close broadcast.
    const live = Object.keys(tally).length > 0;
    if (live || sess.votesLive) {
      const s = JSON.stringify({ t: 'votes', tally, need });
      for (const c of occ) c.send(s);
    }
    sess.votesLive = live;
    for (const d in tally) {
      if (tally[d] >= need) {
        const b = JSON.stringify({ t: 'ban', dev: d, by: 'the room (vote)' });
        for (const c of sess.clients.values()) c.send(b);
        for (const c of Array.from(sess.clients.values())) if (c.dev === d) { try { c.close(4007, 'voted-off'); } catch (e) {} }
        roster();
      }
    }
  };
  const routePeer = (from, m) => {
    // no stamp — authority is a signature (docs/meet-security.md §SIG)
    const wrapped = JSON.stringify({ t: 'peer', from, msg: m.msg });
    const dest = sess.clients.get(m.to);
    if (process.env.RELAY_DEBUG) console.log('[route]', new Date().toISOString().slice(11, 23), 'peer', String(from).slice(0, 10), '->', String(m.to).slice(0, 10), dest ? 'DELIVERED' : 'NOSOCK');
    if (dest) { dest.send(wrapped); return; }
    // Explicit no-socket bounce (docs/meet-security.md §FWD): the target holds
    // no socket here (a seated deep seat — R2 greeting scope), so tell the
    // SENDER instead of dropping the frame silently; it falls back to
    // sponsor-forward immediately instead of retrying blind. Leaks nothing the
    // roster doesn't already broadcast (which peers hold sockets). Mirrors
    // relay/src/relay.js routePeer.
    const src = sess.clients.get(from);
    if (src) src.send(JSON.stringify({ t: 'nosock', to: m.to }));
  };
  // ---- greeter registry (R2/R3) — mirrors relay/src/relay.js ----
  // State lives on the CONNECTIONS (occupancy), so it is forgotten when the room
  // empties. The relay holds only H(genesis key) + TTL'd SEALED addresses,
  // gates GENESIS (empty registry ⇒ first knocker founds), and hands newcomers
  // the opaque list. Zero-knowledge — it never holds the meeting-URL key.
  const genesisHash = () => {
    // Mirrors relay.js: the genesis lives only on connections provably ALIVE
    // at the door (unexpired greeter blob, or a knock within one TTL) — a
    // zombie socket must not hold a greeterless room founded forever (E3's
    // reopening clause) — AND, per the ghost-genesis rule, only on a
    // connection that has actually BECOME a greeter, or is a founder still
    // inside its mint grace. THE STALE-REGISTRATION FIX (2026-08-06): the
    // lapsed-greeter window is measured from the registration's EXPIRY, not
    // from the last knock — gblob is never cleared and gseen is refreshed by
    // every blobless knock, so the old rule renewed itself forever and left the
    // room founded-with-an-empty-pool. See relay/src/relay.js for the full
    // statement.
    const now = Date.now();
    for (const c of sess.clients.values()) {
      if (!c.gkh) continue;
      if (c.gblob && (c.gexp || 0) > now) return c.gkh;                      // a registered greeter, live
      if (c.gblob && (c.gexp || 0) + CLAIM_GRACE_MS > now) return c.gkh;     // lapsed — bounded re-register window, measured from EXPIRY (a knock cannot extend it)
      if (!c.gblob && (c.gmint || 0) + MINT_GRACE_MS > now) return c.gkh;    // a founder still taking its seat
    }
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
    const prev = { gkh: c.gkh, gseen: c.gseen, gmint: c.gmint, gblob: c.gblob, gexp: c.gexp };
    const have = genesisHash();
    let founded = false, admitted = false;
    const wasGreeter = isGreeter(c);
    if (!have) { c.gkh = gk ? sha256hex(gk) : null; founded = admitted = !!c.gkh; if (founded) { c.gmint = Date.now(); delete c.gblob; delete c.gexp; } } // empty ⇒ found (R3); a stale blob would hide the mint from genesisHash
    else if (gk && sha256hex(gk) === have) { c.gkh = have; admitted = true; }       // key match ⇒ join pool
    if (c.gkh) c.gseen = Date.now(); // a knock is proof of life — see genesisHash
    if (admitted && gblob) { c.gblob = String(gblob).slice(0, GBLOB_CAP); c.gexp = Date.now() + GREETER_TTL_MS; }
    if (!attFits(attOf(c), 'knock')) {
      // Mirrors relay.js knock: the Worker's saveAtt failed, so nothing is
      // kept, and the reply carries no `admitted` (the client's R3a arm reads
      // admitted:false as a key mismatch and would requeue an honest greeter).
      for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete c[k]; else c[k] = prev[k]; }
      c.send(JSON.stringify({ t: 'greeters', list: greeterList(c), founded: false, error: 'registration too large' }));
      return;
    }
    const list = greeterList(c);
    if (GREETDEBUG) greetLog(sess, parts[1], c, { gk, gblob, have, founded, admitted, listLen: list.length });
    c.send(JSON.stringify({ t: 'greeters', list, founded, admitted }));
    if (wasGreeter !== isGreeter(c)) doorsChanged(isGreeter(c) ? c : null); // the greeter set changed: the new greeter gets the full list, the non-greeters new doors
  };

  // ONE RUNTIME step 6 (mirrors relay/src/relay.js): the app-session star is
  // DELETED — greeter + door only. role=host/client no longer exist.
  if (role !== 'mesh') { rejectConn('the relay is a greeter — app sessions ride the room mesh now'); return; }
  {

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
      sess.pw = av ? null : ((url.searchParams.get('pw') || '').slice(0, 64) || null);
    }
    if (sess.meshToken !== token) { rejectConn('bad room token'); return; } // 1008, as the Worker sends it — the client treats that as fatal
    if (sess.pw && (url.searchParams.get('pw') || '').slice(0, 64) !== sess.pw) { rejectConn('password required'); return; }
    const dev = (url.searchParams.get('dev') || '').slice(0, 16);
    if (!dev) { rejectConn('a device tag is required'); return; } // mirrors relay/src/relay.js
    const rs = (url.searchParams.get('rs') || '').slice(0, 24); // reconnect secret — mirrors relay/src/relay.js
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
      if ((p === peer || (dev && c.dev === dev)) && c.rs && c.rs !== rs) { rejectConn('that id is in use from another device'); return; }
    }
    conn.rs = rs;
    if (!attFits(attOf(Object.assign({ peer, dev, rs }, {})), 'join')) { rejectConn('join state too large'); return; } // the Worker closes 1008 when serializeAttachment throws
    for (const [p, c] of Array.from(sess.clients)) {
      if (p === peer || (dev && c.dev === dev)) {
        sess.clients.delete(p);
        try { c.close(4000, 'replaced'); } catch (e) {} // terminal for the evicted tab — no reconnect ping-pong
        if (p !== peer) toGreeters(JSON.stringify({ t: 'peer-leave', peer: p }));
      }
    }
    conn.peer = peer; sess.clients.set(peer, conn);
    conn.onbinary = (payload) => { allow(payload); }; // metered, never dispatched
    conn.onmessage = async (data) => {
      if (!allow(data)) return;
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (!m || typeof m !== 'object') return; // `null` parses; mirrors relay/src/relay.js
      if (process.env.RELAY_DEBUG) typeRate.set(m.t, (typeRate.get(m.t) || 0) + 1); // what is actually flooding the relay?
      if (m.t === 'peer') routePeer(peer, m);
      else if (m.t === 'knock') knock(conn, String(m.gk || '').slice(0, 128), m.gblob); // (re)register greeter / take-over empty room (R2/R3/R6); gk cut like the URL's
      else if (m.t === 'who') { // PULL the full socket list (admin re-grant, fork observers) — rate-limited per socket
        const nowW = Date.now();
        if (nowW - (conn.whoAt || 0) >= WHO_MIN_MS) { conn.whoAt = nowW; conn.send(fullRosterForPull()); }
      }
      // ({t:'gossip'} fan-out deleted 2026-08-01 — dead; mirrors relay/src/relay.js.)
      else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Signed in admin rooms (§9): the relay verifies the same Ed25519
        // proof any peer would — mirrors relay/src/relay.js.
        let admOrder = null;
        if (sess.av) {
          admOrder = await admProvenGet(sess.av, m.w, 'setpw');
          if (!admOrder || admOrder.pw !== m.pw) { conn.send(JSON.stringify({ t: 'error', error: 'admins only: this room\'s password is managed by its admin' })); return; }
          if (!orderIsNew(sess, 'setpw', admOrder.ts)) return; // replay of an older order — mirrors relay/src/relay.js
          sess.admTs.setpw = +admOrder.ts;
        }
        sess.pw = m.pw.slice(0, 64) || null;
        const s = JSON.stringify({ t: 'pw', pw: sess.pw || '', by: String((admOrder && admOrder.by) || '').slice(0, 64) });
        for (const c of sess.clients.values()) c.send(s);
      } else if ((m.t === 'ban' || m.t === 'unban') && typeof m.dev === 'string') {
        if (!sess.av) return;
        const o = await admProvenGet(sess.av, m.w, m.t);
        if (!o || o.dev !== m.dev) return;
        if (!orderIsNew(sess, 'ban', o.ts)) return;
        sess.admTs.ban = +o.ts;
        const d = m.dev.slice(0, 16);
        if (!d) return;
        const prevBan = sess.ban;
        sess.ban = (sess.ban || []).filter((b) => b.d !== d);
        if (m.t === 'ban') { sess.ban.push({ d }); if (sess.ban.length > BAN_CAP) sess.ban.shift(); }
        if (!attFitsAll(m.t)) sess.ban = prevBan;
        const s = JSON.stringify({ t: m.t, dev: d, by: String(o.by || '').slice(0, 64) });
        for (const c of sess.clients.values()) c.send(s);
        if (m.t === 'ban') for (const c of sess.clients.values()) if (c.dev === d) { try { c.close(4004, 'banned'); } catch (e) {} }
        roster();
      } else if (m.t === 'banlist' && Array.isArray(m.devs)) {
        // Signed re-seed; the SIGNED devs list is authoritative. Re-seed also
        // CUTS any listed device already on a socket — mirrors relay/src/relay.js.
        const o = sess.av ? await admProvenGet(sess.av, m.w, 'banlist') : null;
        if (!o || !Array.isArray(o.devs)) return;
        if (!orderIsNew(sess, 'banlist', o.ts)) return;
        sess.admTs.banlist = +o.ts;
        const prevBan = sess.ban;
        sess.ban = cleanBanList(o.devs);
        if (!attFitsAll('banlist')) sess.ban = prevBan;
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
      if (process.env.RELAY_DEBUG) msgRate.delete(peer);
      toGreeters(JSON.stringify({ t: 'peer-leave', peer })); // the doors' full lists stay exact; nobody else routes on it
      tallyVotes();
      // The blob, not its live TTL (mirrors relay.js cleanup): a lapse sends
      // no door list, so the non-greeters' last list may still name it.
      if (conn.gblob) doorsChanged(null); // a door closed: every non-greeter's door list changes; the greeters heard the leave
      // The registry is occupancy. The Worker forgets a room whose last seat left.
      if (sess.clients.size === 0) sessions.delete(parts[1]);
    };
    conn.send(JSON.stringify({ t: 'joined', peer }));
    conn.send(JSON.stringify({ t: 'whoami', ip })); // tell the socket its own address so it can seal it to peers
    knock(conn, gk, null); // KNOCK at connection (R2/R3): found if empty, else hand back the sealed greeter list
    rosterTo(conn);                                                             // the doors (a connecting socket is never yet a greeter)
    toGreeters(JSON.stringify({ t: 'peer-join', peer, dev: conn.dev || '' })); // and the doors learn it is reachable
  }
});

// Binds 127.0.0.1 by default (every e2e suite is same-host, unchanged). Set
// RELAY_HOST=0.0.0.0 to expose it on the LAN/tailnet for a multi-machine swarm
// (bots on other boxes point --relay ws://<this-box-ip>:PORT).
const HOST = process.env.RELAY_HOST || '127.0.0.1';
// RELAY_DEBUG rate meter: the relay's frame budget (FRAMES_PER_SEC) is only
// defensible against the rate real clients actually need, so measure it rather
// than guess. Every 10s, report each peer's observed msgs/sec.
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
  // The session cap is the experiment knob, not a production bound. Infinity
  // unless RELAY_MAX_SOCKETS is a positive integer (same expression as
  // MAX_SOCKETS_PER_SESSION inside the upgrade handler).
  const sessionCap = parseInt(process.env.RELAY_MAX_SOCKETS || '0', 10) || Infinity;
  const sessionCapText = Number.isFinite(sessionCap) ? String(sessionCap) : 'Infinity';
  if (process.env.RELAY_PROD === '1') console.log('  RELAY_PROD=1 — prod-mirroring abuse guards ON (byte + frame meters per connection, no per-address cap, session cap ' + sessionCapText + ')');
  else console.log('  DEV mode (default) — abuse guards OFF. Set RELAY_PROD=1 to mirror the production caps.');
});
