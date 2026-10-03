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
 * about a socket (role, peer id, device tag, token, room password) rides
 * in its serialized attachment, which survives eviction but DIES WITH THE
 * CONNECTION — the relay persists nothing, ever. Identity is never in the
 * attachment or the roster in readable form: display NAMES and network
 * ADDRESSES travel end-to-end sealed under the meeting-URL key the relay does
 * not hold, and no address or address hash is stored at all — so the relay
 * routes anonymous peer ids over an encrypted roster it cannot read. A room's
 * token and password
 * are therefore properties of its CURRENT OCCUPANTS: the first arrival to an
 * empty room re-establishes them from their own session, and everyone after
 * that must match the people already inside — except that in an ADMIN room
 * only an admin may (re)establish the password lock, so a non-admin winning
 * the post-eviction race can neither seize nor unlock it. Per-socket rate
 * meters are in-memory and simply start fresh after a wake.
 *
 * THE RELAY IS A GREETER + DOOR. NOTHING ELSE. (one-runtime flag day,
 * docs/one-runtime.md — the app-session star, its host/client roles, and the
 * gossip fan-out are DELETED. Every room — meeting or app — is a mesh room;
 * room-wide traffic rides the mesh itself over WebRTC, owner-/admin-signed.)
 *
 *   GREETER (R2/R3, docs/healing-laws.md): knock → the sealed greeter list;
 *     founding by arrival order; TTL'd sealed blobs; the relay reads none of it.
 *   DOOR: targeted { t:'peer' } first-contact signaling (sealed), plus the
 *     Ed25519-SIGNED door verbs — setpw / ban / unban / votekick / banlist —
 *     verified here exactly as any peer would (§SIG); the relay stamps nothing.
 *
 * BANDWIDTH GUARD — hard caps on message size and per-connection throughput so
 * nobody can tunnel audio/video through the door. Media is P2P or nothing.
 *
 * ABUSE GUARDS — per CONNECTION, never per network address: the byte meter,
 * the frame meter, and the {t:'who'} pull interval. There is NO per-address
 * cap. Hundreds of people behind one office, campus or carrier NAT share one
 * address, and an attacker just uses more addresses, so a per-address cap
 * locked out the first and never stopped the second (removed 3 Oct 2026).
 *
 * Protocol (all JSON text frames):
 *   mesh → relay : { t:'peer', to:<peer>, msg:{} }  → routed peer↔peer (sealed signaling)
 *   mesh → relay : { t:'knock', gk, gblob }         → { t:'greeters', list, founded, admitted }
 *   mesh → relay : signed door verbs (setpw/ban/unban/votekick/banlist)
 *   mesh → relay : { t:'who' }                      → { t:'roster', scope:'full' } (a pull, rate-limited)
 *   relay → each : { t:'roster', scope, peers:[...] } (opaque ids only): a greeter gets
 *                  scope 'full' (every socket), everyone else 'door' (greeters only)
 *   relay → greeters : { t:'peer-join', peer, dev } / { t:'peer-leave', peer }
 *   relay → one  : { t:'joined' } / { t:'whoami', ip } / { t:'nosock', to } / { t:'error' }
 *
 * A room session is the stadium's FRONT DOOR: it holds only the greeter pool
 * (Section-1 seats re-knocking on E3) plus knock churn; seated members drop
 * their sockets. With hibernation, an idle door costs nothing to keep alive.
 */

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// A key's id is SHA-256 over its RAW bytes (gifos-net.js keyId): base64 is
// not canonical, and hashing the spelling gave one key many ids.
async function keyHex(pubB64) {
  const raw = Uint8Array.from(atob(String(pubB64).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error('not a 32-byte key');
  const d = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// The relay OBSERVES a socket's IP (Cloudflare terminates the connection) but
// never stores it, nor any hash of it: the only use is the one-time whoami
// frame back to that same socket. A peer's network address is theirs and
// their room-mates', not something a relay-state dump or log should hand out.
// Every write of a socket's state goes through here: the platform caps an
// attachment at 2 KB and THROWS past it, and a swallowed throw was a founder
// that recorded nothing (R3), a greeter that silently left the pool. The
// caps above keep a real attachment far under the line; if one still
// overflows, it is logged with the socket's peer id so it can be seen.
function saveAtt(ws, a) {
  try { ws.serializeAttachment(a); return true; }
  catch (e) { console.log('attachment overflow', a && a.peer, String(e && e.message || '').slice(0, 80)); return false; }
}
// A session id "<room>.<verifier>" carries its verifier after the LAST dot —
// hex, 24–64 chars (24 now, legacy 64). ONE derivation, used by BOTH the app
// host gate and the meeting admin check: the id already holds it, so neither
// needs a separate query param. A dotless id or non-hex tail → no verifier.
// The floor is 24 because admProven compares the tail against a 24-char hash
// prefix: a shorter tail could never be administered, only silently refused.
function verifierOf(sid) {
  const dot = String(sid || '').lastIndexOf('.');
  if (dot <= 0) return '';
  const v = sid.slice(dot + 1);
  return /^[a-f0-9]{24,64}$/.test(v) ? v : '';
}
// AUTHORITY IS A SIGNATURE (docs/meet-security.md §SIG). Privileged mesh orders
// (setpw / ban / unban / banlist in verifier rooms) carry { sp, sig, pub }:
// sp is the exact JSON string the admin signed, sig its Ed25519 signature,
// pub the raw public key (base64). The relay checks the SAME proof any peer
// checks — SHA-256(raw pub bytes) starts with the room verifier, the signature covers
// sp, the parsed order names the right action and is fresh. No stamp, no
// stored authority, and the admin secret never reaches this code.
async function admProvenGet(av, w, act) {
  try {
    if (!av || !w || typeof w.sp !== 'string' || w.sp.length > 8192 || !w.sig || !w.pub) return null;
    if ((await keyHex(w.pub)).slice(0, 24) !== String(av).toLowerCase().slice(0, 24)) return null;
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
// REPLAY inside the freshness window: a verified order stays verifiable for
// five minutes, so a member who captured an `unban` could re-send it after a
// later `ban`. Every occupant's attachment carries the newest ts applied per
// act (the room's only memory); an order not newer than that is refused.
function orderIsNew(members, att, act, ts) {
  let last = 0;
  for (const ws of members) { const t = (att(ws).admTs || {})[act]; if (t > last) last = t; }
  return (+ts || 0) > last;
}
function markOrder(members, att, act, ts) {
  for (const ws of members) {
    const a = att(ws); a.admTs = a.admTs || {}; a.admTs[act] = +ts || 0;
    saveAtt(ws, a)
  }
}

// Token bucket: a one-time BURST (delivering an App GIF) is fine, but SUSTAINED
// throughput is refilled far below any usable audio/video bitrate.
const BURST_BYTES = 1024 * 1024;        // 1 MB one-time burst (e.g. an App GIF)
const REFILL_BYTES_PER_SEC = 48 * 1024; // ~384 Kbps sustained — below even low-quality video

// Abuse guards (generous for humans, hostile to loops).
// There is NO per-session socket cap. A meeting that starts at 10:00 is a
// burst of every attendee at once, and the door must take them all. The old
// cap (C²+C = 30) left only C slots beside Section 1's C² permanent greeters,
// and what it really bounded was roster() re-sending EVERY socket to EVERY
// socket on every connect and close — ~N³/3 list entries for a burst of N.
// The roster is now scoped to the doors (see roster()), so a connect or close
// costs O(greeters) sends, and the per-connection meters below bound abuse.
// There is NO per-address cap either (see ABUSE GUARDS in the banner).
const WHO_MIN_MS = 5000;            // one full-roster pull per socket per 5s
const WHO_CACHE_MS = 1000;          // the pulled list is rebuilt at most this often (see fullRosterForPull)

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
const GBLOB_CAP = 1024;             // a sealed greeter address — opaque ciphertext (a real one is ~250 chars; the attachment is 2 KB in all)
// A mint is a PROMISE to greet. A socket that founds the room but never
// registers a greeter blob holds it only this long — see genesisHash's
// ghost-genesis note. Comfortably above a real founder's seat-and-register
// (~1s; 8s worst case behind mesh-wire's reregister throttle) and far below
// the forever the old rule granted. NEVER above GREETER_TTL_MS: a blobless
// claim must be WEAKER than a registered greeter's, never stronger.
const MINT_GRACE_MS = Math.min(60 * 1000, GREETER_TTL_MS);
// How long a genesis claim survives WITHOUT a live greeter registration behind
// it, measured from the registration's EXPIRY. This is E3's re-knock window:
// mesh-wire re-registers on sock.onopen (~1s, worst case its 8s throttle), so
// 60s is generous. It must be measured from a fixed point — see genesisHash;
// the old rule measured from the last KNOCK, which every heartbeat pushed
// forward, so the window never closed.
const CLAIM_GRACE_MS = Math.min(60 * 1000, GREETER_TTL_MS);

// Admin-room ban lists ride in socket attachments (2KB serialized cap) —
// keep entries tiny. Plain rooms have NO ban list at all: exclusion there is
// only ever a live MAJORITY of personal vote-offs (see tallyVotes).
const BAN_CAP = 20;
// A ban entry is a device tag and nothing else. Names never reach the relay
// readable (they travel sealed, end to end) — a banned person's name in the
// attachment and in every roster was the one exception, and it is gone.
const cleanBanList = (list) => (Array.isArray(list) ? list : []).slice(0, BAN_CAP)
  .map((e) => ({ d: String((e && e.d) || '').slice(0, 16) }))
  .filter((e) => e.d);
// A voter's relay-held vote set: device ids, bounded by room size.
const cleanDevList = (list) => (Array.isArray(list) ? list : []).slice(0, 24) // 24 × 16 chars fits the 2 KB attachment beside the rest
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
// A DOOR (a socket in the door set: a Section-1 greeter, or a founder minting)
// answers the whole crowd at the door, so its traffic grows with the burst — one
// door sent ~315 frames/s at the peak of a 500-joiner burst, against a 3/s
// budget, and was cut three times over. Cutting a door mid-burst takes the
// room's registration with it. So a door is metered by BYTES only, on a larger
// bucket, and is NEVER cut: an over-budget frame is dropped (every door frame
// is beat-retried). Becoming a door takes a Section-1 seat under the room's
// genesis key; everyone else keeps the frame meter and the cut.
const DOOR_BURST_BYTES = 4 * BURST_BYTES;
const DOOR_REFILL_BYTES_PER_SEC = 4 * REFILL_BYTES_PER_SEC;

// A socket is a DOOR only while genesisHash() would honour its claim: a live
// registration (or one inside its re-register grace), or a founder's mint
// inside MINT_GRACE_MS. The index keeps lapsed entries (they still carry
// room state), but the bytes-only meter and the never-cut rule are the
// door's and lapse with the claim — a founder that never registers held
// them for the socket's life.
function doorLive(a, now) {
  if (a.gblob) return (a.gexp || 0) + CLAIM_GRACE_MS > now;
  return !!a.gmint && a.gmint + MINT_GRACE_MS > now;
}

function makeMeter() { return { tokens: BURST_BYTES, frames: FRAME_BURST, last: Date.now(), warned: false, strikes: 0 }; }
// Returns true if this message must be DROPPED (would overrun a budget).
function overBudget(meter, len, door) {
  const now = Date.now();
  const dt = (now - meter.last) / 1000;
  const cap = door ? DOOR_BURST_BYTES : BURST_BYTES;
  meter.tokens = Math.min(cap, meter.tokens + dt * (door ? DOOR_REFILL_BYTES_PER_SEC : REFILL_BYTES_PER_SEC));
  meter.frames = Math.min(FRAME_BURST, meter.frames + dt * FRAMES_PER_SEC);
  meter.last = now;
  if (len > cap) return true;
  if (door) { if (meter.tokens >= len) { meter.tokens -= len; return false; } return true; } // bytes only
  if (meter.tokens >= len && meter.frames >= 1) {
    // Strikes count a sustained overrun. A frame bucket that has refilled to
    // FRAME_BURST has been inside the budget, so the count starts over.
    if (meter.frames >= FRAME_BURST) meter.strikes = 0;
    meter.tokens -= len; meter.frames -= 1; meter.warned = false; return false;
  }
  return true;
}

export class Session {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.meters = new Map();  // ws -> meter; in-memory, rebuilt after hibernation
    this.bornAt = Date.now(); // wedge self-heal: age-gates the self-abort below
    this.wedgeStrikes = [];   // timestamps of internal accept-path failures
    this.whoAt = new WeakMap(); // socket -> last full-roster pull (the {t:'who'} rate limit); in-memory, dies with the socket
    this.whoCache = null;     // { at, s }: the full roster as last built for a pull — see fullRosterForPull()
    this._ix = null;          // THE DOOR INDEX — see ix(); null until the first event after a wake
    this._ixed = new WeakSet(); // sockets counted in the index (a close must be un-counted exactly once)
    this._cleaned = new WeakSet(); // sockets cleanup() has run for (a server-side close, then the platform's echo)
    this.votesLive = false;   // did the last tally carry votes? (tallyVotes only re-sends while it does)
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
  members() { return this.all().filter((ws) => this.att(ws).role === 'mesh'); }
  // From the index's peer map, not by scanning every socket's attachment:
  // routePeer runs this for every relayed frame. A miss answers nosock, and the
  // sender falls back to the sponsor path (§FWD) — never a wrong delivery.
  peerSock(peer) { const ws = this.ix().peer.get(peer); return ws && this.open(ws) ? ws : null; }

  // ---- THE DOOR INDEX (in-memory; rebuilt once per wake) ----
  // With no session cap, everything a JOIN touches must cost O(door) or O(1),
  // never O(sockets): the replaced-tab eviction, the vote
  // gate, genesisHash, greeterList, toGreeters and the door roster all used to
  // walk every socket and deserialize its attachment — ~5 million attachment
  // reads for a 1,000-person burst on this single-threaded object (measured
  // locally: a 60 s average wait for an accept). The door set is every socket
  // holding a greeter blob or a founder's mint (at most a few dozen). Hibernation
  // evicts the object but keeps sockets and attachments, so the index is left
  // null by the constructor and rebuilt by ONE scan on the first event after a
  // wake. Dead entries are dropped lazily wherever the door set is walked.
  ix() {
    if (this._ix) return this._ix;
    const ix = { door: new Set(), dev: new Map(), peer: new Map(), voters: new Set(), room: null };
    this._ix = ix;
    for (const ws of this.members()) this.ixAdd(ws, this.att(ws));
    return ix;
  }
  ixAdd(ws, a) {
    const ix = this.ix();
    if (a.gblob || a.gmint) ix.door.add(ws);
    if (a.votes && a.votes.length) ix.voters.add(ws); else ix.voters.delete(ws);
    if (!ix.room) ix.room = ws; // any live occupant carries the room-level state (tok/pw/ban/av)
    if (a.peer) ix.peer.set(a.peer, ws); // the newest socket for an id wins (a reload replaces its old one)
    if (this._ixed.has(ws)) return;
    this._ixed.add(ws);
    if (a.dev) { let set = ix.dev.get(a.dev); if (!set) ix.dev.set(a.dev, (set = new Set())); set.add(ws); }
  }
  ixDel(ws, a) {
    const ix = this._ix;
    if (!ix || !this._ixed.has(ws)) return;
    this._ixed.delete(ws);
    ix.door.delete(ws); ix.voters.delete(ws);
    if (a.peer && ix.peer.get(a.peer) === ws) ix.peer.delete(a.peer);
    if (a.dev) { const set = ix.dev.get(a.dev); if (set) { set.delete(ws); if (!set.size) ix.dev.delete(a.dev); } }
    if (ix.room === ws) ix.room = null;
  }
  doorSocks() { const out = []; for (const ws of this.ix().door) { if (this.open(ws)) out.push(ws); else this.ix().door.delete(ws); } return out; }
  roomSock() {
    const ix = this.ix();
    if (ix.room && this.open(ix.room)) return ix.room;
    ix.room = null;
    for (const ws of this.ix().door) if (this.open(ws)) return (ix.room = ws);
    for (const ws of this.members()) return (ix.room = ws); // rare: no door socket left
    return null;
  }
  send(ws, obj) { try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) {} }

  // THE ROSTER IS SCOPED TO THE DOOR (2026-09-28). A GREETER (a socket holding
  // a registered greeter blob) routes for everyone at the door — §FWD's reverse
  // bootstrap and signaling to newcomers both need to know which joiners hold a
  // socket — so it gets the FULL list once, then peer-join / peer-leave deltas.
  // Everyone else needs only the doors: scope 'door', sent on connect and again
  // only when the greeter set changes. Anyone may PULL the full list with
  // {t:'who'} (the admin re-grant after an eviction, fork observers).
  // A live registration only. The blob stays after gexp so genesisHash can
  // honour the re-register grace, but greeterList does not serve it.
  isGreeter(a) { return !!a.gblob && (a.gexp || 0) > Date.now(); }
  toGreeters(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.doorSocks()) if (this.isGreeter(this.att(ws))) this.send(ws, s);
  }
  rosterTo(ws, full) { this.send(ws, this.rosterMsg(full || this.isGreeter(this.att(ws)))); }
  // The full list for a {t:'who'} pull costs one attachment read per socket.
  // Any socket may pull once per WHO_MIN_MS, and any number of sockets may
  // share one network, so a crowd of pullers made the object rebuild it per pull; it is built at
  // most once per WHO_CACHE_MS and the pulls inside that window share it.
  fullRosterForPull() {
    const now = Date.now();
    if (!this.whoCache || now - this.whoCache.at >= WHO_CACHE_MS) this.whoCache = { at: now, s: this.rosterMsg(true) };
    return this.whoCache.s;
  }
  // The greeter SET changed (a socket registered, or a door closed): every
  // non-greeter gets the new door list; the newly registered greeter alone
  // gets the full list once. Existing greeters hold an exact list already
  // (peer-join / peer-leave deltas), so re-sending it to each of them was
  // O(sockets × greeters) per change — a burst registers its 25 Section-1
  // seats one by one while every attendee is connected.
  doorsChanged(newGreeter) {
    const door = this.rosterMsg(false);
    for (const ws of this.members()) {
      if (ws === newGreeter) this.rosterTo(ws, true);
      else if (!this.isGreeter(this.att(ws))) this.send(ws, door);
    }
  }
  // Every socket, each its own scope: for a ban/lock change (rare) — never on
  // an ordinary connect or close; a greeter-set change is doorsChanged().
  roster() {
    const full = this.rosterMsg(true), door = this.rosterMsg(false);
    this.whoCache = { at: Date.now(), s: full };
    for (const ws of this.members()) this.send(ws, this.isGreeter(this.att(ws)) ? full : door);
  }

  rosterMsg(full) {
    // The roster the relay AUTHORS is peer IDS only — never names, never
    // network addresses. Identity (name + IP) travels end-to-end SEALED under
    // the meeting-URL key the relay does not hold: clients seal it into their
    // status heartbeat / offer-answer, so the relay stores and broadcasts only
    // ciphertext. A relay-state dump or log yields opaque ids, not a directory
    // of who is on the call. Device tags ARE carried (the relay needs them for
    // ban/vote equality) but they are ROOM-SALTED by the client, so they are
    // per-room opaque tokens — not correlatable to a person or across rooms.
    // Room-level state (av/ban/pw) is replicated into EVERY occupant's
    // attachment, so one occupant answers it; the door scope then reads only
    // the door set — never every socket.
    const peers = [], devs = {};
    const rs = this.roomSock(), r = rs ? this.att(rs) : {};
    const mesh = r.role === 'mesh', admV = r.av || null, ban = r.ban || null, lockedPw = r.pw || '';
    for (const ws of (full ? this.members() : this.doorSocks())) {
      const a = this.att(ws);
      if (!full && !this.isGreeter(a)) continue;
      peers.push(a.peer);
      if (a.dev) devs[a.peer] = a.dev;
    }
    const msg = { t: 'roster', scope: full ? 'full' : 'door', peers };
    if (mesh) {
      msg.devs = devs; // room-salted device tags, for client-side ban/vote UI
      // No admins[] here anymore: adminship is a SIGNATURE peers verify
      // themselves (docs/meet-security.md §SIG) — the relay neither knows nor says
      // who is an admin. It only still carries the door ban list.
      if (admV) {
        msg.ban = ban || [];
        // Door-gate state (2026-07-29): in an admin room the gate is set ONLY
        // by a signed setpw, so `locked` tells a client whether the door it
        // just passed VOUCHED for its password proof (gated ⇒ an admin set
        // this) or was open (an unsigned stored password confers nothing).
        // Zero-knowledge: a boolean the door already enforces behaviorally.
        msg.locked = !!lockedPw;
      }
    }
    return JSON.stringify(msg);
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
    // E3's reopening clause, literally: "when all of them fall silent for one
    // TTL, the list empties and the room reopens for a fresh genesis". The
    // genesis therefore lives only on sockets provably ALIVE at the door —
    // holding an unexpired greeter blob, or having KNOCKED within one TTL
    // (gseen; the connect knock stamps it, so a reconnecting member keeps the
    // room through a blip). A ZOMBIE socket — dead phone, unreaped by the
    // network — never knocks again: honoring its stale attachment forever left
    // the room founded-but-greeterless, every knocker holding on the mint gap,
    // the meeting unjoinable by anyone until the socket happened to be reaped
    // (observed live 2026-07-25, room "test", a sleeping phone).
    //
    // THE GHOST GENESIS (observed live 2026-07-29, room "test", a reloading
    // phone alone for ~15 minutes beside two live clients). Proof of life is
    // NOT proof of greeting, and the rule above conflated them. The connect
    // knock is fired for EVERY socket that attaches, carrying `seat.genKey ||
    // myKey` — the client's THROWAWAY key while it is still joining. A client
    // at mesh state 1 or 2 whose socket reconnects into a momentarily-empty
    // registry is therefore handed the mint, but mesh.js:1361 gates taking
    // 0/0.0 on state===0, so it seats nothing and registers no blob
    // (mesh-wire calls this 'empty-founded-noop'). The room's genesis was then
    // H(a key nobody will ever present): no later knock matches, so knock()'s
    // `if (admitted && gblob)` silently dropped every Section-1 seat's E3
    // registration, the surviving blobs expired one TTL later, and the pool
    // stayed EMPTY while `founded` was false for everyone — nobody could even
    // R3/R6 take over. It was ABSORBING, because the one line below
    // ("gseen within a TTL") renewed the claim on every knock the ghost made.
    //
    // So a claim must be CONVERTED. A socket that has never registered a
    // greeter blob holds the room only for MINT_GRACE_MS — long enough for a
    // real founder to take 0/0.0 and register (mesh-wire re-registers on
    // sock.onopen, ~1s, worst case its 8s throttle), far short of forever.
    // Once it lapses the room reopens: the ghost's own next knock re-mints and
    // it finally gets a `founded:true` it can act on, and any member holding
    // the real genesis can found for real. A socket that HAS registered keeps
    // the old TTL rule untouched — that is the E3 re-knock window, and
    // shortening it would re-open the 2026-07-26 room tear.
    // THE STALE-REGISTRATION GENESIS (found 2026-08-06 by
    // test/tools/door-registry-probe.js, 5/5 reproducible; same absorbing shape
    // as the ghost above, reached through a DIFFERENT door). The rule here used
    // to be `a.gblob && a.gseen + GREETER_TTL_MS > now` — "registered before,
    // still knocking". Both halves of that are traps:
    //   * `a.gblob` is NEVER cleared when the registration expires, so "has a
    //     blob" outlives "is a greeter" forever, and
    //   * `a.gseen` is refreshed by EVERY knock (knock() stamps it whenever
    //     a.gkh is set), INCLUDING blobless ones — which is exactly a seat's
    //     state after requeue(): same socket, state 0, knocking every ~10s and
    //     registering nothing.
    // So the window that was meant to be "one TTL to re-register" renewed itself
    // on every heartbeat and never closed. Meanwhile greeterList() below demands
    // `gexp > now`, so that same socket contributed NO blob: the room was
    // founded by a hash nobody would ever present, with an empty pool, and every
    // newcomer got {founded:false, admitted:false, list:[]} forever. Worse, the
    // dead claim RESURRECTED over a legitimate founder that had taken the room
    // while it was briefly lapsed. That is the 2026-07-29 field signature
    // (hold-mint-gap, listLen 0, sealed []) and MINT_GRACE_MS does not cover it —
    // that clause only bounds sockets which NEVER registered.
    //
    // The rule is now the one the ghost fix already taught, applied uniformly:
    // A KNOCK IS PROOF OF LIFE, NEVER PROOF OF GREETING. A genesis claim must be
    // backed by a LIVE registration, or by a bounded grace measured from a fixed
    // point that a heartbeat cannot push forward — the mint for a founder still
    // taking its seat, the EXPIRY for a greeter that has lapsed. E3's re-knock
    // window survives: a real greeter whose blob has just aged out still holds
    // the room for CLAIM_GRACE_MS while it re-registers (mesh-wire re-registers
    // on sock.onopen in ~1s, worst case its 8s throttle), which is what stops the
    // 2026-07-26 room tear. What does not survive is holding it forever without
    // ever greeting anyone again.
    const now = Date.now();
    for (const ws of this.doorSocks()) { // only a greeter blob or a founder's mint can hold the room
      const a = this.att(ws);
      if (!a.gkh) continue;
      if (a.gblob && (a.gexp || 0) > now) return a.gkh;                      // a registered greeter, live
      if (a.gblob && (a.gexp || 0) + CLAIM_GRACE_MS > now) return a.gkh;     // lapsed — a bounded window to re-register, measured from EXPIRY (a knock cannot extend it)
      if (!a.gblob && (a.gmint || 0) + MINT_GRACE_MS > now) return a.gkh;    // a founder still taking its seat
    }
    return null;
  }
  // The sealed greeter list: every unexpired Seal(K,address) blob a Section-1
  // seat has registered, opaque to the relay (sealed under the meeting-URL key
  // it does not hold). The knocker's own blob is excluded — you don't greet
  // yourself. GC is lazy (expiry filtered here); a departed seat's blob leaves
  // with its socket, so the list is naturally the live greeter pool.
  greeterList(exceptWs) {
    const now = Date.now(), out = [];
    for (const ws of this.doorSocks()) {
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
    const wasGreeter = this.isGreeter(a);
    // Hash FIRST, then read the registry: the read→write pair below is then
    // synchronous whatever the digest primitive does, so two knocks cannot
    // both meet an empty registry (R3's single-founder guarantee rests on the
    // DO's single thread, and an await between the read and the write would
    // be a hole in it).
    const gkh = gk ? await sha256hex(gk) : null;
    const have = this.genesisHash();
    let founded = false, admitted = false;
    if (!have) {
      a.gkh = gkh;                               // empty registry ⇒ found (R3)
      founded = admitted = !!a.gkh;
      if (founded) {
        a.gmint = Date.now();                    // the clock the mint must beat (see genesisHash)
        // A founder's claim is its MINT until it registers. A stale blob left
        // from an earlier registration (a requeued seat knocks bloblessly)
        // satisfied none of genesisHash's clauses — the founder was invisible
        // and the next knocker founded too (a fork, the 2026-07-26 shape).
        delete a.gblob; delete a.gexp;
      }
    } else if (gk && gkh === have) {
      a.gkh = have; admitted = true;             // matching key ⇒ join the pool
    }
    if (a.gkh) a.gseen = Date.now(); // a knock is proof of life — see genesisHash
    if (admitted && gblob) {
      a.gblob = String(gblob).slice(0, GBLOB_CAP);
      a.gexp = Date.now() + GREETER_TTL_MS;
    }
    if (!saveAtt(ws, a)) {
      // Nothing was written. Do not index the copy in hand, and do not tell
      // the client the registration landed. Both would publish a door the
      // attachment does not hold. No `admitted` either: the client's R3a arm
      // reads admitted:false as a genesis-key mismatch and requeues after
      // three, so a full attachment must give no key verdict at all.
      this.send(ws, { t: 'greeters', list: this.greeterList(ws), founded: false, error: 'registration too large' });
      return;
    }
    this.ixAdd(ws, a); // a blob or a founder's mint puts this socket in the door set
    this.send(ws, { t: 'greeters', list: this.greeterList(ws), founded, admitted });
    const nowGreeter = this.isGreeter(this.att(ws));
    if (wasGreeter !== nowGreeter) this.doorsChanged(nowGreeter ? ws : null); // the greeter set changed: the new greeter gets the full list, the non-greeters new doors
  }

  // WEDGE SELF-HEAL (2026-07-26, field incident): a Durable Object can wedge
  // — every NEW websocket accept throws ("Network connection lost.") while
  // the established hibernated sockets keep working. The room's door was
  // dead for an hour: every newcomer stranded or fragmented, the seated room
  // never noticed, and only a manual same-code redeploy (which restarts the
  // object) fixed it. The object now performs that restart ITSELF: repeated
  // internal failures on the accept path call state.abort(); the platform
  // re-instantiates fresh on the next request, and hibernatable sockets +
  // their greeter attachments SURVIVE — the seated room never blips.
  // Guards against abort-looping: a young object (<60s) never aborts (a
  // failure that early is more likely our own bug on a poisoned input), and
  // it takes two strikes inside 60s so one transient hiccup restarts nobody.
  wedgeStrike(e) {
    // An attachment that will not serialize is a bounds problem on one
    // socket's input, never a wedged object; it must not be able to earn
    // the restart that exists for platform failures.
    if (e && /attachment/i.test(String(e.message || ''))) return;
    // A ReferenceError or TypeError is this code tripping on an input, not
    // the platform refusing an accept: it must not earn the restart either.
    if (e instanceof ReferenceError || e instanceof TypeError) return;
    const now = Date.now();
    this.wedgeStrikes = (this.wedgeStrikes || []).filter((t) => now - t < 60000);
    this.wedgeStrikes.push(now);
    console.log('wedge-strike', String(e && e.message).slice(0, 100), 'n=' + this.wedgeStrikes.length);
    if (this.wedgeStrikes.length >= 2 && now - (this.bornAt || 0) > 60000) {
      console.log('wedge-abort: restarting this session object');
      try { this.state.abort('wedged accept path'); } catch (e2) { /* abort() never returns normally */ }
    }
  }
  async fetch(request) {
    try { return await this.fetchInner(request); }
    catch (e) { this.wedgeStrike(e); throw e; }
  }
  async fetchInner(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const role = url.searchParams.get('role') || 'client';
    // Every query value that lands in the socket attachment is bounded: the
    // attachment is capped at 2 KB by the platform, and serializeAttachment
    // THROWS past it — after acceptWebSocket, i.e. with a live socket that
    // carries no role. The client sends a 24-hex token and a 64-hex proof.
    const token = (url.searchParams.get('token') || '').slice(0, 64);
    const peer = (url.searchParams.get('peer') || 'c_' + crypto.randomUUID().slice(0, 8)).slice(0, 64);
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    // Reject without hibernating: accept plainly, explain, close. Declared
    // before ANY refusal: a `const` read before its line throws
    // (ReferenceError), the throw lands in fetch()'s wedge counter, and two
    // dev-less upgrades restarted the room object (2026-10-03).
    const reject = (error, code) => {
      server.accept();
      try { server.send(JSON.stringify({ t: 'error', error })); server.close(code, error.slice(0, 120)); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    };
    // The DEVICE TAG (room-salted by the client) is what a ban, a vote-off
    // and the one-slot-per-device rule key on; a socket without one was
    // unbannable and un-vote-off-able by construction. mesh-wire always
    // sends one (an ephemeral one without storage), so none means a
    // hand-made client that wants the door's exclusion verbs not to apply.
    const dev = (url.searchParams.get('dev') || '').slice(0, 16);
    if (!dev) return reject('a device tag is required', 4012); // reject is declared ABOVE: an early return here must never throw
    // The RECONNECT SECRET: a per-device token hashed with the room by the
    // client (mesh-wire.js). Replacing a socket that holds the same peer
    // id or device tag is a reload's right and a ghost's cure — but both
    // ids are broadcast in every roster, so without this any link holder
    // could connect as anyone and have them cut with a fatal 4000. A
    // socket that presented one may only be replaced by a socket that
    // presents the same one; a socket that presented none (no storage,
    // an older client) is replaced as before.
    const rs = (url.searchParams.get('rs') || '').slice(0, 24);
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

    // No per-address guard here: many people share one address behind a NAT.
    // The per-connection meters (webSocketMessage) bound what each socket costs.

    // ONE RUNTIME (docs/one-runtime.md step 6): the app-session STAR is DELETED.
    // The relay is a GREETER + DOOR for mesh rooms and nothing else — app state
    // rides each room's own mesh, owner-signed. role=host / role=client no
    // longer exist; any straggler is told so and cut.
    if (role !== 'mesh') return reject('the relay is a greeter — app sessions ride the room mesh now', 4010);
    {

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
      // /meet/<room>/<V> link everyone shares — the session id is the
      // room+V composite, so /meet/<room> is a DIFFERENT room that can
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
      const roomWs = this.roomSock();
      const first = roomWs ? this.att(roomWs) : null;
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
      const offeredPw = (url.searchParams.get('pw') || '').slice(0, 64);
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
      const gk = (url.searchParams.get('gk') || '').slice(0, 128); // genesis-key token (R3)
      const ban = first ? (first.ban || []) : [];
      if (dev && ban.some((b) => b.d === dev)) return reject('banned', 4004);
      // STANDING VOTES GATE (plain rooms): every participant carries a
      // personal, global vote-off list; if a MAJORITY of the devices already
      // here (min 2, counting the arriver) have this device on theirs, the
      // door stays shut. One grudge alone never gatekeeps a public room.
      if (!av && dev && this.ix().voters.size) { // only sockets with standing votes can shut the door
        const voters = new Set();
        for (const ws of this.ix().voters) {
          if (!this.open(ws)) continue;
          const a2 = this.att(ws);
          if ((a2.votes || []).includes(dev)) voters.add(a2.dev || a2.peer);
        }
        const pop = this.ix().dev.size + (this.ix().dev.has(dev) ? 0 : 1); // devices present, counting the arriver
        if (voters.size >= Math.max(2, Math.floor(pop / 2) + 1)) return reject('voted-off', 4007);
      }
      // One socket per peer id AND one slot per DEVICE. A reload reuses its peer
      // id (sessionStorage) and swaps cleanly; a NEW tab/session from the same
      // device gets a FRESH peer id but the SAME device id — without this it
      // lingers beside you as a ghost the relay can't tell from a real guest,
      // and a frozen mobile socket may never send a close. Evict any same-device
      // occupant too; its close broadcasts a peer-leave so everyone drops the
      // ghost at once. dev is empty in private mode → fall back to peer-id only.
      const evict = [];
      const cands = new Set();
      const same = this.ix().peer.get(peer); if (same) cands.add(same);
      for (const ws of (this.ix().dev.get(dev) || [])) cands.add(ws);
      for (const ws of cands) {
        if (!this.open(ws)) continue;
        const a = this.att(ws);
        if (a.peer === peer || (dev && a.dev === dev)) {
          if (a.rs && a.rs !== rs) return reject('that id is in use from another device', 4011);
          evict.push(ws);
        }
      }
      for (const ws of evict) {
        const old = this.att(ws);
        try { ws.close(4000, 'replaced'); } catch (e) {}
        this.cleanup(ws, { leave: old.peer !== peer, tally: false }); // a reload keeps its id: no departure to announce
      }
      this.state.acceptWebSocket(server, ['role:mesh', 'peer:' + peer]);
      try { server.serializeAttachment({ role: 'mesh', peer, tok: token, pw: roomPw, av, dev, ban, rs }); }
      catch (e) { try { server.close(1008, 'join state too large'); } catch (e2) {} return new Response(null, { status: 101, webSocket: client }); }
      this.ixAdd(server, this.att(server));
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
      this.rosterTo(server);                                  // the doors (a connecting socket is never yet a greeter)
      this.toGreeters({ t: 'peer-join', peer, dev: dev || '' }); // and the doors learn it is reachable
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- hibernation handlers (the DO may have been asleep between any two) ----
  async webSocketMessage(ws, data) {
    // Meter BEFORE the type check: a binary frame bills a wake like any
    // other and would otherwise ride unmetered and unstruck forever.
    let meter = this.meters.get(ws);
    if (!meter) { meter = makeMeter(); this.meters.set(ws, meter); }
    const size = typeof data === 'string' ? data.length : ((data && data.byteLength) || 0);
    const a = this.att(ws);
    const door = this.ix().door.has(ws) && doorLive(a, Date.now());
    if (overBudget(meter, size, door)) {
      if (door) return; // dropped, never warned or cut — see DOOR_BURST_BYTES
      if (!meter.warned) {
        meter.warned = true;
        meter.strikes++;
        this.send(ws, { t: 'error', error: 'relay is for control messages only — stream media peer-to-peer (WebRTC)' });
        // A sender that keeps hammering after being told is cut loose: every
        // frame it sends bills a wake whether we act or not, and a 1013 close
        // puts a well-behaved client on its slow retry lane instead of a loop.
        if (meter.strikes >= FRAME_STRIKES) { try { ws.close(1013, 'rate'); } catch (e) {} this.cleanup(ws); }
      }
      return;
    }
    if (typeof data !== 'string') return;
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== 'object') return; // `null` parses; (null).t throws
    if (a.role === 'mesh') {
      if (m.t === 'peer') this.routePeer(a.peer, m); // signaling only — authority is a signature now (§9), never a stamp
      else if (m.t === 'knock') this.knock(ws, String(m.gk || '').slice(0, 128), m.gblob); // (re)register a greeter / take-over an empty room (R2/R3/R6); gk cut like the URL's
      else if (m.t === 'who') { // PULL the full socket list — rate-limited per socket (in-memory: a hibernation wake forgets it, harmlessly)
        const now = Date.now(), last = this.whoAt.get(ws) || 0;
        if (now - last >= WHO_MIN_MS) { this.whoAt.set(ws, now); this.send(ws, this.fullRosterForPull()); }
      }
      // ({ t:'gossip' } fan-out DELETED 2026-08-01 — dead since mesh gossip
      // moved onto WebRTC (mesh.js over DataChannels); no client sends it.
      // Roadmap §7 step 1: the relay shrinks toward greeter + door.)
      else if (m.t === 'setpw' && typeof m.pw === 'string') {
        // Only someone already IN the room can reach this — that's the
        // authorization; in an admin room the order must additionally be
        // SIGNED by the room's admin key (§9) — the relay verifies the same
        // Ed25519 proof any peer would. The new password proof is written
        // into every occupant's attachment (the room's only "memory");
        // empty removes the lock.
        const av2 = this.meshAdmV();
        let admOrder = null;
        if (av2) {
          admOrder = await admProvenGet(av2, m.w, 'setpw');
          if (!admOrder || admOrder.pw !== m.pw) return this.send(ws, { t: 'error', error: 'admins only: this room\'s password is managed by its admin' });
          if (!orderIsNew(this.members(), (s) => this.att(s), 'setpw', admOrder.ts)) return; // a replay of an older order
          markOrder(this.members(), (s) => this.att(s), 'setpw', admOrder.ts);
        }
        const pw = m.pw.slice(0, 64);
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.pw = pw;
          saveAtt(ws2, a2)
        }
        this.broadcast({ t: 'pw', pw, by: String((admOrder && admOrder.by) || '').slice(0, 64) }); // a peer id in admin rooms, empty in plain ones — never a name
      } else if ((m.t === 'ban' || m.t === 'unban') && typeof m.dev === 'string') {
        // Signed admin orders only — verifier rooms are the only rooms with
        // a ban list, and the signature is the entire authority.
        const av2 = this.meshAdmV();
        if (!av2) return;
        const o = await admProvenGet(av2, m.w, m.t);
        if (!o || o.dev !== m.dev) return;
        // ban and unban share one clock: an old unban must not undo a newer ban.
        if (!orderIsNew(this.members(), (s) => this.att(s), 'ban', o.ts)) return;
        markOrder(this.members(), (s) => this.att(s), 'ban', o.ts);
        if (m.t === 'ban') this.banDevice(m.dev, o.by);
        else this.unbanDevice(m.dev, o.by);
      } else if (m.t === 'votekick' && !this.meshAdmV() && Array.isArray(m.devs)) {
        // Vote-off-the-island: no admin exists to ban bad actors, so the ROOM
        // does it. Each participant carries a PERSONAL, GLOBAL vote-off list
        // in their own browser and syncs the here-relevant slice (device ids)
        // into their attachment. The relay only ever tallies a live majority
        // — there is NO ban list in plain rooms, so no injected "insta-ban"
        // can do more than cast its author's one vote.
        a.votes = cleanDevList(m.devs);
        saveAtt(ws, a)
        this.ixAdd(ws, a); // joins or leaves the voter set
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
        if (!orderIsNew(this.members(), (s) => this.att(s), 'banlist', o.ts)) return;
        markOrder(this.members(), (s) => this.att(s), 'banlist', o.ts);
        const ban = cleanBanList(o.devs);
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2); a2.ban = ban;
          saveAtt(ws2, a2)
        }
        for (const ws2 of this.members()) {
          const a2 = this.att(ws2);
          if (a2.dev && ban.some((b) => b.d === a2.dev)) { try { ws2.close(4004, 'banned'); } catch (e) {} this.cleanup(ws2, { tally: false }); }
        }
        this.roster();
      }
    }
  }

  // Route a peer-addressed message to the named peer (or 'host'), tagged with
  // sender — and, in admin rooms, with a relay-verified admin stamp receivers
  // can trust (clients themselves can't prove adminship to each other).
  routePeer(from, m) {
    const dest = this.peerSock(m.to);
    if (dest) { this.send(dest, { t: 'peer', from, msg: m.msg }); return; } // no stamp — authority is a signature (§9)
    // Explicit no-socket bounce (docs/meet-security.md §FWD): the target holds
    // no socket here (a seated deep seat — R2 greeting scope), so tell the
    // SENDER instead of dropping the frame silently; it falls back to
    // sponsor-forward immediately instead of retrying blind. Leaks nothing the
    // roster doesn't already broadcast (which peers hold sockets). Mirrors
    // test/servers/relay-local.js routePeer.
    const src = this.peerSock(from);
    if (src) this.send(src, { t: 'nosock', to: m.to });
  }

  // Is this an admin room? The verifier rides in every occupant's attachment
  // (it's part of the room identity they all connected with).
  meshAdmV() {
    const r = this.roomSock(); // av is replicated into every occupant's attachment
    return r ? (this.att(r).av || null) : null;
  }

  // Ban a device: written into every occupant's attachment (occupancy memory),
  // announced, and any matching non-admin socket is cut. Shared by admin bans
  // and consensus vote-kicks.
  banDevice(dev, by) {
    dev = String(dev || '').slice(0, 16);
    if (!dev) return;
    const entry = { d: dev };
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2);
      const ban = (a2.ban || []).filter((b) => b.d !== dev);
      ban.push(entry); if (ban.length > BAN_CAP) ban.shift(); // attachments cap at 2KB — keep it tiny
      a2.ban = ban;
      saveAtt(ws2, a2)
    }
    // `by` is the signed order's author — a PEER ID, which every member
    // resolves to a name from its own sealed roster; the relay carries no name.
    this.broadcast({ t: 'ban', dev, by: String(by || '').slice(0, 64) });
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2);
      if (a2.dev === dev) { try { ws2.close(4004, 'banned'); } catch (e) {} this.cleanup(ws2, { tally: false }); }
    }
    this.roster();
  }
  unbanDevice(dev, by) {
    dev = String(dev || '').slice(0, 16);
    if (!dev) return;
    for (const ws2 of this.members()) {
      const a2 = this.att(ws2); a2.ban = (a2.ban || []).filter((b) => b.d !== dev);
      saveAtt(ws2, a2)
    }
    this.broadcast({ t: 'unban', dev, by: String(by || '').slice(0, 64) });
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
    if (!this.ix().voters.size && !this.votesLive) return; // no standing votes: nothing to tally (this runs on every close)
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
    // Only a room with standing votes (or whose last vote just lapsed) hears
    // the tally: this runs on every close, and an empty tally re-sent to every
    // socket on every close was another per-close broadcast. votesLive is
    // in-memory — a hibernation wake can cost one redundant empty tally.
    const live = Object.keys(tally).length > 0;
    if (live || this.votesLive) this.broadcast({ t: 'votes', tally, need });
    this.votesLive = live;
    for (const d in tally) {
      if (tally[d] >= need) {
        this.broadcast({ t: 'ban', dev: d, by: 'the room (vote)' });
        for (const s of this.members()) {
          const a2 = this.att(s);
          if (a2.dev === d) { try { s.close(4007, 'voted-off'); } catch (e) {} this.cleanup(s, { tally: false }); } // tallying is what runs this
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
  // Runs once per socket: at once after a close THIS object makes (replaced,
  // banned, voted-off, rate), and from the platform's close callback for a
  // close the client makes. Whether the platform echoes a server-side close
  // into webSocketClose is not relied on: the greeters' lists, the door
  // index and the meters must not wait on it. opts.leave=false: the peer id
  // is still present (a reload); opts.tally=false: the caller tallies.
  cleanup(ws, opts) {
    this.meters.delete(ws);
    if (this._cleaned.has(ws)) return;
    this._cleaned.add(ws);
    const a = this.att(ws);
    if (!a.role) return;
    this.ixDel(ws, a);
    // A reconnecting peer reuses its id; if a NEWER socket already replaced
    // this one, this stale close must not announce a departure.
    const cur = this.ix().peer.get(a.peer);
    if (cur && cur !== ws && this.open(cur)) return;
    if (a.role === 'mesh' && (!opts || opts.leave !== false)) this.toGreeters({ t: 'peer-leave', peer: a.peer }); // the doors' full lists stay exact; nobody else routes on it
    if (a.role === 'mesh' && (!opts || opts.tally !== false)) this.tallyVotes();
    // The blob, not its live TTL: a lapse sends no door list, so the
    // non-greeters' last list still names a lapsed greeter until this close.
    if (a.gblob) this.doorsChanged(null); // a door closed: every non-greeter's door list changes; the greeters heard the leave
  }
}

// Which sites may use this relay. A browser sets Origin itself and page JS
// CANNOT forge or override it, so this reliably shuts out random websites
// freeloading on the relay as a free message bus. It is NOT a defense against
// non-browser clients (curl can send any Origin) — the per-connection byte
// and frame meters handle those. Configure via the ALLOWED_ORIGINS env var (comma-list of
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
      const id = env.SESSION.idFromName(parts[1]);
      return env.SESSION.get(id).fetch(request);
    }
    return new Response('not found', { status: 404 });
  },
};
