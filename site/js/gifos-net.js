/*
 * gifos-net.js — the shared transport fabric for GifOS multiplayer.
 *
 * BOTH session shapes ride this one module: app sessions (run.html /
 * runtime.js — a host browser serving clients) and meetings (meet.html — a
 * host-less mesh). It owns everything that is about MOVING BYTES, so the two
 * never fork on transport behavior again:
 *
 *   - steadySocket : the self-healing relay WebSocket (backoff, queue,
 *     visibility/online kicks)
 *   - sendChunked / makeDefrag : one framing layer — any message bigger than
 *     a transport frame fragments into {t:'frag'} pieces and reassembles on
 *     the far side, over the relay or a DataChannel alike
 *   - derive* / seal / open : the DERIVE-DON'T-SEND scheme (below)
 *   - fwd envelopes : the single-hop peer-forwarding primitive (P1)
 *
 * PATHS. Every message class travels an ordered path list:
 *   P0 — a direct WebRTC DataChannel to the destination
 *   P1 — one hop THROUGH A FRIEND'S browser ({t:'fwd'} over two DataChannels)
 *   P2 — the relay WebSocket (bandwidth-capped control plane)
 * Which classes may use which paths is policy in the CALLER (join: db and the
 * app GIF go P0→P1→P2; meet: chat goes P0→P1→P2, media and file bodies go
 * P0→P1 and NEVER the relay). The fabric provides the rungs; the sessions
 * pick the ladder.
 *
 * DERIVE, DON'T SEND. The invite link carries a secret the relay must never
 * learn. Everything the relay needs is a ONE-WAY DERIVATION of that secret:
 * the session id it routes on and the token it equality-checks are SHA-256
 * outputs, and the end-to-end AES-GCM key is derived from the same secret and
 * sent NOWHERE. The relay can gate and route exactly as before while every
 * content frame it carries is ciphertext. Anyone holding the link derives the
 * key offline — late joiners and P2P-less peers need no key exchange at all,
 * which is exactly when the relay path (P2) matters. A friend forwarding P1
 * frames carries ciphertext too.
 *
 * The derivation is versioned (DS tag). Changing it is a deliberate flag day:
 * old and new clients would land in different relay sessions for the "same"
 * link. That is by design — we do not negotiate crypto downward.
 */
(function (root) {
  'use strict';
  const GifOS = (root.GifOS = root.GifOS || {});

  // ---- WebRTC availability + ICE --------------------------------------------
  // No TURN server anywhere: P1 (a friend) and P2 (the relay, for control
  // classes only) are the fallbacks. Media gets a friend or nothing.
  const ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  const hasP2P = () => typeof root.RTCPeerConnection === 'function';

  // Browsers FREEZE hidden tabs after a few minutes (Chrome's Page Lifecycle),
  // suspending ALL JS — fatal for a live session. Holding a Web Lock is the
  // documented opt-out (and costs nothing); it releases when the tab closes.
  let sessionLockHeld = false;
  function holdSessionLock() {
    if (sessionLockHeld) return;
    sessionLockHeld = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request)
        navigator.locks.request('gifos-live-session', () => new Promise(() => {}));
    } catch (e) { /* unsupported — reconnect machinery still covers recovery */ }
  }

  // ---- the self-healing relay socket ----------------------------------------
  // Exponential-backoff reconnect (instant on tab-visible/online — the
  // "glanced at another app" case), an outbound queue while down, and a stable
  // facade so callers wire handlers exactly once. makeUrl() is re-evaluated on
  // every (re)connect, so rotated credentials (a new password proof, an admin
  // key) ride the next attempt automatically.
  function steadySocket(makeUrl) {
    const s = { onmessage: null, onstate: null, onopen: null, state: 'connecting', downSince: Date.now(), rejected: 0 };
    let ws = null, closed = false, attempt = 0, timer = null, slow = false;
    const queue = [];
    // Close-code policy — the relay is BILLED for every wake, so reconnects are
    // never free. A POLICY rejection (bad token, wrong password, banned, voted
    // off, replaced by a newer socket, stale/owned host slot) can never succeed
    // by retrying with the same credentials: blind retries are a forever-loop
    // (a banned tab left open overnight ≈ 17k billed wakes; two tabs of one
    // room evicting each other never stops). Those STOP — s.rejected holds the
    // code, and only an explicit s.kick() (the app changed something: new
    // password, deliberate re-join) re-arms. CROWD codes (full / rate-limited /
    // no host yet) keep retrying on a longer leash.
    const FATAL_CLOSES = [1008, 4000, 4001, 4003, 4004, 4007, 4008, 4009, 4010];
    const SLOW_CLOSES = [1011, 1013];
    const setState = (st) => {
      if (s.state === st) return;
      s.state = st;
      if (st === 'up') s.downSince = null;
      else if (!s.downSince) s.downSince = Date.now();
      if (s.onstate) s.onstate(st);
    };
    function connect() {
      if (closed) return;
      let sock;
      try { sock = new WebSocket(makeUrl()); } catch (e) { schedule(); return; }
      ws = sock;
      // Connect watchdog: some stacks never follow a failed CONNECT with a
      // close event — the attempt would wedge in CONNECTING forever and pin
      // the in-flight guard. If the socket isn't OPEN by the deadline, abandon
      // it and let backoff govern.
      const born = setTimeout(() => {
        if (ws !== sock || sock.readyState === 1) return;
        ws = null;
        try { sock.onerror = null; sock.close(); } catch (e) { /* already dead */ }
        setState('down');
        schedule();
      }, 8000);
      sock.onopen = () => {
        clearTimeout(born);
        if (closed || ws !== sock) return;
        attempt = 0;
        slow = false;
        setState('up');
        for (const frame of queue.splice(0)) { try { sock.send(frame); } catch (e) { /* re-dropped */ } }
        if (s.onopen) s.onopen();
      };
      sock.onmessage = (ev) => { if (ws === sock && s.onmessage) s.onmessage(ev); };
      sock.onclose = (ev) => {
        clearTimeout(born);
        if (ws !== sock) return;
        ws = null;
        const code = ev && ev.code;
        if (FATAL_CLOSES.indexOf(code) >= 0) s.rejected = code;
        else if (SLOW_CLOSES.indexOf(code) >= 0) slow = true;
        setState('down');
        schedule();
      };
      // onerror is deliberately PASSIVE: browsers always follow it with a
      // close event (which carries the code the policy above reads), and on
      // stacks that don't, the watchdog reaps the attempt. Never call close()
      // here — some stacks re-dispatch error from inside close() on a
      // CONNECTING socket and recurse forever.
      sock.onerror = () => {};
    }
    function schedule() {
      if (closed || s.rejected || timer) return;
      // Backoff cap by context: snappy while someone is looking, patient when
      // the tab is hidden (an overnight background tab must not knock every
      // few seconds), extra patient when the relay itself said "not now".
      const hidden = typeof document !== 'undefined' && document.hidden;
      const cap = hidden ? 60000 : slow ? 15000 : 5000;
      const delay = Math.min(cap, 500 * Math.pow(2, attempt++)) * (0.7 + Math.random() * 0.6);
      timer = setTimeout(() => { timer = null; connect(); }, delay);
    }
    const kick = (force) => {
      if (closed || (s.rejected && !force)) return; // a policy-rejected socket stays down until the app re-arms it
      if (force) s.rejected = 0;
      if (ws && ws.readyState <= 1) return;
      if (timer) { clearTimeout(timer); timer = null; }
      attempt = 0;
      connect();
    };
    const wake = () => kick(false);
    if (root.addEventListener) { root.addEventListener('online', wake); root.addEventListener('pageshow', wake); }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
      document.addEventListener('resume', wake); // Page Lifecycle: tab just unfroze
    }
    s.send = (data) => {
      if (closed) return;
      if (typeof data !== 'string') data = JSON.stringify(data);
      if (ws && ws.readyState === 1) { try { ws.send(data); return; } catch (e) { /* fell through to queue */ } }
      queue.push(data);
      if (queue.length > 500) queue.shift();
      // Wake a sleeping socket, but NEVER cancel a scheduled backoff: a periodic
      // sender (the meeting heartbeat) must not turn exponential backoff into a
      // fixed-cadence reconnect hammer against a down or rejecting relay.
      if (!timer) kick(false);
    };
    s.kick = () => kick(true); // app-layer re-arm after a credential/intent change
    s.close = () => { closed = true; if (timer) { clearTimeout(timer); timer = null; } try { if (ws) ws.close(); } catch (e) { /* fine */ } };
    s._raw = () => ws; // test hook: lets the e2e suite yank the live socket
    connect();
    (root.__gifosConns = root.__gifosConns || []).push(s);
    return s;
  }

  // ---- transport fragmentation ----------------------------------------------
  // Every transport has a per-MESSAGE ceiling (browsers cap a DataChannel
  // message around 256KB; the relay hard-drops anything over its burst), so
  // any message bigger than FRAG_PART is split into {t:'frag'} envelopes and
  // reassembled on the other side. Fragments carry their index, so mixed
  // arrival order across a healing transport is fine; incomplete messages are
  // swept after 30s.
  const FRAG_PART = 100 * 1024; // chars per piece — envelope stays well under DC limits
  // Reassembly cap. Sized to the app-DATA ceiling (a single db record can be ~25MB
  // — My Media's per-item max), and that record is DOUBLE base64'd on the wire: the
  // binary-safe db serializer tags a Uint8Array as { $bin: base64 } (×1.33), then
  // seal() base64s the ciphertext (×1.33) → ~1.78× the raw bytes. So a 25MB blob
  // becomes ~45MB of fragments; 512×100KB = ~51MB carries it with margin (a smaller
  // cap silently drops a big shared video mid-transfer). Still bounds a bad peer's
  // claim, and incomplete messages are swept after 30s.
  const FRAG_MAX_PARTS = 512;
  let fragSeq = 0;
  // emit(pieceObj, pieceStr) is called once for small messages (the original)
  // or once per fragment — the caller picks which form its transport wants.
  const sendChunked = (msg, emit) => {
    const str = JSON.stringify(msg);
    if (str.length <= FRAG_PART) return emit(msg, str);
    const fid = 'f' + (++fragSeq) + '.' + Math.floor(Math.random() * 1e9).toString(36);
    const n = Math.ceil(str.length / FRAG_PART);
    if (root.__fragDebug) console.error('[frag out] ' + fid + ' n=' + n + ' len=' + str.length);
    for (let i = 0; i < n; i++) {
      const piece = { t: 'frag', fid, i, n, p: str.slice(i * FRAG_PART, (i + 1) * FRAG_PART) };
      emit(piece, JSON.stringify(piece));
    }
  };
  // Collect a message's fragments up front (each { o: pieceObj, s: pieceStr }) so
  // a big send can be PACED rather than dumped. A shared video blob is hundreds
  // of 100KB fragments; a synchronous loop of channel.send() overruns the
  // browser's ~16MB DataChannel send buffer and the far side silently loses the
  // tail — reassembly then hangs forever (the app RPC has no timeout). Paced
  // sends honor the channel's backpressure so every fragment lands.
  const chunk = (msg) => { const a = []; sendChunked(msg, (o, s) => a.push({ o, s })); return a; };
  const PUMP_HIGH = 4 * 1024 * 1024; // keep the channel's send buffer well under its ceiling
  const pumpChannel = (chan, pieces, mk) => new Promise((resolve) => {
    let i = 0;
    (function pump() {
      if (!chan || chan.readyState !== 'open') return resolve(); // channel died mid-flush; peer will re-request
      try { while (i < pieces.length && chan.bufferedAmount < PUMP_HIGH) chan.send(mk(pieces[i++])); }
      catch (e) { return resolve(); }
      if (i < pieces.length) setTimeout(pump, 40); else resolve();
    })();
  });
  // Stateful filter: feed every parsed inbound message with its sender key;
  // frag pieces buffer and return null until the last one completes the
  // original message. Non-frag messages pass straight through.
  const makeDefrag = (onProgress) => {
    const bufs = new Map(); // sender|fid -> { parts, got, n, at }
    return (m, sender) => {
      if (!m || m.t !== 'frag') return m;
      const n = m.n | 0, i = m.i | 0;
      if (typeof m.p !== 'string' || typeof m.fid !== 'string' || n < 2 || n > FRAG_MAX_PARTS || i < 0 || i >= n) return null;
      const key = sender + '|' + m.fid;
      let b = bufs.get(key);
      if (!b) {
        for (const [k, v] of bufs) if (Date.now() - v.at > 30000) bufs.delete(k); // sweep stale partials
        if (bufs.size >= 8) return null; // bounded memory even from a hostile sender
        b = { parts: new Array(n), got: 0, n, at: Date.now() };
        bufs.set(key, b);
      }
      if (b.n !== n || b.parts[i] !== undefined) { bufs.delete(key); return null; } // inconsistent sender
      b.parts[i] = m.p; b.got++;
      if (onProgress) { try { onProgress(m.fid, b.got, b.n); } catch (e) {} }
      if (root.__fragDebug) console.error('[defrag] ' + key + ' ' + b.got + '/' + b.n);
      if (b.got < b.n) return null;
      bufs.delete(key);
      try { return JSON.parse(b.parts.join('')); } catch (e) { if (root.__fragDebug) console.error('[defrag] PARSE FAIL ' + key); return null; }
    };
  };

  // ---- ids ------------------------------------------------------------------
  // One short code is the whole capability: session identity, join right, AND
  // encryption key all derive from it. The alphabet drops lookalikes (0/O,
  // 1/l/i) so codes survive being read aloud.
  const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  function shortCode(len) {
    const n = len || 10; // 31^10 ≈ 2^49 — plenty for ephemeral, unlisted rooms
    const buf = new Uint8Array(n);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = i * 7));
    let s = '';
    for (let i = 0; i < n; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    return s;
  }
  // High-entropy random hex — host secrets (never shown to a human, never in
  // the link; only a SHA-256 prefix, the verifier, travels).
  function randHex(bytes) {
    const b = new Uint8Array(bytes || 24);
    if ((root.crypto || {}).getRandomValues) root.crypto.getRandomValues(b); else for (let i = 0; i < b.length; i++) b[i] = (i * 137 + 11) & 255;
    return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const enc = (s) => new TextEncoder().encode(String(s));
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  function sha256hex(s) {
    if (!(root.crypto && root.crypto.subtle)) return Promise.resolve('');
    return root.crypto.subtle.digest('SHA-256', enc(s)).then(hex);
  }

  // ---- derive, don't send ----------------------------------------------------
  // DS is the derivation version tag. Bumping it is a FLAG DAY on purpose.
  const DS = 'gifos-net-1';
  const dsHash = (label, data) => sha256hex(DS + '|' + label + '|' + data);
  async function aesKey(label, secret) {
    if (!(root.crypto && root.crypto.subtle)) return null;
    const d = await root.crypto.subtle.digest('SHA-256', enc(DS + '|' + label + '|' + secret));
    return root.crypto.subtle.importKey('raw', d, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  // App session (join): everything derives from the LINK SECRET lsec — the
  // #j=<code> of a self-healing link, or the &k=<code> of an owned link. The
  // session id of an OWNED link is "<room>.<verifier>" (the relay's host gate
  // reads the verifier off it) and carries no secret, so it is NOT derived
  // here — only the token and key are.
  function deriveJoin(lsec) {
    return Promise.all([dsHash('app-sid', lsec), dsHash('app-tok', lsec), aesKey('app-e2e', lsec)])
      .then(([sid, tok, key]) => ({ sid: sid.slice(0, 20), tok: tok.slice(0, 24), key }));
  }
  // Meeting: the room code (+ the admin verifier, which is part of the room's
  // identity) derives the sid the relay routes on, the token occupants must
  // match, and the room key. The verifier is re-appended after the derived
  // hex so the relay's verifierOf(sid) keeps reading it off the tail.
  //
  // THE DOOR LOCK IS CRYPTOGRAPHY (mesh-refactor §8): a LOCKED room's E2E key
  // mixes the password into the derivation — without the password you cannot
  // READ the room, no matter what you hold or which door you talk past. The
  // relay's proof check remains a courtesy gate only (fail fast with a clear
  // error). Distinct label ('meet-e2e-pw') so unlocked rooms derive exactly
  // as before and app-session derivations are untouched; changing a room's
  // password RE-KEYS it (deriveMeetKey is the rotation primitive). sid/token
  // deliberately stay password-free — routing identity must not move when
  // the room re-keys.
  function deriveMeetKey(roomCode, av, pw) {
    const base = roomCode + '|' + (av || '');
    return pw ? aesKey('meet-e2e-pw', base + '|' + pw) : aesKey('meet-e2e', base);
  }
  function deriveMeet(roomCode, av, pw) {
    const base = roomCode + '|' + (av || '');
    return Promise.all([dsHash('meet-sid', base), dsHash('meet-tok', base), deriveMeetKey(roomCode, av, pw || '')])
      .then(([sid, tok, key]) => ({ sid: sid.slice(0, 20) + (av ? '.' + av : ''), tok: tok.slice(0, 24), key }));
  }
  // Multi-session rows (docs/rows.md): each row lives in its OWN relay
  // session so no single DO ever holds more than a row's worth of sockets.
  // Path '' IS deriveMeet — a room that fits in one row never changes
  // identity. Deeper paths mix INTO the hash (never appended after the
  // last dot, where the relay reads the admin verifier off the sid tail).
  // The E2E key is deliberately NOT per-path: one room, one key.
  function deriveMeetSess(roomCode, av, path) {
    if (!path) return deriveMeet(roomCode, av);
    const base = roomCode + '|' + (av || '') + '|' + path;
    return Promise.all([dsHash('meet-sid', base), dsHash('meet-tok', base)])
      .then(([sid, tok]) => ({ sid: sid.slice(0, 20) + (av ? '.' + av : ''), tok: tok.slice(0, 24) }));
  }
  // The room password never reaches the relay either: the relay only ever
  // compares occupants' PROOFS for equality. Room-salted so equal passwords
  // in different rooms leave different proofs.
  function meetPwProof(roomCode, av, pw) {
    if (!pw) return Promise.resolve('');
    return dsHash('meet-pw', roomCode + '|' + (av || '') + '|' + pw);
  }

  // ---- authority is a signature (mesh-refactor §9) ---------------------------
  // Admin power used to exist only as the relay's adm:true stamp — nothing a
  // peer could check. Now the PBKDF2 bits derived from the admin password are
  // the SEED of a deterministic Ed25519 keypair; the room verifier V commits
  // to the PUBLIC key (24-hex prefix of its SHA-256, same URL shape as
  // before); admins SIGN their moderation orders. Any peer — and the relay
  // itself — verifies the same proof: H(pub) startsWith V, signature valid.
  // No third party, no stamp, and the secret never leaves the device (the
  // old scheme put K itself in the socket URL).
  //
  // Signing canonicalization: the SIGNED BYTES are an exact JSON string the
  // sender minted (sp); receivers verify the string then parse it — key-order
  // ambiguity never enters the trust path.
  const ED_PKCS8 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const hexBytes = (hex) => { const u = new Uint8Array(hex.length >> 1); for (let i = 0; i < u.length; i++) u[i] = parseInt(hex.substr(i * 2, 2), 16); return u; };
  async function edKeysFromSeedHex(seedHex) {
    const seed = hexBytes(String(seedHex).slice(0, 64));
    const pkcs8 = new Uint8Array(ED_PKCS8.length + 32);
    pkcs8.set(ED_PKCS8, 0); pkcs8.set(seed, ED_PKCS8.length);
    const priv = await root.crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
    // the browser gives the public half via JWK export of the private key
    const jwk = await root.crypto.subtle.exportKey('jwk', priv);
    const xb = String(jwk.x).replace(/-/g, '+').replace(/_/g, '/');
    const pubRaw = bufOfB64(xb + '='.repeat((4 - xb.length % 4) % 4));
    const pub = await root.crypto.subtle.importKey('raw', pubRaw, 'Ed25519', true, ['verify']);
    const pubB64 = b64ofBuf(pubRaw.buffer || pubRaw);
    const verifier = (await sha256hex(pubB64)).slice(0, 24);
    return { priv, pub, pubB64, verifier };
  }
  async function edSign(priv, str) {
    const sig = await root.crypto.subtle.sign('Ed25519', priv, enc(str));
    return b64ofBuf(sig);
  }
  async function edVerify(pubB64, sigB64, str) {
    try {
      const pub = await root.crypto.subtle.importKey('raw', bufOfB64(pubB64), 'Ed25519', false, ['verify']);
      return await root.crypto.subtle.verify('Ed25519', pub, bufOfB64(sigB64), enc(str));
    } catch (e) { return false; }
  }
  // One check, used by peers AND the relay: does this pubkey commit to the
  // room's verifier, and did it sign these bytes?
  async function edProven(av, pubB64, sigB64, str) {
    if (!av || !pubB64 || !sigB64 || typeof str !== 'string') return false;
    if ((await sha256hex(pubB64)).slice(0, 24) !== String(av).toLowerCase()) return false;
    return edVerify(pubB64, sigB64, str);
  }

  // ---- sealed frames ---------------------------------------------------------
  // One envelope for every content frame, over every path: AES-256-GCM under
  // the session key. On P0 this doubles DTLS — cheap, and it removes the whole
  // category of "plaintext accidentally took the wrong path" bugs; on P1 the
  // forwarding friend carries ciphertext; on P2 the relay carries ciphertext.
  const b64ofBuf = (buf) => {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return btoa(s);
  };
  const bufOfB64 = (b) => {
    const s = atob(b); const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  // Binary-safe (de)serialization lives in GifOS.store (the one module loaded on
  // every page); seal/open use it so a Uint8Array db value — e.g. My Media's
  // stored photo/video bytes — survives the mesh instead of turning into a
  // mangled {"0":..} object. Fall back to plain JSON if store isn't present.
  const packJSON = (obj) => (GifOS.store && GifOS.store.packJSON ? GifOS.store.packJSON(obj) : JSON.stringify(obj));
  const unpackJSON = (str) => (GifOS.store && GifOS.store.unpackJSON ? GifOS.store.unpackJSON(str) : JSON.parse(str));

  async function seal(key, obj) {
    const iv = new Uint8Array(12);
    root.crypto.getRandomValues(iv);
    const ct = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(packJSON(obj)));
    return { e: 1, iv: b64ofBuf(iv), ct: b64ofBuf(ct) };
  }
  const isSealed = (m) => !!(m && m.e === 1 && typeof m.iv === 'string' && typeof m.ct === 'string');
  async function open(key, m) {
    if (!isSealed(m) || !key) return null;
    try {
      const pt = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufOfB64(m.iv) }, key, bufOfB64(m.ct));
      return unpackJSON(new TextDecoder().decode(pt));
    } catch (e) { return null; } // wrong key or tampered — drop silently
  }

  // ---- ordered async pipelines ----------------------------------------------
  // seal()/open() are async; two racing promises could reorder a sender's
  // frames. A chain runs jobs strictly FIFO so crypto never reorders traffic.
  function makeChain() {
    let q = Promise.resolve();
    return (job) => { q = q.then(job).catch(() => {}); return q; };
  }

  // ---- the scale constants (docs/rows.md) ------------------------------------
  // Structure emerges from THESE NUMBERS, never from code that asks "is this
  // room big?" (per-node invariants, no global modes). Tests and rehearsals
  // override via window.GIFOS_SCALE — the same idiom as GIFOS_CONN — so ten
  // browsers at C=2 exercise a four-level tree: the K-sweep doctrine. The
  // small case must equal today's behavior by ARITHMETIC (empty sets,
  // degenerate folds), never by branching.
  const SCALE = Object.assign({
    // C is THE shape constant — the stadium's whole geometry derives from it:
    // a row seats C people, a section is C rows (C² seats — one relay
    // session), a level-1 space seats the sections' row deacons, and so on
    // up. Per-device link count and fold fanout are CONSEQUENCES of the
    // arithmetic, never separate knobs. (Grows with rehearsals.)
    C: 8,
    // The fold frame budget: 756×1344 = 1,016,064 px — the smallest 9:16
    // frame past ONE MILLION PIXELS, on purpose: a million people in the
    // room, and every one of them is a pixel of the fold. PORTRAIT, because
    // the congregation is on phones: a fold fills the phone's width and
    // runs TALL — the crowd continues below the fold, and you scroll down
    // through it. Phones decode ~1MP hardware-accelerated; one fold per
    // edge, each way, forever.
    COMP_W: 756,
    COMP_H: 1344,
    COMP_FPS: 12,
    HB: 4000,         // status heartbeat ms — the gossip pulse everything idempotent rides
  }, root.GIFOS_SCALE || {});

  // ---- P1: single-hop forwarding through a friend -----------------------------
  // {t:'fwd', src, to, p} — p is ONE piece (a sealed envelope, or one {t:'frag'}
  // fragment of one). The forwarder relays pieces verbatim and statelessly:
  // it never defragments, never decrypts, and never forwards to another
  // forwarder (single hop by construction — 'to' must be its DIRECT link).
  // The receiver defragments with the ORIGINAL sender as the key, so pieces
  // arriving via different friends still reassemble.
  const fwdWrap = (src, to, piece) => ({ t: 'fwd', src, to, p: piece });
  const isFwd = (m) => !!(m && m.t === 'fwd' && m.p && typeof m.src === 'string' && typeof m.to === 'string');

  GifOS.net = {
    ICE_SERVERS, hasP2P, holdSessionLock,
    steadySocket,
    FRAG_PART, sendChunked, chunk, pumpChannel, makeDefrag,
    shortCode, randHex, sha256hex,
    deriveJoin, deriveMeet, deriveMeetKey, deriveMeetSess, meetPwProof,
    edKeysFromSeedHex, edSign, edVerify, edProven,
    seal, open, isSealed, makeChain,
    fwdWrap, isFwd,
    SCALE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
