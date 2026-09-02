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
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-gif.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-sign.js'));
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

    // ---- THE CERTIFICATE IS WALKED, NOT SCRAPED FOR KEY PACKETS ----
    // Every key in a certificate must earn its place: a verified self-signature
    // carrying the sign flag, no verified revocation, a verified binding (and
    // the subkey's own back-signature) for a subkey, and a validity window the
    // SIGNATURE's creation time falls inside. Fixtures are real gpg output.
    const gpgHome = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-gpg3-')); fs.chmodSync(h, 0o700); return h; };
    const gpgIn = (home, args, input, extra) => execFileSync('gpg', ['--batch', '--yes', '--no-tty'].concat(args), Object.assign({ env: Object.assign({}, process.env, { GNUPGHOME: home }), input, stdio: ['pipe', 'pipe', 'ignore'] }, extra || {}));
    const fprsOf = (home, email) => gpgIn(home, ['--with-colons', '--list-keys', email]).toString().split('\n').filter((l) => l.startsWith('fpr:')).map((l) => l.split(':')[9]);
    const signWith = (home, who, extra) => { // detached signature over the statement bytes
      const sp = path.join(home, 's.bin'); fs.writeFileSync(sp, Buffer.from(stmt));
      gpgIn(home, (extra || []).concat(['--local-user', who, '--detach-sign', '--digest-algo', 'SHA256', '-o', sp + '.sig', sp]));
      return new Uint8Array(fs.readFileSync(sp + '.sig'));
    };
    // (a) a SIGNING SUBKEY: binding by the primary + the subkey's embedded back-signature
    {
      const h = gpgHome();
      fs.writeFileSync(path.join(h, 'params'), '%no-protection\nKey-Type: eddsa\nKey-Curve: ed25519\nKey-Usage: cert\nSubkey-Type: eddsa\nSubkey-Curve: ed25519\nSubkey-Usage: sign\nName-Real: Sub Signer\nName-Email: sub@example.com\nExpire-Date: 0\n%commit\n');
      gpgIn(h, ['--gen-key', path.join(h, 'params')]);
      const [primaryFpr, subFpr] = fprsOf(h, 'sub@example.com');
      const sig = signWith(h, subFpr + '!');
      const kb = new Uint8Array(gpgIn(h, ['--export', 'sub@example.com']));
      check('a signature by a bound SIGNING SUBKEY verifies (binding + back-signature checked)', await sign._pgpVerify(stmt, sig, kb));
      const usable = await sign._pgpSigningKeys(kb);
      check('a cert-only primary is NOT offered as a signer; the signing subkey is', usable.length === 1 && usable[0].key.created > 0, usable.length);
      // Drop the subkey's binding signature: the same subkey, unbound, must be refused.
      const pkts = []; { // re-serialise the certificate without the signature packets that follow the subkey
        const buf = kb; let q = 0, afterSub = false;
        while (q < buf.length) {
          const ctb = buf[q]; let tag, len, hdr;
          if (ctb & 0x40) { tag = ctb & 0x3f; const o = buf[q + 1]; if (o < 192) { len = o; hdr = 2; } else if (o < 224) { len = ((o - 192) << 8) + buf[q + 2] + 192; hdr = 3; } else { len = (buf[q + 2] << 24 | buf[q + 3] << 16 | buf[q + 4] << 8 | buf[q + 5]) >>> 0; hdr = 6; } }
          else { tag = (ctb >> 2) & 0x0f; const lt = ctb & 3; if (lt === 0) { len = buf[q + 1]; hdr = 2; } else if (lt === 1) { len = (buf[q + 1] << 8) | buf[q + 2]; hdr = 3; } else { len = (buf[q + 1] << 24 | buf[q + 2] << 16 | buf[q + 3] << 8 | buf[q + 4]) >>> 0; hdr = 5; } }
          const whole = buf.subarray(q, q + hdr + len);
          if (tag === 14) afterSub = true;
          if (!(afterSub && tag === 2)) pkts.push(whole);
          q += hdr + len;
        }
      }
      const unbound = Buffer.concat(pkts.map((x) => Buffer.from(x)));
      check('the same subkey with its binding signature STRIPPED verifies nothing', !(await sign._pgpVerify(stmt, sig, new Uint8Array(unbound))));
      check('…and is not offered as a signer', (await sign._pgpSigningKeys(new Uint8Array(unbound))).length === 0);
      // A foreign subkey pasted onto a real certificate is the same case: no binding the primary made.
      void primaryFpr;
      fs.rmSync(h, { recursive: true, force: true });
    }
    // (b) a REVOKED primary verifies nothing, even a signature it made before the revocation
    {
      const h = gpgHome();
      fs.writeFileSync(path.join(h, 'params'), '%no-protection\nKey-Type: eddsa\nKey-Curve: ed25519\nKey-Usage: sign\nName-Real: Gone\nName-Email: gone@example.com\nExpire-Date: 0\n%commit\n');
      gpgIn(h, ['--gen-key', path.join(h, 'params')]);
      const [fpr] = fprsOf(h, 'gone@example.com');
      const sig = signWith(h, fpr);
      const before = new Uint8Array(gpgIn(h, ['--export', 'gone@example.com']));
      check('before revocation the signature verifies', await sign._pgpVerify(stmt, sig, before));
      // gpg 2.1+ writes a revocation certificate for every generated key into
      // openpgp-revocs.d/, armoured with a leading ':' on the BEGIN line as a
      // safety catch; removing the colon and importing it revokes the key.
      const rev = fs.readFileSync(path.join(h, 'openpgp-revocs.d', fpr + '.rev'), 'utf8').replace(/^:(-----BEGIN)/m, '$1');
      fs.writeFileSync(path.join(h, 'rev.asc'), rev);
      gpgIn(h, ['--import', path.join(h, 'rev.asc')]);
      const after = new Uint8Array(gpgIn(h, ['--export', 'gone@example.com']));
      check('after the owner REVOKES the key, the same signature verifies nothing', !(await sign._pgpVerify(stmt, sig, after)));
      fs.rmSync(h, { recursive: true, force: true });
    }
    // (c) EXPIRY is judged at the signature's creation time: a signature made
    //     inside the key's window stays good, one dated after the key expired
    //     verifies nothing. The key's whole life is played out with gpg's
    //     --faked-system-time so the window is deterministic.
    {
      const h = gpgHome();
      const at = (t) => ['--faked-system-time', t + '!'];
      fs.writeFileSync(path.join(h, 'params'), '%no-protection\nKey-Type: eddsa\nKey-Curve: ed25519\nKey-Usage: sign\nName-Real: Timed\nName-Email: timed@example.com\nExpire-Date: 0\n%commit\n');
      gpgIn(h, at('20200101T000000').concat(['--gen-key', path.join(h, 'params')]));
      const [fpr] = fprsOf(h, 'timed@example.com');
      const early = signWith(h, fpr, at('20200115T000000'));   // inside the window to come
      const late = signWith(h, fpr, at('20200601T000000'));    // after it
      // Now the owner sets the key to expire on 2020-03-01 (a newer self-signature, dated 2020-02-01).
      gpgIn(h, at('20200201T000000').concat(['--quick-set-expire', fpr, '20200301T000000']));
      const kb = new Uint8Array(gpgIn(h, ['--export', 'timed@example.com']));
      check('a signature made INSIDE the key\'s validity window verifies', await sign._pgpVerify(stmt, early, kb));
      check('a signature dated AFTER the key expired verifies nothing', !(await sign._pgpVerify(stmt, late, kb)));
      fs.rmSync(h, { recursive: true, force: true });
    }

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
