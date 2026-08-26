// fake-facilitator.js — the STANDARD x402 facilitator interface, for the gate.
//
// Stands exactly where https://x402.org/facilitator (testnet) and CDP's
// facilitator (mainnet, authed) stand, speaking the same wire the pay Worker
// speaks to them: POST /verify and POST /settle, each taking
// { x402Version, paymentPayload, paymentRequirements }. The Worker cannot
// tell the difference — which is the point: what tier 2 proves about this
// wire it proves about the real one, shape for shape.
//
// What it CANNOT verify it does not pretend to (docs/payments-testing.md —
// a stub that "verified" a real signature would be a lie): it checks that
// the payload's AUTHORIZATION is internally consistent with the requirements
// it rides beside (network, recipient, amount, validity window, a 32-byte
// nonce, a hex signature present) — which proves the broker/wallet built and
// framed what was displayed — never that a chain would accept the signature.
// Tier 3 proves that.
//
//   POST /verify -> { isValid: true } | { isValid: false, invalidReason }
//   POST /settle -> { success: true, transaction, network } | { success:false, errorReason }
//   GET  /_state -> every settled transfer, for assertions
//
// Usage: node test/servers/fake-facilitator.js [port]   (default 8797)
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || process.env.FACILITATOR_PORT || 8797);
const NETWORK = 'base-sepolia';
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

// The consistency check both endpoints share. Returns null when sound, or
// the human-readable reason the payment is refused.
function inspect(body) {
  const pp = body && body.paymentPayload, pr = body && body.paymentRequirements;
  if (!pp || !pr) return 'missing paymentPayload/paymentRequirements';
  if (pp.scheme !== 'exact' || pr.scheme !== 'exact') return 'scheme is not exact';
  if (pp.network !== NETWORK || pr.network !== NETWORK) return 'network is not ' + NETWORK;
  const a = pp.payload && pp.payload.authorization;
  const sig = pp.payload && pp.payload.signature;
  if (!a) return 'no authorization';
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]+$/.test(sig)) return 'no hex signature';
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(a.from))) return 'authorization.from is not an address';
  if (a.to !== pr.payTo) return 'authorization pays ' + a.to + ' but the requirement names ' + pr.payTo;
  if (!/^[0-9]+$/.test(String(a.value))) return 'authorization.value is not integer base units';
  if (BigInt(a.value) > BigInt(pr.maxAmountRequired)) return 'authorization exceeds maxAmountRequired';
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(a.nonce))) return 'nonce is not 32 bytes of hex';
  if (Number(a.validBefore) * 1000 < Date.now()) return 'authorization already expired';
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(pr.asset))) return 'asset is not an address';
  return null;
}

http.createServer(async (req, res) => {
  if (req.method === 'POST' && (req.url === '/verify' || req.url === '/settle')) {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'not JSON' }); }
    const reason = inspect(body);
    if (req.url === '/verify') {
      return send(res, 200, reason ? { isValid: false, invalidReason: reason } : { isValid: true });
    }
    if (reason) return send(res, 200, { success: false, errorReason: reason });
    const a = body.paymentPayload.payload.authorization;
    const tx = '0x' + 'fe'.repeat(28) + String(++seq).padStart(8, '0');
    settled.push({ to: a.to, value: a.value, from: a.from, tx });
    console.log('SETTLED ' + a.value + ' -> ' + a.to.slice(0, 10) + '…  ' + tx.slice(0, 14) + '…');
    return send(res, 200, { success: true, transaction: tx, network: NETWORK });
  }
  if (req.method === 'GET' && req.url === '/_state') return send(res, 200, { settled });
  send(res, 404, { error: 'no such endpoint' });
}).listen(PORT, () => console.log('fake-facilitator (standard x402 wire) on http://127.0.0.1:' + PORT));
