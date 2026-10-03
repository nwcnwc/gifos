// Fast unit check: the transport reassembly cap (FRAG_MAX_PARTS) must carry the
// APP-DATA ceiling — a single ~25MB db record (My Media's per-item max), which is
// DOUBLE base64'd on the wire (binary-safe $bin ×1.33, then seal's ciphertext
// base64 ×1.33 ≈ 1.78×). A cap sized only for the raw bytes silently DROPS a big
// shared video mid-transfer, so the guest never loads it. No browser needed.
global.crypto = require('crypto').webcrypto;
global.addEventListener = () => {};
require('../../site/js/gifos-net.js');
const net = globalThis.GifOS.net;

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

function roundTrip(mb) {
  const s = 'x'.repeat(Math.round(mb * 1024 * 1024));
  const frags = [];
  net.sendChunked({ t: 'rpc-reply', ct: s }, (obj, str) => frags.push(JSON.parse(str)));
  const defrag = net.makeDefrag();
  let out = null;
  for (const f of frags) { const r = defrag(f, 'peer'); if (r) out = r; }
  return { parts: frags.length, ok: !!(out && out.ct && out.ct.length === s.length) };
}

// A 25MB My Media item seals to ~44MB on the wire — the transport must carry it.
const big = roundTrip(44);
check('a ~44MB sealed message (a 25MB shared video) reassembles', big.ok, big.parts + ' fragments');
check('and it needs more than the old 256-part cap (this is the fix)', big.parts > 256, big.parts + ' parts');

// A small message still takes the one-shot path (no fragmentation).
const small = roundTrip(0.05);
check('a small message is not fragmented', small.parts === 1 && small.ok);

// ---- THE PROGRESS COUNT IS THE ONLY THING THAT CAN DRAW THE WAIT ------------
// A guest's App GIF crosses as ONE owner-signed frame — Sound It Out's 3.9MB
// GIF is 6.0MB of base64, ~8.1MB sealed, ~80 fragments, measured at 3.6-7.1s
// against production. makeDefrag has always counted those fragments, and
// run.html passed `null` and threw the count away, so the guest stared at the
// app's chrome over an empty stage and read it as broken. Guard BOTH halves:
// the count itself, and the fact that run.html still asks for it.
const seen = [];
const defrag = net.makeDefrag((fid, got, n) => seen.push({ fid, got, n }));
const pieces = [];
net.sendChunked({ t: 'rpc-reply', ct: 'y'.repeat(6 * 1024 * 1024) }, (o, s) => pieces.push(JSON.parse(s)));
for (const p of pieces) defrag(p, 'peer');
check('onProgress fires once per fragment', seen.length === pieces.length, seen.length + ' of ' + pieces.length);
check('it reports a constant total', seen.every((s) => s.n === pieces.length), 'n=' + (seen[0] || {}).n);
check('and a strictly rising count (a bar may never walk backwards)',
  seen.every((s, i) => s.got === i + 1));
check('the last call reads 100%', !!seen.length && seen[seen.length - 1].got === seen[seen.length - 1].n);
// A single-piece message never fragments, so it reports nothing — the caller
// must not depend on progress for bodies that land in one frame.
const quiet = [];
net.makeDefrag((f, g, n) => quiet.push(n))({ t: 'small' }, 'peer');
check('an unfragmented message reports no progress', quiet.length === 0);

// The wiring. This is the regression: the mechanism worked the whole time.
const runHtml = require('fs').readFileSync(require('path').join(__dirname, '../../site/run.html'), 'utf8');
const mk = runHtml.match(/net\.makeDefrag\(([^)]*)\)/);
check('run.html asks makeDefrag for progress', !!mk && mk[1].trim() !== '' && mk[1].trim() !== 'null',
  mk ? 'makeDefrag(' + mk[1].trim() + ')' : 'no makeDefrag call found');
check('and something draws it', /appCopyPaint\s*\(/.test(runHtml) && /id="appcopy"|id = .appcopy./.test(runHtml));

// ---- REASSEMBLY IS BOUNDED IN BYTES, NOT ONLY IN MESSAGE COUNT --------------
// The old bound was eight partial messages, each up to 512 pieces, and a piece
// carried any length: a room member (it holds the room key) could park eight
// 511-piece partials in every receiver, ~400MB of strings that live until the
// 30s sweep, and a piece longer than FRAG_PART multiplied that without limit.
// A phone browser kills the tab long before. The transport now refuses a piece
// longer than FRAG_PART and keeps the bytes it holds under FRAG_BUDGET, and it
// says how much it holds (defrag.stats()) so this guard can watch the ceiling.
{
  const PART = net.FRAG_PART;
  const piece = 'z'.repeat(PART); // one shared string: the test's own memory stays flat, the defrag's count does not
  let now = 1e12; const realNow = Date.now; Date.now = () => now;
  const d = net.makeDefrag();
  check('the defrag reports what it holds (stats)', typeof d.stats === 'function' && typeof net.FRAG_BUDGET === 'number');
  const stats = () => (typeof d.stats === 'function' ? d.stats() : { bytes: Infinity, msgs: 0 });
  check('FRAG_BUDGET carries at least two 25MB shared videos side by side (2 x FRAG_MAX_PARTS x FRAG_PART)',
    net.FRAG_BUDGET >= 2 * 512 * PART, net.FRAG_BUDGET + ' chars');
  // An oversized piece is a hostile piece — an honest sender never cuts one.
  const over = d({ t: 'frag', fid: 'big', i: 0, n: 2, p: 'z'.repeat(PART + 1) }, 'hostile');
  check('a piece longer than FRAG_PART is refused and holds nothing', over === null && stats().bytes === 0, JSON.stringify(stats()));
  // Eight 511-of-512 partials from eight senders: the count bound alone allows
  // ~400MB; the byte budget must cap retention at FRAG_BUDGET.
  let peak = 0;
  for (let s = 0; s < 8; s++) for (let i = 0; i < 511; i++) {
    d({ t: 'frag', fid: 'f' + s, i, n: 512, p: piece }, 'sender' + s);
    peak = Math.max(peak, stats().bytes);
  }
  check('retained bytes never exceed FRAG_BUDGET under a 400MB partial flood', peak <= net.FRAG_BUDGET, 'peak ' + peak + ' of ' + net.FRAG_BUDGET);
  check('and the budget is actually used (at least one full partial is held)', peak >= 511 * PART, 'peak ' + peak);
  // The sweep frees them: 30s later a fresh message reassembles.
  now += 31000;
  const late = d({ t: 'frag', fid: 'late', i: 0, n: 2, p: '{"t":"x","v":"' + 'q'.repeat(PART - 20) }, 'honest');
  const late2 = d({ t: 'frag', fid: 'late', i: 1, n: 2, p: '"}' }, 'honest');
  check('after the sweep a new message reassembles', late === null && !!late2 && late2.t === 'x', JSON.stringify(stats()));
  check('and a completed message is released from the count', stats().bytes === 0 && stats().msgs === 0, JSON.stringify(stats()));
  Date.now = realNow;
}

// ---- A DUPLICATE PIECE IS BENIGN; A CONFLICTING ONE IS NOT ------------------
// The same piece can reach a receiver twice (a re-send after a stall, two
// paths). An identical copy at an index already held must be ignored, not
// treated as a hostile inconsistency that throws the whole partial away. A
// DIFFERENT payload at a held index stays a drop.
{
  const d = net.makeDefrag();
  const pieces = [];
  net.sendChunked({ t: 'rpc-reply', ct: 'w'.repeat(250 * 1024) }, (o, s) => pieces.push(JSON.parse(s)));
  check('fixture: three pieces', pieces.length === 3, pieces.length);
  let out = null;
  const r0 = d(pieces[0], 'peer'); const r0b = d(pieces[0], 'peer'); // piece 0 twice
  for (const p of pieces.slice(1)) { const r = d(p, 'peer'); if (r) out = r; }
  check('an identical duplicate piece does not break reassembly', r0 === null && r0b === null && !!out && out.ct.length === 250 * 1024);
  const d2 = net.makeDefrag();
  d2(pieces[0], 'peer');
  const conflict = Object.assign({}, pieces[0], { p: pieces[0].p.slice(0, -1) + '!' });
  d2(conflict, 'peer');
  let out2 = null; for (const p of pieces.slice(1)) { const r = d2(p, 'peer'); if (r) out2 = r; }
  check('a conflicting payload at a held index still discards the partial', out2 === null);
}

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
