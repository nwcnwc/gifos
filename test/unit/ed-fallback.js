// THE TWO ENGINES ARE ONE ALGORITHM — the byte-compatibility guard for the
// Ed25519 fallback signer (site/js/gifos-ed.js + site/js/vendor/nacl-fast.js).
//
// The fallback's entire justification is that a browser without native
// WebCrypto Ed25519 (an old iPhone's Safari 16) interoperates in the SAME
// room with native signers: same seed → same public key, and every signature
// verifies across engines, both directions. If any of that drifts, old and
// new browsers silently split into mutually-deaf cohorts — worse than the
// hard wall the fallback replaced. So this suite cross-checks the vendored
// JS signer against node's native WebCrypto Ed25519, byte for byte.
//
// Also guarded here: the vendored file is VERBATIM upstream (sha256 of the
// block below the marker), because a vendored crypto file that drifts from
// its pin is a supply-chain hole with a friendly filename.
//
// Needs nothing (pure node).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) failures++; };
const hex = (u) => Buffer.from(u).toString('hex');

(async () => {
  // ---- the pin: vendored file is verbatim upstream --------------------------
  const VENDOR = path.join(ROOT, 'site', 'js', 'vendor', 'nacl-fast.js');
  const raw = fs.readFileSync(VENDOR, 'utf8');
  const marker = '==== VERBATIM UPSTREAM tweetnacl-1.0.3/nacl-fast.js BELOW ====';
  const at = raw.indexOf(marker);
  check('vendor file carries the verbatim marker', at !== -1);
  const body = raw.slice(raw.indexOf('\n', at) + 1);
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  check('vendored block sha256 matches the pinned upstream hash',
    sha === '6bcd37a3b20dce913f82d4b23e4e2b661058b4b953df8a3f8c45d56ac4f72447', sha);
  check('…and the header records that same hash (self-describing pin)', raw.indexOf(sha) !== -1);

  // ---- load both engines ----------------------------------------------------
  const nacl = require(VENDOR);
  const subtle = globalThis.crypto.subtle;
  const ED_PKCS8 = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
  async function nativeFromSeed(seed) {
    const pkcs8 = new Uint8Array(48); pkcs8.set(ED_PKCS8, 0); pkcs8.set(seed, 16);
    const priv = await subtle.importKey('pkcs8', pkcs8, 'Ed25519', true, ['sign']);
    const jwk = await subtle.exportKey('jwk', priv);
    const pubRaw = new Uint8Array(Buffer.from(String(jwk.x), 'base64url'));
    return { priv, pubRaw };
  }
  const nativeVerify = async (pubRaw, sig, msg) => {
    const pub = await subtle.importKey('raw', pubRaw, 'Ed25519', false, ['verify']);
    return subtle.verify('Ed25519', pub, sig, msg);
  };

  // ---- same seed, same public key, across 32 seeds --------------------------
  let pubMatch = 0;
  for (let i = 0; i < 32; i++) {
    const seed = crypto.randomBytes(32);
    const n = await nativeFromSeed(seed);
    const j = nacl.sign.keyPair.fromSeed(seed);
    if (hex(n.pubRaw) === hex(j.publicKey)) pubMatch++;
  }
  check('same seed → same public key, 32/32 random seeds', pubMatch === 32, pubMatch);

  // ---- signatures cross-verify, both directions -----------------------------
  const seed = crypto.randomBytes(32);
  const n = await nativeFromSeed(seed);
  const j = nacl.sign.keyPair.fromSeed(seed);
  const msg = new TextEncoder().encode(JSON.stringify({ v: 1, t: 'CLAIM', k: 'c:0.0.0', from: 'k_test' }));

  const jsSig = nacl.sign.detached(msg, j.secretKey);
  check('JS signature verifies under NATIVE verify', await nativeVerify(n.pubRaw, jsSig, msg));
  const natSig = new Uint8Array(await subtle.sign('Ed25519', n.priv, msg));
  check('NATIVE signature verifies under JS verify', nacl.sign.detached.verify(msg, natSig, j.publicKey));
  check('…and the two engines even produce IDENTICAL bytes (Ed25519 is deterministic)', hex(jsSig) === hex(natSig));

  // ---- tampering rejected, both engines -------------------------------------
  const bad = new Uint8Array(msg); bad[3] ^= 1;
  check('tampered message rejected by NATIVE', !(await nativeVerify(n.pubRaw, jsSig, bad)));
  check('tampered message rejected by JS', !nacl.sign.detached.verify(bad, natSig, j.publicKey));
  const badSig = new Uint8Array(jsSig); badSig[10] ^= 1;
  check('tampered signature rejected by JS', !nacl.sign.detached.verify(msg, badSig, j.publicKey));

  // ---- the door itself: gifos-ed on both engines ----------------------------
  // native engine (stock node has WebCrypto Ed25519)
  require(path.join(ROOT, 'site', 'js', 'gifos-ed.js'));
  const edNative = globalThis.GifOS.ed;
  check('gifos-ed detects the native engine in stock node', (await edNative.engine()) === 'native');
  const kN = await edNative.keysFromSeed(new Uint8Array(seed));
  check('door(native): seed → the same public key', hex(kN.pubRaw) === hex(j.publicKey));
  const sigN = await edNative.sign(kN.priv, msg);
  check('door(native) signature cross-verifies under raw JS', nacl.sign.detached.verify(msg, sigN, j.publicKey));

  // js engine, forced: fresh module instance with the force flag up
  delete require.cache[require.resolve(path.join(ROOT, 'site', 'js', 'gifos-ed.js'))];
  const savedGifOS = globalThis.GifOS;
  globalThis.GifOS = {};
  globalThis.GIFOS_ED_FORCE_JS = true;
  require(path.join(ROOT, 'site', 'js', 'gifos-ed.js'));
  const edJs = globalThis.GifOS.ed;
  check('gifos-ed honors GIFOS_ED_FORCE_JS (js engine)', (await edJs.engine()) === 'js');
  const kJ = await edJs.keysFromSeed(new Uint8Array(seed));
  check('door(js): seed → the same public key', hex(kJ.pubRaw) === hex(j.publicKey));
  const sigJ = await edJs.sign(kJ.priv, msg);
  check('door(js) signature verifies under NATIVE verify', await nativeVerify(n.pubRaw, sigJ, msg));
  check('door(js) verifies a NATIVE signature', await edJs.verify(kJ.pubRaw, natSig, msg));
  check('door(js) rejects a tampered frame', !(await edJs.verify(kJ.pubRaw, natSig, bad)));
  globalThis.GIFOS_ED_FORCE_JS = false;
  globalThis.GifOS = savedGifOS;

  // ---- the net layer rides the door: mixed-engine {sp,sig,pub} blocks -------
  // (gifos-net edSign/edVerify are what mesh-identity and §SIG actually call)
  require(path.join(ROOT, 'site', 'js', 'gifos-net.js'));
  const net = globalThis.GifOS.net;
  const kk = await net.edKeysFromSeedHex(Buffer.from(crypto.randomBytes(32)).toString('hex'));
  const sp = JSON.stringify({ v: 1, t: 'HELLO', from: 'k_x' });
  const sigB64 = await net.edSign(kk.priv, sp);
  check('net.edSign/edVerify round-trip through the door', await net.edVerify(kk.pubB64, sigB64, sp));
  check('net.edVerify rejects a wrong statement', !(await net.edVerify(kk.pubB64, sigB64, sp + 'x')));
  // a JS-engine key's signature must satisfy net.edVerify (the mixed room)
  const kpJs = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));
  const spJ = 'mixed-room-statement';
  const sigJs = nacl.sign.detached(new TextEncoder().encode(spJ), kpJs.secretKey);
  check('a JS-signed block satisfies net.edVerify (native side of a mixed room)',
    await net.edVerify(Buffer.from(kpJs.publicKey).toString('base64'), Buffer.from(sigJs).toString('base64'), spJ));

  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
