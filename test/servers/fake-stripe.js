// fake-stripe.js — Stripe's PaymentIntents API, as far as the MPP rail uses
// it, for the gate.
//
// The pay Worker's /mpp/charge consumes a Shared Payment Token (spt_…) by
// creating a PaymentIntent — confirm=true, a Connect DESTINATION charge to
// the author's connected account with GifOS's application_fee_amount. This
// fake holds the tokens an "agent wallet" issued, enforces what Stripe
// enforces about them (one use, the granted max_amount, expiry, the
// currency), honours Idempotency-Key the way Stripe does (same key -> the
// SAME response, marked `idempotent-replayed: true` — the header the Worker
// MUST read, or a replayed credential would look like a fresh success), and
// records every intent for assertions.
//
// It does NOT verify a secret key beyond its shape, and says so: nothing
// here proves Stripe would accept the same request, only that the Worker
// sends the one it should.
//
//   POST /v1/test_helpers/shared_payment/granted_tokens   mint a token
//        (form: payment_method, usage_limits[currency|max_amount|expires_at])
//   GET  /v1/shared_payment/granted_tokens/:id            inspect one
//   POST /v1/payment_intents                              consume one
//   GET  /_state                                          everything
//
// Usage: node test/servers/fake-stripe.js [port]   (default 8801)
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || process.env.STRIPE_PORT || 8801);
const tokens = new Map();
const intents = [];
const idem = new Map();      // Idempotency-Key -> { status, body }
let seq = 0;

const readBody = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
});
const send = (res, status, obj, extra) => {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, extra || {}));
  res.end(JSON.stringify(obj));
};
const stripeError = (res, status, code, message) => send(res, status, { error: { type: 'invalid_request_error', code, message } });
// Stripe's bracketed form encoding -> nested object: a[b][c]=v
function form(text) {
  const out = {};
  for (const [k, v] of new URLSearchParams(text)) {
    const path = k.replace(/\]/g, '').split('[');
    let o = out;
    for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
    o[path[path.length - 1]] = v;
  }
  return out;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const auth = req.headers.authorization || '';
  if (url.pathname.startsWith('/v1/') && !/^Basic /.test(auth)) return stripeError(res, 401, 'auth', 'no API key');
  const key = Buffer.from(auth.slice(6), 'base64').toString().split(':')[0];
  if (url.pathname.startsWith('/v1/') && !/^sk_(test|live)_/.test(key)) return stripeError(res, 401, 'auth', 'Invalid API Key provided');

  if (req.method === 'POST' && url.pathname === '/v1/test_helpers/shared_payment/granted_tokens') {
    const b = form(await readBody(req));
    const lim = b.usage_limits || {};
    if (!b.payment_method || !lim.currency || !lim.max_amount) return stripeError(res, 400, 'parameter_missing', 'payment_method and usage_limits are required');
    const id = 'spt_test_' + (++seq);
    const t = { id, object: 'shared_payment.granted_token', created: Math.floor(Date.now() / 1000), deactivated_at: null, deactivated_reason: null,
      usage_limits: { currency: lim.currency, max_amount: Number(lim.max_amount), expires_at: lim.expires_at ? Number(lim.expires_at) : Math.floor(Date.now() / 1000) + 600 },
      payment_method: b.payment_method };
    tokens.set(id, t);
    console.log('granted ' + id + ' max ' + t.usage_limits.max_amount + ' ' + t.usage_limits.currency);
    return send(res, 200, t);
  }

  const g = /^\/v1\/shared_payment\/granted_tokens\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && g) {
    const t = tokens.get(g[1]);
    return t ? send(res, 200, t) : stripeError(res, 404, 'resource_missing', 'No such shared payment token: ' + g[1]);
  }

  if (req.method === 'POST' && url.pathname === '/v1/payment_intents') {
    const raw = await readBody(req);
    const idemKey = req.headers['idempotency-key'];
    if (idemKey && idem.has(idemKey)) {
      const prior = idem.get(idemKey);
      console.log('REPLAY ' + idemKey);
      return send(res, prior.status, prior.body, { 'idempotent-replayed': 'true' });
    }
    const b = form(raw);
    const answer = (status, body) => { if (idemKey) idem.set(idemKey, { status, body }); return send(res, status, body); };
    const spt = b.shared_payment_granted_token;
    if (!spt) return answer(400, { error: { type: 'invalid_request_error', code: 'parameter_missing', message: 'shared_payment_granted_token is required' } });
    const t = tokens.get(spt);
    if (!t) return answer(400, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such shared payment token: ' + spt } });
    if (t.deactivated_at) return answer(400, { error: { type: 'invalid_request_error', code: 'shared_payment_token_deactivated', message: 'This shared payment token has already been used' } });
    if (t.usage_limits.expires_at * 1000 < Date.now()) return answer(400, { error: { type: 'invalid_request_error', code: 'shared_payment_token_expired', message: 'This shared payment token has expired' } });
    const amount = Number(b.amount);
    if (!Number.isInteger(amount) || amount < 50) return answer(400, { error: { type: 'invalid_request_error', code: 'amount_too_small', message: 'Amount must be at least $0.50 usd' } });
    if ((b.currency || '').toLowerCase() !== t.usage_limits.currency) return answer(400, { error: { type: 'invalid_request_error', code: 'currency_mismatch', message: 'The token was granted in ' + t.usage_limits.currency } });
    if (amount > t.usage_limits.max_amount) return answer(400, { error: { type: 'invalid_request_error', code: 'amount_exceeds_limit', message: 'Amount ' + amount + ' exceeds the token\'s max_amount ' + t.usage_limits.max_amount } });
    if (b.confirm !== 'true') return answer(400, { error: { type: 'invalid_request_error', code: 'parameter_invalid', message: 'the MPP rail confirms inline' } });
    const dest = b.transfer_data && b.transfer_data.destination;
    if (dest && !/^acct_/.test(dest)) return answer(400, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such account: ' + dest } });
    const fee = b.application_fee_amount == null ? null : Number(b.application_fee_amount);
    if (fee != null && (!Number.isInteger(fee) || fee < 0 || fee > amount)) return answer(400, { error: { type: 'invalid_request_error', code: 'parameter_invalid', message: 'application_fee_amount out of range' } });
    t.deactivated_at = Math.floor(Date.now() / 1000); t.deactivated_reason = 'consumed';
    const pi = { id: 'pi_test_' + (++seq), object: 'payment_intent', status: 'succeeded', amount, currency: b.currency,
      payment_method: 'pm_cloned_' + spt, shared_payment_granted_token: spt,
      transfer_data: dest ? { destination: dest } : null, application_fee_amount: fee, on_behalf_of: b.on_behalf_of || null,
      metadata: b.metadata || {}, livemode: /^sk_live_/.test(key), stripe_version: req.headers['stripe-version'] || null, idempotency_key: idemKey || null };
    intents.push(pi);
    console.log('PI ' + pi.id + ' ' + amount + ' ' + b.currency + ' -> ' + (dest || 'platform') + ' fee ' + fee + ' via ' + spt);
    return answer(200, pi);
  }

  if (req.method === 'GET' && url.pathname === '/_state') return send(res, 200, { tokens: [...tokens.values()], intents });
  send(res, 404, { error: { type: 'invalid_request_error', message: 'Unrecognized request URL' } });
}).listen(PORT, () => console.log('fake-stripe on http://127.0.0.1:' + PORT));
