/*
 * pay/src/core.js — the payments Worker's whole brain, environment-agnostic.
 *
 * Four jobs and no more (docs/payments.md §The Worker):
 *
 *   POST /checkout      derive the payee from the app's VERIFIED signing
 *                       identity (published catalog — never the client),
 *                       create the PayPal order with GifOS's platform fee
 *   GET  /return        PayPal lands the buyer back here; capture the order
 *   GET  /receipt/:id   the only proof money moved: PayPal's own answer,
 *                       wrapped in an Ed25519-SIGNED receipt the OS verifies
 *                       against gifos.app's published key
 *   POST /x402/settle   forward the broker-built transfer payloads to the
 *                       x402 facilitator, sign the same receipt shape
 *   POST /transfer/invoice  the WALLET-TRANSFER rail (RockWallet and every
 *                       other self-custody wallet): mint a signed invoice
 *                       token naming the catalog's payee and a dust-unique
 *                       amount; /transfer/receipt watches the chain for that
 *                       exact USDC transfer and signs the same receipt shape
 *   POST /fednow/rfp    the FEDNOW rail, via a provider (FedNow itself has
 *                       no public API): create a Request-for-Payment the
 *                       buyer approves in their own banking app;
 *                       /fednow/receipt/:id polls it to the same receipt
 *   GET|POST /mpp/charge/:appId?sku=&amount=
 *                       the AGENT rail — Machine Payments Protocol (HTTP
 *                       402, mpp.dev), the wire Stripe's Link agent wallet
 *                       speaks (link.com/agents): a 402 challenge, then a
 *                       Shared Payment Token back, settled as a Stripe
 *                       Connect destination charge to the author's
 *                       connected account with the 3% as the platform's
 *                       application fee; same signed receipt
 *   POST /receipt/file  package a signed receipt as the receipt GIF the OS
 *                       opens (verified first) — how an agent's purchase
 *                       reaches the human's Purchases folder
 *
 * STATELESS by design — no KV, no Durable Object, no database. Everything a
 * receipt needs rides inside the PayPal order itself (custom_id carries
 * {appId, sku}); /receipt asks PayPal, not a store of ours. Restart the
 * Worker and nothing is lost, because nothing was held.
 *
 * THE WORKER DERIVES THE PAYEE ITSELF, NEVER FROM THE CLIENT. A payee email
 * in the request body would be a redirect-another-author's-revenue invitation;
 * here the client sends only an appId, and the payee comes from the signing
 * identity the published catalog records for it. The derivation rule itself
 * (payments@<domain> / the signing email) is imported from gifos-charge.js —
 * one home, not two copies.
 *
 * SANDBOX ONLY until the mainnet flag day: the PayPal base URL is
 * configuration, and production deploys point it at api-m.sandbox.paypal.com.
 *
 * This file runs unchanged in the Cloudflare Worker (src/pay.js) and in the
 * local Node twin (test/servers/pay-local.js) — the environment injects
 * fetch, WebCrypto and configuration; nothing here touches either directly.
 */
import '../../site/js/gifos-charge.js'; // attaches globalThis.GifOS.charge
import '../../site/js/gifos-gif.js';    // attaches globalThis.GifOS.gif — pure, so it packs receipt files here too
import { makeMpp } from './mpp.js';
const CHARGE = globalThis.GifOS.charge;
const GIF = globalThis.GifOS.gif;

const CENT = 10000n; // USDC base units (6 dp) per whole cent

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Payment-Receipt',
};
const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
});
const bad = (msg, status) => json({ error: msg }, status || 400);
const html = (body, status) => new Response(body, {
  status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
});

// Base units -> "12.34" (PayPal money string). The broker already refused
// sub-cent amounts on this rail; a stray one here is a hard error, not a
// rounding — money is never rounded silently.
function usdValue(units) {
  const n = BigInt(units);
  if (n <= 0n || n % CENT !== 0n) throw new Error('amount must be a positive whole-cent amount in base units');
  const cents = n / CENT;
  return (cents / 100n) + '.' + String(cents % 100n).padStart(2, '0');
}
const unitsFromValue = (value) => {
  const m = /^([0-9]+)\.([0-9]{2})$/.exec(String(value));
  if (!m) throw new Error('unparseable money value ' + value);
  return String((BigInt(m[1]) * 100n + BigInt(m[2])) * CENT);
};

export function makeCore(cfg) {
  const F = cfg.fetch;
  const subtle = cfg.subtle;

  // ---- PayPal ---------------------------------------------------------------
  let tokenCache = { token: null, until: 0 };
  async function ppToken() {
    if (tokenCache.token && Date.now() < tokenCache.until) return tokenCache.token;
    const r = await F(cfg.paypalBase + '/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(cfg.paypalClientId + ':' + cfg.paypalClientSecret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) throw new Error('paypal auth failed (HTTP ' + r.status + ')');
    const b = await r.json();
    tokenCache = { token: b.access_token, until: Date.now() + 5 * 60 * 1000 };
    return tokenCache.token;
  }
  async function pp(path, method, body) {
    const t = await ppToken();
    const r = await F(cfg.paypalBase + path, {
      method: method || 'GET',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch (e) {}
    return { ok: r.ok, status: r.status, body: parsed, text };
  }

  // ---- the payee, derived from the PUBLISHED catalog ------------------------
  let catalogCache = { at: 0, byId: null };
  async function identityFor(appId) {
    if (!catalogCache.byId || Date.now() - catalogCache.at > 60 * 1000) {
      const r = await F(cfg.catalogUrl, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('catalog unreachable (HTTP ' + r.status + ')');
      const idx = await r.json();
      const list = Array.isArray(idx) ? idx : (idx.apps || []);
      const byId = new Map();
      for (const a of list) if (a && a.appId) byId.set(a.appId, a);
      catalogCache = { at: Date.now(), byId };
    }
    const app = catalogCache.byId.get(appId);
    if (!app) throw new Error('app "' + appId + '" is not in the published catalog');
    const sig = app.signature;
    if (!sig || !sig.type || !sig.id) throw new Error('app "' + appId + '" has no recorded signing identity — unsigned apps cannot be paid');
    return { app, identity: { verified: true, type: sig.type, id: sig.id } };
  }

  // The app's authoritative CHAIN payee, from the published index — never the
  // client (see the catalog generator's comment: a client-sent payTo lets a
  // buyer self-deal a signed receipt without paying the author).
  async function chainPayeeFor(appId) {
    const { app } = await identityFor(appId);
    if (!app.pay || !/^0x[0-9a-fA-F]{40}$/.test(String(app.pay.to))) {
      throw new Error('app "' + appId + '" declares no chain payee — this rail is not available for it');
    }
    return app.pay.to;
  }

  // ---- the rails registry ---------------------------------------------------
  // The fee-free rails (wallet transfer, FedNow) collect no per-transaction
  // cut, so they are open only to signing identities REGISTERED on the
  // published registry (docs/payments.md §Registration — an annual flat fee,
  // amount not yet set). The fee-collecting rails need none of this. Absent
  // or expired -> a plain refusal naming the policy, never a pretend rail.
  let registryCache = { at: 0, reg: null };
  async function assertRegistered(identity) {
    if (!cfg.registryUrl) throw new Error('the rails registry is not configured on this deployment');
    if (!registryCache.reg || Date.now() - registryCache.at > 60 * 1000) {
      const r = await F(cfg.registryUrl, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('rails registry unreachable (HTTP ' + r.status + ')');
      registryCache = { at: Date.now(), reg: (await r.json()).registered || {} };
    }
    const e = registryCache.reg[identity.id];
    if (!e) throw new Error('"' + identity.id + '" is not registered for the fee-free rails — see gifos.app/pay (registration is annual; the PayPal and USDC rails need no registration)');
    const untilMs = e.until == null ? null : Date.parse(e.until);
    if (untilMs != null && (Number.isNaN(untilMs) || Date.now() > untilMs)) {
      throw new Error('the rails registration for "' + identity.id + '" expired on ' + e.until + ' — renew it, or use the PayPal / USDC rails, which need no registration');
    }
  }

  // ---- signed invoice tokens ------------------------------------------------
  // STATELESS invoices: the token IS the state, signed with the same key as
  // the receipts and verified here before it is honored. The client can hold
  // it, lose it, or tamper with it — tampering just fails the signature.
  const b64u = (bytes) => { let s2 = ''; for (const b of bytes) s2 += String.fromCharCode(b); return btoa(s2).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { const b = atob(String(str).replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
  async function signToken(obj) {
    const json = JSON.stringify(obj);
    const body = b64u(new TextEncoder().encode(json));
    const sig = b64u(new Uint8Array(await subtle.sign('Ed25519', cfg.signKey.privateKey, new TextEncoder().encode(body))));
    return body + '.' + sig;
  }
  async function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) throw new Error('malformed token');
    if (!cfg.signKey.publicKey) throw new Error('this deployment cannot verify tokens');
    const ok = await subtle.verify('Ed25519', cfg.signKey.publicKey, unb64u(sig), new TextEncoder().encode(body));
    if (!ok) throw new Error('the invoice token does not verify — refusing it');
    return JSON.parse(new TextDecoder().decode(unb64u(body)));
  }

  // ---- the chain, read-only -------------------------------------------------
  let rpcId = 0;
  async function rpc(method, params) {
    if (!cfg.rpcUrl) throw new Error('no chain RPC is configured on this deployment');
    const r = await F(cfg.rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: params || [] }),
    });
    if (!r.ok) throw new Error('rpc ' + method + ' failed (HTTP ' + r.status + ')');
    const b = await r.json();
    if (b.error) throw new Error('rpc ' + method + ': ' + (b.error.message || JSON.stringify(b.error)));
    return b.result;
  }

  // ---- the signed receipt ---------------------------------------------------
  // Signed over the exact JSON STRING returned, so there is no canonicalization
  // to disagree about: the OS verifies the bytes it received.
  async function signedReceipt(fields) {
    const receiptJson = JSON.stringify(Object.assign({ v: 1, kind: 'gifos-pay-receipt' }, fields));
    const sigBytes = new Uint8Array(await subtle.sign('Ed25519', cfg.signKey.privateKey, new TextEncoder().encode(receiptJson)));
    let b64 = ''; for (const b of sigBytes) b64 += String.fromCharCode(b);
    return { receiptJson, sig: btoa(b64) };
  }

  // ---- routes ---------------------------------------------------------------
  async function checkout(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const appId = String(body.appId || '');
    if (!/^[\w.\-]{1,64}$/.test(appId)) return bad('bad appId');
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('amount must be a decimal integer string of base units');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    const reason = String(body.reason || '').slice(0, 140);
    const sku = body.sku == null ? null : String(body.sku).slice(0, 64);
    if (sku != null && !/^[\w.\-:]{1,64}$/.test(sku)) return bad('bad sku');
    // custom_id is what the receipt is rebuilt from after capture; PayPal
    // cuts it at 127 chars, and a cut JSON is a receipt with no app and no
    // sku — money taken, nothing granted. Refuse BEFORE an order exists.
    const customId = JSON.stringify({ a: appId, s: sku });
    if (customId.length > 127) return bad('appId and sku are too long together for a PayPal order (' + customId.length + ' > 127 chars)');

    let payee;
    try {
      const { identity } = await identityFor(appId);
      payee = CHARGE.paypalPayeeOf(identity); // THE PAYEE RULE — one home
    } catch (e) { return bad(String(e.message || e), 403); }

    // GifOS's cut rides the order itself (platform_fees) so the split happens
    // at capture, inside PayPal — the money is never in a GifOS balance.
    const cents = BigInt(body.amount) / CENT;
    const feeCents = (cents * BigInt(cfg.feeBps)) / 10000n;
    const unit = {
      reference_id: appId,
      custom_id: customId,
      description: reason || ('GifOS: ' + appId),
      amount: { currency_code: 'USD', value },
      payee: { email_address: payee },
    };
    if (feeCents > 0n && cfg.treasuryEmail) {
      unit.payment_instruction = {
        disbursement_mode: 'INSTANT',
        platform_fees: [{
          amount: { currency_code: 'USD', value: (feeCents / 100n) + '.' + String(feeCents % 100n).padStart(2, '0') },
          payee: { email_address: cfg.treasuryEmail },
        }],
      };
    }
    const order = await pp('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE',
      purchase_units: [unit],
      application_context: {
        return_url: cfg.returnBase + '/return',
        cancel_url: cfg.returnBase + '/cancelled',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    });
    if (!order.ok) return bad('paypal refused the order: ' + order.text.slice(0, 300), 502);
    const approve = (order.body.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    if (!approve) return bad('paypal returned no approval link', 502);
    return json({ id: order.body.id, approveUrl: approve.href });
  }

  async function receiptFor(orderId) {
    const got = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId));
    if (!got.ok) return json({ status: 'PENDING' });
    let order = got.body;
    // The buyer approved but the return page never captured (closed tab, flaky
    // network): capture here. /receipt converges on COMPLETED from either path.
    if (order.status === 'APPROVED') {
      const cap = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', 'POST', {});
      if (cap.ok) order = cap.body;
    }
    if (order.status !== 'COMPLETED') return json({ status: order.status || 'PENDING' });
    const unit = (order.purchase_units || [])[0] || {};
    let meta = { a: null, s: null };
    try { meta = JSON.parse(unit.custom_id || (unit.payments.captures[0].custom_id)); } catch (e) {}
    const capture = ((unit.payments || {}).captures || [])[0] || {};
    const amountValue = (capture.amount && capture.amount.value) || (unit.amount && unit.amount.value);
    const { receiptJson, sig } = await signedReceipt({
      rail: 'paypal',
      appId: meta.a,
      sku: meta.s,
      amount: unitsFromValue(amountValue),
      payee: (unit.payee && unit.payee.email_address) || null,
      tx: capture.id || order.id,
      orderId: order.id,
      at: Date.now(),
    });
    return json({ status: 'COMPLETED', receiptJson, sig });
  }

  async function returnPage(url) {
    const orderId = url.searchParams.get('token') || '';
    if (!orderId) return html('<p>Missing order.</p>', 400);
    // Capture immediately — the poll in the OS page turns COMPLETED on its
    // next tick. A failure here is NOT fatal: /receipt retries the capture.
    try { await pp('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', 'POST', {}); } catch (e) {}
    return html('<!doctype html><meta charset="utf-8"><title>Payment complete</title>' +
      '<body style="font:16px/1.5 system-ui;background:#14141f;color:#e8e8f4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h2>✓ Payment complete</h2><p>You can close this window.</p></div>' +
      '<script>setTimeout(function(){ try { window.close(); } catch(e){} }, 800);</script>');
  }

  // ---- x402 settle ----------------------------------------------------------
  // The broker built and the wallet signed; this speaks the STANDARD x402
  // facilitator interface (POST /verify then POST /settle, one call per
  // transfer of the split) and wraps the answer in the SAME receipt shape as
  // the fiat rail — one verifiable object, whatever paid. The testnet
  // facilitator (https://x402.org/facilitator) takes these shapes with no
  // credentials; CDP's mainnet facilitator takes the same shapes with auth —
  // a config change, not a code change.
  //
  // Naming: GifOS pins the chain as CAIP-2 (eip155:84532) everywhere; the
  // facilitator wire speaks x402 v1's names ('base-sepolia'). The mapping
  // lives HERE, at the one boundary where both worlds meet.
  // The one asset every USDC rail is pinned to (Base Sepolia USDC), lower-case.
  const USDC_SEPOLIA = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
  const FACILITATOR_NETWORKS = { 'eip155:84532': 'base-sepolia' };

  async function facilitator(path, body) {
    const r = await F(cfg.facilitatorUrl + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch (e) {}
    return { ok: r.ok, body: parsed, text };
  }

  async function settle(req) {
    if (!cfg.facilitatorUrl) return bad('no x402 facilitator is configured on this deployment', 501);
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const appId = String(body.appId || '');
    if (!/^[\w.\-]{1,64}$/.test(appId)) return bad('bad appId');
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    const transfers = body.transfers, payloads = body.payloads;
    if (!Array.isArray(transfers) || !transfers.length || !Array.isArray(payloads) || payloads.length !== transfers.length) {
      return bad('transfers/payloads mismatch');
    }
    // The AUTHOR leg (transfers[0]) must point at the catalog's payee — the
    // same self-dealing hole the invoice rail closes (see chainPayeeFor).
    try {
      const authoritative = await chainPayeeFor(appId);
      if (String(transfers[0].to).toLowerCase() !== authoritative.toLowerCase()) {
        return bad('transfer 0 pays ' + transfers[0].to + ' but the catalog names ' + authoritative + ' for "' + appId + '"', 403);
      }
    } catch (e) { return bad(String(e.message || e), 403); }
    // THE RECEIPT SAYS body.amount, SO THE TRANSFERS MUST ADD UP TO IT — in
    // the pinned asset, split as the fee rule says, with the fee leg at the
    // treasury, and each signed authorization naming exactly its transfer's
    // payee and value. Without this the Worker signed whatever amount the
    // client claimed after settling whatever it actually paid.
    const amount = BigInt(body.amount);
    const fee = (amount * BigInt(cfg.feeBps)) / 10000n;
    const legs = fee > 0n ? 2 : 1;
    if (transfers.length !== legs) return bad('expected ' + legs + ' transfer(s) for this fee rule, got ' + transfers.length);
    if (fee > 0n && !cfg.treasuryAddress) return bad('no treasury address is configured for the fee leg on this deployment', 501);
    const expectAmounts = fee > 0n ? [amount - fee, fee] : [amount];
    for (let i = 0; i < transfers.length; i++) {
      const t = transfers[i], pl = payloads[i];
      if (!t || typeof t.amount !== 'string' || !/^[0-9]+$/.test(t.amount)) return bad('transfer ' + i + ': bad amount');
      if (BigInt(t.amount) !== expectAmounts[i]) return bad('transfer ' + i + ' carries ' + t.amount + ' but the fee rule requires ' + String(expectAmounts[i]));
      if (String(t.asset || '').toLowerCase() !== USDC_SEPOLIA) return bad('transfer ' + i + ': asset must be ' + USDC_SEPOLIA);
      if (i === 1 && String(t.to || '').toLowerCase() !== String(cfg.treasuryAddress).toLowerCase()) return bad('transfer 1 must pay the treasury');
      const auth = pl && pl.authorization;
      if (!auth || String(auth.to || '').toLowerCase() !== String(t.to).toLowerCase() || String(auth.value) !== String(t.amount)) {
        return bad('payload ' + i + ' does not authorize transfer ' + i + ' (to/value differ)');
      }
    }
    const txs = [];
    for (let i = 0; i < transfers.length; i++) {
      const t = transfers[i], pl = payloads[i];
      const network = FACILITATOR_NETWORKS[t && t.network];
      if (!network) return bad('refused: network "' + (t && t.network) + '" has no facilitator mapping');
      if (!pl || typeof pl.signature !== 'string' || !pl.authorization) return bad('payload ' + i + ' carries no signed authorization');
      const paymentRequirements = {
        scheme: 'exact',
        network,
        maxAmountRequired: t.amount,
        resource: 'https://gifos.app/charge/' + appId,
        description: 'GifOS charge: ' + appId + (body.sku ? ' / ' + body.sku : ''),
        mimeType: 'application/json',
        payTo: t.to,
        maxTimeoutSeconds: 60,
        asset: t.asset,
        extra: t.extra || { name: 'USDC', version: '2' },
      };
      const paymentPayload = {
        x402Version: 1,
        scheme: 'exact',
        network,
        payload: { signature: pl.signature, authorization: pl.authorization },
      };
      const v = await facilitator('/verify', { x402Version: 1, paymentPayload, paymentRequirements });
      if (!v.ok || !v.body || v.body.isValid !== true) {
        return bad('facilitator refused transfer ' + i + ': ' + ((v.body && (v.body.invalidReason || v.body.error)) || v.text.slice(0, 200)), 502);
      }
      const st = await facilitator('/settle', { x402Version: 1, paymentPayload, paymentRequirements });
      if (!st.ok || !st.body || st.body.success !== true || !st.body.transaction) {
        return bad('facilitator did not settle transfer ' + i + ': ' + ((st.body && (st.body.errorReason || st.body.error)) || st.text.slice(0, 200)), 502);
      }
      txs.push(st.body.transaction);
    }
    const { receiptJson, sig } = await signedReceipt({
      rail: 'x402',
      appId,
      sku: body.sku == null ? null : String(body.sku).slice(0, 64),
      amount: body.amount,
      payee: (transfers[0] && transfers[0].to) || null,
      tx: txs.join(','),
      at: Date.now(),
    });
    return json({ status: 'COMPLETED', receiptJson, sig });
  }

  // ---- the wallet-transfer rail ---------------------------------------------
  // RockWallet — and every other self-custody wallet — has exactly one
  // universal integration surface: SEND EXACTLY X TO ADDRESS Y. So the
  // invoice adds a random sub-cent DUST to the amount (0–9999 base units,
  // under one cent) to make this payment's value unique among concurrent
  // buyers of the same thing, and the receipt endpoint watches the chain for
  // a USDC Transfer of exactly that value to the catalog's payee. The 3% is
  // NOT collected on this rail (a direct wallet send cannot split, and
  // routing it through a GifOS account would be custody) — the receipt says
  // so: feeCollected:false. Honest bookkeeping beats silent fiction.
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak(Transfer(address,address,uint256))
  const INVOICE_TTL_MS = 30 * 60 * 1000;

  async function transferInvoice(req) {
    if (!cfg.rpcUrl) return bad('the wallet-transfer rail is not configured on this deployment', 501);
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const appId = String(body.appId || '');
    if (!/^[\w.\-]{1,64}$/.test(appId)) return bad('bad appId');
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount) || BigInt(body.amount) <= 0n) return bad('bad amount');
    let payTo;
    try {
      payTo = await chainPayeeFor(appId);
      await assertRegistered((await identityFor(appId)).identity);
    } catch (e) { return bad(String(e.message || e), 403); }
    const dustBytes = new Uint8Array(2); crypto.getRandomValues(dustBytes);
    const dust = (dustBytes[0] * 256 + dustBytes[1]) % 10000;          // < one cent
    const expected = String(BigInt(body.amount) + BigInt(dust));
    const block = await rpc('eth_blockNumber');
    const now = Date.now();
    const token = await signToken({
      v: 1, kind: 'gifos-pay-invoice', appId,
      sku: body.sku == null ? null : String(body.sku).slice(0, 64),
      amount: body.amount, expected, payTo,
      asset: USDC_SEPOLIA, network: 'eip155:84532',
      block, iat: now, exp: now + INVOICE_TTL_MS,
    });
    return json({
      token, payTo, expected, asset: USDC_SEPOLIA, network: 'eip155:84532',
      exp: now + INVOICE_TTL_MS,
      // EIP-681, for wallets that register as handlers; everyone else copies.
      uri: 'ethereum:' + USDC_SEPOLIA + '@84532/transfer?address=' + payTo + '&uint256=' + expected,
    });
  }

  async function transferReceipt(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    let inv;
    try { inv = await verifyToken(body.token); } catch (e) { return bad(String(e.message || e), 403); }
    if (inv.kind !== 'gifos-pay-invoice') return bad('not an invoice token', 403);
    if (Date.now() > inv.exp) return bad('this invoice expired — start the payment again', 410);
    const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
    const logs = await rpc('eth_getLogs', [{
      fromBlock: inv.block, toBlock: 'latest',
      address: inv.asset,
      topics: [TRANSFER_TOPIC, null, pad(inv.payTo)],
    }]);
    const hit = (logs || []).find((l) => {
      try { return BigInt(l.data) === BigInt(inv.expected); } catch (e) { return false; }
    });
    if (!hit) return json({ status: 'PENDING' });
    const { receiptJson, sig } = await signedReceipt({
      rail: 'transfer',
      appId: inv.appId, sku: inv.sku,
      amount: inv.amount,
      payee: inv.payTo,
      tx: hit.transactionHash,
      feeCollected: false,
      at: Date.now(),
    });
    return json({ status: 'COMPLETED', receiptJson, sig });
  }

  // ---- the FedNow rail, via a provider --------------------------------------
  // FedNow has NO public API — only financial institutions touch the rail, so
  // a provider (Finzly-shaped) fronts it and the buyer approves the Request-
  // for-Payment inside their own banking app. Only identities REGISTERED with
  // the provider (cfg.fednowPayees: signing identity -> provider account) can
  // be paid; everything else is a plain refusal, not a pretend rail. Fee: not
  // collected on this rail either — feeCollected:false, same honesty.
  async function fednowRfp(req) {
    if (!cfg.fednowApi) return bad('the FedNow rail is not configured on this deployment', 501);
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const appId = String(body.appId || '');
    if (!/^[\w.\-]{1,64}$/.test(appId)) return bad('bad appId');
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    let identity;
    try {
      identity = (await identityFor(appId)).identity;
      await assertRegistered(identity);
    } catch (e) { return bad(String(e.message || e), 403); }
    const account = (cfg.fednowPayees || {})[identity.id];
    if (!account) return bad('"' + identity.id + '" is not registered for bank payments — this rail is not available for it', 403);
    const r = await F(cfg.fednowApi + '/rfp', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.fednowKey ? { Authorization: 'Bearer ' + cfg.fednowKey } : {}),
      body: JSON.stringify({
        account, amount: value, currency: 'USD',
        reference: JSON.stringify({ a: appId, s: body.sku == null ? null : String(body.sku).slice(0, 64), u: body.amount }).slice(0, 140),
        description: String(body.reason || '').slice(0, 140),
      }),
    });
    if (!r.ok) return bad('the payment provider refused: ' + (await r.text()).slice(0, 200), 502);
    const b = await r.json();
    if (!b.id) return bad('the payment provider returned no request id', 502);
    return json({ id: b.id });
  }

  async function fednowReceipt(id) {
    if (!cfg.fednowApi) return bad('the FedNow rail is not configured on this deployment', 501);
    const r = await F(cfg.fednowApi + '/rfp/' + encodeURIComponent(id), {
      headers: cfg.fednowKey ? { Authorization: 'Bearer ' + cfg.fednowKey } : {},
    });
    if (!r.ok) return json({ status: 'PENDING' });
    const b = await r.json();
    if (b.status !== 'SETTLED') return json({ status: b.status || 'PENDING' });
    let meta = { a: null, s: null, u: null };
    try { meta = JSON.parse(b.reference); } catch (e) {}
    const { receiptJson, sig } = await signedReceipt({
      rail: 'fednow',
      appId: meta.a, sku: meta.s,
      amount: meta.u,
      payee: b.account || null,
      tx: b.settlementId || b.id,
      feeCollected: false,
      at: Date.now(),
    });
    return json({ status: 'COMPLETED', receiptJson, sig });
  }

  // ---- the AGENT rail: MPP + a Stripe Shared Payment Token ------------------
  // An agent (Claude, OpenClaw, anything running link.com/agents' Link CLI)
  // cannot click a PayPal window, but it can answer an HTTP 402. This is the
  // Machine Payments Protocol endpoint: no credential -> a `WWW-Authenticate:
  // Payment … method="stripe"` challenge naming the price and OUR Stripe
  // profile; the wallet asks the HUMAN to approve in the Link app (that is
  // the consent step — theirs, not ours, exactly as the FedNow approval is
  // the bank's); a Shared Payment Token comes back; we consume it as a
  // Connect DESTINATION charge to the author's connected account with the
  // 3% as application_fee_amount. The author is still seller of record and
  // GifOS still holds nothing (docs/payments.md §FIVE RAILS).
  //
  // Stateless like every other rail: the challenge id is an HMAC over the
  // challenge itself (mpp.js), and the route — appId, sku, amount — is the
  // authority for what is being bought; a credential must echo a challenge
  // for exactly this URL's purchase. Replay: Stripe's Idempotency-Key makes
  // a second use of the same credential return the SAME intent marked
  // `idempotent-replayed`, which we refuse — the hole mppx shipped with.
  const MPP = makeMpp({ subtle });
  const STRIPE_VERSION = '2026-07-29.preview';   // SPTs are preview API surface
  const STRIPE_MIN_CENTS = 50n;                  // Stripe's card minimum

  async function mppCharge(req, url) {
    const appId = decodeURIComponent(url.pathname.slice('/mpp/charge/'.length));
    // A human who followed the link: this is a machine endpoint, say so.
    if (/text\/html/.test(req.headers.get('Accept') || '') && !req.headers.get('Authorization')) {
      return html('<div style="font:16px system-ui;max-width:32rem;margin:3rem auto"><h2>This is the agent checkout for “' + appId.replace(/[&<>"]/g, '') + '”</h2>' +
        '<p>It speaks the Machine Payments Protocol (HTTP 402) for AI agents paying with a Stripe Link wallet. To buy as a person, open the app in <a href="https://gifos.app">GifOS</a> and pay there.</p></div>', 402);
    }
    if (!cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    if (!/^[\w.\-]{1,64}$/.test(appId)) return bad('bad appId');
    const amount = url.searchParams.get('amount') || '';
    if (!/^[0-9]+$/.test(amount)) return bad('amount must be a decimal integer string of base units ($1 = 1000000)');
    let value; try { value = usdValue(amount); } catch (e) { return bad(e.message); }
    const cents = BigInt(amount) / CENT;
    if (cents < STRIPE_MIN_CENTS) return bad('Stripe takes nothing under $0.50 on this rail — $' + value + ' is too small; the USDC rails have no minimum');
    const skuRaw = url.searchParams.get('sku');
    const sku = skuRaw == null || skuRaw === '' ? null : String(skuRaw).slice(0, 64);
    let app, identity;
    try { ({ app, identity } = await identityFor(appId)); } catch (e) { return bad(String(e.message || e), 403); }
    // Onboarded authors only: a destination charge needs a connected account,
    // and that mapping is the platform's record (like FEDNOW_PAYEES), never
    // a client value. Absent -> a plain refusal naming the way back.
    const acct = (cfg.stripePayees || {})[identity.id];
    if (!acct) return bad('"' + identity.id + '" is not onboarded for the agent rail — the author connects a Stripe account at gifos.app/pay (the PayPal and USDC rails need no onboarding)', 403);

    const realm = url.host;
    // The bound request: everything a wallet needs, derived from the ROUTE
    // (not from the reason text, so a free-text query cannot change what
    // the binding covers). Amount is CENTS AS A STRING on this wire.
    const request = {
      amount: String(cents), currency: 'usd',
      description: 'GifOS: ' + (app.name || appId) + (sku ? ' / ' + sku : ' / tip'),
      externalId: JSON.stringify({ a: appId, s: sku, u: amount }),
      methodDetails: { networkId: cfg.stripeProfileId, paymentMethodTypes: ['card', 'link'] },
    };
    // The challenge description is the app and sku — derived from the route,
    // never from a query string a link could put words into.
    const fresh = async () => MPP.serializeChallenge(await MPP.challenge({ secret: cfg.mppSecret, realm, request, description: request.description }));
    // Every not-yet-paid answer is a 402 WITH a fresh challenge (the spec's
    // table): plain when nothing was sent, a problem+json body when a
    // credential was sent and failed.
    const challenge = async (problem, detail) => new Response(
      JSON.stringify(problem ? { type: problem, title: MPP.PROBLEMS[problem], detail, status: 402 } : { status: 402, error: 'payment required — answer the WWW-Authenticate: Payment challenge (link-cli mpp pay <this url>)' }),
      { status: 402, headers: Object.assign({ 'Content-Type': problem ? 'application/problem+json' : 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': await fresh() }, CORS) });

    const auth = req.headers.get('Authorization');
    if (!auth) return challenge(null);
    let cred, bound;
    try {
      cred = MPP.parseCredential(auth);
      bound = await MPP.verifyCredential(cred, { secret: cfg.mppSecret, realm });
    } catch (e) { return challenge(e.type || 'verification-failed', e.message); }
    // The HMAC proved WE issued it; this proves it was for THIS purchase.
    if (MPP.encodeRequest(bound) !== MPP.encodeRequest(request)) return challenge('invalid-challenge', 'the credential answers a different charge than this URL names');
    const spt = cred.payload.spt;
    if (typeof spt !== 'string' || !/^spt_[A-Za-z0-9_]{1,200}$/.test(spt)) return challenge('malformed-credential', 'the payload carries no shared payment token');

    const feeCents = (cents * BigInt(cfg.feeBps)) / 10000n;
    const form = new URLSearchParams({
      amount: String(cents), currency: 'usd', confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      shared_payment_granted_token: spt,
      'transfer_data[destination]': acct,
      application_fee_amount: String(feeCents),
      'metadata[gifos_app]': appId,
      'metadata[gifos_sku]': sku || '',
      'metadata[machine_payment]': 'true',
    });
    const r = await F(cfg.stripeApi + '/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(cfg.stripeKey + ':'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': 'mpp_' + cred.challenge.id + '_' + spt,
        'Stripe-Version': STRIPE_VERSION,
      },
      body: form.toString(),
    });
    const text = await r.text();
    let pi = null; try { pi = JSON.parse(text); } catch (e) {}
    if (!r.ok) return challenge('verification-failed', 'Stripe refused the payment: ' + ((pi && pi.error && pi.error.message) || text.slice(0, 200)));
    if (r.headers.get('idempotent-replayed') === 'true') return challenge('invalid-challenge', 'this credential was already used — a replay, not a payment');
    if (!pi || pi.status !== 'succeeded') return challenge('verification-failed', 'Stripe did not settle the payment (status ' + (pi && pi.status) + ')');

    const at = Date.now();
    const { receiptJson, sig } = await signedReceipt({
      rail: 'mpp', appId, sku, amount, payee: acct, tx: pi.id, at,
    });
    return new Response(JSON.stringify({
      status: 'COMPLETED', receiptJson, sig,
      // How the purchase reaches the human: package it as the receipt FILE
      // and hand it to them — opening it in any GifOS grants the entitlement.
      file: { url: cfg.returnBase + '/receipt/file', method: 'POST', body: { receiptJson, sig } },
    }), {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Payment-Receipt': MPP.receiptHeader({ reference: pi.id, externalId: request.externalId, now: at }) }, CORS),
    });
  }

  // ---- the receipt as a FILE, packed here -----------------------------------
  // The OS mints receipt GIFs itself after a browser purchase; an agent has
  // no OS page, so the Worker packs the same file — the SAME builder
  // (gifos-charge.js receiptFile) and the SAME codec. Verified first: a
  // receipt that does not verify against this deployment's key is refused,
  // so this can never launder a forged receipt into a real-looking file.
  async function receiptFile(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    if (typeof body.receiptJson !== 'string' || typeof body.sig !== 'string') return bad('needs {receiptJson, sig} — the signed receipt, verbatim');
    if (!cfg.signKey.publicKey) return bad('this deployment cannot verify receipts', 501);
    let sigBytes; try { sigBytes = Uint8Array.from(atob(body.sig), (c) => c.charCodeAt(0)); } catch (e) { return bad('sig is not base64'); }
    const ok = await subtle.verify('Ed25519', cfg.signKey.publicKey, sigBytes, new TextEncoder().encode(body.receiptJson));
    if (!ok) return bad('the receipt does not verify against this deployment\'s key — refusing to package it', 403);
    let receipt; try { receipt = JSON.parse(body.receiptJson); } catch (e) { return bad('receiptJson is not JSON'); }
    if (!receipt || receipt.kind !== 'gifos-pay-receipt') return bad('not a GifOS pay receipt', 403);
    let appName = receipt.appId, payingTo = null;
    try { const { app, identity } = await identityFor(receipt.appId); appName = app.name || appName; payingTo = identity.id; } catch (e) {}
    const { label, files } = CHARGE.receiptFile(receipt, body.receiptJson, body.sig, { appName, payingTo });
    const bytes = await GIF.encode(files, { accent: [255, 196, 57] });
    return new Response(bytes, {
      status: 200,
      headers: Object.assign({ 'Content-Type': 'image/gif', 'Content-Disposition': 'attachment; filename="' + label.replace(/[^\w.\- ]+/g, '_') + '.gif"' }, CORS),
    });
  }

  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method === 'POST' && url.pathname === '/checkout') return checkout(req);
    if (req.method === 'GET' && url.pathname.startsWith('/receipt/')) return receiptFor(decodeURIComponent(url.pathname.slice('/receipt/'.length)));
    if (req.method === 'GET' && url.pathname === '/return') return returnPage(url);
    if (req.method === 'GET' && url.pathname === '/cancelled') return html('<p style="font:16px system-ui">Payment cancelled — you can close this window.</p>');
    if (req.method === 'POST' && url.pathname === '/x402/settle') return settle(req);
    if (req.method === 'POST' && url.pathname === '/transfer/invoice') return transferInvoice(req);
    if (req.method === 'POST' && url.pathname === '/transfer/receipt') return transferReceipt(req);
    if (req.method === 'POST' && url.pathname === '/fednow/rfp') return fednowRfp(req);
    if (req.method === 'GET' && url.pathname.startsWith('/fednow/receipt/')) return fednowReceipt(decodeURIComponent(url.pathname.slice('/fednow/receipt/'.length)));
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname.startsWith('/mpp/charge/')) return mppCharge(req, url);
    if (req.method === 'POST' && url.pathname === '/receipt/file') return receiptFile(req);
    if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true, mode: cfg.paypalBase.includes('sandbox') || cfg.paypalBase.includes('127.0.0.1') || cfg.paypalBase.includes('localhost') ? 'test' : 'LIVE' });
    return bad('no such endpoint', 404);
  };
}
