/*
 * gifos-pay.js — the OS pays; the app never holds a key (docs/payments.md).
 *
 * x402: a resource server answers a plain HTTP request with `402 Payment
 * Required` and a challenge; the payer signs; the request is retried with a
 * payment header. Because `gifos.fetch` is ALREADY brokered — an app RPCs the
 * OS, which performs the request — that 402 lands in trusted first-party code,
 * which is exactly where a key belongs and the sandbox is not.
 *
 * SOLANA, and it is a custody decision (docs/payments.md §SOLANA). The SVM
 * `exact` scheme signs Ed25519, which WebCrypto can hold NON-EXTRACTABLY: the
 * page may ask the key to sign and can never read it. EVM's EIP-3009 signs
 * secp256k1, which WebCrypto does not implement at all, so an EVM wallet keeps
 * raw key bytes that any XSS steals permanently. The scheme also asks less of
 * us: we hand over a PARTIALLY signed transaction and the sponsor adds the
 * feePayer signature and pays the fee, so this code never needs SOL, never
 * broadcasts, and never talks to an RPC node.
 *
 * DEVNET ONLY. NETWORK is pinned below and is not reachable by any app or
 * manifest. Phase 2 (2026-08-11).
 *
 * Attaches to `GifOS.pay`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.pay) return;

  // Pinned. Not configurable — an app cannot ask to be paid on mainnet.
  const NETWORK = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'; // devnet genesis hash prefix
  const NETWORK_NAME = 'solana-devnet';

  // ---- base58 (Solana addresses and signatures) ------------------------------
  // Bitcoin alphabet. Hand-rolled because site/js takes no dependencies, and
  // because the encoding is load-bearing: an address off by one character is a
  // payment to nobody, unrecoverably.
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const B58MAP = (() => { const m = Object.create(null); for (let i = 0; i < B58.length; i++) m[B58[i]] = i; return m; })();

  function b58encode(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new Error('gifos-pay: b58encode wants bytes');
    if (!bytes.length) return '';
    // Count leading zero bytes — each becomes a literal '1'.
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
    // NO seed digit: a seeded accumulator emits one character too many when the
    // value is zero (e.g. the all-zero system-program address). Caught by the
    // known-address vector in test/unit/pay-encoding.js.
    const digits = [];
    for (let i = zeros; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let out = '';
    for (let i = 0; i < zeros; i++) out += '1';
    for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
    return out;
  }

  function b58decode(str) {
    if (typeof str !== 'string') throw new Error('gifos-pay: b58decode wants a string');
    if (!str.length) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < str.length && str[zeros] === '1') zeros++;
    const bytes = []; // NO seed byte — see b58encode
    for (let i = zeros; i < str.length; i++) {
      const v = B58MAP[str[i]];
      if (v === undefined) throw new Error('gifos-pay: "' + str[i] + '" is not base58');
      let carry = v;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
    }
    const out = new Uint8Array(zeros + bytes.length);
    for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i];
    return out;
  }

  // A Solana address IS the Ed25519 public key, base58-encoded. Nothing else.
  function addressFromPub(pubRaw) {
    if (!(pubRaw instanceof Uint8Array) || pubRaw.length !== 32) throw new Error('gifos-pay: a Solana address is a 32-byte Ed25519 public key');
    return b58encode(pubRaw);
  }
  function pubFromAddress(addr) {
    const raw = b58decode(addr);
    if (raw.length !== 32) throw new Error('gifos-pay: "' + addr + '" does not decode to 32 bytes — not a Solana address');
    return raw;
  }

  // ---- the money's units -----------------------------------------------------
  // Amounts are integer base units (USDC has 6 decimals) and are compared as
  // integers. Never floats: a rounding error here is a wrong payment.
  function parseAmount(s) {
    if (typeof s === 'number') {
      if (!Number.isSafeInteger(s) || s < 0) throw new Error('gifos-pay: amount must be a non-negative integer of base units');
      return s;
    }
    if (typeof s !== 'string' || !/^[0-9]+$/.test(s)) throw new Error('gifos-pay: amount must be a decimal integer string of base units');
    const n = Number(s);
    if (!Number.isSafeInteger(n)) throw new Error('gifos-pay: amount exceeds safe integer range');
    return n;
  }
  // Display only. 6dp is USDC; never used for arithmetic or comparison.
  function formatUsdc(baseUnits) {
    const neg = baseUnits < 0; const v = Math.abs(baseUnits);
    const whole = Math.floor(v / 1e6), frac = String(v % 1e6).padStart(6, '0').replace(/0+$/, '');
    return (neg ? '-' : '') + '$' + whole + (frac ? '.' + frac : '');
  }

  GifOS.pay = {
    NETWORK, NETWORK_NAME,
    b58encode, b58decode, addressFromPub, pubFromAddress,
    parseAmount, formatUsdc,
  };
})(typeof window !== 'undefined' ? window : globalThis);
