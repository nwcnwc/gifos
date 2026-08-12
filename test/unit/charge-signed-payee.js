// The foundation claim, tested against REAL signed GIFs rather than hand-made
// verdict objects: editing an app's PAYOUT ADDRESS breaks its signature.
//
// docs/payments.md says an app may charge only when it verifies as `signed`,
// and that the payee is safe because it lives in the signed payload. If
// manifest.json were somehow outside the canonical content hash, that whole
// design would be false and every other payments test would still pass. This is
// the test that would catch it.
//
// Network-free: the domain key is verified directly with sign._ed25519Verify,
// the same way test/unit/sign.js avoids fetching https://<domain>/gifos.key.
const path = require('path');
globalThis.crypto = require('crypto').webcrypto;
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-gif.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-sign.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-charge.js'));
const gif = globalThis.GifOS.gif;
const sign = globalThis.GifOS.sign;
const C = globalThis.GifOS.charge;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const hex = (b) => Buffer.from(b).toString('hex');
const AUTHOR = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const THIEF  = '0xdeadBEEFdeadBEEFdeadBEEFdeadBEEFdeadBEEF';

const manifestFor = (payTo) => JSON.stringify({
  gifos: '1.0', appId: 'paid-shop', name: 'Paid Shop', entry: 'index.html',
  capabilities: { db: true }, pay: { to: payTo, chain: 'eip155:84532' },
});

(async () => {
  const files = { 'manifest.json': manifestFor(AUTHOR), 'index.html': '<h1>buy things</h1>' };
  const app = await gif.encode(files);
  const { keyPair, publicKeyB64 } = await sign.generateDomainKey();
  const signedGif = await sign.signDomain(app, 'author.example.com', keyPair, '2026-08-12');
  const pub = sign._b64ToBytes(publicKeyB64);

  const statementFor = async (bytes, id) => sign.statement('domain', id || 'author.example.com', hex(await sign.contentHash(bytes)));
  const sigOf = (bytes) => sign._b64ToBytes(sign.readSig(bytes).sig);

  // Baseline: the untouched signed app verifies, and its manifest still parses.
  const okStatement = await statementFor(signedGif);
  check('the signed app verifies against its author key', await sign._ed25519Verify(pub, sigOf(signedGif), okStatement));
  const decoded = await gif.decode(signedGif);
  const m = JSON.parse(gif.bytesToText(decoded.files['manifest.json']));
  check('the payout address survives signing intact', m.pay.to === AUTHOR);
  check('…and the charge gate lets a valid app charge, to THAT address',
    (() => { const e = C.eligibility({ status: 'valid', id: 'author.example.com', type: 'domain' }, m);
             return e.allowed === true && e.payee.to === AUTHOR; })());

  // ---- THE ATTACK: redirect the money, keep the signature --------------------
  const stolen = Object.assign({}, decoded.files);
  stolen['manifest.json'] = manifestFor(THIEF);
  const tamperedApp = await gif.encode(stolen);
  const tamperedSigned = sign.writeSig(tamperedApp, sign.readSig(signedGif));

  const hashBefore = hex(await sign.contentHash(signedGif));
  const hashAfter = hex(await sign.contentHash(tamperedSigned));
  check('changing the payout address CHANGES the canonical content hash',
    hashBefore !== hashAfter, hashBefore.slice(0, 12) + ' -> ' + hashAfter.slice(0, 12));
  check('the author signature NO LONGER verifies over the redirected app',
    (await sign._ed25519Verify(pub, sigOf(tamperedSigned), await statementFor(tamperedSigned))) === false,
    'so verify() returns TAMPERED');
  // The redirected GIF really does carry the thief's address — so the ONLY
  // thing standing between the user and it is the tampered verdict above.
  const stolenManifest = JSON.parse(gif.bytesToText((await gif.decode(tamperedSigned)).files['manifest.json']));
  check('the redirected app really does name the thief as payee', stolenManifest.pay.to === THIEF, THIEF.slice(0, 10) + '…');
  check('and a TAMPERED verdict cannot charge, even though that manifest is well-formed',
    C.eligibility({ status: 'tampered', detail: 'signature does not match these contents' }, stolenManifest).allowed === false);

  // ---- but SAVING STATE must not void the author's signature -----------------
  // A purchase must not be voided by the app writing to its own DB.
  const withState = Object.assign({}, decoded.files, { '.state/db.json': '{"level":7}' });
  const stateApp = await gif.encode(withState);
  const stateSigned = sign.writeSig(stateApp, sign.readSig(signedGif));
  check('saving app state does NOT change the content hash',
    hex(await sign.contentHash(stateSigned)) === hashBefore, 'state is excluded from the digest');
  check('…so the signature still verifies after a state save, and the app can still charge',
    await sign._ed25519Verify(pub, sigOf(stateSigned), await statementFor(stateSigned)));

  // ---- a remix cannot inherit the original's revenue -------------------------
  // Strip the signature (an honest remix): the app becomes anonymous, and an
  // anonymous app cannot take money — it must be re-signed by the remixer.
  const remix = await gif.encode(Object.assign({}, decoded.files, { 'index.html': '<h1>my remix</h1>' }));
  check('a remix without a signature reads as unsigned', sign.readSig(remix) === null || sign.readSig(remix) === undefined);
  check('…and an unsigned app cannot charge', C.eligibility({ status: 'unsigned' }, JSON.parse(manifestFor(AUTHOR))).allowed === false);

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
