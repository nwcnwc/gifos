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
    const s = { onmessage: null, onstate: null, onopen: null, state: 'connecting', downSince: Date.now() };
    let ws = null, closed = false, attempt = 0, timer = null;
    const queue = [];
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
      sock.onopen = () => {
        if (closed || ws !== sock) return;
        attempt = 0;
        setState('up');
        for (const frame of queue.splice(0)) { try { sock.send(frame); } catch (e) { /* re-dropped */ } }
        if (s.onopen) s.onopen();
      };
      sock.onmessage = (ev) => { if (ws === sock && s.onmessage) s.onmessage(ev); };
      sock.onclose = () => { if (ws === sock) { ws = null; setState('down'); schedule(); } };
      sock.onerror = () => { try { sock.close(); } catch (e) { /* already dead */ } };
    }
    function schedule() {
      if (closed || timer) return;
      const delay = Math.min(5000, 500 * Math.pow(2, attempt++)) * (0.7 + Math.random() * 0.6);
      timer = setTimeout(() => { timer = null; connect(); }, delay);
    }
    const kick = () => {
      if (closed || (ws && ws.readyState <= 1)) return;
      if (timer) { clearTimeout(timer); timer = null; }
      attempt = 0;
      connect();
    };
    if (root.addEventListener) { root.addEventListener('online', kick); root.addEventListener('pageshow', kick); }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
      document.addEventListener('resume', kick); // Page Lifecycle: tab just unfroze
    }
    s.send = (data) => {
      if (closed) return;
      if (typeof data !== 'string') data = JSON.stringify(data);
      if (ws && ws.readyState === 1) { try { ws.send(data); return; } catch (e) { /* fell through to queue */ } }
      queue.push(data);
      if (queue.length > 500) queue.shift();
      kick();
    };
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
  const FRAG_MAX_PARTS = 256;   // ~25MB reassembled max — a heavy app rides P2P; refuses absurd claims
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
  function deriveMeet(roomCode, av) {
    const base = roomCode + '|' + (av || '');
    return Promise.all([dsHash('meet-sid', base), dsHash('meet-tok', base), aesKey('meet-e2e', base)])
      .then(([sid, tok, key]) => ({ sid: sid.slice(0, 20) + (av ? '.' + av : ''), tok: tok.slice(0, 24), key }));
  }
  // The room password never reaches the relay either: the relay only ever
  // compares occupants' PROOFS for equality. Room-salted so equal passwords
  // in different rooms leave different proofs.
  function meetPwProof(roomCode, av, pw) {
    if (!pw) return Promise.resolve('');
    return dsHash('meet-pw', roomCode + '|' + (av || '') + '|' + pw);
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
  async function seal(key, obj) {
    const iv = new Uint8Array(12);
    root.crypto.getRandomValues(iv);
    const ct = await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc(JSON.stringify(obj)));
    return { e: 1, iv: b64ofBuf(iv), ct: b64ofBuf(ct) };
  }
  const isSealed = (m) => !!(m && m.e === 1 && typeof m.iv === 'string' && typeof m.ct === 'string');
  async function open(key, m) {
    if (!isSealed(m) || !key) return null;
    try {
      const pt = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufOfB64(m.iv) }, key, bufOfB64(m.ct));
      return JSON.parse(new TextDecoder().decode(pt));
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
    C: 8,             // row capacity — people per row (grows with rehearsals)
    K: 8,             // live A/V link budget per device
    F: 16,            // fold fanout — child rows per deacon at one level
    COMP_W: 480,      // composite frame budget: width…
    COMP_H: 270,      // …height…
    COMP_FPS: 12,     // …and rate. One composite per edge, each way, forever.
    HB: 4000,         // status heartbeat ms
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
    FRAG_PART, sendChunked, makeDefrag,
    shortCode, randHex, sha256hex,
    deriveJoin, deriveMeet, meetPwProof,
    seal, open, isSealed, makeChain,
    fwdWrap, isFwd,
    SCALE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
