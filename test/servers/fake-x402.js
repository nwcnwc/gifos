// fake-x402.js — a paid resource server + sponsor, for the gate.
//
// Real money must never be required to run a test (docs/payments.md). This
// plays BOTH halves of an x402 exchange, on Base Sepolia's identifiers, so the
// broker can be exercised end to end with no chain, no funds and no network:
//
//   GET  /paid            -> 402 + PAYMENT-REQUIRED   (base64 PaymentRequired)
//   GET  /paid + PAYMENT-SIGNATURE -> 200 + PAYMENT-RESPONSE, or 402 again
//   GET  /free            -> 200, never charges (proves we don't pay unasked)
//   GET  /paid?mainnet=1  -> quotes eip155:8453, which the client MUST refuse
//   GET  /paid?huge=1     -> quotes far above any sane cap
//   GET  /paid?scheme=upto-> quotes an unsupported scheme
//
// The "sponsor" here verifies only the SHAPE of the payload — it cannot verify
// a real signature without a chain, and pretending otherwise would make the
// test lie. What it does guarantee is that the client actually produced a
// well-formed, correctly-framed payment for the exact offer it was given.
//
// Usage: node test/servers/fake-x402.js [port]   (default 8794)
const http = require('http');

const PORT = Number(process.argv[2] || process.env.X402_PORT || 8794);
const USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const PAY_TO = '0x209693Bc6afc0C5328bA36FaF03C514EF312287C';

const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(String(s), 'base64').toString('utf8'));

let charged = 0, served = 0, refusedPayments = 0;

function offerFor(q) {
  const o = {
    scheme: q.scheme || 'exact',
    network: q.mainnet ? 'eip155:8453' : 'eip155:84532',
    amount: q.huge ? '100000000000' : (q.amount || '10000'),
    asset: USDC_SEPOLIA,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: 'USDC', version: '2' },
  };
  return o;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const q = Object.fromEntries(u.searchParams.entries());
  const send = (code, headers, body) => {
    res.writeHead(code, Object.assign({
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE',
      'access-control-allow-headers': 'PAYMENT-SIGNATURE, content-type',
    }, headers || {}));
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  if (req.method === 'OPTIONS') return send(204, {}, '');
  if (u.pathname === '/__stats') return send(200, {}, { charged, served, refusedPayments });

  if (u.pathname === '/free') { served++; return send(200, {}, { ok: true, free: true }); }

  if (u.pathname !== '/paid') return send(404, {}, { error: 'not found' });

  const sig = req.headers['payment-signature'];
  if (!sig) {
    return send(402, {
      'PAYMENT-REQUIRED': b64({
        x402Version: 2,
        error: 'PAYMENT-SIGNATURE header is required',
        resource: {
          url: 'http://127.0.0.1:' + PORT + '/paid',
          description: 'One (1) fake premium datum',
          serviceName: 'Fake x402 Service',
          mimeType: 'application/json',
        },
        accepts: [offerFor(q)],
      }),
    }, {});
  }

  // A payment was offered — check it frames the exact deal we quoted.
  let payload;
  try { payload = unb64(sig); } catch (e) {
    refusedPayments++;
    return send(402, {}, { error: 'PAYMENT-SIGNATURE is not base64 JSON' });
  }
  const want = offerFor(q);
  const bad = [];
  if (Number(payload.x402Version) !== 2) bad.push('version');
  if (payload.scheme !== want.scheme) bad.push('scheme');
  if (payload.network !== want.network) bad.push('network');
  if (!payload.payload || typeof payload.payload !== 'object') bad.push('payload');
  else if (!payload.payload.signature) bad.push('signature');
  if (bad.length) {
    refusedPayments++;
    return send(402, {}, { error: 'payment rejected: ' + bad.join(', ') });
  }

  charged++; served++;
  return send(200, {
    'PAYMENT-RESPONSE': b64({ success: true, network: want.network, payer: payload.payload.from || null, transaction: '0xfa4e' + String(charged).padStart(4, '0') }),
  }, { ok: true, datum: 42, paidAmount: want.amount });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('fake-x402 listening on http://127.0.0.1:' + PORT + '  (/paid, /free, /__stats)');
});
