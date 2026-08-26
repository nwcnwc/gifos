// fake-paypal.js — PayPal's Orders v2 API, just enough of it, for the gate.
//
// Real money must never be required to run a test (docs/payments-testing.md).
// This plays PayPal for the pay Worker: OAuth, order create, the buyer's
// approval page, capture, and order read — hermetically, in memory. What it
// CANNOT verify it does not pretend to: there is no real buyer, no real
// account, and the "approval" is a button on a plain page that the test (or a
// person) clicks, exactly where PayPal's own UI would sit.
//
// Hostile knobs, same spirit as fake-x402.js:
//   POST /v2/checkout/orders with ?reject=1 on the server URL — refuse orders
//   GET  /approve?token=…                    — the buyer-facing approval page
//   GET  /_state                             — everything, for assertions
//
// Usage: node test/servers/fake-paypal.js [port]   (default 8795)
const http = require('http');

const PORT = Number(process.argv[2] || process.env.PAYPAL_PORT || 8795);
const orders = new Map();
let seq = 0;

const readBody = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
});
const send = (res, status, obj, type) => {
  const body = type === 'html' ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': type === 'html' ? 'text/html; charset=utf-8' : 'application/json' });
  res.end(body);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  const path = url.pathname;

  if (req.method === 'POST' && path === '/v1/oauth2/token') {
    if (!/^Basic /.test(req.headers.authorization || '')) return send(res, 401, { error: 'no basic auth' });
    return send(res, 200, { access_token: 'TEST-TOKEN', expires_in: 3600 });
  }

  if (req.method === 'POST' && path === '/v2/checkout/orders') {
    const body = JSON.parse(await readBody(req) || '{}');
    const unit = (body.purchase_units || [])[0];
    if (!unit || !unit.amount || !unit.amount.value) return send(res, 422, { error: 'no amount' });
    if (!unit.payee || !unit.payee.email_address) return send(res, 422, { error: 'no payee' });
    const id = 'ORD-' + (++seq);
    const order = {
      id, status: 'CREATED',
      purchase_units: body.purchase_units,
      application_context: body.application_context || {},
      links: [{ rel: 'approve', href: 'http://127.0.0.1:' + PORT + '/approve?token=' + id }],
    };
    orders.set(id, order);
    console.log('ORDER ' + id + ' ' + unit.amount.value + ' -> ' + unit.payee.email_address +
      (unit.payment_instruction ? ' (fee ' + unit.payment_instruction.platform_fees[0].amount.value + ' -> ' + unit.payment_instruction.platform_fees[0].payee.email_address + ')' : ' (NO FEE)'));
    return send(res, 201, order);
  }

  // The page a buyer sees. A real PayPal login/consent stands here; the fake
  // is one button, because what the SUITE proves is our side of the wire.
  if (req.method === 'GET' && path === '/approve') {
    const o = orders.get(url.searchParams.get('token') || '');
    if (!o) return send(res, 404, '<p>no such order</p>', 'html');
    const unit = o.purchase_units[0];
    return send(res, 200, '<!doctype html><meta charset="utf-8"><title>fake PayPal</title>' +
      '<body style="font:16px system-ui;padding:2rem"><h2>fake PayPal — sandbox of the sandbox</h2>' +
      '<p>Pay <b>$' + unit.amount.value + '</b> to <b>' + unit.payee.email_address + '</b>?</p>' +
      '<button id="pp-approve" style="padding:.6rem 1.4rem;font-size:1rem">Approve payment</button>' +
      '<script>document.getElementById("pp-approve").onclick=async function(){' +
      'await fetch("/approved?token=' + o.id + '",{method:"POST"});' +
      'location="' + (o.application_context.return_url || '/nowhere') + '?token=' + o.id + '";' +
      '};</script>', 'html');
  }

  if (req.method === 'POST' && path === '/approved') {
    const o = orders.get(url.searchParams.get('token') || '');
    if (!o) return send(res, 404, { error: 'no such order' });
    o.status = 'APPROVED';
    return send(res, 200, { ok: true });
  }

  const capMatch = /^\/v2\/checkout\/orders\/([^/]+)\/capture$/.exec(path);
  if (req.method === 'POST' && capMatch) {
    const o = orders.get(decodeURIComponent(capMatch[1]));
    if (!o) return send(res, 404, { error: 'no such order' });
    // PayPal refuses a capture the buyer never approved — so does the fake,
    // because the suite must prove nothing completes without the click.
    if (o.status === 'CREATED') return send(res, 422, { error: 'ORDER_NOT_APPROVED' });
    if (o.status !== 'COMPLETED') {
      o.status = 'COMPLETED';
      o.purchase_units[0].payments = { captures: [{ id: 'CAP-' + o.id, status: 'COMPLETED', amount: o.purchase_units[0].amount, custom_id: o.purchase_units[0].custom_id }] };
      console.log('CAPTURED ' + o.id);
    }
    return send(res, 201, o);
  }

  const getMatch = /^\/v2\/checkout\/orders\/([^/]+)$/.exec(path);
  if (req.method === 'GET' && getMatch) {
    const o = orders.get(decodeURIComponent(getMatch[1]));
    if (!o) return send(res, 404, { error: 'no such order' });
    return send(res, 200, o);
  }

  if (req.method === 'GET' && path === '/_state') {
    return send(res, 200, { orders: [...orders.values()] });
  }

  send(res, 404, { error: 'no such endpoint ' + req.method + ' ' + path });
}).listen(PORT, () => console.log('fake-paypal on http://127.0.0.1:' + PORT));
