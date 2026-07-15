/*
 * crypto-pool.js — a deterministic, barrier-synchronized pool of W
 * crypto-worker.js threads. Batches a tick's seal/open frames across cores.
 *
 * DETERMINISM: the pool preserves input order in the output (item i of the
 * batch maps to result i, regardless of which worker computed it and in what
 * order the replies arrive). The only non-determinism in AES-GCM is the random
 * IV, which never affects the decrypted plaintext — so the SIM's state
 * evolution (driven by plaintext) is identical to a single-threaded run.
 *
 *   const pool = makePool(keyHex, W)
 *   const envs      = await pool.seal([str, str, ...])   // → [{e,iv,ct}, ...]
 *   const plaintxts = await pool.open([env, env, ...])   // → [str|null, ...]
 *   pool.close()
 *
 * Sharding: a batch of N items is split into W contiguous slices; each worker
 * gets one slice; results are stitched back in order. Contiguous (not
 * round-robin) keeps per-message postMessage overhead amortized — one
 * postMessage per worker per batch, carrying ~N/W items.
 */
'use strict';
const path = require('path');
const { Worker } = require('worker_threads');

function makePool(keyHex, W) {
  const workers = [];
  for (let i = 0; i < W; i++) {
    const w = new Worker(path.join(__dirname, 'crypto-worker.js'), { workerData: { keyHex } });
    w.pending = new Map();   // reqId -> resolve
    w.on('message', (m) => { const r = w.pending.get(m.id); if (r) { w.pending.delete(m.id); r(m.out); } });
    w.on('error', (e) => { throw e; });
    workers.push(w);
  }
  let reqId = 0;
  const runOn = (w, op, items) => new Promise((resolve) => { const id = reqId++; w.pending.set(id, resolve); w.postMessage({ id, op, items }); });

  async function batch(op, items) {
    const n = items.length;
    if (n === 0) return [];
    // one contiguous slice per worker (amortized postMessage); small batches
    // just use one worker to avoid split overhead.
    const nw = Math.min(W, Math.max(1, Math.ceil(n / 32)));
    const per = Math.ceil(n / nw);
    const jobs = [];
    for (let s = 0; s < nw; s++) { const slice = items.slice(s * per, (s + 1) * per); if (slice.length) jobs.push({ off: s * per, p: runOn(workers[s], op, slice) }); }
    const out = new Array(n);
    for (const j of jobs) { const res = await j.p; for (let k = 0; k < res.length; k++) out[j.off + k] = res[k]; }
    return out;
  }

  return {
    seal: (strs) => batch('seal', strs),
    open: (envs) => batch('open', envs),
    close: () => { for (const w of workers) w.terminate(); },
    W,
  };
}

module.exports = { makePool };
