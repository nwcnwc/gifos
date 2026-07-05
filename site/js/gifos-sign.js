/*
 * gifos-sign.js — provenance signatures for App GIFs.
 *
 * "Signed by nathancheng.com" or "signed by alice@example.com" means: someone
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
 *     .state/** file — so saving app state never voids the author's signature,
 *     but changing the app or its artwork does.
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
  //    every app file EXCEPT .state/** .
  // Consequence: saving app state (which only rewrites .state inside GIFOS1.0)
  // changes neither term, so the signature survives; changing app code or
  // artwork changes one of them, so it (correctly) breaks.
  function stripBlock(bytes, marker) {
    const span = gif.findAppExtSpan(bytes, marker);
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
        if (path.indexOf('.state/') === 0) continue; // volatile — never signed
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
    const span = gif.findAppExtSpan(bytes, SIG_MARKER);
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

  async function ed25519Sign(privateKey, msg) {
    return new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, msg));
  }
  async function ed25519Verify(pub32, sig64, msg) {
    try {
      const key = await subtle.importKey('raw', pub32, { name: 'Ed25519' }, false, ['verify']);
      return await subtle.verify({ name: 'Ed25519' }, key, sig64, msg);
    } catch (e) { return false; }
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

  // Extract every Ed25519 public key (32 bytes) from a transferable public key.
  function pgpEd25519Keys(keyBytes) {
    const keys = [];
    for (const pk of pgpPackets(keyBytes)) {
      if (pk.tag !== 6 && pk.tag !== 14) continue; // primary key / subkey
      const b = pk.body;
      if (b[0] !== 4) continue;                    // v4 only
      if (b[5] !== 22 && b[5] !== 27) continue;    // EdDSA(22) / Ed25519(27)
      let o = 6;
      const oidLen = b[o]; o += 1 + oidLen;        // curve OID (length-prefixed, not an MPI)
      const pt = mpi(b, o);
      keys.push(pt.val[0] === 0x40 ? pt.val.subarray(1) : pt.val);
    }
    return keys;
  }
  // Parse a detached OpenPGP signature; return { hashAlgo, hashedPortion, sig64 }.
  function pgpParseSig(sigBytes) {
    for (const sp of pgpPackets(sigBytes)) {
      if (sp.tag !== 2) continue;
      const b = sp.body;
      if (b[0] !== 4) return null;                 // v4 sigs only
      const hashAlgo = b[3];
      const hashedLen = (b[4] << 8) | b[5];
      const hashedEnd = 6 + hashedLen;
      const hashedPortion = b.subarray(0, hashedEnd);
      let o = hashedEnd;
      const unhashedLen = (b[o] << 8) | b[o + 1]; o += 2 + unhashedLen;
      o += 2;                                       // left 16 bits of hash
      const r = mpi(b, o); const s = mpi(b, r.next);
      const sig64 = new Uint8Array(64);
      sig64.set(r.val, 32 - r.val.length); sig64.set(s.val, 64 - s.val.length);
      return { hashAlgo, hashedPortion, sig64 };
    }
    return null;
  }
  // Verify a detached OpenPGP signature over `data` against a transferable key.
  async function pgpVerify(data, sigBytes, keyBytes) {
    const parsed = pgpParseSig(sigBytes);
    if (!parsed) return false;
    const hashName = OPENPGP_HASH[parsed.hashAlgo];
    if (!hashName || hashName === 'SHA-1') return false; // refuse weak hashes
    const tl = parsed.hashedPortion.length;
    const trailer = Uint8Array.from([0x04, 0xff, (tl >>> 24) & 255, (tl >>> 16) & 255, (tl >>> 8) & 255, tl & 255]);
    const digest = new Uint8Array(await subtle.digest(hashName, concat([data, parsed.hashedPortion, trailer])));
    for (const pub of pgpEd25519Keys(keyBytes)) {
      if (await ed25519Verify(pub, parsed.sig64, digest)) return true;
    }
    return false;
  }
  function dearmor(text) {
    const m = /-----BEGIN PGP[^-]*-----[\r\n]+([\s\S]*?)[\r\n]+=[\s\S]{4}[\r\n]+-----END/.exec(text)
      || /-----BEGIN PGP[^-]*-----[\r\n]+([\s\S]*?)[\r\n]+-----END/.exec(text);
    if (!m) return null;
    const body = m[1].replace(/[\r\n]+/g, '').replace(/=[^=]*$/, (s) => (s.length === 5 ? '' : s)); // drop CRC24 tail if it slipped in
    try { return b64ToBytes(m[1].split('\n').filter((l) => l.indexOf('=') !== 0 || l.length > 5).join('')); }
    catch (e) { return null; }
  }

  // ---- TOFU key pinning (first key seen for an identity wins) ---------------
  function pinKey(id, fingerprint) {
    try {
      const pins = JSON.parse(localStorage.getItem('gifos_sig_pins') || '{}');
      if (pins[id] && pins[id] !== fingerprint) return { changed: true, first: pins[id] };
      if (!pins[id]) { pins[id] = fingerprint; localStorage.setItem('gifos_sig_pins', JSON.stringify(pins)); }
      return { changed: false };
    } catch (e) { return { changed: false }; }
  }

  // ---- fetch keys (network — desktop shell only, never the app sandbox) -----
  async function fetchDomainKey(domain) {
    const url = 'https://' + domain + '/gifos.key';
    const r = await fetch(url, { mode: 'cors', redirect: 'error' });
    if (!r.ok) throw new Error('no gifos.key at ' + domain + ' (HTTP ' + r.status + ')');
    const txt = (await r.text()).trim();
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
    const { type, id, alg } = sig;
    if (!id || (type === 'domain' && !isDomain(id)) || (type === 'email' && !isEmail(id))) {
      return { status: 'tampered', detail: 'malformed signature identity' };
    }
    const chHex = hex(await contentHash(bytes));
    const msg = statement(type, id, chHex);
    try {
      if (type === 'domain') {
        const pub = await fetchDomainKey(id);
        const ok = await ed25519Verify(pub, b64ToBytes(sig.sig), msg);
        if (!ok) return { status: 'tampered', id, type, ts: sig.ts, detail: 'signature does not match these contents' };
        const pin = pinKey('domain:' + id, hex(pub));
        return { status: 'valid', id, type, ts: sig.ts, keyChanged: pin.changed };
      }
      if (type === 'email') {
        const keyBytes = await fetchEmailKey(id);
        const ok = await pgpVerify(msg, b64ToBytes(sig.sig), keyBytes);
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
    _pgpVerify: pgpVerify, _ed25519Verify: ed25519Verify, _b64ToBytes: b64ToBytes, _bytesToB64: bytesToB64, _dearmor: dearmor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
