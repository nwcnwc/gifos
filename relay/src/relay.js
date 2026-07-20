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
 * about a socket (role, peer id, a SALTED IP tag, token, room password) rides
 * in its serialized attachment, which survives eviction but DIES WITH THE
 * CONNECTION — the relay persists nothing, ever. Identity is never in the
 * attachment or the roster in readable form: display NAMES and network
 * ADDRESSES travel end-to-end sealed under the meeting-URL key the relay does
 * not hold, and the stored IP is a salted hash used only for per-IP abuse
 * caps — so the relay routes anonymous peer ids over an encrypted roster it
 * cannot read. A room's token and password
 * are therefore properties of its CURRENT OCCUPANTS: the first arrival to an
 * empty room re-establishes them from their own session, and everyone after
 * that must match the people already inside — except that in an ADMIN room
 * only an admin may (re)establish the password lock, so a non-admin winning
 * the post-eviction race can neither seize nor unlock it. Per-socket rate
 * meters are in-memory and simply start fresh after a wake.
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
 *   mesh   → relay : { t:'gossip', msg:{} }           → every OTHER mesh member as { t:'peer', from, msg }
 *   mesh   → relay : { t:'knock', gk, gblob }         → { t:'greeters', list, founded, admitted } (R2/R3)
 *   relay  → host  : { t:'peer-join'|'peer-leave', peer }
 *   relay  → all   : { t:'roster', peers:[...], names:{...} }
 *   relay  → client: { t:'joined', peer } / { t:'host-gone' } / { t:'error', error }
 *
 * Roles: 'host'/'client' form an app session (host's browser is the server);
 * 'mesh' is a MEETING socket — but a meeting session is NOT the room anymore:
 * it is the stadium's FRONT DOOR (docs/healing-laws.md R2/R3), holding only
 * the greeter pool (Section-1 seats re-knocking on E3) plus knock churn.
 * Room-wide traffic rides the mesh itself (mesh.js gossip over WebRTC);
 * newcomers drop their socket after seating deep. With hibernation, an idle
 * door costs nothing to keep alive.
 */

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// The relay OBSERVES a socket's IP (Cloudflare terminates the connection) but
// must never PERSIST it in readable form: a peer's network address is theirs
// and their room-mates', not something a relay-state dump or log should hand
// out. So the per-IP abuse caps key on a SALTED HASH of the IP, kept in the
// attachment — equality still counts sockets-per-network, but a state breach
// yields opaque tags, not addresses. (A party holding the salt AND the code
// could still brute-force IPv4 — but that party can already log raw IPs, so
// the salt raises the bar exactly against the storage/log-only adversary this
// is meant to stop.) Set ABUSE_SALT in the environment to make it a real
// secret; the default keeps dev and tests working.
async function ipTag(ip, env) {
  const salt = (env && env.ABUSE_SALT) || 'gifos-relay-ip-tag';
  return (await sha256hex(salt + '|' + ip)).slice(0, 24);
}
// A session id "<room>.<verifier>" carries its verifier after the LAST dot —
// hex, 16–64 chars (24 now, legacy 64). ONE derivation, used by BOTH the app
// host gate and the meeting admin check: the id already holds it, so neither
// needs a separate query param. A dotless id or non-hex tail → no verifier.
function verifierOf(sid) {
  const dot = String(sid || '').lastIndexOf('.');
  if (dot <= 0) return '';
  const v = sid.slice(dot + 1);
  return /^[a-f0-9]{16,64}$/.test(v) ? v : '';
}
// AUTHORITY IS A SIGNATURE (docs/meet-security.md §SIG). Privileged mesh orders
// (setpw / ban / unban / banlist in verifier rooms) carry { sp, sig, pub }:
// sp is the exact JSON string the admin signed, sig its Ed25519 signature,
// pub the raw public key (base64). The relay checks the SAME proof any peer
// checks — SHA-256(pub) starts with the room verifier, the signature covers
// sp, the parsed order names the right action and is fresh. No stamp, no
// stored authority, and the admin secret never reaches this code.
async function admProvenGet(av, w, act) {
  try {
    if (!av || !w || typeof w.sp !== 'string' || w.sp.length > 8192 || !w.sig || !w.pub) return null;
    if ((await sha256hex(w.pub)).slice(0, 24) !== String(av).toLowerCase().slice(0, 24)) return null;
    const raw = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
    const pub = await crypto.subtle.importKey('raw', raw(w.pub), 'Ed25519', false, ['verify']);
    if (!(await crypto.subtle.verify('Ed25519', pub, raw(w.sig), new TextEncoder().encode(w.sp)))) return null;
    const o = JSON.parse(w.sp);
    if (o.act !== act) return null;
    if (Math.abs(Date.now() - (+o.ts || 0)) > 300000) return null; // stale order — replay window
    return o;
  } catch (e) { return null; }
}
async function admProven(av, w, act, check) {
  const o = await admProvenGet(av, w, act);
  return !!(o && (!check || check(o)));
}

// Token bucket: a one-time BURST (delivering an App GIF) is fine, but SUSTAINED
// throughput is refilled far below any usable audio/video bitrate.
const BURST_BYTES = 1024 * 1024;        // 1 MB one-time burst (e.g. an App GIF)
const REFILL_BYTES_PER_SEC = 48 * 1024; // ~384 Kbps sustained — below even low-quality video

// Abuse guards (generous for humans, hostile to loops).
// C MUST equal GIFOS_SCALE.C (site/js/gifos-net.js) — the stadium's shape
// constant. A session is one SECTION: C rows of C seats = C² sockets, plus
// C more so the stage can double-home into a full level-1 space. Never a
// client parameter: letting a stranger size a Durable Object is an attack
// vector — this number moves only here, in lockstep with C.
const C = 5;
const MAX_SOCKETS_PER_SESSION = C * C + C; // 30 — Section 1 (the greeter pool) plus knock/churn headroom
const MAX_SOCKETS_PER_IP = 8;       // several devices behind one NAT are fine
const MAX_JOINS_PER_IP_MIN = 120;   // several flapping devices behind one NAT stay fine

// GREETER REGISTRY (healing-laws R2/R3) — the relay's ONE piece of state beyond
// live occupancy. Per session it holds H(genesis key) + a TTL'd list of SEALED
// greeter addresses, BOTH carried in occupant attachments (so they survive
// hibernation and die with the room — nothing is persisted to disk). It is
// zero-knowledge: the relay never holds the meeting-URL key that seals the
// addresses, never sees a coord, a home, or a seat. It gates only GENESIS
// (an empty registry ⇒ the first knocker founds the instance) and hands
// newcomers the sealed list so they can walk into the mesh. Arrival order
// alone decides genesis; the relay arbitrates nothing.
// TTL = the sim's RELAY_TTL (500 ticks) × the canonical 500ms production tick.
// Must exceed the E3 re-knock worst case (E3_PERIOD + jitter = up to 400 ticks
// = 200s), or live greeters would expire off the list between re-knocks.
const GREETER_TTL_MS = 250 * 1000;
const GBLOB_CAP = 4096;             // a sealed greeter address — opaque ciphertext

// Admin-room ban lists ride in socket attachments (2KB serialized cap) —
// keep entries tiny. Plain rooms have NO ban list at all: exclusion there is
// only ever a live MAJORITY of personal vote-offs (see tallyVotes).
const BAN_CAP = 20;
const BAN_NAME = 12;
const cleanBanList = (list) => (Array.isArray(list) ? list : []).slice(0, BAN_CAP)
  .map((e) => ({ d: String((e && e.d) || '').slice(0, 16), n: String((e && e.n) || '').slice(0, BAN_NAME) }))
  .filter((e) => e.d);
// A voter's relay-held vote set: device ids, bounded by room size.
const cleanDevList = (list) => (Array.isArray(list) ? list : []).slice(0, 64)
  .map((d) => String(d || '').slice(0, 16)).filter(Boolean);

// FRAME-rate guard beside the byte guard: tiny frames sail under the byte
// budget forever, but with hibernation EVERY inbound frame wakes (and bills)
// this object — a runaway client loop at 4s cadence is ~21,600 billed wakes a
// day while never touching the byte cap. Joins are legitimately bursty (ICE
// trickle to a full row), so the burst is generous; the sustained rate is far
// above any real gossip pulse and far below a hot loop.
const FRAME_BURST = 600;
const FRAMES_PER_SEC = 3;
const FRAME_STRIKES = 3; // sustained overruns after being told → cut the socket

function makeMeter() { return { tokens: BURST_BYTES, frames: FRAME_BURST, last: Date.now(), warned: false, strikes: 0 }; }
// Returns true if this message must be DROPPED (would overrun a budget).
function overBudget(meter, len) {
  const now = Date.now();
  const dt = (now - meter.last) / 1000;
  meter.tokens = Math.min(BURST_BYTES, meter.tokens + dt * REFILL_BYTES_PER_SEC);
  meter.frames = Math.min(FRAME_BURST, meter.frames + dt * FRAMES_PER_SEC);
  meter.last = now;
  if (len > BURST_BYTES) return true;
  if (meter.tokens >= len && meter.frames >= 1) { meter.tokens -= len; meter.frames -= 1; meter.warned = false; return false; }
  return true;
}

// A comma-list of source IPs (TRUSTED_IPS env var) that BYPASS the PER-IP caps
// — for the operator's OWN load tests, where hundreds of bots share a few
// egress IPs. Unset in normal operation, so the caps apply to everyone. Set it
// only during a rehearsal (`wrangler deploy --var TRUSTED_IPS:"a,b"`), clear it
// after. It never lifts the per-SESSION cap (that's section size, not abuse)
// nor the byte/frame guards — a runaway loop is still cut even from a test box.
function isTrusted(ip, env) {
  if (!env || !env.TRUSTED_IPS) return false;
  return String(env.TRUSTED_IPS).split(',').map((s) => s.trim()).filter(Boolean).includes(ip);
}

export class Session {
  constructor(state, env) {
    this.state = state;
    this.env = env;           // for the TRUSTED_IPS test-mode allowlist
    this.meters = new Map();  // ws -> meter; in-memory, rebuilt after hibernation
    this.joinLog = new Map(); // ip -> [join timestamps]; best-effort, in-memory
    // Edge-answered keepalive: a client-level ping is answered WITHOUT waking
    // (or billing) the hibernated object. Nothing sends {"t":"ping"} today —
    // this guarantees that if anything ever does, it stays free.
    try {
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    } catch (e) { /* older runtime without auto-response — pings just wake us */ }
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
    // The roster the relay AUTHORS is peer IDS only — never names, never
    // network addresses. Identity (name + IP) travels end-to-end SEALED under
    // the meeting-URL key the relay does not hold: clients seal it into their
    // status heartbeat / offer-answer, so the relay stores and broadcasts only
    // ciphertext. A relay-state dump or log yields opaque ids, not a directory
    // of who is on the call. Device tags ARE carried (the relay needs them for
    // ban/vote equality) but they are ROOM-SALTED by the client, so they are
    // per-room opaque tokens — not correlatable to a person or across rooms.
    const peers = [], devs = {};
    let admV = null, ban = null, mesh = false;
    for (const ws of this.members()) {
      const a = this.att(ws);
      peers.push(a.peer);
      if (a.role === 'mesh') mesh = true;
      if (a.dev) devs[a.peer] = a.dev;
      if (!admV && a.av) admV = a.av;
      if (ban === null && a.ban) ban = a.ban;
    }
    const h = this.hostSock();
    const msg = { t: 'roster', peers };
    if (h) msg.epoch = this.att(h).epoch || 0; // clients claim epoch+1 on takeover
    if (mesh) {
      msg.devs = devs; // room-salted device tags, for client-side ban/vote UI
      // No admins[] here anymore: adminship is a SIGNATURE peers verify
      // themselves (docs/meet-security.md §SIG) — the relay neither knows nor says
      // who is an admin. It only still carries the door ban list.
      if (admV) msg.ban = ban || [];
    }
    const s = JSON.stringify(msg);
    if (h) this.send(h, s);
    for (const ws of this.members()) this.send(ws, s);
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.members()) this.send(ws, s);
  }

  // ---- greeter registry (R2/R3): state = occupancy, nothing persisted ----
  // The genesis-key hash is the ROOM-INSTANCE identity: recorded by the first
  // knocker to meet an empty registry, then replicated into every admitted
  // Section-1 seat's attachment. Any live seat carries it; when the last seat
  // leaves it is forgotten and the room reopens for a fresh genesis (R2/R3).
  genesisHash() {
    for (const ws of this.members()) { const g = this.att(ws).gkh; if (g) return g; }
    return null;
  }
  // The sealed greeter list: every unexpired Seal(K,address) blob a Section-1
  // seat has registered, opaque to the relay (sealed under the meeting-URL key
  // it does not hold). The knocker's own blob is excluded — you don't greet
  // yourself. GC is lazy (expiry filtered here); a departed seat's blob leaves
  // with its socket, so the list is naturally the live greeter pool.
  greeterList(exceptWs) {
    const now = Date.now(), out = [];
    for (const ws of this.members()) {
      if (ws === exceptWs) continue;
      const a = this.att(ws);
      if (a.gblob && (a.gexp || 0) > now) out.push(a.gblob);
    }
    return out;
  }
  // Answer a knock. Returns the sealed greeter list ALWAYS (newcomers need it to
  // find the mesh) and decides two flags: `founded` — this knocker met an empty
  // registry and MINTED the genesis instance (R3); `admitted` — its key matches
  // the instance genesis, so its sealed address joins the greeter POOL. Only
  // H(gk) is ever stored/compared, so the relay never learns the key in a form
  // that decrypts anything (the genesis key is an admission token, not the
  // URL seal). The DO is single-threaded, so exactly one knocker can found.
  async knock(ws, gk, gblob) {
    const a = this.att(ws);
    const have = this.genesisHash();
    let founded = false, admitted = false;
    if (!have) {
      a.gkh = gk ? await sha256hex(gk) : null;   // empty registry ⇒ found (R3)
      founded = admitted = !!a.gkh;
    } else if (gk && (await sha256hex(gk)) === have) {
      a.gkh = have; admitted = true;             // matching key ⇒ join the pool
    }
    if (admitted && gblob) {
      a.gblob = String(gblob).slice(0, GBLOB_CAP);
      a.gexp = Date.now() + GREETER_TTL_MS;
    }
    try { ws.serializeAttachment(a); } catch (e) {}
    this.send(ws, { t: 'greeters', list: this.greeterList(ws), founded, admitted });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'client';
    const token = url.searchParams.get('token') || '';
    const peer = (url.searchParams.get('peer') || 'c_' + crypto.randomUUID().slice(0, 8)).slice(0, 64);
    // NOTE: no display name is read here. Participant names travel end-to-end
    // sealed (in status/offer/answer frames the relay only ever sees as
    // ciphertext), so the relay never learns who is in a room by name — even
    // if a client puts a ?name= on the URL, it is ignored and never stored.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    // The session id string, straight from the path (/s/<sid>). An OWNED app
    // session is named "<room>.<verifier>": to hold its HOST slot you must
    // present a secret whose SHA-256 begins with that verifier. The secret lives
    // only in the creator's app — never in the shared link — so a guest holding
    // the link can JOIN but can never take over the host slot and impersonate
    // the app. A plain sid (no dot) is an "anyone-owns" self-healing session:
    // the host slot is epoch-guarded only (a friend may keep it going).
    const sid = (url.pathname.split('/').filter(Boolean)[1] || '');

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
    // 1013 = RFC 6455 "Try Again Later" (the client backs off + retries). The
    // ROOM is never full — deep seats drop their sockets, so a stadium holds
    // billions; it's the relay's bootstrap socket slots that are momentarily
    // saturated by simultaneous joiners.
    if (sockets.length >= MAX_SOCKETS_PER_SESSION) return reject('too many joining right now — try again in a moment', 1013);
    const trusted = isTrusted(ip, this.env); // operator load-test IPs skip the per-IP caps
    const iph = await ipTag(ip, this.env);   // salted tag; the raw IP is never stored
    let mine = 0;
    for (const ws of sockets) if (this.att(ws).iph === iph) mine++;
    if (mine >= MAX_SOCKETS_PER_IP && !trusted) return reject('too many connections from your network', 1013);
    const now = Date.now();
    const log = (this.joinLog.get(ip) || []).filter((t) => now - t < 60000);
    log.push(now);
    this.joinLog.set(ip, log);
    if (log.length > MAX_JOINS_PER_IP_MIN && !trusted) return reject('joining too fast — slow down', 1013);

    if (role === 'host') {
      // OWNED-app gate: if the sid carries a verifier, only the secret's holder
      // may host. Checked here, before the epoch race, so no guest can ever seize
      // the slot regardless of epoch. (A dotless sid skips this — self-healing.)
      const verifier = verifierOf(sid);
      if (verifier) {
        const adm = url.searchParams.get('adm') || '';
        const proven = adm && (await sha256hex(adm)).slice(0, verifier.length) === verifier;
        if (!proven) return reject('this app link is owned — only its creator can host it', 4010);
      }
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
      server.serializeAttachment({ role: 'host', peer: 'host', iph, tok: token, epoch, hostid });
      this.send(server, { t: 'host-ready', epoch });
      for (const ws of this.members()) this.send(server, { t: 'peer-join', peer: this.att(ws).peer });
      this.roster();
    } else if (role === 'mesh') {
      // Host-less ROOM: every participant is equal and the room lives at its
      // URL forever. Its token and password are whatever the CURRENT
      // occupants carry in their attachments — the first person to arrive at
      // an empty room re-establishes them from their own session, and
      // everyone after them has to match. No storage anywhere. (Exception,
      // enforced below: in an ADMIN room only an admin may re-establish the
      // password lock — a non-admin first-arriver can neither seize nor
      // unlock it after an eviction.)
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
      // The verifier comes from the session id itself (…/<room>.<verifier>) —
      // the SAME derivation the app host gate uses, no separate query param.
      // ADMINSHIP IS NOT A JOIN PROPERTY ANYMORE (docs/meet-security.md §SIG): the
      // secret never rides the URL, and no socket is "an admin socket".
      // Privileged orders (setpw/ban/unban/banlist) arrive individually
      // SIGNED by the keypair the admin password seeds; V commits to its
      // public key, and this relay verifies each order exactly like any
      // peer would (admProven below). Nothing claimed, nothing stored.
      const av = verifierOf(sid);
      const offeredPw = url.searchParams.get('pw') || '';
      // The door lock is OCCUPANCY STATE — re-seeded by whoever reconnects
      // FIRST after an eviction. In an ADMIN room only an admin may establish
      // it: a non-admin first-arriver must not be able to seize the room with a
      // rogue password (locking legit members out) OR unlock it. Until an admin
      // sets the lock, an admin room is an open, blurred, self-closing waiting
      // room; when the admin (re)arrives they re-assert it via setpw.
      //
      // Plain rooms (no av) keep first-arriver seeding BY DESIGN — they are the
      // fun-but-safe anarchy tier. A squatter CAN lock one by setting a
      // password, but only at the price of a perpetual bot holding that single
      // room, while an infinity of open rooms stays available. That's a losing
      // trade for the attacker, so it's a feature boundary, not a bug to fix.
      // (Once occupants exist, the lock is read from them, unchanged.)
      // Admin rooms always start LOCKLESS at the door (nobody is an admin at
      // join time now): the admin re-asserts the lock with a SIGNED setpw the
      // moment they see the roster — the same waiting-room doctrine as before,
      // one signed round-trip later. §8 makes this safe: the lock that
      // matters is the ciphertext, not this courtesy gate.
      const roomPw = first ? (first.pw || '') : (av ? '' : offeredPw);
      if (first && roomPw && offeredPw !== roomPw) return reject('password required', 4003);
      const dev = (url.searchParams.get('dev') || '').slice(0, 16);
      const gk = (url.searchParams.get('gk') || '').slice(0, 128); // genesis-key token (R3)
      const ban = first ? (first.ban || []) : [];
      if (dev && ban.some((b) => b.d === dev)) return reject('banned', 4004);
      // STANDING VOTES GATE (plain rooms): every participant carries a
      // personal, global vote-off list; if a MAJORITY of the devices already
      // here (min 2, counting the arriver) have this device on theirs, the
      // door stays shut. One grudge alone never gatekeeps a public room.
      if (!av && dev) {
        const voters = new Set(), pop = new Set([dev]);
        for (const ws of occupants) {
          const a2 = this.att(ws);
          if (a2.dev) pop.add(a2.dev);
          if ((a2.votes || []).includes(dev)) voters.add(a2.dev || a2.peer);
        }
        if (voters.size >= Math.max(2, Math.floor(pop.size / 2) + 1)) return reject('voted-off', 4007);
      }
      // One socket per peer id AND one slot per DEVICE. A reload reuses its peer
      // id (sessionStorage) and swaps cleanly; a NEW tab/session from the same
      // device gets a FRESH peer id but the SAME device id — without this it
      // lingers beside you as a ghost the relay can't tell from a real guest,
      // and a frozen mobile socket may never send a close. Evict any same-device
      // occupant too; its close broadcasts a peer-leave so everyone drops the
      // ghost at once. dev is empty in private mode → fall back to peer-id only.
      for (const ws of occupants) {
        const a = this.att(ws);
        if (a.peer === peer || (dev && a.dev === dev)) { try { ws.close(4000, 'replaced'); } catch (e) {} }
      }
      this.state.acceptWebSocket(server, ['role:mesh', 'peer:' + peer]);
      server.serializeAttachment({ role: 'mesh', peer, iph, tok: token, pw: roomPw, av, dev, ban });
      this.send(server, { t: 'joined', peer });
      // Tell this socket its OWN address (privately, once). The relay can't
      // seal — it lacks the room key — so the client seals its IP into the
      // sealed roster card/heartbeat itself; the relay only ever holds and
      // broadcasts ciphertext. This is the one place an IP crosses the relay,
      // to its rightful owner, and it is never stored.
      this.send(server, { t: 'whoami', ip });
      // KNOCK at connection (R2/R3): found the instance if the registry is
      // empty, else hand back the sealed greeter list. A newcomer presents a
      // throwaway gk and has no address to register yet — it re-knocks with
      // { t:'knock', gk, gblob } once it has taken a Section-1 seat (E3).
      await this.knock(server, gk, null);
      this.roster();
    } else {
      const h = this.hostSock();
      if (!h) return reject('no host for this session', 1011);
      const tok = this.att(h).tok || '';
      if (tok && token !== tok) return reject('bad join token', 1008);
      for (const ws of this.members()) if (this.att(ws).peer === peer) { try { ws.close(4000, 'replaced'); } catch (e) {} }
      this.state.acceptWebSocket(server, ['role:client', 'peer:' + peer]);
      server.serializeAttachment({ role: 'client', peer, iph });
      this.send(server, { t: 'joined', peer });
      this.send(h, { t: 'peer-join', peer });
      this.roster();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- hibernation handlers (the DO may have been asleep between any two) ----
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    let meter = this.meters.get(ws);
    if (!meter) { meter = makeMeter(); this.meters.set(ws, meter); }
    if (overBudget(meter, data.length)) {
      if (!meter.warned) {
        meter.warned = true;
        meter.strikes++;
        this.send(ws, { t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' });
        // A sender that keeps hammering after being told is cut loose: every
        // frame it sends bills a wake whether we act or not, and a 1013 close
        // puts a well-behaved client on its slow retry lane instead of a loop.
        if (meter.strikes >= FRAME_STRIKES) { try { ws.close(1013, 'rate'); } catch (e) {} }
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
      if (m.t === 'peer') this.routePeer(a.peer, m); // signaling only — authority is a signature now (§9), never a stamp
      else if (m.t === 'knock') this.knock(ws, m.gk, m.gblob); // (re)register a greeter / take-over an empty room (R2/R3/R6)
      else if (m.t === 'gossip' && m.msg !== undefined) {
        // Room-wide fan-out of ONE inbound frame, delivered as the ordinary
        // { t:'peer', from } shape so receivers need no new path. The
        // client's status heartbeat is the same sealed envelope for every
        // recipient; per-peer envelopes at section scale (~70 silent roster
        // members × every 4s) both tripped the frame budget above (sockets
        // cut with "control messages only") and billed a wake per member per
        // tick. Fan-out multiplies only OUTBOUND sends, which are unmetered.
        const s = JSON.stringify({ t: 'peer', from: a.peer, msg: m.msg });
        for (const ws2 of this.members()) if (this.att(ws2).peer !== a.peer) this.send(ws2, s);
      } else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Only someone already IN the room can reach this — that's the
        // authorization; in an admin room the order must additionally be
        // SIGNED by the room's admin key (§9) — the relay verifies the same
        // Ed25519 proof any peer would. The new password proof is written
        // into every occupant's attachment (the room's only "memory");
        // empty removes the lock.
        const av2 = this.meshAdmV();
        if (av2 && !(await admProven(av2, m.w, 'setpw', (o) => o.pw === m.pw)))
          return this.send(ws, { t: 'error', error: 'admins only: this room\'s password is managed by its admin' });
        const pw = m.pw.slice(0, 64);
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.pw = pw;
          try { ws2.serializeAttachment(a2); } catch (e) {}
        }
        this.broadcast({ t: 'pw', pw, by: (m.by || '').slice(0, 40) });
      } else if ((m.t === 'ban' || m.t === 'unban') && typeof m.dev === 'string') {
        // Signed admin orders only — verifier rooms are the only rooms with
        // a ban list, and the signature is the entire authority.
        const av2 = this.meshAdmV();
        if (!av2 || !(await admProven(av2, m.w, m.t, (o) => o.dev === m.dev))) return;
        if (m.t === 'ban') this.banDevice(m.dev, m.name, m.by);
        else this.unbanDevice(m.dev, m.name, m.by);
      } else if (m.t === 'votekick' && !this.meshAdmV() && Array.isArray(m.devs)) {
        // Vote-off-the-island: no admin exists to ban bad actors, so the ROOM
        // does it. Each participant carries a PERSONAL, GLOBAL vote-off list
        // in their own browser and syncs the here-relevant slice (device ids)
        // into their attachment. The relay only ever tallies a live majority
        // — there is NO ban list in plain rooms, so no injected "insta-ban"
        // can do more than cast its author's one vote.
        a.votes = cleanDevList(m.devs);
        try { ws.serializeAttachment(a); } catch (e) {}
        this.tallyVotes();
      } else if (m.t === 'banlist' && Array.isArray(m.devs)) {
        // An admin re-arriving to a (possibly re-emptied) admin room re-seeds
        // the ban list from their own device — occupancy memory, no storage.
        // The order must be SIGNED (§9); the SIGNED devs list is the
        // authoritative one. The no-admin window is exactly when a banned
        // device can sneak back in (a fresh DO has an empty list), so the
        // re-seed also CUTS any listed device already on a socket.
        const av2 = this.meshAdmV();
        const o = av2 ? await admProvenGet(av2, m.w, 'banlist') : null;
        if (!o || !Array.isArray(o.devs)) return;
        const ban = cleanBanList(o.devs);
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.ban = ban;
          try { ws2.serializeAttachment(a2); } catch (e) {}
        }
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2);
          if (a2.dev && ban.some((b) => b.d === a2.dev)) { try { ws2.close(4004, 'banned'); } catch (e) {} }
        }
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
  routePeer(from, m) {
    const dest = m.to === 'host' ? this.hostSock() : this.peerSock(m.to);
    if (dest) { this.send(dest, { t: 'peer', from, msg: m.msg }); return; } // no stamp — authority is a signature (§9)
    // Explicit no-socket bounce (docs/meet-security.md §FWD): the target holds
    // no socket here (a seated deep seat — R2 greeting scope), so tell the
    // SENDER instead of dropping the frame silently; it falls back to
    // sponsor-forward immediately instead of retrying blind. Leaks nothing the
    // roster doesn't already broadcast (which peers hold sockets). Mirrors
    // test/servers/relay-local.js routePeer.
    const src = from === 'host' ? this.hostSock() : this.peerSock(from);
    if (src) this.send(src, { t: 'nosock', to: m.to });
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
      if (a2.dev === dev) { try { ws2.close(4004, 'banned'); } catch (e) {} }
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

  // Tally standing votes per DEVICE across occupants, broadcast progress, and
  // boot any device a MAJORITY of the room's devices (min 2) has voted off.
  // Counted by device on BOTH sides — ten tabs are still one voter and one
  // occupant, so nobody manufactures a majority. No list is written anywhere:
  // the votes themselves (each voter's own, carried in their own browser and
  // re-synced wherever they go) ARE the exclusion. Called on each vote sync
  // AND when occupancy changes (a departure can push a target over).
  tallyVotes() {
    if (this.meshAdmV()) return; // admin rooms don't vote-kick
    const occ = this.members();
    const pop = new Set(), votersFor = {};
    for (const s of occ) {
      const a = this.att(s);
      if (a.dev) pop.add(a.dev);
      for (const d of (a.votes || [])) {
        if (!d || d === a.dev) continue; // no self-votes
        (votersFor[d] = votersFor[d] || new Set()).add(a.dev || a.peer);
      }
    }
    const tally = {};
    for (const d in votersFor) tally[d] = votersFor[d].size;
    const need = Math.max(2, Math.floor((pop.size || occ.length) / 2) + 1);
    this.broadcast({ t: 'votes', tally, need });
    for (const d in tally) {
      if (tally[d] >= need) {
        this.broadcast({ t: 'ban', dev: d, name: '', by: 'the room (vote)' });
        for (const s of this.members()) {
          const a2 = this.att(s);
          if (a2.dev === d) { try { s.close(4007, 'voted-off'); } catch (e) {} }
        }
        this.roster();
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
      if (edgeLimited(ip) && !isTrusted(ip, env)) return new Response('rate limited', { status: 429 });
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
