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
  const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto
    : (typeof require === 'function' ? require('crypto').webcrypto : null);
  // THE ONE Ed25519 DOOR (gifos-ed.js) — resolved lazily so load order never
  // matters; in node it pulls the sibling module in itself.
  const ed = () => {
    const G = typeof self !== 'undefined' ? self : globalThis;
    if ((!G.GifOS || !G.GifOS.ed) && typeof document === 'undefined' && typeof require === 'function') { try { require('./gifos-ed.js'); } catch (e) {} }
    if (!G.GifOS || !G.GifOS.ed) throw new Error('gifos-ed.js must load before app-owner.js');
    return G.GifOS.ed;
  };

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
  //
  // BINARY: an app record can hold a Uint8Array/ArrayBuffer (My Media's photo
  // or video bytes). The mesh transport (gifos-net seal/open) round-trips it
  // as a real typed array on BOTH ends — so canonical() must serialize it to a
  // STABLE token (hex behind a tag), identical host-side (raw) and guest-side
  // (transport-revived). Enumerating a Uint8Array as a plain object instead
  // would make the two ends disagree the instant either holds the revived form
  // vs the {$bin} form — the bad-sig that blanked shared blobs.
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (v instanceof Uint8Array) return JSON.stringify('$u8:' + hex(v));
    if (v instanceof ArrayBuffer) return JSON.stringify('$u8:' + hex(new Uint8Array(v)));
    if (ArrayBuffer.isView(v)) return JSON.stringify('$u8:' + hex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  const canonicalBytes = (v) => enc.encode(canonical(v));

  // ---- owner signer --------------------------------------------------------
  // A fresh per-share Ed25519 keypair. The key never leaves this tab; the
  // public key (hex) travels in every frame so any participant can verify.
  // `sign(sid, kind, body)` returns a signed frame over the canonical bytes of
  // the SIGNED TUPLE { sid, kind, n, body } (n = a monotonic per-owner counter
  // that binds ordering and defeats replay). Routed through THE ONE Ed25519
  // DOOR (gifos-ed.js) so an owner on a no-native-Ed25519 browser (old
  // iPhone) can still share; the key is seed-derived like the S4 identity —
  // the former non-extractable generateKey bought nothing the seed path
  // doesn't, since the S4 seed already lives in JS memory.
  async function createSigner() {
    const seed = new Uint8Array(32); rnd.getRandomValues(seed);
    const k = await ed().keysFromSeed(seed);
    const pkHex = hex(k.pubRaw);
    let n = 0;
    return {
      pkHex,
      async sign(sid, kind, body) {
        const p = { sid: sid, kind: kind, n: (++n), body: body };
        const sig = await ed().sign(k.priv, canonicalBytes(p));
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
  // healing-link sid (opaque tail) the pin is trust-on-first-valid-frame —
  // UNLESS the caller passes `ownerPk` (the pk carried in the app ad, the
  // clean close of that race): then the pin is fixed up front, and a stale
  // retained frame from an earlier share of the same sid (old key) can never
  // capture the verifier.
  function makeVerifier(sid, ownerPk) {
    const dot = String(sid || '').indexOf('.');
    const sidTail = dot >= 0 ? String(sid).slice(dot + 1) : null;
    const boundable = !!(sidTail && /^[0-9a-f]{8,}$/.test(sidTail));
    let pinned = (typeof ownerPk === 'string' && /^[0-9a-f]{16,}$/.test(ownerPk)) ? ownerPk : null;
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
          good = await ed().verify(fromHex(frame.pk), fromHex(frame.sig), canonicalBytes(p));
        } catch (e) { good = false; }
        if (!good) return { ok: false, reason: 'bad-sig' };
        // THE APP FRAME IS IMMUTABLE CONTENT, NOT ORDERED STATE.
        // The monotonic n exists to stop an old snap/delta/act being replayed
        // over newer state — a rollback attack on MUTABLE data. The 'app' frame
        // is different in kind: it carries the app GIF for this sid, which is
        // fixed for the whole session, so replaying it can only ever deliver the
        // same bytes (and mountFromB64 ignores it once mounted).
        //
        // Ordering it was what forced the star. A RETAINED frame necessarily
        // carries its mint-time n, so the moment any snap advanced lastN the
        // retained app was rejected 'stale' forever — which is precisely why the
        // owner had to re-sign the bytes fresh for every guest that dialled in
        // with 'need-app'. That design cannot scale past a handful of guests.
        // Exempting 'app' from ordering is what lets the bytes be retained on
        // every node and pulled peer-to-peer; the SIGNATURE still proves the
        // owner minted them for this sid, so a relaying peer can carry the app
        // but can never forge it.
        const ordered = p.kind !== 'app';
        if (ordered && typeof p.n === 'number' && p.n <= lastN && pinned === frame.pk) return { ok: false, reason: 'stale' };
        if (!pinned) pinned = frame.pk;
        if (ordered) lastN = (typeof p.n === 'number') ? p.n : lastN;
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
    // A prototype-member name would read Object.prototype as "the collection"
    // (GifOS.store.badCollectionName); such a frame gets an empty, detached one.
    if (typeof name !== 'string' || (name in Object.prototype)) return { items: {}, seq: 0 };
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
