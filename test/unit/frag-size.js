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

console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
process.exit(failures ? 1 : 0);
