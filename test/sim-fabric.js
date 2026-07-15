/*
 * sim-fabric.js — the REAL transport fabric for the mesh simulator.
 *
 * The scale sim used to teleport messages (send(id, msg) with a tick delay)
 * past a toy greeter-list relay. This module replaces the hand-waves with the
 * actual algorithm all the way through, so the simulator exercises what we
 * are actually building:
 *
 *   CRYPTO  — the DS 'gifos-net-1' derivations of site/js/gifos-net.js,
 *             byte-identical, on Node's SYNCHRONOUS node:crypto so the sim
 *             stays tick-deterministic: dsHash (SHA-256 tagged), deriveMeet
 *             (sid/token/AES-256-GCM room key), meetPwProof, seal/open
 *             ({e:1, iv, ct} envelopes — ct carries the GCM tag appended,
 *             exactly like WebCrypto, so a browser could open these frames),
 *             Ed25519 signed orders (§9) via node crypto sign/verify.
 *
 *   RELAY   — the ported Session Durable-Object semantics of
 *             relay/src/relay.js for role:'mesh': sockets with hibernation-
 *             surviving attachments, token/pw as OCCUPANCY state (first
 *             arrival re-establishes, everyone after matches), the anonymous
 *             peer-id roster, {t:'peer'} routing + {t:'gossip'} fan-out, the
 *             byte/frame meters (1MB burst / 48KBps refill; 600-frame burst /
 *             3fps / 3 strikes → cut), and the caps (C²+C sockets/session).
 *             The relay sees ONLY derived ids, proofs, and ciphertext.
 *
 *   SOCKETS — WebSocket lifecycle as state: a seat holds a relay socket only
 *             while knocking or greeting (mesh-refactor §1/§2 — members CLOSE
 *             their socket after joining; only greeters hold the door).
 *
 *   DCs     — DataChannels as state: send() works ONLY over an ESTABLISHED
 *             link. Links are born by signaling — offer/answer {t:'peer'}
 *             frames through the relay (bootstrap), or {t:'fwd'} single-hop
 *             sponsor forwarding over existing DCs (§3.2, the steady state) —
 *             with a connect delay, so "hand the newcomer its neighbours" is
 *             a real signaling act, not a teleport.
 *
 * Every DC payload is a REAL sealed envelope under the room key. The relay
 * and any forwarding friend carry ciphertext only. This is the invention
 * under test; the sim must not paper over it.
 */
'use strict';
const nodeCrypto = require('crypto');

// ---- DS derivations (gifos-net.js, byte-identical, synchronous) -------------
const DS = 'gifos-net-1';
const sha256hex = (s) => nodeCrypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const dsHash = (label, data) => sha256hex(DS + '|' + label + '|' + data);
const aesKeyBytes = (label, secret) => nodeCrypto.createHash('sha256').update(DS + '|' + label + '|' + secret, 'utf8').digest();
function deriveMeetKey(roomCode, av, pw) {
  const base = roomCode + '|' + (av || '');
  return pw ? aesKeyBytes('meet-e2e-pw', base + '|' + pw) : aesKeyBytes('meet-e2e', base);
}
function deriveMeet(roomCode, av, pw) {
  const base = roomCode + '|' + (av || '');
  return {
    sid: dsHash('meet-sid', base).slice(0, 20) + (av ? '.' + av : ''),
    tok: dsHash('meet-tok', base).slice(0, 24),
    key: deriveMeetKey(roomCode, av, pw || ''),
  };
}
const meetPwProof = (roomCode, av, pw) => (pw ? dsHash('meet-pw', roomCode + '|' + (av || '') + '|' + pw) : '');

// seal/open — AES-256-GCM, {e:1, iv, ct} with the 16-byte tag APPENDED to ct
// (WebCrypto's encrypt() output shape, so browser open() would accept these).
function seal(key, obj) {
  const iv = nodeCrypto.randomBytes(12);
  const c = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  return { e: 1, iv: iv.toString('base64'), ct: ct.toString('base64') };
}
function open(key, m) {
  if (!m || m.e !== 1 || typeof m.iv !== 'string' || typeof m.ct !== 'string' || !key) return null;
  try {
    const buf = Buffer.from(m.ct, 'base64');
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(m.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8'));
  } catch (e) { return null; } // wrong key or tampered — drop silently
}

// Ed25519 signed orders (§9): deterministic keypair from seed, verifier
// commits to the public key, signatures over exact JSON strings.
function edKeysFromSeedHex(seedHex) {
  const seed = Buffer.from(String(seedHex).slice(0, 64), 'hex');
  const pkcs8 = Buffer.concat([Buffer.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]), seed]);
  const priv = nodeCrypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const pubDer = nodeCrypto.createPublicKey(priv).export({ format: 'der', type: 'spki' });
  const pubRaw = pubDer.subarray(pubDer.length - 32); // raw 32-byte key off the SPKI tail
  const pubB64 = pubRaw.toString('base64');
  return { priv, pubB64, verifier: sha256hex(pubB64).slice(0, 24) };
}
const edSign = (priv, str) => nodeCrypto.sign(null, Buffer.from(str, 'utf8'), priv).toString('base64');
function edVerify(pubB64, sigB64, str) {
  try {
    const pubDer = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubB64, 'base64')]);
    const pub = nodeCrypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
    return nodeCrypto.verify(null, Buffer.from(str, 'utf8'), pub, Buffer.from(sigB64, 'base64'));
  } catch (e) { return false; }
}
const edProven = (av, w, str) => !!(av && w && w.pub && w.sig && typeof str === 'string' &&
  sha256hex(w.pub).slice(0, 24) === String(av).toLowerCase() && edVerify(w.pub, w.sig, str));

// ---- the fabric --------------------------------------------------------------
// makeFabric({ tickRef, deliver, rnd }) wires a tick-driven world:
//   tickRef()            → current tick (the sim's clock)
//   deliver(id, fn)      → schedule fn on seat id's inbox after transit delay
//   rnd()                → the sim's seeded PRNG
// Latency model (ticks): WS frame 1-3, DC frame 1-2, DC ESTABLISH 4-8
// (offer + answer + DTLS), matching the relative costs of the real paths.
function makeFabric(opts) {
  const { rnd } = opts;
  const later = (delay, fn) => opts.schedule(delay, fn);
  const WS_D = () => 1 + ((rnd() * 3) | 0);
  const DC_D = () => 1 + ((rnd() * 2) | 0);
  const EST_D = () => 4 + ((rnd() * 5) | 0);

  // ---- the relay: ported Session semantics (role:'mesh' subset) -------------
  const C = 8; // relay/src/relay.js — the relay's own C (section cap), NOT the mesh's
  const MAX_SOCKETS_PER_SESSION = C * C + C;
  const BURST_BYTES = 1024 * 1024, REFILL_BYTES_PER_SEC = 48 * 1024;
  const FRAME_BURST = 600, FRAMES_PER_SEC = 3, FRAME_STRIKES = 3;
  const TICKS_PER_SEC = 25; // sim clock → wall clock for the meters (phone beat 8 ticks ≈ the 4s HB / ~12 ticks; 25/s keeps ratios honest)

  function makeSession(sid) {
    return {
      sid, sockets: new Map(), // sockId -> { peer, tok, pw, av, open, meter, owner }
      nextSock: 0,
      verifierOf() { const dot = this.sid.lastIndexOf('.'); if (dot <= 0) return ''; const v = this.sid.slice(dot + 1); return /^[a-f0-9]{16,64}$/.test(v) ? v : ''; },
      members() { return [...this.sockets.values()].filter((s) => s.open); },
      // fetch()-equivalent: a websocket upgrade with role:'mesh'.
      connect(ownerId, { peer, token, pw }) {
        if (this.members().length >= MAX_SOCKETS_PER_SESSION) return { err: 'this session is full' };
        const first = this.members()[0] || null;
        if (first && (first.tok || '') !== (token || '')) return { err: 'bad room token' };
        const av = this.verifierOf();
        const roomPw = first ? (first.pw || '') : (av ? '' : (pw || '')); // occupancy state; admin rooms start lockless (§8: the real lock is the ciphertext)
        if (first && roomPw && (pw || '') !== roomPw) return { err: 'password required' };
        for (const s of this.members()) if (s.peer === peer) s.close('replaced'); // one socket per peer id
        const sock = { id: 's' + (this.nextSock++), peer, tok: token || '', pw: roomPw, av, open: true, owner: ownerId,
          meter: { tokens: BURST_BYTES, frames: FRAME_BURST, lastT: opts.tickRef(), strikes: 0, warned: false },
          close: (why) => { const s2 = this.sockets.get(sock.id); if (s2 && s2.open) { s2.open = false; this.sockets.delete(sock.id); later(WS_D(), () => opts.wsClosed(s2.owner, sock.id, why || '')); this.roster(); } } };
        this.sockets.set(sock.id, sock);
        later(WS_D(), () => opts.wsFrame(ownerId, sock.id, { t: 'joined', peer }));
        this.roster();
        return { sock };
      },
      roster() { // anonymous peer ids only — the relay never authors names
        const peers = this.members().map((s) => s.peer);
        for (const s of this.members()) later(WS_D(), () => opts.wsFrame(s.owner, s.id, { t: 'roster', peers: peers.slice() }));
      },
      overBudget(meter, len) {
        const now = opts.tickRef();
        const dt = Math.max(0, now - meter.lastT) / TICKS_PER_SEC;
        meter.tokens = Math.min(BURST_BYTES, meter.tokens + dt * REFILL_BYTES_PER_SEC);
        meter.frames = Math.min(FRAME_BURST, meter.frames + dt * FRAMES_PER_SEC);
        meter.lastT = now;
        if (len > BURST_BYTES) return true;
        if (meter.tokens >= len && meter.frames >= 1) { meter.tokens -= len; meter.frames -= 1; meter.warned = false; return false; }
        return true;
      },
      // webSocketMessage()-equivalent — {t:'peer'} routing + {t:'gossip'} fan-out.
      frame(sockId, m) {
        const s = this.sockets.get(sockId); if (!s || !s.open) return;
        const len = JSON.stringify(m).length;
        if (this.overBudget(s.meter, len)) {
          if (!s.meter.warned) {
            s.meter.warned = true; s.meter.strikes++;
            later(WS_D(), () => opts.wsFrame(s.owner, s.id, { t: 'error', error: 'relay is for control messages only' }));
            if (s.meter.strikes >= FRAME_STRIKES) s.close('rate');
          }
          return;
        }
        if (m.t === 'peer') { const d = this.members().find((x) => x.peer === m.to); if (d) later(WS_D(), () => opts.wsFrame(d.owner, d.id, { t: 'peer', from: s.peer, msg: m.msg })); }
        else if (m.t === 'gossip' && m.msg !== undefined) { for (const d of this.members()) if (d.peer !== s.peer) later(WS_D(), () => opts.wsFrame(d.owner, d.id, { t: 'peer', from: s.peer, msg: m.msg })); }
      },
    };
  }
  const sessions = new Map();
  const relay = {
    session(sid) { let s = sessions.get(sid); if (!s) sessions.set(sid, s = makeSession(sid)); return s; },
  };

  // ---- DataChannels: links as STATE ------------------------------------------
  // dcs: linkKey(a,b) -> { state: 'connecting'|'open', a, b }
  const dcs = new Map();
  const linkKey = (a, b) => (a < b ? a + '~' + b : b + '~' + a);
  const dc = {
    isOpen: (a, b) => { const l = dcs.get(linkKey(a, b)); return !!(l && l.state === 'open'); },
    // Establish after a completed offer/answer handshake (the caller runs the
    // signaling; this models the DTLS/ICE connect time).
    establish(a, b) {
      const k = linkKey(a, b); const l = dcs.get(k);
      if (l && l.state === 'open') return;
      if (l && l.state === 'connecting') return;
      dcs.set(k, { state: 'connecting', a, b });
      later(EST_D(), () => { const l2 = dcs.get(k); if (l2 && l2.state === 'connecting') { l2.state = 'open'; opts.dcOpen(a, b); opts.dcOpen(b, a); } });
    },
    close(a, b) { const k = linkKey(a, b); if (dcs.delete(k)) { opts.dcClosed(a, b); opts.dcClosed(b, a); } },
    closeAll(a) { for (const [k, l] of dcs) if (l.a === a || l.b === a) { dcs.delete(k); const o = l.a === a ? l.b : l.a; opts.dcClosed(o, a); } },
    // A sealed frame over an OPEN channel — the only way protocol bytes move
    // peer-to-peer. No channel, no delivery: the caller must signal first.
    send(from, to, envelope) {
      if (!dc.isOpen(from, to)) return false;
      later(DC_D(), () => opts.dcFrame(to, from, envelope));
      return true;
    },
  };

  return { relay, dc, WS_D, DC_D, EST_D };
}

module.exports = {
  DS, sha256hex, dsHash, deriveMeet, deriveMeetKey, meetPwProof,
  seal, open, edKeysFromSeedHex, edSign, edVerify, edProven,
  makeFabric,
};
