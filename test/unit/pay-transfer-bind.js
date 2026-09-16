// The wallet-transfer rail's receipt honours ONLY a bound invoice.
//
// /transfer/invoice mints a token whose amount carries random dust so honest
// concurrent buyers never collide. The dust is not a secret: 10,000 values,
// so someone minting invoices for a popular price holds a token for whichever
// value a stranger's wallet later happens to send. /transfer/bind re-signs
// the token with the payer's address; this test holds /transfer/receipt to
// refusing the ORIGINAL, unbound token even when the chain shows a matching
// transfer — the pre-mint attack — and to signing the bound one only for a
// transfer FROM the bound wallet.
//
// Network-free: the chain is a fake eth_getLogs answer, the token is signed
// with a throwaway key the way the Worker signs its own.
const path = require('path');
const { webcrypto } = require('crypto');
globalThis.crypto = webcrypto;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const PAYEE = '0x209693bc6afc0c5328ba36faf03c514ef312287c';
const BUYER = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x2222222222222222222222222222222222222222';
const pad = (a) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');

(async () => {
  const { makeCore } = await import(path.join(__dirname, '..', '..', 'pay', 'src', 'core.js'));
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));

  // The chain, as the Worker will see it: every Transfer ever sent to the
  // payee. The fake honours the topic filter exactly as a node would.
  const logs = [];
  const rpcCalls = [];
  const fakeFetch = async (u, o) => {
    const body = JSON.parse(o.body);
    rpcCalls.push(body.method);
    if (body.method === 'eth_blockNumber') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x10' }));
    if (body.method === 'eth_getLogs') {
      const f = body.params[0];
      const out = logs.filter((l) => (!f.topics[1] || l.topics[1] === f.topics[1]) && (!f.topics[2] || l.topics[2] === f.topics[2]));
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: out }));
    }
    throw new Error('unexpected fetch ' + u);
  };

  const handle = makeCore({
    fetch: fakeFetch, subtle: webcrypto.subtle,
    paypalBase: 'https://api-m.sandbox.paypal.com', paypalClientId: 'x', paypalClientSecret: 'y',
    treasuryEmail: 't@example.com', feeBps: 300, catalogUrl: 'http://127.0.0.1:1/apps/index.json', returnBase: 'http://127.0.0.1:1',
    rpcUrl: 'http://127.0.0.1:1/rpc',
    signKey: { privateKey: kp.privateKey, publicKey: kp.publicKey },
  });

  // Mint an invoice token the way the Worker does (same wire shape, same
  // signer), skipping /transfer/invoice's catalog + registry lookups.
  const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
  async function token(inv) {
    const body = b64u(new TextEncoder().encode(JSON.stringify(inv)));
    const sig = b64u(new Uint8Array(await webcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(body))));
    return body + '.' + sig;
  }
  const now = Date.now();
  const base = { v: 1, kind: 'gifos-pay-invoice', appId: 'paid-shop', sku: 'pro', amount: '5000000', expected: '5001234',
    payTo: PAYEE, asset: USDC, network: 'eip155:84532', block: '0x10', iat: now, exp: now + 15 * 60 * 1000 };
  const unbound = await token(base);
  const post = (p, body) => handle(new Request('http://pay.test' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

  // A stranger's wallet sends the exact dusted amount to the payee.
  const sendFrom = (from) => logs.push({ address: USDC, topics: [TRANSFER_TOPIC, pad(from), pad(PAYEE)],
    data: '0x' + BigInt(base.expected).toString(16).padStart(64, '0'), blockNumber: '0x11', transactionHash: '0x' + 'ab'.repeat(32) });
  sendFrom(STRANGER);

  // ---- THE ATTACK: the original token, after a matching third-party transfer
  let r = await post('/transfer/receipt', { token: unbound });
  let b = await r.json();
  check('an UNBOUND invoice is not receipted even when the chain shows a matching transfer', r.status === 200 && b.status === 'PENDING' && !b.receiptJson, JSON.stringify(b));
  check('…and it says what it is waiting for (the payer)', b.needsPayer === true, JSON.stringify(b));
  check('…and the chain was not even asked', rpcCalls.indexOf('eth_getLogs') < 0, rpcCalls.join(','));

  // ---- bound to the buyer: the stranger's transfer still does not count
  r = await post('/transfer/bind', { token: unbound, from: BUYER });
  const bound = (await r.json()).token;
  check('binding re-signs the invoice with the payer', r.status === 200 && typeof bound === 'string' && bound !== unbound);
  r = await post('/transfer/receipt', { token: bound });
  b = await r.json();
  check('a BOUND invoice ignores a matching transfer from another wallet', b.status === 'PENDING' && !b.receiptJson, JSON.stringify(b));
  check('…after asking the chain for transfers FROM the bound wallet only', rpcCalls.indexOf('eth_getLogs') >= 0);

  // ---- the buyer pays: receipt, naming the payer
  sendFrom(BUYER);
  r = await post('/transfer/receipt', { token: bound });
  b = await r.json();
  check('the buyer\'s own transfer is receipted', b.status === 'COMPLETED' && !!b.receiptJson && !!b.sig, JSON.stringify(b).slice(0, 120));
  const receipt = b.receiptJson ? JSON.parse(b.receiptJson) : {};
  check('…and the receipt names the payer, never null', receipt.payer === BUYER, String(receipt.payer));
  const ok = b.sig ? await webcrypto.subtle.verify('Ed25519', kp.publicKey, Buffer.from(b.sig, 'base64'), new TextEncoder().encode(b.receiptJson)) : false;
  check('…signed by the Worker key', ok);
  check('a bound token cannot be re-bound to a different wallet', (await post('/transfer/bind', { token: bound, from: STRANGER })).status === 409);

  // Sanity: the public key exported above is the one the site would publish.
  check('the signing key exports as a 32-byte Ed25519 public key', pubRaw.length === 32);

  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
