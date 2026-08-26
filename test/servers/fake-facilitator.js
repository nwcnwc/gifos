// fake-facilitator.js — the x402 settle backend, for the gate.
//
// Stands where Coinbase's CDP facilitator will: takes the broker-built
// transfers and the wallet-signed payloads, "settles" them, answers with tx
// ids. What it CANNOT verify it does not pretend to (docs/payments-testing.md
// — a stub that "verified" a real signature would be a lie): it checks that
// every payload is the STUB signature the test wallet produces over exactly
// its transfer, which proves the broker signed what it displayed and framed
// what it signed — not that a chain would accept it. Tier 3 proves that.
//
//   POST /settle { transfers:[{to,amount,asset,network}], payloads:[…] }
//     -> { ok:true, txs:['SEPOLIA-TEST-…'] }        (or a refusal)
//   GET  /_state -> settled transfers, for assertions
//
// Usage: node test/servers/fake-facilitator.js [port]   (default 8797)
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || process.env.FACILITATOR_PORT || 8797);
const SEPOLIA = 'eip155:84532';
const settled = [];
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

// The stub the test wallet signs with: 'stub:' + base64(JSON of the transfer).
const stubSig = (t) => 'stub:' + Buffer.from(JSON.stringify(t)).toString('base64');

http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/settle') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { ok: false, error: 'not JSON' }); }
    const transfers = body.transfers, payloads = body.payloads;
    if (!Array.isArray(transfers) || !transfers.length || !Array.isArray(payloads) || payloads.length !== transfers.length) {
      return send(res, 400, { ok: false, error: 'transfers/payloads mismatch' });
    }
    const txs = [];
    for (let i = 0; i < transfers.length; i++) {
      const t = transfers[i];
      if (!t || t.network !== SEPOLIA) return send(res, 400, { ok: false, error: 'refused: network "' + (t && t.network) + '" is not Base Sepolia' });
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(t.to))) return send(res, 400, { ok: false, error: 'refused: "to" is not an address' });
      if (!/^[0-9]+$/.test(String(t.amount)) || BigInt(t.amount) <= 0n) return send(res, 400, { ok: false, error: 'refused: bad amount' });
      if (payloads[i] !== stubSig(t)) return send(res, 400, { ok: false, error: 'refused: payload ' + i + ' does not sign its transfer' });
      txs.push('SEPOLIA-TEST-' + (++seq));
    }
    settled.push({ transfers, txs });
    console.log('SETTLED ' + transfers.map((t) => t.amount + '->' + t.to.slice(0, 10)).join(' + '));
    return send(res, 200, { ok: true, txs });
  }
  if (req.method === 'GET' && req.url === '/_state') return send(res, 200, { settled });
  send(res, 404, { ok: false, error: 'no such endpoint' });
}).listen(PORT, () => console.log('fake-facilitator on http://127.0.0.1:' + PORT));
