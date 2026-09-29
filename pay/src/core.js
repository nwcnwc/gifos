/*
 * pay/src/core.js — the payments Worker's whole brain, environment-agnostic.
 *
 * Four jobs and no more (docs/payments.md §The Worker):
 *
 *   POST /checkout      derive the payee from the app's VERIFIED signing
 *                       identity (the app's signature proof — never the
 *                       client's word), create the PayPal order with
 *                       GifOS's platform fee
 *   GET  /return        PayPal lands the buyer back here; capture the order
 *   GET  /receipt/:id   the only proof money moved: PayPal's own answer,
 *                       wrapped in an Ed25519-SIGNED receipt the OS verifies
 *                       against gifos.app's published key
 *   POST /x402/settle   forward the broker-built transfer payloads to the
 *                       x402 facilitator, sign the same receipt shape
 *   POST /transfer/invoice  the WALLET-TRANSFER rail (RockWallet and every
 *                       other self-custody wallet): mint a signed invoice
 *                       token naming the signed payee and a dust-unique
 *                       amount; /transfer/bind ties it to the payer's wallet;
 *                       /transfer/receipt watches the chain for that exact
 *                       USDC transfer (from that wallet) and signs the same
 *                       receipt shape
 *   POST /fednow/rfp    the FEDNOW rail, via a provider (FedNow itself has
 *                       no public API): create a Request-for-Payment the
 *                       buyer approves in their own banking app;
 *                       /fednow/receipt/:id polls it to the same receipt
 *   POST /mpp/offer     the OS presents the app's proof once and gets a signed
 *                       agent-checkout link for one purchase (an agent holds
 *                       no app bytes, so it cannot present a proof itself)
 *   GET|POST /mpp/charge/<offer>
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
 *   POST /rails         which of the author's allowed rails this deployment
 *                       can process right now — the OS sheet draws only those
 *
 * STATELESS by design — no KV, no Durable Object, no database. Everything a
 * receipt needs rides inside the PayPal order itself (custom_id carries
 * {appId, sku}); /receipt asks PayPal, not a store of ours. Restart the
 * Worker and nothing is lost, because nothing was held.
 *
 * THE PAYEE AND THE RAILS COME FROM THE AUTHOR'S SIGNATURE — NEVER FROM THE
 * CLIENT, AND NEVER FROM THE STORE. Every request that starts a payment
 * carries the app's PROOF (gifos-sign.js proofOf: the picture, manifest.json
 * in full, every other file as a sha256). The Worker rebuilds the signed
 * content hash from it, checks the signature against the author's own
 * published key (https://<domain>/gifos.key, or the keyserver for an email),
 * and reads the manifest as signed: the chain payee (manifest.pay.to), the
 * allowed rails (capabilities.pay), and the fiat payee derived from the
 * identity (payments@<domain> / the signing email). The rules are imported
 * from gifos-charge.js and gifos-sign.js — one home, not two copies. So any
 * signed app can be paid, listed in the store or not, and a request cannot
 * redirect a payout or use a rail its author refused. The kill switch is
 * cfg.blocked: signing identities (or identity/appId) this Worker refuses.
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
import '../../site/js/gifos-ed.js';     // the Ed25519 door gifos-sign.js verifies through
import '../../site/js/gifos-sign.js';   // attaches globalThis.GifOS.sign — checkProof
import { makeMpp } from './mpp.js';
const CHARGE = globalThis.GifOS.charge;
const GIF = globalThis.GifOS.gif;
const SIGN = globalThis.GifOS.sign;

// What a rail is called when a refusal names it to a person.
const RAIL_NAMES = { paypal: 'PayPal', x402: 'USDC from a connected wallet', transfer: 'USDC wallet transfers', fednow: 'FedNow bank payments', mpp: 'AI-agent payments (Stripe Link)' };

// A refusal that knows its HTTP status, so a route can `throw` one.
class Refusal extends Error { constructor(msg, status) { super(msg); this.status = status || 403; } }

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

  // ---- the author's key, fetched and cached ---------------------------------
  // The same key locations gifos-sign.js derives from the identity: a domain's
  // key is https://<domain>/gifos.key, an email's comes from the keyserver.
  // Cached for a few minutes so a checkout and its receipt poll do not fetch
  // twice; a failure is not cached, so a host that comes back is seen at once.
  const KEY_TTL_MS = 5 * 60 * 1000;
  const keyCache = new Map();
  async function authorKey(type, id) {
    const k = type + ':' + id;
    const hit = keyCache.get(k);
    if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
    let key;
    if (type === 'domain') {
      const url = cfg.keyUrlFor ? cfg.keyUrlFor(id) : 'https://' + id + '/gifos.key';
      // A redirect is not followed: the key lives AT the derived location.
      const r = await F(url, { redirect: 'manual', headers: { Accept: 'text/plain' } });
      if (r.status !== 200) throw new Error('no gifos.key at ' + id + ' (HTTP ' + r.status + ')');
      const text = await r.text();
      if (text.length > 4096) throw new Error('the gifos.key at ' + id + ' is too large to be a key');
      key = SIGN.parseDomainKey(text);
    } else if (type === 'email') {
      const r = await F(SIGN.KEYSERVER + encodeURIComponent(id));
      if (!r.ok) throw new Error('no key on the keyserver for ' + id + ' (HTTP ' + r.status + ')');
      const text = await r.text();
      if (text.length > 65536) throw new Error('the keyserver answer for ' + id + ' is too large');
      key = SIGN._dearmor(text);
      if (!key) throw new Error('could not parse the key for ' + id);
    } else {
      throw new Error('unknown signing identity type "' + type + '"');
    }
    if (keyCache.size > 1000) keyCache.clear();
    keyCache.set(k, { at: Date.now(), key });
    return key;
  }

  // ---- the kill switch ----------------------------------------------------
  // cfg.blocked: signing identities ("gifos.app", "a@b.co") or single apps
  // ("gifos.app/tip-creators") this Worker refuses to take payments for.
  // Checked when a payment starts AND again when an agent offer is redeemed,
  // so blocking an identity also stops offers minted before the block.
  function blockedWhy(id, appId) {
    const list = cfg.blocked || [];
    const who = String(id || '').toLowerCase();
    for (const e of list) {
      const x = String(e || '').toLowerCase();
      if (x === who) return 'payments to "' + id + '" are blocked on GifOS';
      if (appId && x === who + '/' + String(appId).toLowerCase()) return 'payments to "' + id + '" for "' + appId + '" are blocked on GifOS';
    }
    return null;
  }

  // ---- the SELLER, out of the app's signature -------------------------------
  // Verify the proof, then read everything a payment needs from the manifest
  // AS SIGNED. The eligibility rules are gifos-charge.js's — the same ones the
  // OS sheet ran — so the Worker and the sheet cannot disagree about who is
  // paid or on which rails.
  async function sellerFrom(proof) {
    if (!proof || typeof proof !== 'object') throw new Refusal('a payment must carry the app\'s signature proof (GifOS.sign.proofOf)', 400);
    const v = await SIGN.checkProof(proof, authorKey);
    if (v.status === 'unverified') throw new Refusal('the author\'s signing key could not be fetched right now (' + (v.detail || 'no detail') + ') — try again shortly', 503);
    if (v.status === 'unsigned') throw new Refusal('this app is not signed, so there is no verified author to pay', 403);
    if (v.status !== 'valid') throw new Refusal('this app\'s signature does not verify (' + (v.detail || v.status) + '), so it cannot be paid', 403);
    const m = v.manifest;
    const appId = String(m.appId || '');
    if (!/^[\w.\-]{1,64}$/.test(appId)) throw new Refusal('the signed manifest has no usable appId', 403);
    const why = blockedWhy(v.id, appId);
    if (why) throw new Refusal(why, 403);
    if (!m.capabilities || !m.capabilities.pay) throw new Refusal('"' + appId + '" did not declare the "pay" capability', 403);
    const elig = CHARGE.eligibility({ status: 'valid', id: v.id, type: v.type, ts: v.ts }, m);
    if (!elig.allowed) throw new Refusal(elig.reason, 403);
    return {
      appId,
      name: String(m.name || appId).slice(0, 80),
      identity: elig.identity,
      rails: elig.rails,
      chainPayee: elig.payee ? elig.payee.to : null,
      paypal: elig.paypal,
    };
  }
  function requireRail(seller, rail) {
    if (seller.rails.indexOf(rail) === -1) {
      throw new Refusal('the author of "' + seller.name + '" does not accept ' + RAIL_NAMES[rail] + ' (they allow: ' + seller.rails.map((r) => RAIL_NAMES[r]).join(', ') + ')', 403);
    }
  }
  // Run a route body that may throw a Refusal; anything else is a real error.
  const refusals = (fn) => async (...args) => {
    try { return await fn(...args); }
    catch (e) { if (e instanceof Refusal) return bad(e.message, e.status); throw e; }
  };

  // ---- the rails registry ---------------------------------------------------
  // The fee-free rails (wallet transfer, FedNow) collect no per-transaction
  // cut, so they are open only to signing identities REGISTERED on the
  // published registry (docs/payments.md §Registration — an annual flat fee,
  // amount not yet set). The fee-collecting rails need none of this. Absent
  // or expired -> a plain refusal naming the policy, never a pretend rail.
  let registryCache = { at: 0, reg: null };
  async function assertRegistered(identity) {
    if (!cfg.registryUrl) throw new Refusal('the rails registry is not configured on this deployment', 501);
    if (!registryCache.reg || Date.now() - registryCache.at > 60 * 1000) {
      const r = await F(cfg.registryUrl, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Refusal('rails registry unreachable (HTTP ' + r.status + ')', 503);
      registryCache = { at: Date.now(), reg: (await r.json()).registered || {} };
    }
    const e = registryCache.reg[identity.id];
    if (!e) throw new Refusal('"' + identity.id + '" is not registered for the fee-free rails — registration is not open to other authors yet; list paypal or x402 instead, which need none', 403);
    const untilMs = e.until == null ? null : Date.parse(e.until);
    if (untilMs != null && (Number.isNaN(untilMs) || Date.now() > untilMs)) {
      throw new Refusal('the rails registration for "' + identity.id + '" expired on ' + e.until + ' — renew it, or use the PayPal / USDC rails, which need no registration', 403);
    }
  }

  // ---- signed invoice tokens ------------------------------------------------
  // STATELESS invoices: the token IS the state, signed with the same key as
  // the receipts and verified here before it is honored. The client can hold
  // it, lose it, or tamper with it — tampering just fails the signature.
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const randHex = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); };
  const sha256hex = async (str) => hex(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(String(str)))));
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
    if (!ok) throw new Error('the token does not verify — refusing it');
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

  // ---- which rails can be processed right now -------------------------------
  // The author's list is what they ALLOW; this is what this deployment can
  // actually PROCESS for them at this moment — providers configured, PayPal's
  // platform approval, the rails registry, onboarding. The OS sheet draws a
  // button only where both hold, so a buyer never picks a rail that would
  // refuse them after the click. Each rail answers {ok} or {ok:false, why}.
  async function railStatus(seller) {
    const out = {};
    const no = (why) => ({ ok: false, why });
    const registered = async () => { try { await assertRegistered(seller.identity); return null; } catch (e) { return e.message; } };
    for (const rail of CHARGE.RAILS) {
      if (seller.rails.indexOf(rail) === -1) { out[rail] = no('the author does not accept ' + RAIL_NAMES[rail]); continue; }
      if (rail === 'paypal') {
        out.paypal = !cfg.paypalClientId || !cfg.paypalClientSecret ? no('PayPal is not configured on this deployment')
          : cfg.paypalPartner !== 'approved' ? no('PayPal payments open once PayPal approves GifOS as a platform partner')
          : { ok: true };
      } else if (rail === 'x402') {
        out.x402 = !cfg.facilitatorUrl ? no('no x402 facilitator is configured on this deployment')
          : !seller.chainPayee ? no('the app names no address to pay')
          : { ok: true };
      } else if (rail === 'transfer') {
        const reg = cfg.rpcUrl && seller.chainPayee ? await registered() : null;
        out.transfer = !cfg.rpcUrl ? no('the wallet-transfer rail is not configured on this deployment')
          : !seller.chainPayee ? no('the app names no address to pay')
          : reg ? no(reg) : { ok: true };
      } else if (rail === 'fednow') {
        const reg = cfg.fednowApi ? await registered() : null;
        out.fednow = !cfg.fednowApi ? no('the FedNow rail is not configured on this deployment')
          : reg ? no(reg)
          : !(cfg.fednowPayees || {})[seller.identity.id] ? no('"' + seller.identity.id + '" is not registered for bank payments')
          : { ok: true };
      } else if (rail === 'mpp') {
        out.mpp = !cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret ? no('the agent (MPP) rail is not configured on this deployment')
          : !(cfg.stripePayees || {})[seller.identity.id] ? no('"' + seller.identity.id + '" is not onboarded for the agent rail')
          : { ok: true };
      }
    }
    return out;
  }
  async function rails(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const seller = await sellerFrom(body.proof);
    return json({ appId: seller.appId, payingTo: seller.identity.id, allowed: seller.rails, rails: await railStatus(seller) });
  }

  // ---- routes ---------------------------------------------------------------
  async function checkout(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'paypal');
    // Refused HERE, before PayPal is asked: without partner approval PayPal
    // rejects any order carrying platform_fees (PLATFORM_FEES_NOT_SUPPORTED).
    if (cfg.paypalPartner !== 'approved') throw new Refusal('PayPal payments open once PayPal approves GifOS as a platform partner', 503);
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('amount must be a decimal integer string of base units');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    const reason = String(body.reason || '').slice(0, 140);
    const sku = body.sku == null ? null : String(body.sku).slice(0, 64);
    if (sku != null && !/^[\w.\-:]{1,64}$/.test(sku)) return bad('bad sku');
    // custom_id is what the receipt is rebuilt from after capture; PayPal
    // cuts it at 127 chars, and a cut JSON is a receipt with no app and no
    // sku — money taken, nothing granted. Refuse BEFORE an order exists.
    //
    // It also carries the CLAIM TAG. PayPal order ids are guessable enough
    // that /receipt/:id was a bearer lookup: anyone naming an id got a signed
    // receipt for someone else's purchase. The buyer's page alone receives
    // `claim` (16 random bytes); the order remembers only its SHA-256 tail,
    // and /receipt answers only to the claim that hashes to it. Stateless,
    // like everything else here — the order IS the memory.
    const claim = randHex(16);
    const customId = JSON.stringify({ a: appId, s: sku, c: (await sha256hex(claim)).slice(0, 16) });
    if (customId.length > 127) return bad('appId and sku are too long together for a PayPal order (' + customId.length + ' > 127 chars)');

    const payee = seller.paypal; // THE PAYEE RULE (gifos-charge.js paypalPayeeOf) — one home

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
    // Upstream bodies are logged, never forwarded: a provider's error text can
    // name accounts, ids and internal state that belong in the Worker log,
    // not in a browser that any page on the internet can drive.
    if (!order.ok) { console.log('paypal order refused', order.status, String(order.text || '').slice(0, 300)); return bad('PayPal refused the order', 502); }
    const approve = (order.body.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    if (!approve) return bad('PayPal returned no approval link', 502);
    return json({ id: order.body.id, approveUrl: approve.href, claim });
  }

  async function receiptFor(orderId, claim) {
    if (!/^[0-9a-f]{32}$/.test(String(claim || ''))) return bad('a receipt is read with the claim its checkout returned', 403);
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
    let meta = { a: null, s: null, c: null };
    try { meta = JSON.parse(unit.custom_id || (unit.payments.captures[0].custom_id)); } catch (e) {}
    if (!meta.c || (await sha256hex(claim)).slice(0, 16) !== meta.c) return bad('that claim does not open this order', 403);
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
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'x402');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    const transfers = body.transfers, payloads = body.payloads;
    if (!Array.isArray(transfers) || !transfers.length || !Array.isArray(payloads) || payloads.length !== transfers.length) {
      return bad('transfers/payloads mismatch');
    }
    // The AUTHOR leg (transfers[0]) must pay the SIGNED payee. A client-chosen
    // payTo would let a buyer pay their own address and collect a genuine
    // signed receipt while the author saw nothing.
    if (String(transfers[0] && transfers[0].to).toLowerCase() !== String(seller.chainPayee).toLowerCase()) {
      return bad('transfer 0 pays ' + (transfers[0] && transfers[0].to) + ' but the signed manifest names ' + seller.chainPayee + ' for "' + appId + '"', 403);
    }
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
        console.log('facilitator refused transfer', i, v.status, String((v.body && (v.body.invalidReason || v.body.error)) || v.text || '').slice(0, 200));
        return bad('the facilitator refused transfer ' + i, 502);
      }
      const st = await facilitator('/settle', { x402Version: 1, paymentPayload, paymentRequirements });
      if (!st.ok || !st.body || st.body.success !== true || !st.body.transaction) {
        console.log('facilitator did not settle transfer', i, st.status, String((st.body && (st.body.errorReason || st.body.error)) || st.text || '').slice(0, 200));
        return bad('the facilitator did not settle transfer ' + i, 502);
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
  // a USDC Transfer of exactly that value to the signed payee. The 3% is
  // NOT collected on this rail (a direct wallet send cannot split, and
  // routing it through a GifOS account would be custody) — the receipt says
  // so: feeCollected:false. Honest bookkeeping beats silent fiction.
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak(Transfer(address,address,uint256))
  const INVOICE_TTL_MS = 30 * 60 * 1000;

  async function transferInvoice(req) {
    if (!cfg.rpcUrl) return bad('the wallet-transfer rail is not configured on this deployment', 501);
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'transfer');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount) || BigInt(body.amount) <= 0n) return bad('bad amount');
    const payTo = seller.chainPayee;
    await assertRegistered(seller.identity);
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

  // The dust makes an amount unique among honest concurrent buyers; it does
  // not make it secret. Someone minting invoices for every dust value of a
  // popular price holds a token for whichever one a stranger's wallet later
  // happens to send, and /transfer/receipt would sign that stranger's payment
  // over to them. Binding the invoice to the PAYER closes it: the receipt
  // then honours only a Transfer FROM that address. The buyer names the
  // wallet they are sending from (the sheet asks), the same token is
  // re-signed with `from`, and the amount and dust stay exactly as shown.
  async function transferBind(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    let inv;
    try { inv = await verifyToken(body.token); } catch (e) { return bad(String(e.message || e), 403); }
    if (inv.kind !== 'gifos-pay-invoice') return bad('not an invoice token', 403);
    if (Date.now() > inv.exp) return bad('this invoice expired — start the payment again', 410);
    const from = String(body.from || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(from)) return bad('from must be a 0x… wallet address');
    if (inv.from && inv.from !== from) return bad('this invoice is already bound to another wallet', 409);
    const token = await signToken(Object.assign({}, inv, { from }));
    return json({ token, from });
  }

  async function transferReceipt(req) {
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    let inv;
    try { inv = await verifyToken(body.token); } catch (e) { return bad(String(e.message || e), 403); }
    if (inv.kind !== 'gifos-pay-invoice') return bad('not an invoice token', 403);
    if (Date.now() > inv.exp) return bad('this invoice expired — start the payment again', 410);
    // ONLY A BOUND INVOICE CAN BE RECEIPTED. The unbound token /transfer/invoice
    // hands out still exists (the sheet shows the amount before it asks for
    // the wallet), and the OS polls with it until the buyer binds — so an
    // unbound poll is answered PENDING, never with the chain. Answering it
    // from the chain is the pre-mint attack the comment above describes:
    // whoever holds a token for a dust value would be signed a stranger's
    // matching transfer. The chain is not asked, and no receipt is minted,
    // until the token names the payer.
    const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
    if (!inv.from || !/^0x[0-9a-f]{40}$/.test(String(inv.from))) return json({ status: 'PENDING', needsPayer: true });
    const logs = await rpc('eth_getLogs', [{
      fromBlock: inv.block, toBlock: 'latest',
      address: inv.asset,
      topics: [TRANSFER_TOPIC, pad(inv.from), pad(inv.payTo)],
    }]);
    const hit = (logs || []).find((l) => {
      try {
        if (BigInt(l.data) !== BigInt(inv.expected)) return false;
        // The node filtered on topics[1] already; check it here too, so a
        // node that ignores a topic filter cannot widen the binding.
        if (String((l.topics || [])[1] || '').toLowerCase() !== pad(inv.from)) return false;
        if (String((l.topics || [])[2] || '').toLowerCase() !== pad(inv.payTo)) return false;
        return true;
      } catch (e) { return false; }
    });
    if (!hit) return json({ status: 'PENDING' });
    const { receiptJson, sig } = await signedReceipt({
      rail: 'transfer',
      appId: inv.appId, sku: inv.sku,
      amount: inv.amount,
      payee: inv.payTo,
      payer: inv.from,
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
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'fednow');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    const identity = seller.identity;
    await assertRegistered(identity);
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
    if (!r.ok) { console.log('fednow provider refused', r.status, (await r.text()).slice(0, 200)); return bad('the payment provider refused the request', 502); }
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
  const OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  // An agent holds no app bytes, so it cannot present a proof. The OS (or
  // anything holding the app) presents it ONCE, here, and gets back a signed
  // OFFER: a URL naming exactly one purchase — app, sku, amount, signing
  // identity — that any agent can pay. Stateless like the invoices: the
  // token IS the offer, signed with the receipt key.
  async function mppOffer(req) {
    if (!cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    let body; try { body = await req.json(); } catch (e) { return bad('body must be JSON'); }
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'mpp');
    const amount = String(body.amount || '');
    if (!/^[0-9]+$/.test(amount)) return bad('amount must be a decimal integer string of base units ($1 = 1000000)');
    let value; try { value = usdValue(amount); } catch (e) { return bad(e.message); }
    if (BigInt(amount) / CENT < STRIPE_MIN_CENTS) return bad('Stripe takes nothing under $0.50 on this rail — $' + value + ' is too small; the USDC rails have no minimum');
    const sku = body.sku == null || body.sku === '' ? null : String(body.sku);
    if (sku != null && !/^[\w.\-:]{1,64}$/.test(sku)) return bad('bad sku');
    if (!(cfg.stripePayees || {})[seller.identity.id]) return bad('"' + seller.identity.id + '" is not onboarded for the agent rail — Stripe onboarding is not open to other authors yet; the PayPal and x402 rails need none', 403);
    const now = Date.now();
    const token = await signToken({
      v: 1, kind: 'gifos-mpp-offer', appId: seller.appId, name: seller.name,
      id: seller.identity.id, type: seller.identity.type, sku, amount, iat: now, exp: now + OFFER_TTL_MS,
    });
    return json({ url: cfg.returnBase + '/mpp/charge/' + token, exp: now + OFFER_TTL_MS });
  }

  async function mppCharge(req, url) {
    // A human who followed the link: this is a machine endpoint, say so.
    if (/text\/html/.test(req.headers.get('Accept') || '') && !req.headers.get('Authorization')) {
      return html('<div style="font:16px system-ui;max-width:32rem;margin:3rem auto"><h2>This is an agent checkout</h2>' +
        '<p>It speaks the Machine Payments Protocol (HTTP 402) for AI agents paying with a Stripe Link wallet. To buy as a person, open the app in <a href="https://gifos.app">GifOS</a> and pay there.</p></div>', 402);
    }
    if (!cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    let offer;
    try { offer = await verifyToken(decodeURIComponent(url.pathname.slice('/mpp/charge/'.length))); } catch (e) { return bad('this is not a valid GifOS agent checkout link', 404); }
    if (offer.kind !== 'gifos-mpp-offer') return bad('this is not a valid GifOS agent checkout link', 404);
    if (Date.now() > offer.exp) return bad('this checkout link has expired — ask for a new one', 410);
    const appId = offer.appId, amount = offer.amount, sku = offer.sku;
    const identity = { id: offer.id, type: offer.type };
    // The kill switch and the onboarding are read NOW, not when the offer was
    // minted: blocking an identity stops its outstanding offers too.
    const blockedMsg = blockedWhy(identity.id, appId);
    if (blockedMsg) return bad(blockedMsg, 403);
    // Onboarded authors only: a destination charge needs a connected account,
    // and that mapping is the platform's record (like FEDNOW_PAYEES), never
    // a client value. Absent -> a plain refusal naming the way back.
    const acct = (cfg.stripePayees || {})[identity.id];
    if (!acct) return bad('"' + identity.id + '" is not onboarded for the agent rail — Stripe onboarding is not open to other authors yet; the PayPal and x402 rails need none', 403);
    const cents = BigInt(amount) / CENT;
    const app = { name: offer.name };

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
    if (!r.ok) { console.log('stripe refused', r.status, String((pi && pi.error && pi.error.message) || text || '').slice(0, 200)); return challenge('verification-failed', 'Stripe refused the payment'); }
    if (r.headers.get('idempotent-replayed') === 'true') return challenge('invalid-challenge', 'this credential was already used — a replay, not a payment');
    if (!pi || pi.status !== 'succeeded') return challenge('verification-failed', 'Stripe did not settle the payment (status ' + (pi && pi.status) + ')');

    const at = Date.now();
    // appName and payeeId ride the receipt so /receipt/file can label the
    // file without looking anything up.
    const { receiptJson, sig } = await signedReceipt({
      rail: 'mpp', appId, appName: offer.name, sku, amount, payee: acct, payeeId: identity.id, tx: pi.id, at,
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
    // Labelled from the receipt's own signed fields — nothing is looked up.
    const appName = String(receipt.appName || receipt.appId || '');
    const payingTo = receipt.payeeId || null;
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
    if (req.method === 'POST' && url.pathname === '/rails') return refusals(rails)(req);
    if (req.method === 'POST' && url.pathname === '/checkout') return refusals(checkout)(req);
    if (req.method === 'GET' && url.pathname.startsWith('/receipt/')) return receiptFor(decodeURIComponent(url.pathname.slice('/receipt/'.length)), url.searchParams.get('claim'));
    if (req.method === 'GET' && url.pathname === '/return') return returnPage(url);
    if (req.method === 'GET' && url.pathname === '/cancelled') return html('<p style="font:16px system-ui">Payment cancelled — you can close this window.</p>');
    if (req.method === 'POST' && url.pathname === '/x402/settle') return refusals(settle)(req);
    if (req.method === 'POST' && url.pathname === '/transfer/invoice') return refusals(transferInvoice)(req);
    if (req.method === 'POST' && url.pathname === '/transfer/bind') return transferBind(req);
    if (req.method === 'POST' && url.pathname === '/transfer/receipt') return transferReceipt(req);
    if (req.method === 'POST' && url.pathname === '/fednow/rfp') return refusals(fednowRfp)(req);
    if (req.method === 'GET' && url.pathname.startsWith('/fednow/receipt/')) return fednowReceipt(decodeURIComponent(url.pathname.slice('/fednow/receipt/'.length)));
    if (req.method === 'POST' && url.pathname === '/mpp/offer') return refusals(mppOffer)(req);
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname.startsWith('/mpp/charge/')) return mppCharge(req, url);
    if (req.method === 'POST' && url.pathname === '/receipt/file') return receiptFile(req);
    if (req.method === 'GET' && url.pathname === '/health') return json({ ok: true, mode: cfg.paypalBase.includes('sandbox') || cfg.paypalBase.includes('127.0.0.1') || cfg.paypalBase.includes('localhost') ? 'test' : 'LIVE' });
    return bad('no such endpoint', 404);
  };
}
