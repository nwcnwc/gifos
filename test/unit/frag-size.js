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

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
