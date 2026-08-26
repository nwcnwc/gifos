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
 *   BASE_RPC               (optional) Base Sepolia JSON-RPC for the wallet-
 *                          transfer rail; absent -> 501
 *   FEDNOW_API             (optional) the FedNow provider's API base (FedNow
 *                          itself has no public API); absent -> 501
 *   FEDNOW_KEY             (secret) the provider's API key
 *   FEDNOW_PAYEES          JSON: signing identity -> provider account id
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
    feeBps: Number(env.FEE_BPS || 300),
    catalogUrl: env.CATALOG_URL,
    returnBase: env.RETURN_BASE,
    facilitatorUrl: env.FACILITATOR_URL || null,
    rpcUrl: env.BASE_RPC || null,
    fednowApi: env.FEDNOW_API || null,
    fednowKey: env.FEDNOW_KEY || null,
    fednowPayees: env.FEDNOW_PAYEES ? JSON.parse(env.FEDNOW_PAYEES) : {},
    signKey: { privateKey, publicKey },
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
