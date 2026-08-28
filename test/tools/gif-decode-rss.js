// What decoding an App GIF costs in memory, against the file data it holds.
//
// This is the number that decides whether a LARGE App GIF opens on a phone.
// An app that carries a sealed library (the Bible study desk is heading for
// hundreds of megabytes of packed text) is bounded by decode's peak heap, not
// by the GIF's size on disk or by the inflate ceiling.
//
//   node test/tools/gif-decode-rss.js [megabytes]        # encode + decode
//   node test/tools/gif-decode-rss.js [megabytes] encode # encode phase only
//   node test/tools/gif-decode-rss.js [megabytes] decode # decode a saved GIF
//
// Split into two processes on purpose: encode leaves hundreds of megabytes of
// its own garbage behind, and V8 does not return it to the OS, so measuring
// decode in the same process reads encode's high-water mark instead.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const MB = 1024 * 1024;
const N_MB = Number(process.argv[2] || 12);
const PHASE = process.argv[3] || 'both';
const GIF = path.join(os.tmpdir(), 'gifos-mem-probe-' + N_MB + 'mb.gif');

function load() {
  const src = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-gif.js'), 'utf8');
  const g = {
    Uint8Array, TextEncoder, TextDecoder, console, Promise, setTimeout, Blob,
    Response, CompressionStream, DecompressionStream, Error, JSON, Math, Object,
  };
  g.window = g; g.globalThis = g; g.self = g;
  vm.createContext(g);
  vm.runInContext(src, g, { filename: 'gifos-gif.js' });
  return g.GifOS.gif;
}

// Text that deflates like scripture, not like zeros: a compressible-to-nothing
// payload would measure the wrong thing on the inflate side.
function corpus(bytes) {
  const words = ('in the beginning god created the heavens and the earth and the earth was ' +
    'formless and empty darkness was on the surface of the deep gods spirit was hovering ' +
    'over the surface of the waters god said let there be light and there was light it was ' +
    'good and god divided the light from the darkness he called the light day and the ' +
    'darkness he called night there was evening and there was morning the first day ').split(' ');
  const parts = [];
  let n = 0, i = 0;
  // A pseudo-random walk over the vocabulary: real prose does not repeat one
  // sentence, and a repeated sentence deflates to a ratio no app will see.
  let seed = 12345;
  while (n < bytes) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const w = words[(seed >>> 8) % words.length] + ' ';
    parts.push(w); n += w.length; i++;
  }
  return parts.join('');
}

// heapUsed alone is the wrong meter here: the decoded files are ArrayBuffers,
// which V8 reports under `external`, so a heap-only reading counts the base64
// strings and misses the bytes they became.
const heapMB = () => {
  const m = process.memoryUsage();
  return (m.heapUsed + m.external) / MB;
};

function sample(fn) {
  let peak = heapMB();
  const t = setInterval(() => { const h = heapMB(); if (h > peak) peak = h; }, 2);
  return Promise.resolve(fn()).then((v) => { clearInterval(t); return [v, peak]; });
}

async function encodePhase() {
  const gif = load();
  const N = N_MB * MB;
  const files = { 'index.html': '<!doctype html><title>probe</title>',
                  'manifest.json': JSON.stringify({ appId: 'mem-probe' }) };
  for (let i = 0; i < 10; i++) files['pack-' + i + '.gbx'] = corpus(N / 10);

  const base = heapMB();
  const [bytes, peak] = await sample(() => gif.encode(files, {}));
  fs.writeFileSync(GIF, bytes);
  console.log('file data (N)           ' + N_MB.toFixed(0) + ' MB');
  console.log('encoded GIF             ' + (bytes.length / MB).toFixed(1) + ' MB');
  console.log('ENCODE peak heap        ' + peak.toFixed(0) + ' MB   ' +
    ((peak - base) / N_MB).toFixed(1) + ' x N');
}

async function decodePhase() {
  const gif = load();
  const bytes = new Uint8Array(fs.readFileSync(GIF));
  const base = heapMB();
  const [out, peak] = await sample(() => gif.decode(bytes));
  if (global.gc) { global.gc(); global.gc(); }
  const held = heapMB();
  console.log('DECODE peak heap        ' + peak.toFixed(0) + ' MB   ' +
    ((peak - base) / N_MB).toFixed(1) + ' x N');
  console.log('  retained after gc     ' + (held - base).toFixed(0) + ' MB   ' +
    ((held - base) / N_MB).toFixed(1) + ' x N   (should be ~1: the files)');
  console.log('  files decoded         ' + (out ? Object.keys(out.files).length : 'DECODE FAILED'));
  if (!out) process.exitCode = 1;
}

(async () => {
  if (PHASE === 'encode') return encodePhase();
  if (PHASE === 'decode') return decodePhase();
  await encodePhase();
  execFileSync(process.execPath, ['--expose-gc', __filename, String(N_MB), 'decode'], { stdio: 'inherit' });
})();
