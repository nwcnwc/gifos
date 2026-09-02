// fake-chain.js — just enough Base Sepolia JSON-RPC for the gate.
//
// The wallet-transfer rail's Worker side only ever READS the chain:
// eth_blockNumber when an invoice is minted, eth_getLogs to find the exact
// USDC Transfer the invoice named. This serves both, over an in-memory log
// list, and a test hook plays the buyer's wallet:
//
//   POST /rpc              eth_blockNumber | eth_getLogs (address + topics[2])
//   POST /_send            { to, value, from? } — "a wallet sent USDC": appends
//                          a Transfer log at the next block (from defaults to
//                          one fixed stranger address)
//   GET  /_state           the log list, for assertions
//
// What it cannot verify it does not pretend to (docs/payments-testing.md):
// there are no signatures and no balances here — it proves the Worker asks
// the right question of the chain and honors only an exact-value answer,
// never that a real transfer occurred. Tier 3 proves that.
//
// Usage: node test/servers/fake-chain.js [port]   (default 8799)
'use strict';
const http = require('http');

const PORT = Number(process.argv[2] || process.env.CHAIN_PORT || 8799);
const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let block = 1000;
const logs = [];
let txSeq = 0;

const pad = (a) => '0x' + String(a).slice(2).toLowerCase().padStart(64, '0');
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
  if (req.method === 'POST' && req.url === '/rpc') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, {}); }
    const reply = (result) => send(res, 200, { jsonrpc: '2.0', id: body.id, result });
    if (body.method === 'eth_blockNumber') return reply('0x' + (++block).toString(16));
    if (body.method === 'eth_getLogs') {
      const f = (body.params || [])[0] || {};
      const from = f.fromBlock && f.fromBlock !== 'latest' ? parseInt(f.fromBlock, 16) : 0;
      const out = logs.filter((l) =>
        parseInt(l.blockNumber, 16) >= from
        && (!f.address || l.address === String(f.address).toLowerCase())
        && (!f.topics || !f.topics[1] || l.topics[1] === String(f.topics[1]).toLowerCase())
        && (!f.topics || !f.topics[2] || l.topics[2] === String(f.topics[2]).toLowerCase()));
      return reply(out);
    }
    return send(res, 200, { jsonrpc: '2.0', id: body.id, error: { message: 'method not faked: ' + body.method } });
  }
  if (req.method === 'POST' && req.url === '/_send') {
    let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'not JSON' }); }
    const l = {
      address: USDC,
      topics: [TRANSFER_TOPIC, pad(body.from || ('0x' + 'ab'.repeat(20))), pad(body.to)],
      data: '0x' + BigInt(body.value).toString(16).padStart(64, '0'),
      blockNumber: '0x' + (++block).toString(16),
      transactionHash: '0x' + 'cc'.repeat(28) + String(++txSeq).padStart(8, '0'),
    };
    logs.push(l);
    console.log('SENT ' + body.value + ' -> ' + String(body.to).slice(0, 10) + '…  ' + l.transactionHash.slice(0, 14) + '…');
    return send(res, 200, { ok: true, tx: l.transactionHash });
  }
  if (req.method === 'GET' && req.url === '/_state') return send(res, 200, { block, logs });
  send(res, 404, { error: 'no such endpoint' });
}).listen(PORT, () => console.log('fake-chain on http://127.0.0.1:' + PORT));
