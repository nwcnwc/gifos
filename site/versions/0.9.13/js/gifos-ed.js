/*
 * gifos-ed.js — THE ONE Ed25519 DOOR (docs/meet-security.md §SIG).
 *
 * Every Ed25519 operation in GifOS goes through this module: the S4 mesh
 * identity (mesh-identity.js), admin authority (gifos-net.js §SIG), the app
 * lane owner key (app-owner.js), and app-GIF badge verification
 * (gifos-sign.js). One door, two engines behind it:
 *
 *   native — WebCrypto's Ed25519 (Chrome/Edge 137+, Firefox 129+, Safari 17+).
 *   js     — the vendored, pinned tweetnacl (js/vendor/nacl-fast.js), loaded
 *            LAZILY and only on a browser whose WebCrypto lacks Ed25519.
 *            Byte-identical RFC 8032 signatures: a js signer and a native
 *            signer interoperate in the SAME room — same wire format, no
 *            flag day. This is what dropped the browser floor from
 *            Safari 17 / Chrome 137 to the site's own syntax floor.
 *
 * NOT a live dependency: the fallback is a static file on our own origin,
 * pinned by sha256 (see its header). No CDN, no network call, ever. Modern
 * browsers never even fetch it.
 *
 * Engine choice is detected ONCE (the same probe shape run.html's preflight
 * used when Ed25519 still gated admission: pkcs8 import + JWK export, which
 * is exactly what Safari 16 / Firefox 128 / Chrome 136 reject). Signing
 * dispatches on the KEY's own shape, not the engine, so a key minted under
 * one engine is always signed with the engine that minted it.
 *
 * Key representation:
 *   native priv — a CryptoKey (as before).
 *   js priv     — { sk: Uint8Array(64) } (tweetnacl secretKey = seed||pub).
 *   pubRaw      — Uint8Array(32), both engines, always.
 *
 * Custody note, argued: the S4 identity was ALWAYS seed-derived in JS memory
 * (mesh-identity.js mint — randHex seed through the pkcs8 wrapper), so the js
 * engine changes nothing about that threat model.
 *
 * Test hook: set root.GIFOS_ED_FORCE_JS = true BEFORE first use to force the
 * js engine on a browser that has native (byte-compat and interop suites).
 */
(function (root) {
  'use strict';
  const GifOS = root.GifOS = root.GifOS || {};

  // Where the vendored fallback lives: a sibling vendor/ of THIS script's own
  // URL — the same resolve-against-own-src discipline runtime.js uses for
  // app-owner.js, so /meet/ and /join/ mounts and frozen /versions/<v>/
  // snapshots all reach their own copy.
  const OWN_SRC = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  const VENDOR_URL = OWN_SRC ? new URL('vendor/nacl-fast.js', OWN_SRC).href : 'js/vendor/nacl-fast.js';

  const ED_PKCS8 = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
  const subtle = () => root.crypto && root.crypto.subtle;

  // ---- the js engine: load the vendored tweetnacl exactly once ---------------
  let naclP = null;
  function loadNacl() {
    if (naclP) return naclP;
    naclP = (async () => {
      if (root.nacl && root.nacl.sign) return root.nacl;
      // node (unit suites): plain require, same file.
      if (typeof document === 'undefined' && typeof require === 'function') {
        return require('./vendor/nacl-fast.js');
      }
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = VENDOR_URL;
        s.onload = res;
        s.onerror = () => rej(new Error('gifos-ed: fallback signer failed to load: ' + VENDOR_URL));
        document.head.appendChild(s);
      });
      if (!root.nacl || !root.nacl.sign) throw new Error('gifos-ed: vendor loaded but nacl.sign missing');
      return root.nacl;
    })();
    return naclP;
  }

  // ---- engine detection, once ------------------------------------------------
  let engineP = null;
  function engine() {
    if (!engineP) engineP = (async () => {
      if (!root.GIFOS_ED_FORCE_JS && subtle()) {
        try {
          const probe = new Uint8Array(ED_PKCS8.length + 32);
          probe.set(ED_PKCS8, 0);
          for (let i = 16; i < 48; i++) probe[i] = (i * 7) & 0xff;
          const k = await subtle().importKey('pkcs8', probe, 'Ed25519', true, ['sign']);
          const jwk = await subtle().exportKey('jwk', k);
          if (jwk && jwk.x) return 'native';
        } catch (e) { /* no native Ed25519 — the exact Safari-16 shape */ }
      }
      await loadNacl();
      return 'js';
    })();
    return engineP;
  }

  const b64pad = (s) => s + '='.repeat((4 - s.length % 4) % 4);
  function jwkXtoRaw(x) {
    const bin = atob(b64pad(String(x).replace(/-/g, '+').replace(/_/g, '/')));
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  // ---- keys ------------------------------------------------------------------
  // seed: Uint8Array(32) → { priv, pubRaw }. Deterministic (RFC 8032), and the
  // SAME pubRaw from either engine — guarded by test/unit/ed-fallback.js.
  async function keysFromSeed(seed) {
    if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('gifos-ed: seed must be 32 bytes');
    if ((await engine()) === 'native') {
      const pkcs8 = new Uint8Array(ED_PKCS8.length + 32);
      pkcs8.set(ED_PKCS8, 0); pkcs8.set(seed, ED_PKCS8.length);
      const priv = await subtle().importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
      const jwk = await subtle().exportKey('jwk', priv);
      return { priv, pubRaw: jwkXtoRaw(jwk.x) };
    }
    const nacl = await loadNacl();
    const kp = nacl.sign.keyPair.fromSeed(seed);
    return { priv: { sk: kp.secretKey }, pubRaw: kp.publicKey };
  }

  // ---- a key that can sign and can NEVER be read -----------------------------
  // For MONEY (docs/payments.md). keysFromSeed() mints extractable keys on
  // purpose: an identity must be portable, exportable, restorable. A payment
  // key is the opposite — it must be impossible to exfiltrate, so an XSS in
  // the OS page becomes a bounded signing oracle instead of permanent theft.
  //
  // WebCrypto's generateKey sets `extractable` on the PRIVATE key only; the
  // public key stays exportable, which is how we still learn the address.
  //
  // The js (tweetnacl) engine cannot honour this — its secret key is a plain
  // Uint8Array by construction — so this REFUSES rather than silently handing
  // back a readable key. Payments therefore require WebCrypto Ed25519, which
  // is already the mesh floor (Chrome 137 / Firefox 129 / Safari 17).
  async function generateSealed() {
    if ((await engine()) !== 'native') {
      throw new Error('gifos-ed: a sealed (non-extractable) key needs WebCrypto Ed25519 — this browser falls back to the js engine, where a secret key is readable bytes. Payments are refused here rather than pretending the key is sealed.');
    }
    const kp = await subtle().generateKey('Ed25519', false, ['sign', 'verify']);
    const pubRaw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
    return { priv: kp.privateKey, pubRaw };
  }

  // ---- sign ------------------------------------------------------------------
  // Dispatch on the KEY's shape: a js key always signs js, a CryptoKey always
  // signs native — an engine race can never strand a key it cannot use.
  async function sign(priv, msg) {
    if (priv && priv.sk) {
      const nacl = await loadNacl();
      return nacl.sign.detached(msg, priv.sk);
    }
    return new Uint8Array(await subtle().sign('Ed25519', priv, msg));
  }

  // ---- verify ----------------------------------------------------------------
  // Never throws: bad key/sig shapes are `false`, exactly like edVerify always
  // behaved. Uses whichever engine this browser HAS.
  async function verify(pubRaw, sig, msg) {
    try {
      if ((await engine()) === 'native') {
        const pub = await subtle().importKey('raw', pubRaw, 'Ed25519', false, ['verify']);
        return await subtle().verify('Ed25519', pub, sig, msg);
      }
      const nacl = await loadNacl();
      return nacl.sign.detached.verify(msg, sig, pubRaw);
    } catch (e) { return false; }
  }

  GifOS.ed = { engine, keysFromSeed, generateSealed, sign, verify };
})(typeof window !== 'undefined' ? window : globalThis);
