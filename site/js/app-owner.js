/*
 * app-owner.js — owner-authority for app-state that rides the mesh.
 *
 * The DECIDED model (docs/app-mesh-unification.md §DECIDED): an app-share is a
 * media-less mesh room. App state flows over the room's Stage DATA lane
 * (GifOS.meetStageData) as `snap`/`delta`/`act` frames — NOT a second relay
 * session. Authority is a SIGNATURE SCOPE, owner-authoritative (model A):
 *
 *   - The OWNER (the seat that shared the app) holds an Ed25519 signing key.
 *     It signs every canonical app-state frame it emits (`snap`, `delta`).
 *   - Every participant VERIFIES each frame against the owner's public key.
 *     Unsigned / mis-signed / tampered frames are rejected and NEVER become
 *     canonical — a malicious seat can flood frames but cannot corrupt state.
 *   - A client's write is a PROPOSAL: an unsigned `act` frame routed on the
 *     same lane. The owner validates it (visibility / leadership), applies it
 *     to the authoritative store, and the resulting owner-signed `snap`/`delta`
 *     is what the room actually adopts.
 *
 * This authority NESTS in any room and is relay-free: it is pure mesh-peer
 * signature verification the relay never sees. It works inside an open/anarchy
 * meeting (the meeting stays anarchy; the app carries its own owner-authority).
 * The owner's authority is ONLY over app state — it cannot ban meeting members
 * or lock the meeting (that is a relay-door concern).
 *
 * This module is deliberately PURE + transport-free so it is testable in Node
 * and reusable in the browser (runtime.js host/client adapters). It touches no
 * DOM, no store, no socket — just WebCrypto + plain state objects.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const G = (root.GifOS = root.GifOS || {});
  G.appOwner = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle
    : (typeof require === 'function' ? require('crypto').webcrypto.subtle : null);
  const enc = new TextEncoder();

  const hex = (buf) => {
    const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = ''; for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
    return s;
  };
  const fromHex = (h) => {
    const a = new Uint8Array(h.length / 2);
    for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
    return a;
  };
  async function sha256hex(bytes) { return hex(new Uint8Array(await subtle.digest('SHA-256', bytes))); }

  // Deterministic serialization: object keys sorted recursively, so the exact
  // same bytes are signed and re-hashed on every device (a signature over a
  // JS-default key order would verify only by luck).
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  const canonicalBytes = (v) => enc.encode(canonical(v));

  // ---- owner signer --------------------------------------------------------
  // A fresh per-share Ed25519 keypair. The private key is non-extractable and
  // never leaves this tab; the public key (hex) travels in every frame so any
  // participant can verify. `sign(sid, kind, body)` returns a signed frame over
  // the canonical bytes of the SIGNED TUPLE { sid, kind, n, body } (n = a
  // monotonic per-owner counter that binds ordering and defeats replay).
  async function createSigner() {
    const kp = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    const pubRaw = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    const pkHex = hex(pubRaw);
    let n = 0;
    return {
      pkHex,
      async sign(sid, kind, body) {
        const p = { sid: sid, kind: kind, n: (++n), body: body };
        const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, kp.privateKey, canonicalBytes(p)));
        return { p: p, pk: pkHex, sig: hex(sig) };
      },
    };
  }

  // ---- verifier ------------------------------------------------------------
  // One verifier per subscribed sid. It PINS the owner public key on the first
  // valid-signed frame and rejects every later frame not signed by that same
  // key (unsigned, wrong pk, or bad signature). If the sid carries a
  // pubkey-derived verifier tail (`room.<sha256(pk) prefix>` — the owned-link
  // shape), the pin is additionally bound to the sid so even the FIRST frame
  // must come from the key the link commits to (closing the TOFU race). For a
  // healing-link sid (opaque tail) the pin is trust-on-first-valid-frame; see
  // the doc note — the clean close is carrying the owner pk in the app ad.
  function makeVerifier(sid) {
    const dot = String(sid || '').indexOf('.');
    const sidTail = dot >= 0 ? String(sid).slice(dot + 1) : null;
    const boundable = !!(sidTail && /^[0-9a-f]{8,}$/.test(sidTail));
    let pinned = null;
    let lastN = 0;
    return {
      get pinnedPk() { return pinned; },
      // Returns { ok, kind, body, n } on accept, or { ok:false, reason } on reject.
      async verify(frame) {
        if (!frame || !frame.p || !frame.pk || !frame.sig) return { ok: false, reason: 'malformed' };
        const p = frame.p;
        if (p.sid !== sid) return { ok: false, reason: 'wrong-sid' };
        if (pinned && frame.pk !== pinned) return { ok: false, reason: 'not-owner' };
        if (!pinned && boundable) {
          const h = await sha256hex(fromHex(frame.pk));
          if (h.slice(0, sidTail.length) !== sidTail) return { ok: false, reason: 'pk-not-bound' };
        }
        let good = false;
        try {
          const key = await subtle.importKey('raw', fromHex(frame.pk), { name: 'Ed25519' }, false, ['verify']);
          good = await subtle.verify({ name: 'Ed25519' }, key, fromHex(frame.sig), canonicalBytes(p));
        } catch (e) { good = false; }
        if (!good) return { ok: false, reason: 'bad-sig' };
        if (typeof p.n === 'number' && p.n <= lastN && pinned === frame.pk) return { ok: false, reason: 'stale' };
        if (!pinned) pinned = frame.pk;
        lastN = (typeof p.n === 'number') ? p.n : lastN;
        return { ok: true, kind: p.kind, body: p.body, n: p.n };
      },
    };
  }

  // ---- pure state reducer --------------------------------------------------
  // The app-state shape mirrors the store's full-state dump:
  //   { collections: { <name>: { items: { <id>: rec }, seq } } }
  // A `snap` body carries the whole (visibility-filtered) state → full replace.
  // A `delta` body carries { collection, items:{id:rec|null} } → per-record
  // patch (null = delete). Both are pure: same inputs, same output, everywhere.
  function emptyState() { return { collections: {} }; }
  function coll(state, name) {
    if (!state.collections[name]) state.collections[name] = { items: {}, seq: 0 };
    return state.collections[name];
  }
  function applySnap(body) {
    return body && body.collections ? JSON.parse(JSON.stringify(body)) : emptyState();
  }
  function applyDelta(state, body) {
    if (!body || !body.collection || !body.items) return state;
    const c = coll(state, body.collection);
    for (const id of Object.keys(body.items)) {
      const rec = body.items[id];
      if (rec == null) delete c.items[id];
      else c.items[id] = rec;
    }
    return state;
  }
  // Owner-side: apply a validated op-proposal to the authoritative state.
  // Returns { state, delta } where delta is the frame body to broadcast, or
  // null if the op was a no-op. (Visibility/lead checks happen BEFORE this.)
  function applyOp(state, op) {
    if (!op || !op.collection) return { state, delta: null };
    const c = coll(state, op.collection);
    if (op.op === 'put') {
      const rec = op.value && typeof op.value === 'object' ? op.value : null;
      if (!rec) return { state, delta: null };
      let id = rec.id;
      if (id == null) { id = op.collection + '_' + (c.seq++); rec.id = id; }
      c.items[id] = rec;
      return { state, delta: { collection: op.collection, items: { [id]: rec } } };
    }
    if (op.op === 'delete') {
      const id = op.key;
      if (id == null || !(id in c.items)) return { state, delta: null };
      delete c.items[id];
      return { state, delta: { collection: op.collection, items: { [id]: null } } };
    }
    return { state, delta: null };
  }

  // A client-minted record id — high-entropy so two clients proposing puts to
  // the same collection never collide (the owner honors a provided id).
  function newRecordId(collection) {
    const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 14);
    return String(collection) + '_c' + rnd;
  }

  return {
    createSigner, makeVerifier, canonical, canonicalBytes, sha256hex,
    emptyState, applySnap, applyDelta, applyOp, newRecordId,
  };
});
