// fake-fednow.js — a FedNow provider (Finzly-shaped), for the gate.
//
// FedNow itself has NO public API — only financial institutions touch the
// rail, and a provider fronts it. This plays that provider for the pay
// Worker: create a Request-for-Payment, report its status, settle it when
// the "buyer's banking app" approves. The approval is a test hook, because
// the real approval happens in a bank's own app on the buyer's phone —
// there is nothing of ours to render there, and pretending otherwise would
// be the lie the testing doctrine forbids.
//
//   POST /rfp              { account, amount, currency, reference, description }
//                          -> { id, status: 'PENDING' }
//   GET  /rfp/:id          -> { id, status, account, amount, reference, settlementId? }
//   POST /_approve?id=…    the buyer said yes in their banking app
//   GET  /_state           everything, for assertions
//
// Usage: node test/servers/fake-fednow.js [port]   (default 8800)
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || process.env.FEDNOW_PORT || 8800);
const rfps = new Map();
let seq = 0;

const readBody = (req) => new Promise((res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
});
const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);

  if (req.method === 'POST' && url.pathname === '/rfp') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'not JSON' }); }
    if (!body.account) return send(res, 422, { error: 'no account' });
    if (!/^[0-9]+\.[0-9]{2}$/.test(String(body.amount))) return send(res, 422, { error: 'bad amount' });
    const id = 'RFP-' + (++seq);
    rfps.set(id, { id, status: 'PENDING', account: body.account, amount: body.amount, reference: body.reference || '', description: body.description || '' });
    console.log('RFP ' + id + ' $' + body.amount + ' -> ' + body.account);
    return send(res, 201, { id, status: 'PENDING' });
  }

  const m = /^\/rfp\/([^/]+)$/.exec(url.pathname);
  if (req.method === 'GET' && m) {
    const r = rfps.get(decodeURIComponent(m[1]));
    if (!r) return send(res, 404, { error: 'no such request' });
    return send(res, 200, r);
  }

  if (req.method === 'POST' && url.pathname === '/_approve') {
    const r = rfps.get(url.searchParams.get('id') || '');
    if (!r) return send(res, 404, { error: 'no such request' });
    r.status = 'SETTLED';
    r.settlementId = 'FN-' + r.id;
    console.log('SETTLED ' + r.id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/_state') return send(res, 200, { rfps: [...rfps.values()] });
  send(res, 404, { error: 'no such endpoint' });
}).listen(PORT, () => console.log('fake-fednow on http://127.0.0.1:' + PORT));
