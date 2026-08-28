// The archive inside an App GIF: two formats, one framing.
//
// v1 (JSON + base64 per file) is what every signed and installed App GIF
// already is, so decode must read it forever. v2 ("GFA2" | header | blob) is
// what lets a LARGE app open at all: v1 holds the inflated JSON, the string
// JSON.parse reads, every file's base64 AND the bytes, so decoding peaks near
// six times the file data. v2 parses a directory of paths and hands out views
// onto the payload already in hand.
//
// What this pins:
//   - decode reads v1 and v2, byte-identically
//   - encode stays on v1 unless asked (a runtime older than v2 cannot read it)
//   - v2 is materially smaller on the wire and materially cheaper to open
//   - a corrupt v2 directory is refused, not served truncated
//
// Run: node test/unit/gif-archive-v2.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function load() {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-gif.js'), 'utf8');
  const g = {
    Uint8Array, TextEncoder, TextDecoder, console, Promise, setTimeout, Blob,
    Response, CompressionStream, DecompressionStream, Error, JSON, Math, Object,
    ArrayBuffer, Number, String,
  };
  g.window = g; g.globalThis = g; g.self = g;
  vm.createContext(g);
  vm.runInContext(src, g, { filename: 'gifos-gif.js' });
  return g.GifOS.gif;
}

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail && !cond ? '\n      ' + detail : ''));
  if (!cond) failures++;
}

const dec = new TextDecoder();
const enc = new TextEncoder();

// A filesystem with the shapes an app really carries: text, binary with every
// byte value, an empty file, a nested path, and something big enough that the
// per-format cost is visible rather than lost in noise.
const bin = new Uint8Array(256 * 400);
for (let i = 0; i < bin.length; i++) bin[i] = i & 0xff;
const big = new Uint8Array(2 * 1024 * 1024);
for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) & 0xff;
const FILES = {
  'index.html': '<!doctype html><title>archive probe</title><script src="js/a.js"></script>',
  'manifest.json': JSON.stringify({ appId: 'archive-probe', capabilities: { db: true } }),
  'js/a.js': 'console.log("hello");\n',
  'empty.txt': '',
  'unicode.txt': 'ελληνικά — עברית — 日本語 — 🎁',
  '.assets/pack.gbx': bin,
  '.assets/big.gbx': big,
};

function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function expected(p) {
  const v = FILES[p];
  return typeof v === 'string' ? enc.encode(v) : v;
}

(async () => {
  const gif = load();

  // ---- both formats round-trip, identically -------------------------------
  const v1 = await gif.encode(FILES, {});
  const v2 = await gif.encode(FILES, { archive: 2 });

  for (const [label, bytes] of [['v1', v1], ['v2', v2]]) {
    const out = await gif.decode(bytes);
    check(label + ': the GIF decodes', !!out);
    if (!out) continue;
    let allSame = true, first = '';
    for (const p of Object.keys(FILES)) {
      if (!sameBytes(out.files[p], expected(p))) { allSame = false; first = first || p; }
    }
    check(label + ': every file comes back byte for byte', allSame, 'first difference: ' + first);
    check(label + ': it carries no files it was not given',
      Object.keys(out.files).filter((p) => !(p in FILES) && p !== gif.REMIX_DOC).length === 0);
    check(label + ': it is a GifOS gif', gif.looksLikeGifosGif(bytes));
    check(label + ': the manifest reads back',
      JSON.parse(dec.decode(out.files['manifest.json'])).appId === 'archive-probe');
  }

  // ---- v1 stays the default -----------------------------------------------
  // A runtime older than parseArchiveV2 cannot read v2, and every installed
  // App GIF was written by one. Flipping this is a flag day that follows the
  // release teaching everyone to read v2, never leads it.
  const plain = await gif.encode(FILES, {});
  check('encode defaults to v1', !isV2Payload(gif, plain),
    'default encode produced v2 — apps built now would not open on shipped runtimes');
  check('encode(…, {archive: 2}) opts in', isV2Payload(gif, v2));

  gif.setArchiveVersion(2);
  check('setArchiveVersion(2) moves the default', isV2Payload(gif, await gif.encode(FILES, {})));
  gif.setArchiveVersion(1);
  check('setArchiveVersion(1) moves it back', !isV2Payload(gif, await gif.encode(FILES, {})));
  let threw = false;
  try { gif.setArchiveVersion(3); } catch (e) { threw = true; }
  check('an unknown archive version is refused', threw);

  // ---- v2 is smaller on the wire ------------------------------------------
  // base64 is 4/3 before deflate; deflate recovers some of it but not all,
  // because base64 destroys the byte alignment its matcher works on.
  check('v2 is smaller than v1 on disk', v2.length < v1.length,
    'v1 ' + v1.length + ' B, v2 ' + v2.length + ' B');
  console.log('       (v1 ' + (v1.length / 1024).toFixed(0) + ' KB, v2 ' +
    (v2.length / 1024).toFixed(0) + ' KB — ' +
    (100 - (100 * v2.length) / v1.length).toFixed(0) + '% smaller)');

  // ---- v2 is cheaper to open ----------------------------------------------
  // Asserted as STRUCTURE, not as a measurement. Peak heap inside one process
  // reads whichever format ran first (V8 grows the heap lazily and does not
  // give it back), and a wall-clock assertion on a shared box is a flake. The
  // mechanism is what matters and it is exactly checkable: a v2 file is a
  // window onto the one inflated payload, so decode allocates nothing per
  // file, while a v1 file is the output of its own b64decode.
  // The real numbers live in test/tools/gif-decode-rss.js, which measures each
  // format in its own process.
  const outV2 = await gif.decode(v2);
  const viewsV2 = Object.keys(FILES).map((p) => outV2.files[p]);
  const oneBuffer = viewsV2.every((u) => u.buffer === viewsV2[0].buffer);
  check('v2 hands out views onto one payload — no per-file allocation', oneBuffer,
    'v2 copied each file out; the memory win is the copy it does not make');
  check('v2 views are windows, not the whole buffer',
    viewsV2.some((u) => u.byteOffset > 0) &&
    viewsV2.every((u) => u.byteLength <= u.buffer.byteLength));

  const outV1 = await gif.decode(v1);
  const buffersV1 = new Set(Object.keys(FILES).filter((p) => FILES[p].length)
    .map((p) => outV1.files[p].buffer));
  check('v1 allocates per file (the cost v2 removes)', buffersV1.size > 1,
    'expected one buffer per file in v1');

  // ---- a corrupt directory is refused -------------------------------------
  // A v2 entry pointing past the payload must fail the whole decode. Serving a
  // truncated or out-of-bounds file would hand an app someone else's bytes.
  for (const [why, dir] of [
    ['reaching past the payload', { 'a.txt': [0, 999999] }],
    ['at a negative offset', { 'a.txt': [-8, 4] }],
    ['with a negative length', { 'a.txt': [0, -1] }],
  ]) {
    const out = await gif.decode(gifWithPayload(gif, v2, badV2(dir)));
    check('a v2 entry ' + why + ' is refused', out === null,
      'decode returned ' + (out && Object.keys(out.files).join(', ')));
  }
  // ...and a sound one through the same path still opens, so the guard above
  // is not passing because the harness itself is broken.
  const rebuilt = await gif.decode(gifWithPayload(gif, v2, badV2({ 'a.txt': [0, 5] })));
  check('the same harness opens a sound v2 directory',
    !!rebuilt && dec.decode(rebuilt.files['a.txt']) === 'short',
    rebuilt ? JSON.stringify(dec.decode(rebuilt.files['a.txt'] || new Uint8Array())) : 'null');

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — ' + e.stack); process.exit(1); });

// Does this GIF's payload use the v2 archive? Read it the way decode does.
function isV2Payload(gif, gifBytes) {
  // The payload is deflated, so this reproduces decode's first two steps.
  const marker = gif.findAppExtSpan(gifBytes, gif.MARKER);
  if (!marker) return false;
  const zlib = require('zlib');
  // walk the sub-blocks back into one buffer
  const parts = [];
  let p = marker.headerEnd;
  while (p < gifBytes.length) {
    const size = gifBytes[p];
    if (size === 0) break;
    parts.push(Buffer.from(gifBytes.subarray(p + 1, p + 1 + size)));
    p += 1 + size;
  }
  const payload = Buffer.concat(parts);
  const body = payload[0] === 0x01 ? zlib.inflateRawSync(payload.subarray(1)) : payload;
  return gif.isArchiveV2(new Uint8Array(body));
}

// Hand-build a v2 archive with the given directory over a 5-byte blob.
function badV2(dir) {
  const header = Buffer.from(JSON.stringify({ v: 2, files: dir }), 'utf8');
  const blob = Buffer.from('short', 'utf8');
  const out = Buffer.alloc(8 + header.length + blob.length);
  out.write('GFA2', 0, 'latin1');
  out.writeUInt32LE(header.length, 4);
  header.copy(out, 8);
  blob.copy(out, 8 + header.length);
  return new Uint8Array(out);
}

// Swap a GIF's payload for one of our own, so the bytes go through the real
// extractPayload -> inflate -> parseArchive path rather than a reimplementation
// of its bounds rule.
function gifWithPayload(gif, templateGif, archiveBytes) {
  const zlib = require('zlib');
  const span = gif.findAppExtSpan(templateGif, gif.MARKER);
  const z = zlib.deflateRawSync(Buffer.from(archiveBytes));
  const framed = Buffer.concat([Buffer.from([0x01]), z]);
  const blocks = [];
  for (let p = 0; p < framed.length; p += 255) {
    const chunk = framed.subarray(p, Math.min(p + 255, framed.length));
    blocks.push(Buffer.from([chunk.length]), chunk);
  }
  blocks.push(Buffer.from([0]));
  const mid = Buffer.concat(blocks);
  return new Uint8Array(Buffer.concat([
    Buffer.from(templateGif.subarray(0, span.headerEnd)),
    mid,
    Buffer.from(templateGif.subarray(span.end)),
  ]));
}
