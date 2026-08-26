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
 *   FEE_BPS                300
 *   CATALOG_URL            https://gifos.app/apps/index.json
 *   RETURN_BASE            https://pay.gifos.app
 *   FACILITATOR_URL        (optional) x402 settle backend; absent -> 501
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
  return makeCore({
    fetch: (u, o) => fetch(u, o),
    subtle: crypto.subtle,
    paypalBase: env.PAYPAL_BASE,
    paypalClientId: env.PAYPAL_CLIENT_ID,
    paypalClientSecret: env.PAYPAL_CLIENT_SECRET,
    treasuryEmail: env.TREASURY_EMAIL,
    feeBps: Number(env.FEE_BPS || 300),
    catalogUrl: env.CATALOG_URL,
    returnBase: env.RETURN_BASE,
    facilitatorUrl: env.FACILITATOR_URL || null,
    signKey: { privateKey },
  });
}

export default {
  async fetch(request, env) {
    try {
      if (!handler) handler = await init(env);
      return await handler(request);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
