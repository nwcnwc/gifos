/*
 * crypto-worker.js — a stateless AES-256-GCM seal/open kernel for the sim's
 * deterministic crypto pool (test/crypto-pool.js). The mesh sim is
 * CRYPTO-BOUND (measured 2026-07-15: ~78% of wall-clock is seal/open, because
 * every peer frame is a real sealed envelope). Crypto is a PURE function with
 * no shared state, so it parallelizes perfectly and deterministically: the
 * pool shards a tick's frames across W of these workers, the main thread does
 * no crypto, and results are applied in canonical order — bit-identical to
 * the single-threaded run, just computed on W cores.
 *
 * Protocol (worker_threads):
 *   init  : workerData = { keyHex } — the derived room key (hex)
 *   msg   : { id, op:'seal'|'open', items:[...] }
 *           seal items = JSON strings (plaintext);   result = envelopes {e,iv,ct}
 *           open items = envelopes;                  result = plaintext strings (or null on failure)
 *   reply : { id, out:[...] }
 */
'use strict';
const { parentPort, workerData } = require('worker_threads');
const nodeCrypto = require('crypto');
const KEY = Buffer.from(workerData.keyHex, 'hex');

function sealOne(str) {
  const iv = nodeCrypto.randomBytes(12);
  const c = nodeCrypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(str, 'utf8'), c.final(), c.getAuthTag()]);
  return { e: 1, iv: iv.toString('base64'), ct: ct.toString('base64') };
}
function openOne(m) {
  if (!m || m.e !== 1) return null;
  try {
    const buf = Buffer.from(m.ct, 'base64');
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(m.iv, 'base64'));
    d.setAuthTag(buf.subarray(buf.length - 16));
    return Buffer.concat([d.update(buf.subarray(0, buf.length - 16)), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

parentPort.on('message', (m) => {
  const out = new Array(m.items.length);
  if (m.op === 'seal') for (let i = 0; i < m.items.length; i++) out[i] = sealOne(m.items[i]);
  else for (let i = 0; i < m.items.length; i++) out[i] = openOne(m.items[i]);
  parentPort.postMessage({ id: m.id, out });
});
