// gifos-pay: the encoding layer everything downstream trusts.
//
// Base58 and address derivation are load-bearing in the worst way — an address
// off by one character is a payment to nobody, unrecoverably — so they are
// tested against published vectors, against real Solana addresses, and by
// round-trip over random bytes. Also asserts the custody claim in
// docs/payments.md: a payment key SIGNS but cannot be EXPORTED.
const path = require('path');
globalThis.crypto = require('crypto').webcrypto;
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-ed.js'));
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-pay.js'));
const ed = globalThis.GifOS.ed;
const pay = globalThis.GifOS.pay;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const hex = (h) => new Uint8Array((h.match(/../g) || []).map((b) => parseInt(b, 16)));

(async () => {
  // ---- published base58 vectors (Bitcoin alphabet) --------------------------
  const vectors = [
    ['', ''],
    ['61', '2g'],
    ['626262', 'a3gV'],
    ['636363', 'aPEr'],
    ['73696d706c792061206c6f6e6720737472696e67', '2cFupjhnEsSn59qHXstmK2ffpLv2'],
    ['00eb15231dfceb60925886b67d065299925915aeb172c06647', '1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L'],
    ['516b6fcd0f', 'ABnLTmg'],
    ['ecac89cad93923c02321', 'EJDM8drfXA6uyA'],
  ];
  let vOk = true;
  for (const [h, want] of vectors) {
    const got = pay.b58encode(hex(h || ''));
    if (got !== want) { vOk = false; console.log('   vector mismatch', h, '->', got, 'want', want); }
  }
  check('base58 matches the published vectors', vOk, vectors.length + ' vectors');

  // Leading zero bytes must survive as leading '1's — the classic bug.
  check('leading zero bytes encode as leading "1"', pay.b58encode(hex('000000287fb4cd')) === '111233QC4', pay.b58encode(hex('000000287fb4cd')));

  // ---- round trip over random bytes ---------------------------------------
  let rtOk = true;
  for (let i = 0; i < 300; i++) {
    const n = 1 + (i % 40);
    const b = new Uint8Array(n);
    globalThis.crypto.getRandomValues(b);
    const back = pay.b58decode(pay.b58encode(b));
    if (back.length !== b.length || back.some((x, j) => x !== b[j])) { rtOk = false; break; }
  }
  check('base58 round-trips arbitrary bytes', rtOk, '300 random buffers');

  // ---- real Solana addresses ----------------------------------------------
  // Devnet USDC mint and the system program — both are canonical 32-byte keys.
  const known = [
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet USDC mint
    '11111111111111111111111111111111',             // system program (all zero bytes)
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',  // SPL Token program
  ];
  let kOk = true;
  for (const a of known) {
    const raw = pay.pubFromAddress(a);
    if (raw.length !== 32 || pay.addressFromPub(raw) !== a) { kOk = false; console.log('   failed', a); }
  }
  check('real Solana addresses decode to 32 bytes and re-encode identically', kOk, known.length + ' addresses');

  check('a non-base58 character is refused', (() => {
    try { pay.b58decode('0OIl'); return false; } catch (e) { return /not base58/.test(e.message); }
  })());
  check('a short/long address is refused as an address', (() => {
    try { pay.pubFromAddress('2g'); return false; } catch (e) { return /not a Solana address/.test(e.message); }
  })());

  // ---- the custody claim ---------------------------------------------------
  const k = await ed.generateSealed();
  check('the payment key is NOT extractable', k.priv.extractable === false);
  check('exporting the payment key is refused by WebCrypto', await (async () => {
    try { await globalThis.crypto.subtle.exportKey('pkcs8', k.priv); return false; } catch (e) { return true; }
  })());
  const msg = new Uint8Array([1, 2, 3, 4]);
  const sig = await ed.sign(k.priv, msg);
  check('…but it still signs, and the signature verifies', sig.length === 64 && await ed.verify(k.pubRaw, sig, msg));

  const addr = pay.addressFromPub(k.pubRaw);
  check('a fresh key yields a well-formed Solana address', typeof addr === 'string' && addr.length >= 32 && addr.length <= 44
    && pay.pubFromAddress(addr).every((b, i) => b === k.pubRaw[i]), addr);

  // ---- amounts are integers, never floats ---------------------------------
  check('amount parsing keeps base units as integers', pay.parseAmount('1000') === 1000 && pay.parseAmount(0) === 0);
  check('a fractional/negative/garbage amount is refused', ['1.5', '-1', 'abc', ''].every((s) => {
    try { pay.parseAmount(s); return false; } catch (e) { return true; }
  }));
  check('USDC formatting is display-only and exact', pay.formatUsdc(1000) === '$0.001' && pay.formatUsdc(1500000) === '$1.5' && pay.formatUsdc(0) === '$0',
    [pay.formatUsdc(1000), pay.formatUsdc(1500000), pay.formatUsdc(0)].join(' '));

  // ---- the network is pinned ----------------------------------------------
  check('the network is pinned to devnet in code', /devnet/.test(pay.NETWORK_NAME) && Object.isFrozen === Object.isFrozen && pay.NETWORK_NAME === 'solana-devnet');

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
