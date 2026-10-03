// bg-clock.js — A HIDDEN TAB'S COMPOSITE MUST KEEP PAINTING (2026-10-03).
//
// Chrome throttles a hidden tab's page timers (1 Hz at once, once a minute
// after five minutes). A relay seat's packers (mesh-media.js createPacker)
// painted on setInterval, and run.html's 2 s reconcile sweep was one too, so
// a head that switched tab froze the composite for its whole branch. Painting
// stays on the main thread; the TICK now comes from a Worker timer
// (mesh-media.js workerClock / createBgClock), with setInterval as the
// fallback where no Worker can be made. Node only, fake Worker and timers:
//
//   1. workerClock rides a Worker when one can be made, and stops it;
//   2. workerClock falls back to setInterval when Worker is missing or throws;
//   3. createBgClock: a visible tab ticks on setInterval alone (no Worker);
//      hidden, a Worker beat ticks each subscriber at its own period even
//      while the page timers are throttled to nothing; visible again, the
//      Worker goes; no Worker, the setIntervals alone (the old behaviour);
//   4. createPacker takes its tick from that clock, and the run.html sweep
//      rides workerClock.
'use strict';
const fs = require('fs'), path = require('path');
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); if (!c) fails++; };

check('mesh-media exports workerClock and createBgClock', M && typeof M.workerClock === 'function' && typeof M.createBgClock === 'function');
if (!(M && typeof M.workerClock === 'function' && typeof M.createBgClock === 'function')) { console.log('\n' + fails + ' FAILED'); process.exit(1); }

// A world with a fake clock, fake page timers (which a hidden tab throttles to
// nothing, the worst case) and a fake Worker whose beat the test drives.
function world(opts) {
  opts = opts || {};
  let now = 0, seq = 0;
  const timers = new Map(), workers = [], urls = new Set(), listeners = [];
  const doc = { hidden: false, addEventListener: (t, f) => { if (t === 'visibilitychange') listeners.push(f); } };
  class FakeWorker {
    constructor(url) { if (opts.workerThrows) throw new Error('SecurityError'); this.url = url; this.dead = false; workers.push(this); }
    terminate() { this.dead = true; }
  }
  const env = {
    now: () => now,
    setInterval: (f, ms) => { const id = ++seq; timers.set(id, { f, ms, at: now }); return id; },
    clearInterval: (id) => { timers.delete(id); },
    Worker: opts.noWorker ? undefined : FakeWorker,
    Blob: function (parts) { this.src = parts.join(''); },
    URL: { createObjectURL: (b) => { const u = 'blob:' + (++seq); urls.add(u); FakeWorker.lastSrc = b.src; return u; }, revokeObjectURL: (u) => { urls.delete(u); } },
    document: doc,
  };
  // Advance time by `ms` in 1 ms steps: page timers fire only while VISIBLE
  // (hidden = throttled to nothing); live workers beat at their own period.
  function advance(ms) {
    for (let k = 0; k < ms; k++) {
      now++;
      if (!doc.hidden) for (const t of [...timers.values()]) if (now - t.at >= t.ms) { t.at = now; t.f(); }
      for (const w of workers.filter((x) => !x.dead && x.onmessage)) { w.at = w.at == null ? now - 1 : w.at; if (now - w.at >= w.period) { w.at = now; w.onmessage({ data: 0 }); } }
    }
  }
  const setHidden = (h) => { doc.hidden = h; for (const f of listeners) f(); };
  return { env, timers, workers, urls, advance, setHidden, FakeWorker, live: () => workers.filter((w) => !w.dead) };
}
// The worker source names its period; read it back so the fake can honour it.
function periodOf(w, W) { const m = /\},(\d+)\)/.exec(W.FakeWorker.lastSrc || ''); w.period = m ? +m[1] : 50; }

// ---- 1. workerClock on a Worker ---------------------------------------------
{
  const W = world(); let n = 0;
  const c = M.workerClock(2000, () => { n++; }, W.env);
  periodOf(W.workers[0], W);
  check('workerClock rides a Worker when one can be made', c.via === 'worker' && W.live().length === 1 && W.timers.size === 0, { via: c.via });
  check('…whose source posts every 2000 ms', /setInterval\(function\(\)\{postMessage\(0\)\},2000\)/.test(W.FakeWorker.lastSrc || ''));
  W.setHidden(true); W.advance(10000);
  check('…and keeps the 2 s cadence while the tab is hidden (5 beats in 10 s)', n === 5, { n });
  c.stop();
  check('stop() terminates the Worker and revokes its blob URL', W.live().length === 0 && W.urls.size === 0);
}
// ---- 2. workerClock fallback --------------------------------------------------
for (const [label, o] of [['no Worker constructor', { noWorker: true }], ['a Worker that throws (CSP, sandbox)', { workerThrows: true }]]) {
  const W = world(o); let n = 0;
  const c = M.workerClock(2000, () => { n++; }, W.env);
  W.advance(10000);
  check(`fallback, ${label}: workerClock uses setInterval and still ticks (${n} in 10 s)`, c.via === 'interval' && W.timers.size === 1 && n === 5 && W.urls.size === 0, { via: c.via, n });
  c.stop();
  check(`fallback, ${label}: stop() clears the interval`, W.timers.size === 0);
}
// ---- 3. createBgClock --------------------------------------------------------
{
  const W = world(); const clock = M.createBgClock(W.env); let n = 0;
  const off = clock(() => { n++; }, 125); // an 8 fps packer
  W.advance(1000);
  check('visible: the packer ticks on its own setInterval (8 in 1 s) and no Worker exists', n === 8 && W.live().length === 0 && clock.via() === 'interval', { n });
  W.setHidden(true);
  check('hidden: ONE Worker beat is started', W.live().length === 1 && clock.via() === 'worker');
  periodOf(W.workers[0], W);
  n = 0; W.advance(10000);
  check(`hidden for 10 s with the page timers throttled to nothing: the packer still painted ${n} times (>= 60)`, n >= 60 && n <= 80, { n });
  let m = 0; const off2 = clock(() => { m++; }, 50); // a 20 fps strip on the same beat
  W.advance(1000);
  check(`…one shared Worker serves every subscriber at its own period (strip ${m} in 1 s, workers ${W.live().length})`, m >= 18 && m <= 20 && W.live().length === 1, { m });
  W.setHidden(false);
  check('visible again: the Worker is terminated (no background wakeups for a visible tab)', W.live().length === 0 && clock.via() === 'interval');
  off(); off2();
  check('unsubscribing clears every interval', W.timers.size === 0);
  W.setHidden(true);
  check('hidden with no subscriber: no Worker is started', W.live().length === 0);
}
{
  const W = world({ noWorker: true }); const clock = M.createBgClock(W.env); let n = 0;
  const off = clock(() => { n++; }, 125);
  W.setHidden(true);
  check('no Worker: hidden falls back to the setInterval alone (the old behaviour, no throw)', clock.via() === 'interval' && W.timers.size === 1);
  W.setHidden(false); W.advance(1000);
  check('…and a visible tab still paints on it (8 in 1 s)', n === 8, { n });
  off();
}
// ---- 4. the wiring -------------------------------------------------------------
{
  const mm = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'js', 'mesh-media.js'), 'utf8');
  const pk = mm.slice(mm.indexOf('function createPacker('), mm.indexOf('function createBundle('));
  check('createPacker ticks from the background clock (start and setFps), not a bare setInterval', /timer = \(opts\.clock \|\| bgClock\(\)\)\(paint,/.test(pk) && !/setInterval\(paint/.test(pk));
  // A packer started under a fake document really subscribes to the clock.
  const W = world(); const clock = M.createBgClock(W.env);
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ width: 0 })), set: (t, k, v) => { t[k] = v; return true; } });
  const saved = globalThis.document, savedMS = globalThis.MediaStream;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, captureStream: () => ({ getVideoTracks: () => [{ stop() {} }] }) }) };
  globalThis.MediaStream = function (t) { this.t = t; };
  let pkr = null;
  try { pkr = M.createPacker({ shape: 'grid', fps: 8, clock }).start(); } catch (e) { pkr = null; }
  check('a started packer holds exactly one clock subscription', !!pkr && W.timers.size === 1, { timers: W.timers.size });
  if (pkr) { pkr.setFps(4); check('setFps re-arms on the clock (still one subscription, new period)', W.timers.size === 1 && [...W.timers.values()][0].ms === 250); pkr.stop(); }
  check('stop() releases it', W.timers.size === 0);
  globalThis.document = saved; globalThis.MediaStream = savedMS;
  const run = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');
  check('run.html: the 2 s reconcile sweep rides workerClock, not a page setInterval', /GifOS\.meshMedia\.workerClock\(2000, \(\) => \{\n\s+const now = Date\.now\(\);\n\s+\/\/ §LOCK/.test(run) && !/setInterval\(\(\) => \{\n\s+const now = Date\.now\(\);\n\s+\/\/ §LOCK/.test(run));
}
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
