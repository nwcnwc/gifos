/*
 * gifos-sign.js — provenance signatures for App GIFs.
 *
 * "Signed by example.com" or "signed by alice@example.com" means: someone
 * who controls that domain / that email signed THESE EXACT app bytes. It is the
 * DKIM model for files. It does NOT assert the app is safe, and a signature can
 * always be stripped (the file just becomes anonymous) — the UI is honest about
 * both. What it DOES give is verifiable authorship.
 *
 * Design decisions that make it secure:
 *  1. The key location is DERIVED from the identity, never embedded. A domain
 *     identity's key MUST live at https://<domain>/gifos.key; an email
 *     identity's key MUST come from a public keyserver for that exact address.
 *     So "Signed by X" is exactly as strong as controlling X.
 *  2. The identity is INSIDE the signed statement, so a signature can't be
 *     re-attributed to another identity that happens to share a key.
 *  3. Canonical content hash EXCLUDES the signature block itself AND any
 *     .state/** or .lock/** file — so saving app state, or passkey-wrapping
 *     that state, never voids the author's signature, but changing the app
 *     or its artwork does.
 *  4. Honest verdicts: signed / unsigned / TAMPERED (contents changed after
 *     signing). Never "malware" — a signature can't prove that.
 *
 * Two identity types:
 *  - domain: Ed25519 (native WebCrypto). Key = base64 of the 32-byte public key
 *    at https://<domain>/gifos.key. Signature = 64-byte Ed25519 over the
 *    statement. Zero dependencies.
 *  - email:  OpenPGP. The signer signs the statement with their own PGP key
 *    (gpg). We verify a detached OpenPGP Ed25519 signature against the key
 *    fetched from keys.openpgp.org by email — parsed here by hand (validated
 *    against real gpg output), still no dependency.
 *
 * Signature is carried in a "GIFOSSIG" Application Extension block, a sibling of
 * the "GIFOS1.0" filesystem block. Attaches to GifOS.sign.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const gif = GifOS.gif;
  const SIG_MARKER = 'GIFOSSIG';
  const SIG_AUTH = 'GOS';
  const KEYSERVER = 'https://keys.openpgp.org/vks/v1/by-email/';
  const subtle = (root.crypto && root.crypto.subtle) || null;

  const enc = new TextEncoder();
  const te = (s) => enc.encode(s);
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  async function sha256(bytes) { return new Uint8Array(await subtle.digest('SHA-256', bytes)); }
  function concat(arrs) {
    let n = 0; for (const a of arrs) n += a.length;
    const out = new Uint8Array(n); let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }

  // ---- canonical content hash -----------------------------------------------
  // Hash = SHA256( visualBytes || 0x00 || filesDigest ), where
  //  - visualBytes = the GIF with the GIFOS1.0 and GIFOSSIG blocks removed
  //    (i.e. every pixel/palette/animation byte), and
  //  - filesDigest = SHA256 over the sorted list of "path\0sha256(bytes)" for
  //    every app file EXCEPT .state/**, .lock/** and .assets/** .
  // Consequence: saving app state (which only rewrites .state inside GIFOS1.0)
  // or passkey-wrapping it into .lock/v1 changes neither term, so the
  // signature survives; changing app code or artwork changes one of them, so
  // it (correctly) breaks. `.assets/**` are
  // the install-time downloads the OS seals in (gifos-assets.js): excluded so
  // installing them voids nothing, and SAFE to exclude because the SIGNED
  // manifest already pins each asset by sha256 — the excluded bytes are still
  // hash-committed, just one hop away. (Builds before 2026-08-09 would count
  // .assets/ files into the digest and call such a signed app tampered; no
  // signed app carried assets before this line existed.)
  function stripBlock(bytes, marker) {
    const span = gif.findAppExtSpan(bytes, marker, SIG_AUTH); // both blocks carry the 'GOS' code — the walk checks it
    if (!span) return bytes;
    const out = new Uint8Array(bytes.length - (span.end - span.start));
    out.set(bytes.subarray(0, span.start), 0);
    out.set(bytes.subarray(span.end), span.start);
    return out;
  }
  async function contentHash(bytes) {
    let visual = stripBlock(bytes, 'GIFOS1.0');
    visual = stripBlock(visual, SIG_MARKER);
    const archive = await gif.decode(bytes);
    let filesDigest = new Uint8Array(32); // all-zero if not a GifOS app
    if (archive && archive.files) {
      const parts = [];
      for (const path of Object.keys(archive.files).sort()) {
        if (path.indexOf('.state/') === 0) continue;  // volatile — never signed
        if (path.indexOf('.lock/') === 0) continue;   // passkey wrap of that volatile state — never signed
        if (path.indexOf('.assets/') === 0) continue; // OS-sealed downloads — pinned by the signed manifest instead
        parts.push(te(path + '\0'));
        parts.push(await sha256(archive.files[path]));
        parts.push(te('\n'));
      }
      filesDigest = await sha256(concat(parts));
    }
    return sha256(concat([visual, new Uint8Array([0]), filesDigest]));
  }

  // The exact bytes a signer signs. Deterministic, so the verifier rebuilds it
  // identically. Includes the identity so a sig can't be re-attributed.
  function statement(type, id, contentHashHex) {
    return te('gifos-sig\x00v1\x00' + type + '\x00' + id + '\x00' + contentHashHex);
  }

  // ---- signature block read/write -------------------------------------------
  function readSig(bytes) {
    const span = gif.findAppExtSpan(bytes, SIG_MARKER, SIG_AUTH);
    if (!span) return null;
    const parts = [];
    let p = span.headerEnd;
    while (p < bytes.length) { const n = bytes[p]; if (!n) break; parts.push(bytes.subarray(p + 1, p + 1 + n)); p += 1 + n; }
    try { return JSON.parse(gif.bytesToText(concat(parts))); } catch (e) { return null; }
  }
  // Write (or replace) the signature block, just before the trailer.
  function writeSig(bytes, sigObj) {
    const base = stripBlock(bytes, SIG_MARKER);
    const block = gif.appExtBlock(SIG_MARKER, SIG_AUTH, te(JSON.stringify(sigObj)));
    let end = base.length;
    if (base[end - 1] === 0x3b) end -= 1;
    const out = new Uint8Array(end + block.length + 1);
    out.set(base.subarray(0, end), 0);
    out.set(block, end);
    out[out.length - 1] = 0x3b;
    return out;
  }

  // ---- domain identity: Ed25519 ---------------------------------------------
  const b64ToBytes = (s) => { const bin = atob(s.replace(/\s+/g, '')); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  const bytesToB64 = (a) => { let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };

  // Sign/verify ride THE ONE Ed25519 DOOR (gifos-ed.js): VERIFY is what
  // matters on old browsers — an app badge must check out on the same old
  // iPhone that installs the app. Minting a domain key (below) stays native
  // WebCrypto: that is the developer's own sign.html flow on a dev machine.
  const ed = () => {
    if ((!GifOS.ed) && typeof document === 'undefined' && typeof require === 'function') { try { require('./gifos-ed.js'); } catch (e) {} }
    if (!GifOS.ed) throw new Error('gifos-ed.js must load before gifos-sign.js');
    return GifOS.ed;
  };
  async function ed25519Sign(privateKey, msg) {
    return await ed().sign(privateKey, msg);
  }
  async function ed25519Verify(pub32, sig64, msg) {
    try { return await ed().verify(pub32, sig64, msg); } catch (e) { return false; }
  }
  async function generateDomainKey() {
    const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    return { keyPair: kp, publicKeyB64: bytesToB64(pub) };
  }
  const isDomain = (id) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(id) && id.indexOf('@') === -1;
  const isEmail = (id) => /^[^@\s]+@([a-z0-9-]+\.)+[a-z]{2,}$/i.test(id);

  // ---- email identity: minimal OpenPGP (validated against real gpg) ---------
  const OPENPGP_HASH = { 2: 'SHA-1', 8: 'SHA-256', 9: 'SHA-384', 10: 'SHA-512', 11: 'SHA-224' };
  function* pgpPackets(buf) {
    let p = 0;
    while (p < buf.length) {
      const ctb = buf[p++];
      if (!(ctb & 0x80)) break;
      let tag, len;
      if (ctb & 0x40) {
        tag = ctb & 0x3f; const o = buf[p++];
        if (o < 192) len = o;
        else if (o < 224) len = ((o - 192) << 8) + buf[p++] + 192;
        else if (o === 255) { len = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]; p += 4; }
        else break; // partial-length bodies unsupported
      } else {
        tag = (ctb >> 2) & 0x0f; const lt = ctb & 0x03;
        if (lt === 0) len = buf[p++];
        else if (lt === 1) { len = (buf[p] << 8) | buf[p + 1]; p += 2; }
        else if (lt === 2) { len = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]; p += 4; }
        else break;
      }
      yield { tag, body: buf.subarray(p, p + len) };
      p += len;
    }
  }
  const mpi = (b, o) => { const bits = (b[o] << 8) | b[o + 1]; const n = (bits + 7) >> 3; return { val: b.subarray(o + 2, o + 2 + n), next: o + 2 + n }; };

  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  // One v4 public key packet body -> a key we can verify with, or null.
  // Supported: EdDSA/Ed25519 (algo 22/27) and RSA >= 2048 bits (algo 1/3).
  function pgpKeyOf(body) {
    if (!body || body[0] !== 4) return null;                    // v4 only
    const algo = body[5];
    let k = null;
    if (algo === 22 || algo === 27) {            // EdDSA / Ed25519
      let o = 6;
      const oidLen = body[o]; o += 1 + oidLen;   // curve OID (length-prefixed, not an MPI)
      const pt = mpi(body, o);
      k = { kind: 'ed25519', pub: pt.val[0] === 0x40 ? pt.val.subarray(1) : pt.val };
    } else if (algo === 1 || algo === 3) {       // RSA (encrypt+sign / sign-only)
      const n = mpi(body, 6);
      const e = mpi(body, n.next);
      if (n.val.length * 8 >= 2048) k = { kind: 'rsa', n: n.val, e: e.val };
    }
    if (!k) return null;
    k.algo = algo; k.created = u32(body, 1); k.body = body;
    return k;
  }
  // Signature subpackets (RFC 4880 §5.2.3.1) -> { type: body }; the last
  // occurrence of a type wins, as the RFC asks.
  function pgpSubpackets(area) {
    const out = {};
    let p = 0;
    while (p < area.length) {
      let len; const o = area[p++];
      if (o < 192) len = o;
      else if (o < 255) len = ((o - 192) << 8) + area[p++] + 192;
      else { len = u32(area, p); p += 4; }
      if (len < 1 || p + len > area.length) break;
      out[area[p] & 0x7f] = area.subarray(p + 1, p + len);
      p += len;
    }
    return out;
  }
  // Parse a v4 signature packet body.
  function pgpSigOf(b) {
    if (!b || b[0] !== 4) return null;           // v4 sigs only
    const type = b[1], pubAlgo = b[2], hashAlgo = b[3];
    const hashedLen = (b[4] << 8) | b[5];
    const hashedEnd = 6 + hashedLen;
    if (hashedEnd + 2 > b.length) return null;
    const hashedPortion = b.subarray(0, hashedEnd);
    const hashed = pgpSubpackets(b.subarray(6, hashedEnd));
    let o = hashedEnd;
    const unhashedLen = (b[o] << 8) | b[o + 1];
    const unhashed = pgpSubpackets(b.subarray(o + 2, o + 2 + unhashedLen));
    o += 2 + unhashedLen;
    o += 2;                                       // left 16 bits of hash
    const mpis = [];
    while (o < b.length - 1) { const m = mpi(b, o); mpis.push(m.val); o = m.next; }
    const created = hashed[2] && hashed[2].length >= 4 ? u32(hashed[2], 0) : 0;
    return { type, pubAlgo, hashAlgo, hashedPortion, hashed, unhashed, mpis, created };
  }
  // Parse a detached OpenPGP signature (the first signature packet in it).
  function pgpParseSig(sigBytes) {
    for (const sp of pgpPackets(sigBytes)) if (sp.tag === 2) return pgpSigOf(sp.body);
    return null;
  }
  const b64url = (a) => bytesToB64(a).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // Does `parsed` verify under key `k` over `data` (the bytes the signature
  // covers, before its own hashed portion and trailer are appended)?
  async function pgpCheck(parsed, k, data) {
    const hashName = OPENPGP_HASH[parsed.hashAlgo];
    if (!hashName || hashName === 'SHA-1') return false; // refuse weak hashes
    const tl = parsed.hashedPortion.length;
    const trailer = Uint8Array.from([0x04, 0xff, (tl >>> 24) & 255, (tl >>> 16) & 255, (tl >>> 8) & 255, tl & 255]);
    const message = concat([data, parsed.hashedPortion, trailer]);
    if ((parsed.pubAlgo === 22 || parsed.pubAlgo === 27) && k.kind === 'ed25519') {
      // EdDSA signs the digest; the signature is two 32-byte MPIs (R, S).
      if (parsed.mpis.length < 2) return false;
      const digest = new Uint8Array(await subtle.digest(hashName, message));
      const sig64 = new Uint8Array(64);
      sig64.set(parsed.mpis[0], 32 - parsed.mpis[0].length);
      sig64.set(parsed.mpis[1], 64 - parsed.mpis[1].length);
      return ed25519Verify(k.pub, sig64, digest);
    }
    if ((parsed.pubAlgo === 1 || parsed.pubAlgo === 3) && k.kind === 'rsa') {
      // RSA: PGP uses EMSA-PKCS1-v1_5 — exactly WebCrypto's RSASSA-PKCS1-v1_5,
      // which hashes `message` itself. One MPI; left-pad to the modulus size.
      if (!parsed.mpis.length || parsed.mpis[0].length > k.n.length) return false;
      const sig = new Uint8Array(k.n.length);
      sig.set(parsed.mpis[0], k.n.length - parsed.mpis[0].length);
      try {
        const key = await subtle.importKey('jwk',
          { kty: 'RSA', n: b64url(k.n), e: b64url(k.e), alg: undefined, ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: hashName }, false, ['verify']);
        return await subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, message);
      } catch (e) { return false; }                // malformed key material
    }
    return false;                                 // unsupported public-key algorithm
  }

  // ---- the certificate, and which of its keys may sign ----------------------
  // A transferable public key is a primary key, its user ids, its subkeys, and
  // signatures that bind them together (RFC 4880 §11.1). Taking "every key
  // packet in the file" as a signer, as this once did, trusted whatever was
  // pasted after the primary: an attacker's subkey appended to a real
  // certificate, a key the owner had REVOKED, an encryption-only subkey, a key
  // long EXPIRED. So the certificate is walked and each key must earn its
  // place — a verified self-signature carrying the sign flag, no verified
  // revocation, and for a subkey a verified binding by the primary AND the
  // subkey's own embedded back-signature (§5.2.1, 0x19), the proof the subkey
  // holder agreed to be bound. Expiry is enforced against the SIGNATURE's
  // creation time, as gpg does: an app signed while the key was valid stays
  // verified, a signature dated after the key expired verifies nothing.
  const keyPrefix = (body) => concat([Uint8Array.from([0x99, (body.length >> 8) & 255, body.length & 255]), body]);
  const uidPrefix = (uid) => concat([Uint8Array.from([0xb4, (uid.length >>> 24) & 255, (uid.length >>> 16) & 255, (uid.length >>> 8) & 255, uid.length & 255]), uid]);
  const flagsAllowSign = (sg) => { const f = sg.hashed[27]; return !f || !f.length || !!(f[0] & 0x02); }; // no key-flags subpacket: usable (§5.2.3.21)
  const expiryOf = (sg, created) => { const e = sg.hashed[9]; return e && e.length >= 4 && u32(e, 0) ? created + u32(e, 0) : Infinity; };
  function pgpCert(keyBytes) {
    const cert = { primary: null, primarySigs: [], uids: [], subkeys: [] };
    let cur = null;                               // where the next signature packet attaches
    for (const pk of pgpPackets(keyBytes)) {
      if (pk.tag === 6) { if (cert.primary) break; cert.primary = pgpKeyOf(pk.body); cur = { sigs: cert.primarySigs }; }
      else if (pk.tag === 13) { const u = { uid: pk.body, sigs: [] }; cert.uids.push(u); cur = u; }
      else if (pk.tag === 17) cur = { sigs: [] };  // user attribute — its certifications say nothing about signing
      else if (pk.tag === 14) { const sk = { key: pgpKeyOf(pk.body), body: pk.body, sigs: [] }; cert.subkeys.push(sk); cur = sk; }
      else if (pk.tag === 2 && cur) { const sg = pgpSigOf(pk.body); if (sg) cur.sigs.push(sg); }
    }
    return cert.primary ? cert : null;
  }
  // The keys of a certificate that may sign, each with its validity window
  // (seconds since the epoch): [{ key, notBefore, notAfter }].
  async function pgpSigningKeys(keyBytes) {
    const cert = pgpCert(keyBytes);
    if (!cert) return [];
    const P = cert.primary, pfx = keyPrefix(P.body);
    for (const sg of cert.primarySigs) if (sg.type === 0x20 && await pgpCheck(sg, P, pfx)) return []; // the owner revoked the whole certificate
    const out = [];
    let cert13 = null;                            // newest verified self-certification over any user id
    for (const u of cert.uids) {
      for (const sg of u.sigs) {
        if (sg.type < 0x10 || sg.type > 0x13) continue;
        if (cert13 && sg.created <= cert13.created) continue;
        if (await pgpCheck(sg, P, concat([pfx, uidPrefix(u.uid)]))) cert13 = sg;
      }
    }
    if (cert13 && flagsAllowSign(cert13)) out.push({ key: P, notBefore: P.created, notAfter: expiryOf(cert13, P.created) });
    for (const sk of cert.subkeys) {
      if (!sk.key) continue;
      const skPfx = concat([pfx, keyPrefix(sk.body)]);
      let revoked = false, bind = null;
      for (const sg of sk.sigs) if (sg.type === 0x28 && await pgpCheck(sg, P, skPfx)) { revoked = true; break; }
      if (revoked) continue;
      for (const sg of sk.sigs) {
        if (sg.type !== 0x18 || (bind && sg.created <= bind.created)) continue;
        if (await pgpCheck(sg, P, skPfx)) bind = sg;
      }
      if (!bind || !flagsAllowSign(bind)) continue;
      const embBytes = bind.hashed[32] || bind.unhashed[32];   // gpg keeps the back-signature in the unhashed area
      const emb = embBytes ? pgpSigOf(embBytes) : null;
      if (!emb || emb.type !== 0x19 || !(await pgpCheck(emb, sk.key, skPfx))) continue;
      out.push({ key: sk.key, notBefore: sk.key.created, notAfter: Math.min(expiryOf(bind, sk.key.created), cert13 ? expiryOf(cert13, P.created) : Infinity) });
    }
    return out;
  }
  // Verify a detached OpenPGP signature over `data` against a transferable key.
  async function pgpVerify(data, sigBytes, keyBytes) {
    const parsed = pgpParseSig(sigBytes);
    if (!parsed || (parsed.type !== 0x00 && parsed.type !== 0x01) || !parsed.created) return false; // a document signature with a creation time
    for (const k of await pgpSigningKeys(keyBytes)) {
      if (parsed.created < k.notBefore || parsed.created > k.notAfter) continue;
      if (await pgpCheck(parsed, k.key, data)) return true;
    }
    return false;
  }
  // ASCII armor per RFC 4880 §6.2: BEGIN line, optional "Key: value" armor
  // headers, a blank line, base64 body, an optional "=XXXX" CRC24 line, END.
  // Validated against real gpg output incl. Comment headers and CRLF endings.
  function dearmor(text) {
    const m = /-----BEGIN PGP[^-]*-----([\s\S]*?)-----END PGP/.exec(text);
    if (!m) return null;
    const b64 = [];
    let inBody = false;
    // strip the BEGIN line's own trailing newline(s) so the first line we see
    // is a real header/body line, not a phantom blank that ends the headers
    for (const raw of m[1].replace(/^[\r\n]+/, '').split(/\r?\n/)) {
      const l = raw.trim();
      if (!inBody) {
        if (l === '') { inBody = true; continue; }        // blank line ends headers
        if (/^[A-Za-z][A-Za-z-]*: /.test(l)) continue;    // armor header (Comment:, Version:, …)
        inBody = true;                                     // tolerant: body with no blank line
      }
      if (!l) continue;
      if (l[0] === '=' && l.length === 5) break;           // CRC24 line
      b64.push(l);
    }
    try { const out = b64ToBytes(b64.join('')); return out.length ? out : null; }
    catch (e) { return null; }
  }

  // ---- TOFU key pinning (first key seen for an identity wins) ---------------
  // The pinned fingerprint for an id, as bytes when it is a raw key (domain
  // pins are hex of the 32-byte Ed25519 key); null when unknown.
  function pinnedKey(id) {
    try {
      const pins = JSON.parse(localStorage.getItem('gifos_sig_pins') || '{}');
      const f = pins[id];
      if (typeof f !== 'string' || !/^[0-9a-f]{64}$/.test(f)) return null;
      const out = new Uint8Array(32);
      for (let i = 0; i < 32; i++) out[i] = parseInt(f.slice(i * 2, i * 2 + 2), 16);
      return out;
    } catch (e) { return null; }
  }
  function pinKey(id, fingerprint) {
    try {
      const pins = JSON.parse(localStorage.getItem('gifos_sig_pins') || '{}');
      if (pins[id] && pins[id] !== fingerprint) return { changed: true, first: pins[id] };
      if (!pins[id]) { pins[id] = fingerprint; localStorage.setItem('gifos_sig_pins', JSON.stringify(pins)); }
      return { changed: false };
    } catch (e) { return { changed: false }; }
  }

  // ---- fetch keys (network — desktop shell only, never the app sandbox) -----
  // A key file is a few dozen bytes; read at most a few KB of whatever answers
  // so a hostile host cannot make Verify buffer a large body.
  const KEY_READ_MAX = 4096;
  async function readCapped(r, max) {
    if (!r.body || typeof r.body.getReader !== 'function') { const t = await r.text(); if (t.length > max) throw new Error('key file too large'); return t; }
    const reader = r.body.getReader(); const chunks = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length; if (n > max) { try { reader.cancel(); } catch (e) {} throw new Error('key file too large'); }
      chunks.push(value);
    }
    const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    return new TextDecoder().decode(all);
  }
  async function fetchDomainKey(domain) {
    const url = 'https://' + domain + '/gifos.key';
    const r = await fetch(url, { mode: 'cors', redirect: 'error' });
    if (!r.ok) throw new Error('no gifos.key at ' + domain + ' (HTTP ' + r.status + ')');
    const txt = (await readCapped(r, KEY_READ_MAX)).trim();
    const b64 = txt.replace(/^-----BEGIN[^-]*-----/, '').replace(/-----END[^-]*-----$/, '').trim();
    const key = b64ToBytes(b64);
    if (key.length !== 32) throw new Error('gifos.key is not a 32-byte Ed25519 key');
    return key;
  }
  async function fetchEmailKey(email) {
    const r = await fetch(KEYSERVER + encodeURIComponent(email), { mode: 'cors' });
    if (!r.ok) throw new Error('no key on keys.openpgp.org for ' + email);
    const armored = await r.text();
    const bytes = dearmor(armored);
    if (!bytes) throw new Error('could not parse the key for ' + email);
    return bytes;
  }

  // ---- the public verdict ---------------------------------------------------
  // Returns { status, id, type, ts, detail }.
  //   'unsigned'  — no signature block
  //   'valid'     — signature verifies for the derived key location
  //   'tampered'  — a signature is present but does not verify these bytes
  //   'unverified'— network/key lookup failed (can't reach the key right now)
  async function verify(bytes) {
    const sig = readSig(bytes);
    if (!sig) return { status: 'unsigned' };
    const { type, alg } = sig;
    // A host name is case-insensitive; the fetch, the pin and the label must
    // agree on one spelling or a re-cased id would dodge a key-change warning.
    const id = type === 'domain' && typeof sig.id === 'string' ? sig.id.toLowerCase() : sig.id;
    if (!id || (type === 'domain' && !isDomain(id)) || (type === 'email' && !isEmail(id))) {
      return { status: 'tampered', detail: 'malformed signature identity' };
    }
    // A signature that is not even the right shape is a broken block, not a
    // key we could not reach: say TAMPERED before any network, so a GIF
    // cannot wear "signed by <brand>" on the strength of a claim alone.
    let sigBytes = null;
    try { sigBytes = typeof sig.sig === 'string' && sig.sig ? b64ToBytes(sig.sig) : null; } catch (e) { sigBytes = null; }
    if (!sigBytes || !sigBytes.length || (type === 'domain' && sigBytes.length !== 64)) {
      return { status: 'tampered', id, type, ts: sig.ts, detail: 'malformed signature' };
    }
    const chHex = hex(await contentHash(bytes));
    const msg = statement(type, id, chHex);
    try {
      if (type === 'domain') {
        let pub;
        try { pub = await fetchDomainKey(id); }
        catch (e) {
          // Offline, or the host is down: the pin IS the key we saw before
          // (hex of the raw public key), so a GIF from an identity this
          // computer already trusts still verifies. A mismatch here is not
          // called tampered — it may be a rotation we cannot confirm yet.
          const pinned = pinnedKey('domain:' + id);
          if (!pinned) throw e;
          const okPinned = await ed25519Verify(pinned, sigBytes, msg);
          if (!okPinned) throw e;
          return { status: 'valid', id, type, ts: sig.ts, keyChanged: false, offline: true };
        }
        const ok = await ed25519Verify(pub, sigBytes, msg);
        if (!ok) return { status: 'tampered', id, type, ts: sig.ts, detail: 'signature does not match these contents' };
        const pin = pinKey('domain:' + id, hex(pub));
        return { status: 'valid', id, type, ts: sig.ts, keyChanged: pin.changed };
      }
      if (type === 'email') {
        const keyBytes = await fetchEmailKey(id);
        const ok = await pgpVerify(msg, sigBytes, keyBytes);
        if (!ok) return { status: 'tampered', id, type, ts: sig.ts, detail: 'signature does not match these contents' };
        const pin = pinKey('email:' + id, hex(await sha256(keyBytes)).slice(0, 40));
        return { status: 'valid', id, type, ts: sig.ts, keyChanged: pin.changed };
      }
      return { status: 'tampered', detail: 'unknown signature type' };
    } catch (e) {
      return { status: 'unverified', id, type, ts: sig.ts, detail: String(e.message || e) };
    }
  }

  // ---- signing helpers (used by sign.html) ----------------------------------
  // Domain: sign entirely in-browser; the private key never leaves.
  async function signDomain(bytes, domain, keyPair, ts) {
    const chHex = hex(await contentHash(bytes));
    const sig = await ed25519Sign(keyPair.privateKey, statement('domain', domain, chHex));
    return writeSig(bytes, { v: 1, type: 'domain', id: domain, alg: 'ed25519', sig: bytesToB64(sig), ts: ts || null });
  }
  // Email: the user signs the statement bytes with their own PGP tool; we embed
  // the resulting detached OpenPGP signature. This returns the statement to sign.
  async function emailStatement(bytes, email) {
    const chHex = hex(await contentHash(bytes));
    return statement('email', email, chHex);
  }
  function attachEmailSig(bytes, email, detachedSigBytes, ts) {
    return writeSig(bytes, { v: 1, type: 'email', id: email, alg: 'openpgp', sig: bytesToB64(detachedSigBytes), ts: ts || null });
  }

  GifOS.sign = {
    verify, readSig, writeSig, contentHash, statement,
    generateDomainKey, signDomain, emailStatement, attachEmailSig,
    isDomain, isEmail,
    // exposed for tests
    _pgpVerify: pgpVerify, _pgpSigningKeys: pgpSigningKeys, _ed25519Verify: ed25519Verify, _b64ToBytes: b64ToBytes, _bytesToB64: bytesToB64, _dearmor: dearmor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
