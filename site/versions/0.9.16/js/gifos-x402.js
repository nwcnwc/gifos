/*
 * gifos-x402.js — the x402 wire format, and the refusals that guard it.
 *
 * Transport binding (x402 v2, specs/transports-v2/http.md):
 *   server -> 402 + `PAYMENT-REQUIRED`  : base64 JSON PaymentRequired
 *   client -> retry + `PAYMENT-SIGNATURE`: base64 JSON PaymentPayload
 *   server -> `PAYMENT-RESPONSE`         : base64 JSON settlement result
 *
 * This module is PURE: it parses, validates, chooses and encodes. It holds no
 * key, signs nothing, and performs no I/O — so every refusal below is unit
 * testable without a chain, a wallet or a network. The signing adapter (the
 * Base Account) and the broker hook live elsewhere.
 *
 * The refusals are the point. A resource server is untrusted: it names its own
 * price, asset, chain and recipient. Everything it says is checked against a
 * policy WE hold, BEFORE a human is ever shown a prompt, so a hostile quote is
 * rejected without a person having to notice it (docs/payments.md).
 *
 * Attaches to `GifOS.x402`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.x402) return;

  const VERSION = 2;

  // ---- the policy: what GifOS will EVER agree to pay -------------------------
  // Phase 2 is Base Sepolia only. Pinned here, in code — not in a manifest, not
  // in a setting an app can reach. A server quoting mainnet is refused before
  // any human sees a prompt.
  const ALLOWED = {
    schemes: ['exact'],
    networks: ['eip155:84532'],                                   // Base Sepolia
    assets: { 'eip155:84532': ['0x036cbd53842c5426634e7929541ec2318f3dcf7e'] }, // Sepolia USDC
  };

  const b64encode = (s) => (typeof btoa === 'function'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64'));
  const b64decode = (s) => (typeof atob === 'function'
    ? decodeURIComponent(escape(atob(s)))
    : Buffer.from(s, 'base64').toString('utf8'));

  function decodeHeader(value, what) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('x402: missing ' + what + ' header');
    let json;
    try { json = b64decode(value.trim()); } catch (e) { throw new Error('x402: ' + what + ' is not valid base64'); }
    let obj;
    try { obj = JSON.parse(json); } catch (e) { throw new Error('x402: ' + what + ' is not valid JSON'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('x402: ' + what + ' is not an object');
    return obj;
  }
  const encodeHeader = (obj) => b64encode(JSON.stringify(obj));

  // ---- PaymentRequired -------------------------------------------------------
  function parsePaymentRequired(headerValue) {
    const pr = decodeHeader(headerValue, 'PAYMENT-REQUIRED');
    if (Number(pr.x402Version) !== VERSION) {
      throw new Error('x402: unsupported protocol version ' + pr.x402Version + ' (this build speaks ' + VERSION + ')');
    }
    if (!Array.isArray(pr.accepts) || !pr.accepts.length) throw new Error('x402: PAYMENT-REQUIRED lists no accepted payment');
    return pr;
  }

  // Amounts are integer base units in a STRING, and stay strings until the last
  // moment. Compared as BigInt: USDC has 6 decimals, but nothing here may assume
  // that, and a float comparison on money is a bug waiting for a big number.
  function amountOf(req) {
    if (typeof req.amount !== 'string' || !/^[0-9]+$/.test(req.amount)) {
      throw new Error('x402: amount must be a decimal integer string of base units, got ' + JSON.stringify(req.amount));
    }
    return BigInt(req.amount);
  }

  /**
   * Choose which of the server's offers we are willing to pay, or refuse.
   * policy: { maxAmount: string|bigint }  — the per-call ceiling, in base units.
   * Returns { requirement, amount } — never a partially-checked object.
   */
  function chooseRequirement(pr, policy) {
    const cap = BigInt((policy && policy.maxAmount) || 0);
    const reasons = [];
    for (const req of pr.accepts) {
      if (!req || typeof req !== 'object') { reasons.push('malformed offer'); continue; }
      if (ALLOWED.schemes.indexOf(req.scheme) < 0) { reasons.push('scheme "' + req.scheme + '" unsupported'); continue; }
      if (ALLOWED.networks.indexOf(req.network) < 0) { reasons.push('network "' + req.network + '" refused (this build is Base Sepolia only)'); continue; }
      const assets = ALLOWED.assets[req.network] || [];
      if (typeof req.asset !== 'string' || assets.indexOf(req.asset.toLowerCase()) < 0) { reasons.push('asset "' + req.asset + '" is not an allowed token'); continue; }
      if (typeof req.payTo !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(req.payTo)) { reasons.push('payTo is not an address'); continue; }
      let amount;
      try { amount = amountOf(req); } catch (e) { reasons.push(e.message); continue; }
      if (amount <= 0n) { reasons.push('amount must be positive'); continue; }
      if (cap <= 0n) { reasons.push('no spending ceiling is set for this app — nothing may be paid'); continue; }
      if (amount > cap) { reasons.push('quote ' + amount + ' exceeds the ceiling ' + cap + ' set for this app'); continue; }
      return { requirement: req, amount };
    }
    throw new Error('x402: refused every offer — ' + reasons.join('; '));
  }

  // ---- PaymentPayload --------------------------------------------------------
  // `payload` is scheme-specific and produced by the signing adapter; this only
  // frames it. Nothing here can invent a signature.
  function encodePaymentPayload(requirement, payload) {
    if (!requirement || !payload) throw new Error('x402: encodePaymentPayload needs the chosen requirement and a signed payload');
    return encodeHeader({
      x402Version: VERSION,
      scheme: requirement.scheme,
      network: requirement.network,
      payload,
    });
  }

  function parsePaymentResponse(headerValue) {
    return decodeHeader(headerValue, 'PAYMENT-RESPONSE');
  }

  // What the human is shown BEFORE any passkey prompt. A WebAuthn dialog says
  // only "use your passkey" — it never shows what is being paid — so this is
  // the trusted display, and it must never be skipped (docs/payments.md).
  function describe(pr, chosen) {
    const req = chosen.requirement;
    const res = pr.resource || {};
    return {
      amount: String(chosen.amount),
      asset: (req.extra && req.extra.name) || req.asset,
      payTo: req.payTo,
      network: req.network,
      resourceUrl: res.url || '',
      serviceName: res.serviceName || '',
      description: res.description || '',
    };
  }

  GifOS.x402 = {
    VERSION, ALLOWED,
    encodeHeader, decodeHeader,
    parsePaymentRequired, chooseRequirement, amountOf,
    encodePaymentPayload, parsePaymentResponse, describe,
  };
})(typeof window !== 'undefined' ? window : globalThis);
