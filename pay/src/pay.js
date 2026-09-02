/*
 * pay/src/pay.js — the Cloudflare Worker wrapper around core.js.
 *
 * All configuration is environment, nothing is code:
 *
 *   PAYPAL_BASE            https://api-m.sandbox.paypal.com (SANDBOX until the
 *                          mainnet flag day — docs/payments.md)
 *   PAYPAL_CLIENT_ID       PayPal REST app credentials (secret: wrangler secret)
 *   PAYPAL_CLIENT_SECRET
 *   TREASURY_EMAIL         payments@gifos.app — where the 3% platform fee lands
 *   TREASURY_ADDRESS       the Base address the x402 fee leg must pay (the
 *                          broker's TREASURY; settle refuses any other)
 *   FEE_BPS                300
 *   CATALOG_URL            https://gifos.app/apps/index.json
 *   RETURN_BASE            https://pay.gifos.app
 *   FACILITATOR_URL        (optional) x402 settle backend; absent -> 501
 *   BASE_RPC               (optional) Base Sepolia JSON-RPC for the wallet-
 *                          transfer rail; absent -> 501
 *   FEDNOW_API             (optional) the FedNow provider's API base (FedNow
 *                          itself has no public API); absent -> 501
 *   FEDNOW_KEY             (secret) the provider's API key
 *   FEDNOW_PAYEES          JSON: signing identity -> provider account id
 *   REGISTRY_URL           the rails registry (site/pay/registry.json) — the
 *                          fee-free rails refuse identities not on it
 *   STRIPE_API             (optional) https://api.stripe.com — the AGENT rail
 *                          (MPP + Shared Payment Tokens); absent key -> 501
 *   STRIPE_SECRET_KEY      (secret) the PLATFORM's key — sk_test_ until the
 *                          mainnet flag day, like PayPal's sandbox
 *   STRIPE_PROFILE_ID      the platform's Stripe profile (profile_…): the
 *                          networkId agents' wallets scope their tokens to
 *   STRIPE_PAYEES          JSON: signing identity -> connected account
 *                          (acct_…) — authors onboarded for destination
 *                          charges; everyone else gets a plain refusal
 *   MPP_SECRET             (secret, optional) HMAC key binding MPP challenge
 *                          ids; derived from STRIPE_SECRET_KEY when unset
 *   GIFOS_PAY_SIGN_JWK     Ed25519 private key as a JWK JSON string (wrangler
 *                          secret; its PUBLIC half must be site/gifos.key —
 *                          receipts verify against the site's published key)
 *
 * No storage bindings on purpose: the Worker is stateless (see core.js).
 */
import { makeCore } from './core.js';

let handler = null;
async function init(env) {
  const jwk = JSON.parse(env.GIFOS_PAY_SIGN_JWK);
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  // The PUBLIC half verifies this Worker's own stateless invoice tokens.
  const publicKey = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, { name: 'Ed25519' }, false, ['verify']);
  return makeCore({
    fetch: (u, o) => fetch(u, o),
    subtle: crypto.subtle,
    paypalBase: env.PAYPAL_BASE,
    paypalClientId: env.PAYPAL_CLIENT_ID,
    paypalClientSecret: env.PAYPAL_CLIENT_SECRET,
    treasuryEmail: env.TREASURY_EMAIL,
    treasuryAddress: env.TREASURY_ADDRESS || null,
    feeBps: Number(env.FEE_BPS || 300),
    catalogUrl: env.CATALOG_URL,
    returnBase: env.RETURN_BASE,
    facilitatorUrl: env.FACILITATOR_URL || null,
    rpcUrl: env.BASE_RPC || null,
    fednowApi: env.FEDNOW_API || null,
    fednowKey: env.FEDNOW_KEY || null,
    fednowPayees: env.FEDNOW_PAYEES ? JSON.parse(env.FEDNOW_PAYEES) : {},
    registryUrl: env.REGISTRY_URL || null,
    stripeApi: env.STRIPE_API || 'https://api.stripe.com',
    stripeKey: env.STRIPE_SECRET_KEY || null,
    stripeProfileId: env.STRIPE_PROFILE_ID || null,
    stripePayees: env.STRIPE_PAYEES ? JSON.parse(env.STRIPE_PAYEES) : {},
    // Same derivation as Stripe's own MPP sample, so one secret serves both.
    mppSecret: env.MPP_SECRET || (env.STRIPE_SECRET_KEY ? 'mpp-challenge-signing:' + env.STRIPE_SECRET_KEY : null),
    signKey: { privateKey, publicKey },
  });
}

// Best-effort per-IP damper (per-isolate memory, like the relay's edge
// limiter): every route here spends a metered third-party call — a PayPal
// order, an eth_getLogs, a Stripe intent — under the PLATFORM's single
// identity, so one looping client could get everyone throttled. Polls run at
// one call per 1.5–3 s per purchase, well inside the budget.
const REQ_PER_MIN_PER_IP = 240;
const CREATES_PER_MIN_PER_IP = 40;   // order/invoice/settle/rfp creation
const CREATE_PATHS = new Set(['/checkout', '/x402/settle', '/transfer/invoice', '/fednow/rfp', '/receipt/file']);
const ipHits = new Map();
function ipKey(ip) {
  ip = String(ip || '');
  if (ip.indexOf(':') < 0) return ip;
  const halves = ip.split('::');
  let groups = halves[0] ? halves[0].split(':') : [];
  if (halves.length > 1) {
    const tail = halves[1] ? halves[1].split(':') : [];
    while (groups.length + tail.length < 8) groups.push('0');
    groups = groups.concat(tail);
  }
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
function limited(ip, path, method) {
  const now = Date.now();
  const k = ipKey(ip);
  const e = ipHits.get(k) || { all: [], creates: [] };
  e.all = e.all.filter((t) => now - t < 60000); e.all.push(now);
  const create = method === 'POST' && CREATE_PATHS.has(path) || path.startsWith('/mpp/');
  if (create) { e.creates = e.creates.filter((t) => now - t < 60000); e.creates.push(now); }
  ipHits.set(k, e);
  if (ipHits.size > 10000) ipHits.clear();
  return e.all.length > REQ_PER_MIN_PER_IP || e.creates.length > CREATES_PER_MIN_PER_IP;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (request.method !== 'OPTIONS' && limited(request.headers.get('CF-Connecting-IP') || 'unknown', url.pathname, request.method)) {
        return new Response(JSON.stringify({ error: 'too many requests — slow down' }), {
          status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Retry-After': '30' },
        });
      }
      if (!handler) handler = await init(env);
      return await handler(request);
    } catch (e) {
      // The message can name a misconfigured secret or an upstream account;
      // it goes to the log, not to the caller.
      try { console.log('pay: unhandled', String(e && e.message || e).slice(0, 200)); } catch (e2) {}
      return new Response(JSON.stringify({ error: 'internal error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
