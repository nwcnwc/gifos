// Signing test: provenance for App GIFs.
//  - domain leg: Ed25519 via WebCrypto (sign + verify + tamper detection)
//  - email leg: a REAL gpg Ed25519 detached signature, verified by our
//    hand-written OpenPGP parser (no dependency) — end to end.
//  - the canonical hash survives state changes but not app changes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Node webcrypto under the browser globals the modules expect.
globalThis.crypto = require('crypto').webcrypto;
require(path.join(__dirname, '..', 'site', 'js', 'gifos-gif.js'));
require(path.join(__dirname, '..', 'site', 'js', 'gifos-sign.js'));
const gif = globalThis.GifOS.gif;
const sign = globalThis.GifOS.sign;

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }

function buildApp(indexHtml, state) {
  const files = {
    'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'signed', name: 'Signed', entry: 'index.html', capabilities: { db: true } }),
    'index.html': indexHtml,
  };
  if (state) files['.state/db.json'] = JSON.stringify(state);
  return gif.encode(files, { accent: [123, 92, 255] });
}

(async () => {
  const app = await buildApp('<h1>hello signed world</h1>');

  // ---- canonical hash: excludes .state and the sig block ----
  const h1 = Buffer.from(await sign.contentHash(app)).toString('hex');
  const withState = await gif.repack(app, {
    'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'signed', name: 'Signed', entry: 'index.html', capabilities: { db: true } }),
    'index.html': '<h1>hello signed world</h1>',
    '.state/db.json': JSON.stringify({ collections: { notes: { items: { a: 1 } } } }),
  });
  const h2 = Buffer.from(await sign.contentHash(withState)).toString('hex');
  check('content hash is stable across app-state changes', h1 === h2);
  const changedApp = await buildApp('<h1>TAMPERED</h1>');
  const h3 = Buffer.from(await sign.contentHash(changedApp)).toString('hex');
  check('content hash changes when app code changes', h1 !== h3);

  // ---- domain leg: Ed25519 ----
  const { keyPair, publicKeyB64 } = await sign.generateDomainKey();
  const signedGif = await sign.signDomain(app, 'example-signer.com', keyPair, '2026-07-05');
  check('signed GIF still decodes as the same app', gif.bytesToText((await gif.decode(signedGif)).files['index.html']) === '<h1>hello signed world</h1>');
  check('a signature block is present + readable', sign.readSig(signedGif).id === 'example-signer.com');

  // verify the domain signature directly (bypassing the network fetch)
  const pub = sign._b64ToBytes(publicKeyB64);
  const st = sign.statement('domain', 'example-signer.com', Buffer.from(await sign.contentHash(signedGif)).toString('hex'));
  const rawSig = sign._b64ToBytes(sign.readSig(signedGif).sig);
  check('domain Ed25519 signature verifies for the derived key', await sign._ed25519Verify(pub, rawSig, st));

  // signature survives a state save (repack keeps the sig block? — sig is a
  // separate block, so repack of state must NOT touch it)
  // Simulate: fold in state via the app's own path, then re-verify content hash.
  const stateOnSigned = sign.writeSig(app, sign.readSig(signedGif)); // sig block on a state-changed base
  const st2 = sign.statement('domain', 'example-signer.com', Buffer.from(await sign.contentHash(stateOnSigned)).toString('hex'));
  check('signature still matches after re-attaching to state-bearing bytes', await sign._ed25519Verify(pub, rawSig, st2));

  // tamper: change the app AFTER signing → must fail
  const tampered = sign.writeSig(changedApp, sign.readSig(signedGif));
  const stT = sign.statement('domain', 'example-signer.com', Buffer.from(await sign.contentHash(tampered)).toString('hex'));
  check('tampering after signing breaks verification', !(await sign._ed25519Verify(pub, rawSig, stT)));

  // ---- email leg: a REAL gpg Ed25519 detached signature ----
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-gpg-'));
  try {
    const env = Object.assign({}, process.env, { GNUPGHOME: home });
    fs.chmodSync(home, 0o700);
    fs.writeFileSync(path.join(home, 'params'),
      '%no-protection\nKey-Type: eddsa\nKey-Curve: ed25519\nKey-Usage: sign\nName-Real: Sig Tester\nName-Email: alice@example.com\nExpire-Date: 0\n%commit\n');
    execFileSync('gpg', ['--batch', '--gen-key', path.join(home, 'params')], { env, stdio: 'ignore' });

    // the signer signs the SAME statement bytes our verifier will rebuild
    const stmt = await sign.emailStatement(app, 'alice@example.com');
    const stmtPath = path.join(home, 'statement.bin');
    fs.writeFileSync(stmtPath, Buffer.from(stmt));
    execFileSync('gpg', ['--batch', '--yes', '--detach-sign', '--digest-algo', 'SHA256', '-o', stmtPath + '.sig', stmtPath], { env, stdio: 'ignore' });
    const detached = new Uint8Array(fs.readFileSync(stmtPath + '.sig'));
    const keyBytes = new Uint8Array(execFileSync('gpg', ['--export', 'alice@example.com'], { env }));

    const emailSigned = sign.attachEmailSig(app, 'alice@example.com', detached, '2026-07-05');
    check('email-signed GIF carries the OpenPGP signature', sign.readSig(emailSigned).type === 'email' && sign.readSig(emailSigned).alg === 'openpgp');
    check('email-signed GIF still runs the same app', gif.bytesToText((await gif.decode(emailSigned)).files['index.html']) === '<h1>hello signed world</h1>');

    // verify the real gpg signature with our parser (what the keyserver key does)
    const stmt2 = await sign.emailStatement(emailSigned, 'alice@example.com');
    const ok = await sign._pgpVerify(stmt2, sign._b64ToBytes(sign.readSig(emailSigned).sig), keyBytes);
    check('REAL gpg Ed25519 signature verifies via our OpenPGP parser', ok);

    // tamper the email-signed app → must fail
    const emailTampered = sign.writeSig(changedApp, sign.readSig(emailSigned));
    const stmtT = await sign.emailStatement(emailTampered, 'alice@example.com');
    const okT = await sign._pgpVerify(stmtT, sign._b64ToBytes(sign.readSig(emailSigned).sig), keyBytes);
    check('tampered email-signed app fails OpenPGP verification', !okT);

    // wrong key must not verify
    const badHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-gpg2-'));
    fs.chmodSync(badHome, 0o700);
    const env2 = Object.assign({}, process.env, { GNUPGHOME: badHome });
    fs.writeFileSync(path.join(badHome, 'params'),
      '%no-protection\nKey-Type: eddsa\nKey-Curve: ed25519\nKey-Usage: sign\nName-Real: Impostor\nName-Email: alice@example.com\nExpire-Date: 0\n%commit\n');
    execFileSync('gpg', ['--batch', '--gen-key', path.join(badHome, 'params')], { env: env2, stdio: 'ignore' });
    const wrongKey = new Uint8Array(execFileSync('gpg', ['--export', 'alice@example.com'], { env: env2 }));
    const okWrong = await sign._pgpVerify(stmt2, sign._b64ToBytes(sign.readSig(emailSigned).sig), wrongKey);
    check('a different key does NOT verify the signature', !okWrong);
    fs.rmSync(badHome, { recursive: true, force: true });

    // ---- ASCII armor: what keyservers actually return ----
    const armored = execFileSync('gpg', ['--armor', '--export', 'alice@example.com'], { env }).toString();
    const armoredComment = execFileSync('gpg', ['--armor', '--comment', 'looked up via keyserver', '--export', 'alice@example.com'], { env }).toString();
    const same = (a) => !!(a && a.length === keyBytes.length && a.every((b, i) => b === keyBytes[i]));
    check('dearmor decodes a real gpg armored key byte-for-byte', same(sign._dearmor(armored)));
    check('dearmor survives armor headers (Comment:)', same(sign._dearmor(armoredComment)));
    check('dearmor survives CRLF line endings', same(sign._dearmor(armored.replace(/\n/g, '\r\n'))));

    // ---- the FULL email verify() path, with only the network stubbed ----
    // (the sandbox blocks keys.openpgp.org; everything else is the real code:
    // statement rebuild → fetch → dearmor → OpenPGP parse → WebCrypto verify)
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (String(url).indexOf('keys.openpgp.org/vks/v1/by-email/alice%40example.com') === -1) throw new Error('unexpected URL ' + url);
      return { ok: true, status: 200, text: async () => armoredComment };
    };
    try {
      const verdict = await sign.verify(emailSigned);
      check('full verify() says VALID for the email-signed GIF', verdict.status === 'valid' && verdict.id === 'alice@example.com');
      const verdictT = await sign.verify(sign.writeSig(changedApp, sign.readSig(emailSigned)));
      check('full verify() says TAMPERED for altered contents', verdictT.status === 'tampered');
      globalThis.fetch = async () => { throw new Error('offline'); };
      const verdictOff = await sign.verify(emailSigned);
      check('full verify() degrades to UNVERIFIED when the keyserver is unreachable', verdictOff.status === 'unverified');
    } finally { globalThis.fetch = realFetch; }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }

  // ---- email leg with an RSA key (what most existing PGP users have) ----
  const rsaHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-rsa-'));
  try {
    fs.chmodSync(rsaHome, 0o700);
    const env = Object.assign({}, process.env, { GNUPGHOME: rsaHome });
    fs.writeFileSync(path.join(rsaHome, 'params'),
      '%no-protection\nKey-Type: RSA\nKey-Length: 3072\nKey-Usage: sign\nName-Real: RSA Tester\nName-Email: bob@example.com\nExpire-Date: 0\n%commit\n');
    execFileSync('gpg', ['--batch', '--gen-key', path.join(rsaHome, 'params')], { env, stdio: 'ignore' });
    const stmt = await sign.emailStatement(app, 'bob@example.com');
    const stmtPath = path.join(rsaHome, 'statement.bin');
    fs.writeFileSync(stmtPath, Buffer.from(stmt));
    execFileSync('gpg', ['--batch', '--yes', '--detach-sign', '--digest-algo', 'SHA256', '-o', stmtPath + '.sig', stmtPath], { env, stdio: 'ignore' });
    const rsaSigned = sign.attachEmailSig(app, 'bob@example.com', new Uint8Array(fs.readFileSync(stmtPath + '.sig')), '2026-07-05');
    const rsaArmored = execFileSync('gpg', ['--armor', '--export', 'bob@example.com'], { env }).toString();
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => rsaArmored });
    try {
      const v = await sign.verify(rsaSigned);
      check('REAL gpg RSA-3072 signature verifies through the full verify() path', v.status === 'valid' && v.id === 'bob@example.com');
      const vT = await sign.verify(sign.writeSig(changedApp, sign.readSig(rsaSigned)));
      check('tampered RSA-signed app reports TAMPERED', vT.status === 'tampered');
    } finally { globalThis.fetch = realFetch; }
  } finally {
    fs.rmSync(rsaHome, { recursive: true, force: true });
  }

  // ---- unsigned + verdict shape ----
  check('an unsigned GIF reports unsigned', (await sign.verify(app)).status === 'unsigned');

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
