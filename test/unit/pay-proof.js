// gifos-sign proofOf / checkProof: the pay Worker verifies an app's signature
// WITHOUT the app's bytes or the store.
//
// The proof is the picture, the manifest in full, and every other file as a
// sha256 — exactly what the signed statement commits to. The cases are the
// ways a buyer (or a copycat seller) would try to make a proof say something
// its author never signed: redirect the payout, widen the allowed rails,
// forge or drop a file, swap the picture, borrow another identity. Each must
// come back TAMPERED. Pure: no network, no Worker (docs/payments-testing.md,
// tier 1).
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
require(path.join(ROOT, 'site', 'js', 'gifos-gif.js'));
require(path.join(ROOT, 'site', 'js', 'gifos-ed.js'));
require(path.join(ROOT, 'site', 'js', 'gifos-sign.js'));
const { gif, sign } = globalThis.GifOS;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const b64 = (s) => Buffer.from(s).toString('base64');
const unb64 = (s) => Buffer.from(s, 'base64');
const clone = (o) => JSON.parse(JSON.stringify(o));

const AUTHOR = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';
const THIEF = '0xdeadBEEFdeadBEEFdeadBEEFdeadBEEFdeadBEEF';
const manifest = {
  gifos: '1.0', appId: 'paid-shop', name: 'Paid Shop', entry: 'index.html',
  capabilities: { pay: ['paypal', 'x402'] }, pay: { to: AUTHOR },
};

(async () => {
  const files = {
    'manifest.json': JSON.stringify(manifest),
    'index.html': '<h1>buy things</h1>',
    'js/app.js': 'console.log("shop")',
    '.state/db.json': '{"secret":"the user\'s own data"}',
  };
  const app = await gif.encode(files);
  const { keyPair, publicKeyB64 } = await sign.generateDomainKey();
  const signed = await sign.signDomain(app, 'author.example.com', keyPair, 1786000000000);
  const pub = sign._b64ToBytes(publicKeyB64);
  const keyFor = async (type, id) => { if (type === 'domain' && id === 'author.example.com') return pub; throw new Error('no key for ' + id); };

  // ---- the honest proof ------------------------------------------------------
  const proof = await sign.proofOf(signed);
  const ok = await sign.checkProof(proof, keyFor);
  check('an honest proof verifies, and yields the manifest AS SIGNED',
    ok.status === 'valid' && ok.id === 'author.example.com' && ok.type === 'domain'
    && ok.manifest.pay.to === AUTHOR && JSON.stringify(ok.manifest.capabilities.pay) === '["paypal","x402"]', JSON.stringify(ok).slice(0, 160));
  check('the proof carries hashes, never the app\'s code', !JSON.stringify(proof).includes('buy things') && !JSON.stringify(proof).includes('console.log'));
  check('the user\'s own .state never leaves in a proof — not even as a hash', !Object.keys(proof.hashes).some((p) => p.indexOf('.state/') === 0));
  check('the full verify() and the proof agree on this app', (await sign.verify(signed)).status !== 'tampered');
  const saved = await gif.encode(Object.assign({}, files, { '.state/db.json': '{"secret":"changed after signing"}' }));
  const resigned = sign.writeSig(saved, sign.readSig(signed));
  check('saving app state after signing leaves the proof valid (state is not signed)',
    (await sign.checkProof(await sign.proofOf(resigned), keyFor)).status === 'valid');

  // ---- the attacks -------------------------------------------------------------
  const bad = async (name, mutate, re) => {
    const p = clone(proof); mutate(p);
    const v = await sign.checkProof(p, keyFor);
    check(name, v.status === 'tampered' && (!re || re.test(v.detail || '')), v.status + ': ' + (v.detail || ''));
  };
  await bad('REDIRECTING the payout (edited pay.to) fails the signature',
    (p) => { p.manifest = b64(JSON.stringify(Object.assign({}, manifest, { pay: { to: THIEF } }))); }, /does not match/);
  await bad('WIDENING the allowed rails (adding fednow) fails the signature',
    (p) => { p.manifest = b64(JSON.stringify(Object.assign({}, manifest, { capabilities: { pay: ['paypal', 'x402', 'fednow'] } }))); }, /does not match/);
  await bad('a FORGED file hash fails', (p) => { p.hashes['index.html'] = '00'.repeat(32); }, /does not match/);
  await bad('a DROPPED file fails', (p) => { delete p.hashes['js/app.js']; }, /does not match/);
  await bad('an ADDED file fails', (p) => { p.hashes['evil.js'] = 'ab'.repeat(32); }, /does not match/);
  await bad('a hash claimed for manifest.json is ignored — the manifest is hashed from its bytes',
    (p) => { p.hashes['manifest.json'] = 'cd'.repeat(32); p.manifest = b64(JSON.stringify(Object.assign({}, manifest, { pay: { to: THIEF } }))); }, /does not match/);
  await bad('a SWAPPED picture fails', (p) => { const v = unb64(p.visual); v[v.length - 2] ^= 0xff; p.visual = v.toString('base64'); }, /does not match/);
  // The identity is INSIDE the signed statement: even an attacker who serves
  // the author's own public key at their domain cannot claim the signature.
  const vShared = await sign.checkProof(Object.assign(clone(proof), { sig: Object.assign(clone(proof.sig), { id: 'other.example.com' }) }), async () => pub);
  check('RE-ATTRIBUTING the signature fails — even to a domain that republishes the author\'s own key',
    vShared.status === 'tampered' && /does not match/.test(vShared.detail), vShared.status + ': ' + (vShared.detail || ''));
  await bad('a malformed file hash is refused before any key is fetched', (p) => { p.hashes['index.html'] = 'not-hex'; }, /malformed file hash/);
  await bad('a proof with no manifest is refused', (p) => { p.manifest = ''; }, /no manifest/);
  await bad('a malformed signature is refused', (p) => { p.sig.sig = b64('short'); }, /malformed signature/);
  await bad('non-base64 garbage is refused', (p) => { p.visual = '%%%'; });

  const wrongKey = (await sign.generateDomainKey()).publicKeyB64;
  const vWrong = await sign.checkProof(proof, async () => sign._b64ToBytes(wrongKey));
  check('the RIGHT bytes under the WRONG key (a takeover of the key file) fail', vWrong.status === 'tampered');
  const vNoKey = await sign.checkProof(proof, async () => { throw new Error('host down'); });
  check('a key that cannot be fetched is UNVERIFIED, not valid', vNoKey.status === 'unverified' && /host down/.test(vNoKey.detail));
  check('no signature block at all is UNSIGNED', (await sign.checkProof(Object.assign(clone(proof), { sig: null }), keyFor)).status === 'unsigned');
  check('an unsigned app has no proof to give', await sign.proofOf(app).then(() => false, (e) => /not signed/.test(e.message)));

  // ---- a REAL catalog app, against the site's published key -----------------
  const tipPath = path.join(ROOT, 'site', 'apps', 'tip-creators', 'tip-creators.gif');
  if (fs.existsSync(tipPath)) {
    const tip = new Uint8Array(fs.readFileSync(tipPath));
    const siteKey = sign.parseDomainKey(fs.readFileSync(path.join(ROOT, 'site', 'gifos.key'), 'utf8'));
    const tp = await sign.proofOf(tip);
    const tv = await sign.checkProof(tp, async (type, id) => { if (id !== 'gifos.app') throw new Error('unexpected ' + id); return siteKey; });
    const size = JSON.stringify(tp).length;
    check('the store\'s own tip-creators.gif proves itself against site/gifos.key, with no store lookup',
      tv.status === 'valid' && tv.id === 'gifos.app' && tv.manifest.appId === 'tip-creators', tv.status + ' ' + (tv.detail || ''));
    check('…and its proof is small enough to ride a checkout request', size < 512 * 1024, Math.round(size / 1024) + ' KB for a ' + Math.round(tip.length / 1024) + ' KB GIF');
  } else {
    check('site/apps/tip-creators/tip-creators.gif exists for the real-app case', false, tipPath);
  }

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1); });
