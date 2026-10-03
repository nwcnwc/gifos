// Guards for the mesh-wire-pipe findings that live in gifos-net.js,
// mesh-identity.js, and mesh-pipe.js. No browser and no relay.
'use strict';
// Node 22 exposes WebCrypto as a read-only global (the gate's toolchain); older
// nodes need it supplied. Assigning over the getter throws before any check runs.
if (!globalThis.crypto || !globalThis.crypto.subtle) Object.defineProperty(globalThis, 'crypto', { value: require('crypto').webcrypto, configurable: true });
global.addEventListener = () => {};
global.removeEventListener = () => {};

const intervals = [];
const clearedIv = [];
let ivSeq = 1;
const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;
global.setInterval = (fn, ms) => { const id = ivSeq++; intervals.push({ id, fn, ms }); return id; };
global.clearInterval = (id) => { clearedIv.push(id); };

require('../../site/js/gifos-net.js');
require('../../site/js/mesh-identity.js');
require('../../site/js/mesh-pipe.js');

const net = globalThis.GifOS.net;
const ident = globalThis.GifOS.meshIdentity;
const MP = globalThis.GifOS.meshPipe;

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

check('mesh-pipe does not arm a timer at load', intervals.length === 0, String(intervals.length));

// ---- pins: LRU cap, drop, re-pin (finding 183) -----------------------------
{
  const cap = ident.PIN_MAX;
  check('PIN_MAX is 4096', cap === 4096, String(cap));
  const pins = ident.newPins();
  for (let i = 0; i < cap; i++) pins.pin('k_' + i, 'pub' + i);
  check('a full pin map stays at the cap', pins.size() === cap, String(pins.size()));
  pins.pin('k_new', 'pubnew');
  check('pinning past the cap evicts the oldest id', pins.size() === cap && pins.get('k_0') === null && pins.get('k_new') === 'pubnew');
  pins.pin('k_1', 'pub1');
  pins.pin('k_another', 'pubA');
  check('a repeated pin refreshes LRU so that id is not the next eviction', pins.get('k_1') === 'pub1' && pins.get('k_2') === null);
  const clash = pins.pin('k_1', 'other');
  check('a different pub for a live id still conflicts', clash.ok === false && clash.changed === true && pins.get('k_1') === 'pub1');
  check('drop forgets one id', pins.drop('k_1') === true && pins.get('k_1') === null);
  const again = pins.pin('k_1', 'pub1b');
  check('a dropped id re-pins as first contact', again.ok === true && pins.get('k_1') === 'pub1b');
}

// ---- steadySocket (findings 185, 187, 197) ---------------------------------
function timerStub() {
  const pending = [];
  let n = 1;
  const savedT = global.setTimeout;
  const savedC = global.clearTimeout;
  global.setTimeout = (fn, ms) => { const id = n++; pending.push({ id, fn, ms }); return id; };
  global.clearTimeout = (id) => { const i = pending.findIndex((t) => t.id === id); if (i >= 0) pending.splice(i, 1); };
  return {
    pending,
    fire(pred) {
      const i = pending.findIndex(pred);
      if (i < 0) return null;
      const t = pending.splice(i, 1)[0];
      t.fn();
      return t;
    },
    restore() { global.setTimeout = savedT; global.clearTimeout = savedC; },
  };
}

{
  const rootLog = [];
  const docLog = [];
  global.addEventListener = (ev, fn) => rootLog.push(['add', ev, fn]);
  global.removeEventListener = (ev, fn) => rootLog.push(['rm', ev, fn]);
  global.document = {
    hidden: false,
    addEventListener(ev, fn) { docLog.push(['add', ev, fn]); },
    removeEventListener(ev, fn) { docLog.push(['rm', ev, fn]); },
  };
  global.WebSocket = function () { this.readyState = 0; this.close = () => { this.readyState = 3; }; };
  const before = (global.__gifosConns || []).length;
  const s1 = net.steadySocket(() => 'ws://127.0.0.1:9/a');
  const s2 = net.steadySocket(() => 'ws://127.0.0.1:9/b');
  check('each socket registers online, pageshow, visibilitychange, and resume',
    rootLog.filter((e) => e[0] === 'add').length === 4 && docLog.filter((e) => e[0] === 'add').length === 4);
  check('both sockets are retained on __gifosConns', (global.__gifosConns || []).length === before + 2);
  const wake1 = rootLog.filter((e) => e[0] === 'add' && e[1] === 'online')[0][2];
  const wake2 = rootLog.filter((e) => e[0] === 'add' && e[1] === 'online')[1][2];
  s1.close();
  const removedOnline = rootLog.filter((e) => e[0] === 'rm' && e[1] === 'online').map((e) => e[2]);
  check('close removes that socket\'s listeners and not the other socket\'s',
    removedOnline.length === 1 && removedOnline[0] === wake1 && removedOnline[0] !== wake2);
  check('close drops that socket from __gifosConns', !(global.__gifosConns || []).includes(s1) && (global.__gifosConns || []).includes(s2));
  s2.close();
  check('the second close removes the second wake', rootLog.filter((e) => e[0] === 'rm' && e[1] === 'online').length === 2);
  check('resume and visibility are removed with the socket',
    docLog.filter((e) => e[0] === 'rm' && e[1] === 'resume').length === 2
    && docLog.filter((e) => e[0] === 'rm' && e[1] === 'visibilitychange').length === 2);
}

{
  global.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  global.WebSocket = function () { this.readyState = 0; this.close = () => { this.readyState = 3; }; };
  const T = timerStub();
  const states = [];
  const s = net.steadySocket(() => 'ws://127.0.0.1:9/hang');
  s.onstate = (st) => states.push(st);
  const first = T.pending.map((t) => t.ms);
  check('the first hung CONNECT arms a 3s deadline, not 8s', first.length === 2 && first.every((ms) => ms === 3000), JSON.stringify(first));
  check('the slow note fires before the abort', T.fire((t) => t.ms === 3000) && states[0] === 'connecting-slow');
  check('the abort then marks the socket down', T.fire((t) => t.ms === 3000) && states.indexOf('down') >= 0, JSON.stringify(states));
  const backoff = T.fire((t) => t.ms < 2000);
  check('backoff starts the second attempt', !!backoff, backoff && backoff.ms);
  const second = T.pending.map((t) => t.ms);
  check('the second hung CONNECT waits 6s', second.indexOf(6000) >= 0 && second.indexOf(8000) < 0, JSON.stringify(second));
  s.close();
  T.restore();
}

function pumpCap(onDuty) {
  const delays = [];
  const T = timerStub();
  global.document.hidden = true;
  global.WebSocket = function () { throw new Error('refuse'); };
  const s = net.steadySocket(() => 'ws://127.0.0.1:9/cap', onDuty ? { onDuty: () => true } : {});
  if (T.pending[0]) delays.push(T.pending[0].ms);
  for (let i = 0; i < 9; i++) {
    const t = T.fire(() => true);
    if (!t) break;
    if (T.pending[0]) delays.push(T.pending[0].ms);
  }
  s.close();
  T.restore();
  return delays;
}
{
  global.document = { hidden: true, addEventListener() {}, removeEventListener() {} };
  const hidden = pumpCap(false);
  const duty = pumpCap(true);
  const max = (a) => a.reduce((m, x) => Math.max(m, x), 0);
  check('a hidden socket with no onDuty reaches the 60s cap', max(hidden) >= 42000, JSON.stringify(hidden));
  check('onDuty keeps the visible cap while the document is hidden', max(duty) <= 6500 && max(duty) >= 3500, JSON.stringify(duty));
}

let done = Promise.resolve();

// ---- mesh-pipe (findings 190, 194, 195, 199) -------------------------------
{
  let drain = 'off';
  global.localStorage = { getItem(k) { return k === 'gifos_pipe_drain' ? drain : null; } };
  global.RTCRtpScriptTransform = function () {};
  global.Blob = function () {};
  global.URL = { createObjectURL() { return 'blob:pipe'; } };
  let worker = null;
  global.Worker = function () {
    worker = this;
    this.posted = [];
    this.postMessage = (m) => { this.posted.push(m); };
  };
  const sender = {};
  const carrier = { mint() {}, stop() {} };
  check('pipeSender with the drain flag off does not arm the 33ms timer',
    MP.pipeSender(sender, 'src', 'p0', carrier) === true && intervals.length === 0);
  MP.unpipe('src', 'p0');
  drain = null;
  for (let i = 0; i < 100; i++) MP.pipeSender(sender, 's' + i, 'p' + i, { mint() {}, stop() {} });
  check('the drainer starts once, at 33ms, when a carrier is registered',
    intervals.length === 1 && intervals[0].ms === 33, JSON.stringify(intervals.map((t) => t.ms)));
  for (let i = 0; i < 100; i++) worker.onmessage({ data: { op: 'want', pipeId: 'p' + i, key: false, q: 4 } });
  check('wantN records each pipe', MP._debugSizes().wantN === 100 && MP.chain('p50').wants === 1, JSON.stringify(MP._debugSizes()));
  for (let i = 0; i < 100; i++) MP.unpipe('s' + i, 'p' + i);
  const sizes = MP._debugSizes();
  check('unpipe clears wantN, lastWant, and carriers', sizes.wantN === 0 && sizes.lastWant === 0 && sizes.carriers === 0, JSON.stringify(sizes));
  let wantsLeft = 0;
  for (let i = 0; i < 100; i++) wantsLeft += MP.chain('p' + i).wants;
  check('chain() is 0 for every released pipe', wantsLeft === 0, String(wantsLeft));
  check('the drainer is cleared when the last carrier is released', clearedIv.indexOf(intervals[0].id) >= 0, JSON.stringify(clearedIv));

  check('equal mime types are not a mismatch', MP.codecMismatch('video/vp8', 'video/vp8', 20, 5) === false);
  check('different mime types are a mismatch on the first template', MP.codecMismatch('video/vp8', 'video/H264', 1, 1) === true);
  check('an unknown mime is not a mismatch before 8 templates', MP.codecMismatch(null, null, 7, 5) === false);
  check('an unknown mime is a mismatch after 8 templates once content was seen', MP.codecMismatch(null, 'video/vp8', 8, 1) === true);
  check('an unknown mime with no content yet is not a mismatch', MP.codecMismatch(null, null, 30, 0) === false);

  const taps = new Map(), tapTs = new Map(), skr = new Map();
  for (let i = 0; i < 100; i++) {
    taps.set('s' + i, new Set(['p' + i]));
    tapTs.set('s' + i, {});
    skr.set('s' + i, i);
    MP.releaseTap(taps, tapTs, skr, 's' + i, 'p' + i);
  }
  check('releaseTap drops skrLast when the tap\'s last pipe leaves', taps.size === 0 && tapTs.size === 0 && skr.size === 0);
  taps.set('s', new Set(['a', 'b'])); skr.set('s', 1); tapTs.set('s', {});
  MP.releaseTap(taps, tapTs, skr, 's', 'a');
  check('releaseTap keeps skrLast while a sibling pipe remains', taps.get('s').size === 1 && skr.get('s') === 1);

  const src = MP._workerSrc();
  check('the worker source parses', (() => { new Function(src); return true; })());
  {
    // The worker carries its own copy of both helpers (a Worker cannot see the
    // page). The copies must be the same code, or the tests above prove nothing
    // about the worker.
    const srcText = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'site', 'js', 'mesh-pipe.js'), 'utf8');
    const lit = (srcText.match(/const WORKER_SRC = `([\s\S]*?)`;/) || [])[1] || '';
    const norm = (x) => String(x).replace(/\s+/g, ' ').trim();
    const inWorker = (fn) => norm(lit).indexOf(norm(fn.toString())) >= 0;
    check('the worker literal carries the same codecMismatch as the page', inWorker(MP.codecMismatch));
    check('the worker literal carries the same releaseTap as the page', inWorker(MP.releaseTap));
  }
  check('the worker source calls releaseTap and codecMismatch',
    src.indexOf('function releaseTap') >= 0 && src.indexOf('function codecMismatch') >= 0
    && src.indexOf('releaseTap(taps, tapTs, skrLast') >= 0
    && src.indexOf('codecMismatch(p.mime, p.tmplMime, p.tmpl, p.seen || 0)') >= 0);

  const savedT = global.setTimeout;
  const savedC = global.clearTimeout;
  const timeouts = [];
  global.setTimeout = (fn) => { timeouts.push(fn); return timeouts.length; };
  global.clearTimeout = () => {};
  let late = null, second = null;
  const a = MP.stats().then((v) => { late = v; });
  const b = MP.stats().then((v) => { second = v; });
  check('stats requests carry distinct seqs', worker.posted.filter((m) => m.op === 'stats').map((m) => m.seq).join(',') === '1,2');
  timeouts[0]();
  worker.onmessage({ data: { op: 'stats', seq: 1, stats: { stale: true } } });
  worker.onmessage({ data: { op: 'stats', seq: 2, stats: { fresh: true } } });
  global.setTimeout = savedT;
  global.clearTimeout = savedC;
  done = Promise.all([a, b]).then(() => {
    check('a timed-out stats call does not take the next reply', late && Object.keys(late).length === 0 && second && second.fresh === true, JSON.stringify({ late, second }));
  });
}

global.setInterval = realSetInterval;
global.clearInterval = realClearInterval;

done.then(() => {
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
}).catch((e) => { console.error('FATAL', e && e.stack || e); process.exit(2); });
