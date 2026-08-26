// pay-local.js — the pay Worker's Node twin, for the hermetic gate.
//
// Runs pay/src/core.js — the SAME brain the Cloudflare Worker runs — behind a
// plain Node http server, pointed at the fakes instead of PayPal and the
// chain. What the gate proves about this server it proves about the Worker,
// because there is one core and two thin wrappers (docs/payments-testing.md).
//
// It generates a throwaway Ed25519 keypair at boot and serves the PUBLIC half
// at GET /test-pubkey — the suite arranges for the OS page's /gifos.key fetch
// to answer with it, standing in for the real key whose private half only
// Nathan holds. A receipt signed here verifies through the exact same code
// path a production receipt would.
//
// Usage: node test/servers/pay-local.js [port]     (default 8796)
//   env: PAYPAL_BASE   (default http://127.0.0.1:8795 — fake-paypal)
//        CATALOG_URL   (default http://127.0.0.1:8099/apps/index.json)
//        FACILITATOR_URL (default http://127.0.0.1:8797 — fake-facilitator)
'use strict';
const http = require('http');
const { webcrypto } = require('crypto');

const PORT = Number(process.argv[2] || process.env.PAY_PORT || 8796);
const PAYPAL_BASE = process.env.PAYPAL_BASE || 'http://127.0.0.1:8795';
const CATALOG_URL = process.env.CATALOG_URL || 'http://127.0.0.1:8099/apps/index.json';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://127.0.0.1:8797';
const BASE_RPC = process.env.BASE_RPC || 'http://127.0.0.1:8799/rpc';
const FEDNOW_API = process.env.FEDNOW_API || 'http://127.0.0.1:8800';

(async () => {
  const { makeCore } = await import('../../pay/src/core.js');
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const pubB64 = Buffer.from(pubRaw).toString('base64');

  const handle = makeCore({
    fetch: (u, o) => fetch(u, o),
    subtle: webcrypto.subtle,
    paypalBase: PAYPAL_BASE,
    paypalClientId: 'test-client',
    paypalClientSecret: 'test-secret',
    treasuryEmail: 'payments@gifos.app',
    feeBps: 300,
    catalogUrl: CATALOG_URL,
    returnBase: 'http://127.0.0.1:' + PORT,
    facilitatorUrl: FACILITATOR_URL,
    rpcUrl: BASE_RPC,
    fednowApi: FEDNOW_API,
    fednowKey: null,
    fednowPayees: { 'gifos.app': 'ACCT-GIFOS', 'paytest.example.com': 'ACCT-PAYTEST' },
    signKey: { privateKey: kp.privateKey, publicKey: kp.publicKey },
  });

  http.createServer(async (req, res) => {
    // The suite needs the throwaway public key to stand in for /gifos.key.
    if (req.method === 'GET' && req.url === '/test-pubkey') {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      return res.end(pubB64);
    }
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const r = await handle(new Request('http://127.0.0.1:' + PORT + req.url, {
        method: req.method,
        headers: req.headers,
        body: body.length ? body : undefined,
      }));
      const out = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(out);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e && e.message || e) }));
    }
  }).listen(PORT, () => console.log('pay-local on http://127.0.0.1:' + PORT + '  (paypal ' + PAYPAL_BASE + ', catalog ' + CATALOG_URL + ')'));
})();
