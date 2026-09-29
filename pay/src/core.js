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
 *                       no app bytes, so it cannot present a proof itself),
 *                       plus a one-time claim; POST /mpp/status {offer,
 *                       claim} is how the OS sheet waits for the agent to pay
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

// A proof is the app's picture plus one hash per file: ~235 KB for a store
// app, more for an app with thousands of files. Nothing legitimate is larger
// than this, and an uncapped body is a free way to burn the Worker's CPU.
const MAX_BODY = 4 * 1024 * 1024;
async function readCapped(stream, max) {
  if (!stream || typeof stream.getReader !== 'function') return null;
  const reader = stream.getReader(); const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { try { reader.cancel(); } catch (e) {} throw new Refusal('that is too large (over ' + max + ' bytes)', 413); }
    chunks.push(value);
  }
  const all = new Uint8Array(n); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  return new TextDecoder().decode(all);
}
async function readJson(req) {
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new Refusal('the request body is too large (over ' + MAX_BODY + ' bytes)', 413);
  const text = await readCapped(req.body, MAX_BODY);
  let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) {}
  if (!body || typeof body !== 'object') throw new Refusal('body must be JSON', 400);
  return body;
}

export function makeCore(cfg) {
  const F = cfg.fetch;
  const subtle = cfg.subtle;

  // Configuration that would fail SILENTLY is refused at start. A kill switch
  // written as a string instead of a list blocks nobody and says nothing.
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim());
  if (cfg.blocked != null && !strings(cfg.blocked)) throw new Error('BLOCKED must be a JSON list of strings (signing identities or identity/appId)');
  for (const k of ['fednowPayees', 'stripePayees']) {
    const v = cfg[k];
    if (v != null && (typeof v !== 'object' || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string'))) throw new Error(k + ' must be a JSON object of identity -> account id');
  }

  // ---- the audit trail ------------------------------------------------------
  // One JSON line per money event, to the Worker log (Workers Logs keeps
  // them; wrangler.toml [observability]). Facts only: what was asked, for
  // whom, on which rail, and what was answered. Never a proof body, a
  // credential, a token or a claim.
  function audit(ev, fields) {
    // `ts` is when this line was written; a receipt's own `at` rides beside it.
    try { console.log(JSON.stringify(Object.assign({}, fields || {}, { audit: 'gifos-pay', ev, ts: new Date().toISOString() }))); } catch (e) {}
  }

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
  // twice. A FAILURE is cached briefly too: the host is chosen by the caller,
  // so an uncached failure is a free outbound fetch per request. The body is
  // read through a cap and the fetch is timed — a host that answers with an
  // endless body, or never answers, costs a bounded amount.
  const KEY_TTL_MS = 5 * 60 * 1000;
  const KEY_FAIL_TTL_MS = 30 * 1000;
  const KEY_FETCH_MS = 5000;
  const keyCache = new Map();
  async function fetchKey(type, id) {
    const timed = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(KEY_FETCH_MS) } : {});
    const cappedText = async (r, max, what) => {
      let t;
      try { t = await readCapped(r.body, max); } catch (e) { throw new Error(what + ' is too large to be a key'); }
      return t == null ? await r.text() : t;
    };
    if (type === 'domain') {
      // The host is the CALLER's choice. Names that can only be private
      // (RFC 6762 / 8375 / common intranet suffixes) are never fetched.
      if (!cfg.keyUrlFor && /\.(internal|local|localhost|lan|home|corp|intranet|private|arpa)$/i.test('.' + id)) {
        throw new Error('"' + id + '" is not a public domain');
      }
      const url = cfg.keyUrlFor ? cfg.keyUrlFor(id) : 'https://' + id + '/gifos.key';
      // A redirect is not followed: the key lives AT the derived location.
      const r = await F(url, Object.assign({ redirect: 'manual', headers: { Accept: 'text/plain' } }, timed()));
      // The status is logged, not echoed: what a chosen host answers is not
      // the caller's to learn through this Worker.
      if (r.status !== 200) { console.log('author key fetch', id, r.status); throw new Error('no gifos.key could be read at ' + id); }
      return SIGN.parseDomainKey(await cappedText(r, 4096, 'the gifos.key at ' + id));
    }
    if (type === 'email') {
      const r = await F(SIGN.KEYSERVER + encodeURIComponent(id), timed());
      if (!r.ok) { console.log('keyserver fetch', r.status); throw new Error('no key on the keyserver for ' + id); }
      const key = SIGN._dearmor(await cappedText(r, 65536, 'the keyserver answer for ' + id));
      if (!key) throw new Error('could not parse the key for ' + id);
      return key;
    }
    throw new Error('unknown signing identity type "' + type + '"');
  }
  async function authorKey(type, id) {
    const k = type + ':' + id;
    const hit = keyCache.get(k);
    if (hit && Date.now() - hit.at < (hit.err ? KEY_FAIL_TTL_MS : KEY_TTL_MS)) {
      if (hit.err) throw new Error(hit.err);
      return hit.key;
    }
    if (keyCache.size > 1000) keyCache.clear();
    try {
      const key = await fetchKey(type, id);
      keyCache.set(k, { at: Date.now(), key });
      return key;
    } catch (e) {
      keyCache.set(k, { at: Date.now(), err: String(e && e.message || e) });
      throw e;
    }
  }

  // ---- the kill switch ----------------------------------------------------
  // cfg.blocked: signing identities ("gifos.app", "a@b.co") or single apps
  // ("gifos.app/tip-creators") this Worker refuses to take payments for.
  // A DOMAIN entry covers its subdomains ("evil.com" also blocks
  // "shop.evil.com"): whoever controls a domain controls every name under it.
  // Checked when a payment starts, again before an approved PayPal order is
  // captured, and again when an agent offer is redeemed — so a block also
  // stops orders and offers minted before it.
  function blockedWhy(id, appId) {
    const list = cfg.blocked || [];
    const who = String(id || '').toLowerCase();
    const app = appId ? String(appId).toLowerCase() : null;
    for (const e of list) {
      const x = String(e || '').trim().toLowerCase();
      const slash = x.indexOf('/');
      const xid = slash === -1 ? x : x.slice(0, slash);
      const xapp = slash === -1 ? null : x.slice(slash + 1);
      const covers = xid === who || (xid.indexOf('@') === -1 && who.indexOf('@') === -1 && who.endsWith('.' + xid));
      if (!covers) continue;
      if (xapp == null) return 'payments to "' + id + '" are blocked on GifOS';
      if (app && xapp === app) return 'payments to "' + id + '" for "' + appId + '" are blocked on GifOS';
    }
    return null;
  }

  // ---- WHO WAS PAID: the identity every receipt names ------------------------
  // A receipt that named only an appId let anyone sign their own app under a
  // victim's appId, pay themselves, and hold a genuine receipt that unlocked
  // the VICTIM's app (an appId is a string any manifest can wear). So every
  // receipt carries the signing identity the Worker VERIFIED when the payment
  // started — payeeId + payeeType — and the OS grants a purchase only to an
  // app signed by exactly that identity. Where the payment's memory is a
  // short provider field (a PayPal custom_id, a bank reference) it holds the
  // identity's TAG; the buyer's page names the identity when it asks for the
  // receipt, and the Worker signs it only if it hashes to that tag.
  const idTag = async (identity) => (await sha256hex('gifos-identity\x00' + identity.type + '\x00' + identity.id)).slice(0, 16);
  async function identityFor(tag, type, id) {
    if ((type !== 'domain' && type !== 'email') || typeof id !== 'string' || !id || id.length > 320) {
      throw new Refusal('a receipt is read naming the signing identity that was paid (id, type)', 403);
    }
    if (!tag || (await idTag({ type, id })) !== tag) throw new Refusal('that is not the identity this payment was made to', 403);
    return { type, id };
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
      prices: elig.prices,
    };
  }
  // A sku is sold at the author's SIGNED price (manifest.pay.prices), or not
  // at all — the amount is never the request's to choose. A tip (no sku) is
  // any amount. Returns the sku, validated.
  function pricedSku(seller, rawSku, amount) {
    if (rawSku == null || rawSku === '') return null;
    const sku = String(rawSku);
    if (!/^[\w.\-:]{1,64}$/.test(sku)) throw new Refusal('bad sku', 400);
    try { CHARGE.priceFor(seller.prices, sku, amount); } catch (e) { throw new Refusal(e.message, 403); }
    return sku;
  }
  function requireRail(seller, rail) {
    if (seller.rails.indexOf(rail) === -1) {
      throw new Refusal('the author of "' + seller.name + '" does not accept ' + RAIL_NAMES[rail] + ' (they allow: ' + seller.rails.map((r) => RAIL_NAMES[r]).join(', ') + ')', 403);
    }
  }
  // Run a route body that may throw a Refusal; anything else is a real error.
  const refusals = (fn, route) => async (...args) => {
    try { return await fn(...args); }
    catch (e) {
      if (e instanceof Refusal) { audit('refused', { route, status: e.status, why: e.message.slice(0, 200) }); return bad(e.message, e.status); }
      throw e;
    }
  };

  // An identity is looked up WITHOUT regard to case: "A@b.co" and "a@b.co"
  // are one mailbox, and a payee map must not be dodged by re-casing.
  function byIdentity(map, id) {
    const want = String(id || '').toLowerCase();
    for (const k of Object.keys(map || {})) if (k.toLowerCase() === want) return map[k];
    return undefined;
  }

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
    const e = byIdentity(registryCache.reg, identity.id);
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
  // Tokens and receipts share one key, so a token is signed under a label a
  // receipt (bare JSON) can never begin with: neither can pass as the other.
  const TOKEN_LABEL = 'gifos-pay-token\x00';
  async function signToken(obj) {
    const json = JSON.stringify(obj);
    const body = b64u(new TextEncoder().encode(json));
    const sig = b64u(new Uint8Array(await subtle.sign('Ed25519', cfg.signKey.privateKey, new TextEncoder().encode(TOKEN_LABEL + body))));
    return body + '.' + sig;
  }
  async function verifyToken(token) {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) throw new Error('malformed token');
    if (!cfg.signKey.publicKey) throw new Error('this deployment cannot verify tokens');
    const ok = await subtle.verify('Ed25519', cfg.signKey.publicKey, unb64u(sig), new TextEncoder().encode(TOKEN_LABEL + body));
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
          : !byIdentity(cfg.fednowPayees, seller.identity.id) ? no('"' + seller.identity.id + '" is not registered for bank payments')
          : { ok: true };
      } else if (rail === 'mpp') {
        out.mpp = !cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret ? no('the agent (MPP) rail is not configured on this deployment')
          : !byIdentity(cfg.stripePayees, seller.identity.id) ? no('"' + seller.identity.id + '" is not onboarded for the agent rail')
          : { ok: true };
      }
    }
    return out;
  }
  async function rails(req) {
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    return json({ appId: seller.appId, payingTo: seller.identity.id, allowed: seller.rails, rails: await railStatus(seller) });
  }

  // ---- routes ---------------------------------------------------------------
  async function checkout(req) {
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'paypal');
    // Refused HERE, before PayPal is asked: without partner approval PayPal
    // rejects any order carrying platform_fees (PLATFORM_FEES_NOT_SUPPORTED).
    if (cfg.paypalPartner !== 'approved') throw new Refusal('PayPal payments open once PayPal approves GifOS as a platform partner', 503);
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('amount must be a decimal integer string of base units');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    const reason = String(body.reason || '').slice(0, 140);
    const sku = pricedSku(seller, body.sku, body.amount);
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
    const customId = JSON.stringify({ a: appId, s: sku, c: (await sha256hex(claim)).slice(0, 16), i: await idTag(seller.identity) });
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
    if (!order.ok) {
      console.log('paypal order refused', order.status, String(order.text || '').slice(0, 300));
      audit('provider-refused', { rail: 'paypal', appId, payeeId: seller.identity.id, amount: body.amount, status: order.status });
      return bad('PayPal refused the order', 502);
    }
    const approve = (order.body.links || []).find((l) => l.rel === 'approve' || l.rel === 'payer-action');
    if (!approve) return bad('PayPal returned no approval link', 502);
    audit('started', { rail: 'paypal', appId, sku, amount: body.amount, payeeId: seller.identity.id, payee, ref: order.body.id });
    return json({ id: order.body.id, approveUrl: approve.href, claim });
  }

  // custom_id as this Worker wrote it, or nulls.
  function orderMeta(order) {
    const unit = ((order && order.purchase_units) || [])[0] || {};
    let meta = null;
    try { meta = JSON.parse(unit.custom_id || (unit.payments.captures[0].custom_id)); } catch (e) {}
    return { unit, meta: meta && typeof meta === 'object' ? meta : { a: null, s: null, c: null, i: null } };
  }
  // The kill switch against an identity known only by its tag.
  async function blockedTag(tag, appId) {
    for (const e of cfg.blocked || []) {
      const x = String(e).trim(); const slash = x.indexOf('/');
      const xid = (slash === -1 ? x : x.slice(0, slash)).toLowerCase();
      const xapp = slash === -1 ? null : x.slice(slash + 1).toLowerCase();
      if (xapp != null && xapp !== String(appId || '').toLowerCase()) continue;
      const type = xid.indexOf('@') === -1 ? 'domain' : 'email';
      if ((await idTag({ type, id: xid })) === tag) return true;
    }
    return false;
  }

  async function receiptFor(orderId, q) {
    const claim = q.get('claim');
    if (!/^[0-9a-f]{32}$/.test(String(claim || ''))) return bad('a receipt is read with the claim its checkout returned', 403);
    const got = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId));
    if (!got.ok) return json({ status: 'PENDING' });
    let order = got.body;
    // The claim and the identity are checked BEFORE anything is captured: an
    // order id alone must not be able to move money, only its buyer's page.
    const { meta } = orderMeta(order);
    if (!meta.c || (await sha256hex(claim)).slice(0, 16) !== meta.c) return bad('that claim does not open this order', 403);
    const identity = await identityFor(meta.i, q.get('type'), q.get('id'));
    // The buyer approved but the return page never captured (closed tab, flaky
    // network): capture here. /receipt converges on COMPLETED from either path.
    if (order.status === 'APPROVED') {
      const why = blockedWhy(identity.id, meta.a);
      if (why) throw new Refusal(why, 403);
      const cap = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', 'POST', {});
      if (cap.ok) order = cap.body;
    }
    if (order.status !== 'COMPLETED') return json({ status: order.status || 'PENDING' });
    const unit = orderMeta(order).unit;
    const capture = ((unit.payments || {}).captures || [])[0] || {};
    const amountValue = (capture.amount && capture.amount.value) || (unit.amount && unit.amount.value);
    const fields = {
      rail: 'paypal',
      appId: meta.a,
      sku: meta.s,
      amount: unitsFromValue(amountValue),
      payee: (unit.payee && unit.payee.email_address) || null,
      payeeId: identity.id, payeeType: identity.type,
      tx: capture.id || order.id,
      orderId: order.id,
      at: Date.now(),
    };
    const { receiptJson, sig } = await signedReceipt(fields);
    audit('receipt', fields);
    return json({ status: 'COMPLETED', receiptJson, sig });
  }

  async function returnPage(url) {
    const orderId = url.searchParams.get('token') || '';
    if (!orderId) return html('<p>Missing order.</p>', 400);
    // Capture immediately — the poll in the OS page turns COMPLETED on its
    // next tick. A failure here is NOT fatal: /receipt retries the capture.
    // Only an order THIS Worker made, for a seller not blocked since.
    try {
      const got = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId));
      const { meta } = orderMeta(got.ok ? got.body : null);
      if (got.ok && got.body.status === 'APPROVED' && meta.i && meta.c && !(await blockedTag(meta.i, meta.a))) {
        const cap = await pp('/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', 'POST', {});
        audit('captured', { rail: 'paypal', appId: meta.a, sku: meta.s, ref: orderId, ok: !!cap.ok });
      }
    } catch (e) {}
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
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'x402');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    const sku = pricedSku(seller, body.sku, body.amount);
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
    // EVERY leg is verified before ANY leg is settled, so a payment that
    // cannot complete is refused while nothing has moved.
    const legsToSettle = [];
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
        description: 'GifOS charge: ' + appId + (sku ? ' / ' + sku : ''),
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
        audit('provider-refused', { rail: 'x402', step: 'verify', leg: i, appId, payeeId: seller.identity.id, amount: body.amount });
        return bad('the facilitator refused transfer ' + i, 502);
      }
      legsToSettle.push({ paymentPayload, paymentRequirements });
    }
    const payer = String((payloads[0].authorization && payloads[0].authorization.from) || '') || null;
    const txs = [];
    let feeCollected = true;
    for (let i = 0; i < legsToSettle.length; i++) {
      const st = await facilitator('/settle', Object.assign({ x402Version: 1 }, legsToSettle[i]));
      if (!st.ok || !st.body || st.body.success !== true || !st.body.transaction) {
        console.log('facilitator did not settle transfer', i, st.status, String((st.body && (st.body.errorReason || st.body.error)) || st.text || '').slice(0, 200));
        audit('provider-refused', { rail: 'x402', step: 'settle', leg: i, appId, payeeId: seller.identity.id, amount: body.amount, payer, settled: txs });
        // The AUTHOR leg failed: nothing has moved, nothing is owed.
        if (i === 0) return bad('the facilitator did not settle transfer ' + i, 502);
        // The author WAS paid and only the fee leg failed. The buyer bought
        // the thing: they get their receipt, it says the fee was not
        // collected, and the audit line above names the payer.
        feeCollected = false;
        break;
      }
      txs.push(st.body.transaction);
    }
    const fields = {
      rail: 'x402',
      appId,
      sku,
      amount: body.amount,
      payee: (transfers[0] && transfers[0].to) || null,
      payeeId: seller.identity.id, payeeType: seller.identity.type,
      payer,
      tx: txs.join(','),
      at: Date.now(),
    };
    if (!feeCollected) fields.feeCollected = false;
    const { receiptJson, sig } = await signedReceipt(fields);
    audit('receipt', fields);
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
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'transfer');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount) || BigInt(body.amount) <= 0n) return bad('bad amount');
    const sku = pricedSku(seller, body.sku, body.amount);
    const payTo = seller.chainPayee;
    await assertRegistered(seller.identity);
    const dustBytes = new Uint8Array(2); crypto.getRandomValues(dustBytes);
    const dust = (dustBytes[0] * 256 + dustBytes[1]) % 10000;          // < one cent
    const expected = String(BigInt(body.amount) + BigInt(dust));
    const block = await rpc('eth_blockNumber');
    const now = Date.now();
    const token = await signToken({
      v: 1, kind: 'gifos-pay-invoice', appId, sku,
      id: seller.identity.id, type: seller.identity.type,
      amount: body.amount, expected, payTo,
      asset: USDC_SEPOLIA, network: 'eip155:84532',
      block, iat: now, exp: now + INVOICE_TTL_MS,
    });
    audit('started', { rail: 'transfer', appId, sku, amount: body.amount, expected, payeeId: seller.identity.id, payee: payTo });
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
    const body = await readJson(req);
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
    const body = await readJson(req);
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
    if (!inv.id || !inv.type) return bad('this invoice names no signing identity — start the payment again', 410);
    const fields = {
      rail: 'transfer',
      appId: inv.appId, sku: inv.sku,
      amount: inv.amount,
      payee: inv.payTo,
      payeeId: inv.id, payeeType: inv.type,
      payer: inv.from,
      tx: hit.transactionHash,
      feeCollected: false,
      at: Date.now(),
    };
    const { receiptJson, sig } = await signedReceipt(fields);
    audit('receipt', fields);
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
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'fednow');
    const appId = seller.appId;
    if (typeof body.amount !== 'string' || !/^[0-9]+$/.test(body.amount)) return bad('bad amount');
    let value; try { value = usdValue(body.amount); } catch (e) { return bad(e.message); }
    const identity = seller.identity;
    await assertRegistered(identity);
    const account = byIdentity(cfg.fednowPayees, identity.id);
    if (!account) return bad('"' + identity.id + '" is not registered for bank payments — this rail is not available for it', 403);
    const sku = pricedSku(seller, body.sku, body.amount);
    // The reference is this payment's whole memory, exactly as a PayPal
    // custom_id is: app, sku, amount, the claim's tag and the identity's tag.
    // A CUT reference is money taken and nothing granted, so one that does
    // not fit is refused before the request exists.
    const claim = randHex(16);
    const reference = JSON.stringify({ a: appId, s: sku, u: body.amount, c: (await sha256hex(claim)).slice(0, 16), i: await idTag(identity) });
    if (reference.length > 140) return bad('appId and sku are too long together for a bank payment reference (' + reference.length + ' > 140 chars)');
    const r = await F(cfg.fednowApi + '/rfp', {
      method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, cfg.fednowKey ? { Authorization: 'Bearer ' + cfg.fednowKey } : {}),
      body: JSON.stringify({
        account, amount: value, currency: 'USD',
        reference,
        description: String(body.reason || '').slice(0, 140),
      }),
    });
    if (!r.ok) {
      console.log('fednow provider refused', r.status, (await r.text()).slice(0, 200));
      audit('provider-refused', { rail: 'fednow', appId, payeeId: identity.id, amount: body.amount, status: r.status });
      return bad('the payment provider refused the request', 502);
    }
    const b = await r.json();
    if (!b.id) return bad('the payment provider returned no request id', 502);
    audit('started', { rail: 'fednow', appId, sku, amount: body.amount, payeeId: identity.id, payee: account, ref: b.id });
    return json({ id: b.id, claim });
  }

  async function fednowReceipt(id, q) {
    if (!cfg.fednowApi) return bad('the FedNow rail is not configured on this deployment', 501);
    const claim = q.get('claim');
    if (!/^[0-9a-f]{32}$/.test(String(claim || ''))) return bad('a receipt is read with the claim its payment request returned', 403);
    const r = await F(cfg.fednowApi + '/rfp/' + encodeURIComponent(id), {
      headers: cfg.fednowKey ? { Authorization: 'Bearer ' + cfg.fednowKey } : {},
    });
    if (!r.ok) return json({ status: 'PENDING' });
    const b = await r.json();
    let meta = null;
    try { meta = JSON.parse(b.reference); } catch (e) {}
    if (!meta || typeof meta !== 'object' || !meta.c || (await sha256hex(claim)).slice(0, 16) !== meta.c) return bad('that claim does not open this payment request', 403);
    const identity = await identityFor(meta.i, q.get('type'), q.get('id'));
    if (b.status !== 'SETTLED') return json({ status: b.status || 'PENDING' });
    const fields = {
      rail: 'fednow',
      appId: meta.a, sku: meta.s,
      amount: meta.u,
      payee: b.account || null,
      payeeId: identity.id, payeeType: identity.type,
      tx: b.settlementId || b.id,
      feeCollected: false,
      at: Date.now(),
    };
    const { receiptJson, sig } = await signedReceipt(fields);
    audit('receipt', fields);
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
  // for exactly this URL's purchase. ONE LINK, ONE PAYMENT: the Stripe
  // Idempotency-Key is the offer's own id. So:
  //   - the agent RETRYING the same credential (its first answer was lost)
  //     gets the SAME payment back, marked `idempotent-replayed` — and the
  //     same receipt, because it is the same payment, not a second one;
  //   - a second payment with a DIFFERENT token is refused by Stripe itself
  //     (idempotency_error: same key, different parameters);
  //   - a DECLINED first attempt is remembered by Stripe under the key too,
  //     so the link is spent: the agent is told to ask for a new one, and
  //     /mpp/status tells the waiting sheet FAILED instead of leaving it
  //     to poll.
  // An offer lives 30 minutes — exactly as long as the OS sheet waits for
  // it — well inside the 24 hours Stripe keeps a key.
  const MPP = makeMpp({ subtle });
  const STRIPE_VERSION = '2026-07-29.preview';   // SPTs are preview API surface
  const STRIPE_MIN_CENTS = 50n;                  // Stripe's card minimum
  const OFFER_TTL_MS = 30 * 60 * 1000;

  // An agent holds no app bytes, so it cannot present a proof. The OS (or
  // anything holding the app) presents it ONCE, here, and gets back a signed
  // OFFER: a URL naming exactly one purchase — app, sku, amount, signing
  // identity — that any agent can pay. Stateless like the invoices: the
  // token IS the offer, signed with the receipt key. It carries an offer id
  // (stamped on the Stripe payment, so the OS can find it) and the tag of a
  // one-time CLAIM returned only to the caller: the OS sheet waits on
  // /mpp/status with it, and nobody else holding the link can read the
  // receipt (the same claim design as PayPal's /receipt).
  async function mppOffer(req) {
    if (!cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    const body = await readJson(req);
    const seller = await sellerFrom(body.proof);
    requireRail(seller, 'mpp');
    const amount = String(body.amount || '');
    if (!/^[0-9]+$/.test(amount)) return bad('amount must be a decimal integer string of base units ($1 = 1000000)');
    let value; try { value = usdValue(amount); } catch (e) { return bad(e.message); }
    if (BigInt(amount) / CENT < STRIPE_MIN_CENTS) return bad('Stripe takes nothing under $0.50 on this rail — $' + value + ' is too small; the USDC rails have no minimum');
    const sku = pricedSku(seller, body.sku, amount);
    if (!byIdentity(cfg.stripePayees, seller.identity.id)) return bad('"' + seller.identity.id + '" is not onboarded for the agent rail — Stripe onboarding is not open to other authors yet; the PayPal and x402 rails need none', 403);
    const now = Date.now();
    const claim = randHex(16);
    const oid = randHex(12);
    const token = await signToken({
      v: 1, kind: 'gifos-mpp-offer', appId: seller.appId, name: seller.name,
      id: seller.identity.id, type: seller.identity.type, sku, amount,
      oid, c: (await sha256hex(claim)).slice(0, 16),
      iat: now, exp: now + OFFER_TTL_MS,
    });
    audit('started', { rail: 'mpp', appId: seller.appId, sku, amount, payeeId: seller.identity.id, payee: byIdentity(cfg.stripePayees, seller.identity.id), ref: oid });
    return json({ url: cfg.returnBase + '/mpp/charge/' + token, token, claim, exp: now + OFFER_TTL_MS });
  }

  // Verify an offer token as THIS Worker's, unexpired, well-formed.
  async function offerFrom(token) {
    let offer;
    try { offer = await verifyToken(token); } catch (e) { throw new Refusal('this is not a valid GifOS agent checkout link', 404); }
    if (offer.kind !== 'gifos-mpp-offer' || !/^[0-9a-f]{24}$/.test(String(offer.oid || ''))) throw new Refusal('this is not a valid GifOS agent checkout link', 404);
    if (Date.now() > offer.exp) throw new Refusal('this checkout link has expired — ask for a new one', 410);
    return offer;
  }
  // `at` is the PAYMENT's own time, so the charge, a replayed charge and the
  // sheet's status lookup all sign the same receipt for the same payment.
  async function offerReceipt(offer, acct, pi, via) {
    const fields = {
      rail: 'mpp', appId: offer.appId, appName: offer.name, sku: offer.sku, amount: offer.amount,
      payee: acct, payeeId: offer.id, payeeType: offer.type, tx: pi.id,
      at: pi.created ? Number(pi.created) * 1000 : Date.now(),
    };
    const out = await signedReceipt(fields);
    audit('receipt', Object.assign({ via, offer: offer.oid }, fields));
    return out;
  }
  // Is this Stripe payment THE payment for this offer: settled, in dollars,
  // for the offer's amount, to the author's connected account?
  function paysOffer(pi, offer, acct) {
    return !!pi && pi.status === 'succeeded'
      && pi.metadata && pi.metadata.gifos_offer === offer.oid
      && String(pi.amount) === String(BigInt(offer.amount) / CENT)
      && String(pi.currency || '').toLowerCase() === 'usd'
      && !!acct && !!pi.transfer_data && pi.transfer_data.destination === acct;
  }

  // The OS sheet's wait: has the agent paid this offer yet? Found by the
  // offer id stamped on the payment (Stripe's search API — eventually
  // consistent, so a just-settled payment can take up to a minute to
  // appear). Answers only to the claim the offer was minted with.
  async function mppStatus(req) {
    if (!cfg.stripeKey) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    const body = await readJson(req);
    const offer = await offerFrom(String(body.offer || ''));
    if (!/^[0-9a-f]{32}$/.test(String(body.claim || '')) || (await sha256hex(body.claim)).slice(0, 16) !== offer.c) {
      return bad('that claim does not open this checkout', 403);
    }
    const q = "metadata['gifos_offer']:'" + offer.oid + "'";
    const r = await F(cfg.stripeApi + '/v1/payment_intents/search?query=' + encodeURIComponent(q), {
      headers: { Authorization: 'Basic ' + btoa(cfg.stripeKey + ':'), 'Stripe-Version': STRIPE_VERSION },
    });
    if (!r.ok) { console.log('stripe search refused', r.status, (await r.text()).slice(0, 200)); return json({ status: 'PENDING' }); }
    const acct = byIdentity(cfg.stripePayees, offer.id);
    const mine = ((await r.json()).data || []).filter((pi) => pi && pi.metadata && pi.metadata.gifos_offer === offer.oid);
    const found = mine.find((pi) => paysOffer(pi, offer, acct));
    if (found) {
      const { receiptJson, sig } = await offerReceipt(offer, acct, found, 'status');
      return json({ status: 'COMPLETED', receiptJson, sig });
    }
    // An attempt was made and did not settle: the link's one attempt is
    // spent (see the idempotency note above), so the wait is over.
    if (mine.some((pi) => pi.status === 'requires_payment_method' || pi.status === 'canceled')) return json({ status: 'FAILED' });
    return json({ status: 'PENDING' });
  }

  async function mppCharge(req, url) {
    // A human who followed the link: this is a machine endpoint, say so.
    if (/text\/html/.test(req.headers.get('Accept') || '') && !req.headers.get('Authorization')) {
      return html('<div style="font:16px system-ui;max-width:32rem;margin:3rem auto"><h2>This is an agent checkout</h2>' +
        '<p>It speaks the Machine Payments Protocol (HTTP 402) for AI agents paying with a Stripe Link wallet. To buy as a person, open the app in <a href="https://gifos.app">GifOS</a> and pay there.</p></div>', 402);
    }
    if (!cfg.stripeKey || !cfg.stripeProfileId || !cfg.mppSecret) return bad('the agent (MPP) rail is not configured on this deployment', 501);
    // The token is base64url and a dot: nothing in it needs URL-decoding.
    const offer = await offerFrom(url.pathname.slice('/mpp/charge/'.length));
    const appId = offer.appId, amount = offer.amount, sku = offer.sku;
    const identity = { id: offer.id, type: offer.type };
    // The kill switch and the onboarding are read NOW, not when the offer was
    // minted: blocking an identity stops its outstanding offers too.
    const blockedMsg = blockedWhy(identity.id, appId);
    if (blockedMsg) throw new Refusal(blockedMsg, 403);
    // Onboarded authors only: a destination charge needs a connected account,
    // and that mapping is the platform's record (like FEDNOW_PAYEES), never
    // a client value. Absent -> a plain refusal naming the way back.
    const acct = byIdentity(cfg.stripePayees, identity.id);
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
      'metadata[gifos_offer]': offer.oid,
      'metadata[machine_payment]': 'true',
    });
    const r = await F(cfg.stripeApi + '/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(cfg.stripeKey + ':'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': 'gifos_offer_' + offer.oid,
        'Stripe-Version': STRIPE_VERSION,
      },
      body: form.toString(),
    });
    const text = await r.text();
    let pi = null; try { pi = JSON.parse(text); } catch (e) {}
    const replayed = r.headers.get('idempotent-replayed') === 'true';
    if (!r.ok) {
      const kind = pi && pi.error && pi.error.type;
      console.log('stripe refused', r.status, String((pi && pi.error && pi.error.message) || text || '').slice(0, 200));
      audit('provider-refused', { rail: 'mpp', appId, payeeId: identity.id, amount, offer: offer.oid, status: r.status, kind, replayed });
      if (kind === 'idempotency_error') return challenge('invalid-challenge', 'a payment was already attempted on this checkout link with a different token — one link, one payment; ask for a new link');
      return challenge('verification-failed', replayed
        ? 'the payment attempt on this checkout link was refused by Stripe — one link, one attempt; ask for a new link'
        : 'Stripe refused the payment — if a retry is refused too, ask for a new link');
    }
    // A replay of a SETTLED payment for this offer is the agent retrying
    // after a lost answer: the same payment, so the same receipt. Anything
    // else Stripe hands back is not this offer's payment.
    if (!paysOffer(pi, offer, acct)) return challenge('verification-failed', 'Stripe did not settle this payment (status ' + (pi && pi.status) + ')');

    const at = pi.created ? Number(pi.created) * 1000 : Date.now();
    // appName and payeeId ride the receipt so /receipt/file can label the
    // file without looking anything up; /mpp/status signs the same fields.
    const { receiptJson, sig } = await offerReceipt(offer, acct, pi, replayed ? 'charge-replay' : 'charge');
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
    const body = await readJson(req);
    if (typeof body.receiptJson !== 'string' || typeof body.sig !== 'string') return bad('needs {receiptJson, sig} — the signed receipt, verbatim');
    if (!cfg.signKey.publicKey) return bad('this deployment cannot verify receipts', 501);
    let sigBytes; try { sigBytes = Uint8Array.from(atob(body.sig), (c) => c.charCodeAt(0)); } catch (e) { return bad('sig is not base64'); }
    const ok = await subtle.verify('Ed25519', cfg.signKey.publicKey, sigBytes, new TextEncoder().encode(body.receiptJson));
    if (!ok) return bad('the receipt does not verify against this deployment\'s key — refusing to package it', 403);
    let receipt; try { receipt = JSON.parse(body.receiptJson); } catch (e) { return bad('receiptJson is not JSON'); }
    if (!receipt || receipt.kind !== 'gifos-pay-receipt') return bad('not a GifOS pay receipt', 403);
    if (typeof receipt.payeeId !== 'string' || !receipt.payeeId) return bad('this receipt names no signing identity, so no GifOS would accept it', 403);
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
    const path = url.pathname;
    const is = (method, p) => req.method === method && path === p;
    // A path segment that is not valid percent-encoding is a bad request,
    // not a crash.
    const tail = (prefix) => { try { return decodeURIComponent(path.slice(prefix.length)); } catch (e) { throw new Refusal('malformed path', 400); } };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (is('POST', '/rails')) return refusals(rails, path)(req);
    if (is('POST', '/checkout')) return refusals(checkout, path)(req);
    if (req.method === 'GET' && path.startsWith('/receipt/')) return refusals(() => receiptFor(tail('/receipt/'), url.searchParams), '/receipt')();
    if (is('GET', '/return')) return returnPage(url);
    if (is('GET', '/cancelled')) return html('<p style="font:16px system-ui">Payment cancelled — you can close this window.</p>');
    if (is('POST', '/x402/settle')) return refusals(settle, path)(req);
    if (is('POST', '/transfer/invoice')) return refusals(transferInvoice, path)(req);
    if (is('POST', '/transfer/bind')) return refusals(transferBind, path)(req);
    if (is('POST', '/transfer/receipt')) return refusals(transferReceipt, path)(req);
    if (is('POST', '/fednow/rfp')) return refusals(fednowRfp, path)(req);
    if (req.method === 'GET' && path.startsWith('/fednow/receipt/')) return refusals(() => fednowReceipt(tail('/fednow/receipt/'), url.searchParams), '/fednow/receipt')();
    if (is('POST', '/mpp/offer')) return refusals(mppOffer, path)(req);
    if (is('POST', '/mpp/status')) return refusals(mppStatus, path)(req);
    if ((req.method === 'GET' || req.method === 'POST') && path.startsWith('/mpp/charge/')) return refusals(mppCharge, '/mpp/charge')(req, url);
    if (is('POST', '/receipt/file')) return refusals(receiptFile, path)(req);
    if (is('GET', '/health')) return json({ ok: true, mode: cfg.paypalBase.includes('sandbox') || cfg.paypalBase.includes('127.0.0.1') || cfg.paypalBase.includes('localhost') ? 'test' : 'LIVE' });
    return bad('no such endpoint', 404);
  };
}
