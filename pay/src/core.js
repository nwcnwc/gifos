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
const CHARGE = globalThis.GifOS.charge;

const CENT = 10000n; // USDC base units (6 dp) per whole cent

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
      custom_id: JSON.stringify({ a: appId, s: sku }).slice(0, 127),
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

  return async function handle(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method === 'POST' && url.pathname === '/checkout') return checkout(req);
    if (req.method === 'GET' && url.pathname.startsWith('/receipt/')) return receiptFor(decodeURIComponent(url.pathname.slice('/receipt/'.length)));
    if (req.method === 'GET' && url.pathname === '/return') return returnPage(url);
    if (req.method === 'GET' && url.pathname === '/cancelled') return html('<p style="font:16px system-ui">Payment cancelled — you can close this window.</p>');
    if (req.method === 'POST' && url.pathname === '/x402/settle') return settle(req);
    if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true, mode: cfg.paypalBase.includes('sandbox') || cfg.paypalBase.includes('127.0.0.1') || cfg.paypalBase.includes('localhost') ? 'test' : 'LIVE' });
    return bad('no such endpoint', 404);
  };
}
