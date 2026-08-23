/*
 * mesh-identity.js — per-PARTICIPANT cryptographic identity for the GifOS mesh
 * (healing-laws.md rules S4 + S5). This is the security layer that makes C3's
 * healer-authorization UNFORGEABLE: an impostor cannot sign as the designated
 * healer, so no seat capture at a distance, no turnover-race capture, no climb.
 *
 * The design in one paragraph:
 *   - ONE Ed25519 keypair per participant, minted ONCE at join (NOT per seat,
 *     NOT per coord). The public key IS the participant's name; it does not
 *     change when they move or promote. Promotion moves your COORD, never your
 *     IDENTITY.
 *   - peer id = H(pubkey). This retires the client-set-id hole: a peer can no
 *     longer hand-pick its id on the socket URL, because the id is bound to a
 *     key it must possess to speak as.
 *   - Every occupancy-authoring frame (FINDLEAF / PLACE / CLAIM — and the
 *     HELLO announce, for exchange) is SIGNED by its author over a canonical
 *     statement that commits to {t, key, from}. The receiver verifies:
 *       (1) H(pub) === the signer's peer id            (id is bound to the key)
 *       (2) the Ed25519 signature is valid over sp     (the signer holds the key)
 *       (3) TOFU: pub matches the key already pinned for this participant, or
 *           this is first contact and we pin it now.
 *     A frame that claims to be participant Q but is not signed by Q's key is
 *     REJECTED — an impostor cannot forge Q's signature, and cannot present its
 *     OWN key under Q's id because H(ownPub) !== Q.
 *   - TOFU pinning is keyed on the PARTICIPANT (peer id), not the coord, so a
 *     neighbour that has pinned a participant recognises it across links AND
 *     across moves (the same key re-appears at the new coord).
 *
 * We REUSE the WebCrypto Ed25519 helpers already in gifos-net.js (edSign /
 * edVerify / edKeysFromSeedHex / sha256hex) — the same primitives the admin
 * authority layer (docs/meet-security.md §SIG) signs its {sp,sig,pub} orders
 * with. No new crypto is invented here.
 *
 * The ONE open edge (S4, honestly named — NOT solved here): the first-contact
 * moment (join, or a total reconnect where nobody remembers your key) is
 * authenticated only by the shared room key K = "a member", not "which member".
 * Sybil and the first-pin race live there and stay open. Everything ELSE — every
 * subsequent fill, at every level — is unforgeable.
 */
(function (root) {
  const GifOS = root.GifOS = root.GifOS || {};
  const net = GifOS.net;

  // The authoritative peer id derived from a public key: peer id = H(pubkey).
  // 40 hex chars (160 bits) of SHA-256 over the base64 public key — plenty to
  // make a collision infeasible, short enough to ride socket URLs / occ maps.
  // Prefixed 'k_' so an identity-derived id is visibly distinct from a legacy
  // client-set id (the forgeable ids this scheme retires).
  async function peerIdOf(pubB64) {
    return 'k_' + (await net.sha256hex(pubB64)).slice(0, 40);
  }

  // Mint a fresh per-participant identity. Called ONCE at join. The keypair is
  // deterministic in its seed, but the seed is 32 fresh random bytes, so the
  // participant key is unique and unguessable. Returns everything a seat needs:
  //   { priv, pubB64, peerId }  — priv signs, pubB64 travels, peerId = H(pubB64).
  async function mint() {
    const seed = net.randHex(32);
    const k = await net.edKeysFromSeedHex(seed);
    const peerId = await peerIdOf(k.pubB64);
    return { priv: k.priv, pubB64: k.pubB64, peerId };
  }

  // Canonical signed string for a fill frame. Deterministic, minted by the
  // signer and verified byte-for-byte by the receiver (no key-order ambiguity —
  // the exact §SIG discipline). It commits to the frame TYPE, the COORD/HOLE the
  // frame authors (so a signature for one hole can't be replayed onto another),
  // and the signer's own peer id `from` (so the receiver can bind H(pub)===from).
  function fillKeyOf(m) {
    // the coordinate a fill frame authoritatively acts on
    if (m.hole) return 'h:' + net.topo.ckey(m.hole);
    if (m.coord) return 'c:' + net.topo.ckey(m.coord);
    if (m.ck) return 'k:' + m.ck;
    return '-';
  }
  function statement(from, m) {
    return JSON.stringify({ v: 1, t: m.t, k: fillKeyOf(m), id: (m.id != null ? m.id : null), from });
  }

  // Sign a fill frame as `identity`. Returns a {sp, sig, pub} block (mirrors the
  // admin §SIG shape) to attach to the frame as m.s4. `from` is the signer's
  // stable peer id (H(pub)); the receiver re-derives H(pub) and checks it equals
  // `from`, so the id can't be lied about.
  async function signFill(identity, m) {
    const sp = statement(identity.peerId, m);
    const sig = await net.edSign(identity.priv, sp);
    return { sp, sig, pub: identity.pubB64 };
  }

  // A TOFU pin store: participant peer id -> pinned pubB64. First key seen for a
  // participant wins and is recognised thereafter, across links and moves.
  function newPins() {
    const map = new Map();
    return {
      // pin(id, pub): returns { ok, changed }. ok=false ⇒ this pub CONFLICTS with
      // the one already pinned for id (a key-swap attempt) — reject. changed is
      // reserved for surfacing a key rotation (not used to reject here).
      pin(id, pub) {
        const cur = map.get(id);
        if (cur === undefined) { map.set(id, pub); return { ok: true, changed: false }; }
        if (cur === pub) return { ok: true, changed: false };
        return { ok: false, changed: true, first: cur };
      },
      get(id) { const v = map.get(id); return v === undefined ? null : v; },
      size() { return map.size; },
    };
  }

  // Verify a signed fill frame. Returns { ok, from } (from = the authenticated
  // signer peer id, pinned on success). Rejects when:
  //   - the s4 block is missing/malformed,
  //   - H(pub) !== the signer's claimed peer id `from`      (id not bound to key)
  //   - for an occupant frame (CLAIM/HELLO carrying m.id), the occupant m.id
  //     !== the signer `from`                               (claiming another's seat)
  //   - the recomputed canonical statement !== the signed sp (frame tampered)
  //   - the Ed25519 signature does not verify                (not the key holder)
  //   - TOFU conflict: pub != the key pinned for `from`      (key-swap / impostor)
  async function verifyFill(pins, m) {
    const s = m && m.s4;
    if (!s || typeof s.sp !== 'string' || !s.sig || !s.pub) return { ok: false, from: null };
    let sp;
    try { sp = JSON.parse(s.sp); } catch (e) { return { ok: false, from: null }; }
    const from = sp.from;
    if (!from || typeof from !== 'string') return { ok: false, from: null };
    // (1) id is bound to the key: H(pub) === from
    if ((await peerIdOf(s.pub)) !== from) return { ok: false, from: null };
    // the signed statement must describe THIS frame (no cross-frame replay)
    if (statement(from, m) !== s.sp) return { ok: false, from: null };
    // an occupant-bearing frame must be signed BY that occupant
    if (m.id != null && m.id !== from) return { ok: false, from: null };
    // (2) the signer actually holds the private key
    if (!(await net.edVerify(s.pub, s.sig, s.sp))) return { ok: false, from: null };
    // (3) TOFU: pin on first contact, reject a key that conflicts with the pin
    const p = pins.pin(from, s.pub);
    if (!p.ok) return { ok: false, from: null };
    return { ok: true, from };
  }

  GifOS.meshIdentity = { mint, peerIdOf, signFill, verifyFill, newPins, statement };
})(typeof window !== 'undefined' ? window : globalThis);
