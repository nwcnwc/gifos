#!/usr/bin/env node
// whisper-smoke.js — run the Offline Captions engine end to end in Node:
// the real tiny model, the real JFK clip, the real text. NOT a gate (it needs
// the network once, and onnxruntime-node, which is not a repo dependency):
//
//   npm i --no-save onnxruntime-node@1.20.1      # once, anywhere on the path
//   node test/tools/whisper-smoke.js [--base] [--lang ru] [--translate] [file.wav]
//
// Downloads the pinned model files from the manifest into
// ~/.cache/gifos-whisper/ (sha256-verified, like the OS does), transcribes
// test/fixtures/jfk.wav (16 kHz mono, public domain) and asserts the sentence.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'offline-stt-whisper');
const W = require(path.join(APP, 'whisper-core.js'));
let ort;
try { ort = require('onnxruntime-node'); } catch (e) {
  console.log('NEEDS-ORT-NODE: npm i --no-save onnxruntime-node@1.20.1 (not a repo dependency), then rerun.');
  process.exit(3);
}

const args = process.argv.slice(2);
const flag = (f) => args.indexOf(f) >= 0;
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; };
const size = flag('--base') ? 'base' : 'tiny';
const file = args.filter((a) => /\.wav$/i.test(a))[0] || path.join(ROOT, 'test', 'fixtures', 'jfk.wav');
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
const CACHE = path.join(os.homedir(), '.cache', 'gifos-whisper');
fs.mkdirSync(CACHE, { recursive: true });

function fetchTo(url, dest, expectSha) {
  return new Promise((resolve, reject) => {
    const get = (u, hops) => https.get(u, { headers: { 'user-agent': 'gifos-whisper-smoke' } }, (res) => {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location && hops < 8) { res.resume(); return get(new URL(res.headers.location, u).toString(), hops + 1); }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' for ' + u)); return; }
      const hash = crypto.createHash('sha256'); const out = fs.createWriteStream(dest + '.part'); let n = 0;
      res.on('data', (c) => { hash.update(c); n += c.length; });
      res.pipe(out);
      out.on('finish', () => {
        const got = hash.digest('hex');
        if (got !== expectSha) { fs.unlinkSync(dest + '.part'); reject(new Error('sha256 mismatch for ' + dest + ': ' + got)); return; }
        fs.renameSync(dest + '.part', dest); resolve(n);
      });
      out.on('error', reject);
    }).on('error', reject);
    get(url, 0);
  });
}
async function ensureAsset(p) {
  const a = manifest.assets.find((x) => x.path === p);
  if (!a) throw new Error('no pin for ' + p);
  const dest = path.join(CACHE, p);
  if (fs.existsSync(dest)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
    if (got === a.sha256) return dest;
    fs.unlinkSync(dest);
  }
  process.stdout.write('downloading ' + p + ' (' + (a.bytes / 1e6).toFixed(1) + ' MB)… ');
  await fetchTo(a.url, dest, a.sha256);
  console.log('ok');
  return dest;
}
function readWav(p) {
  const b = fs.readFileSync(p); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), sz = dv.getUint32(off + 4, true);
    if (id === 'fmt ') fmt = { ch: dv.getUint16(off + 10, true), sr: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    if (id === 'data') { data = b.subarray(off + 8, off + 8 + sz); break; }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('need a 16-bit PCM WAV');
  const frames = data.length / 2 / fmt.ch, chans = [];
  for (let c = 0; c < fmt.ch; c++) chans.push(new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = dv.getInt16(data.byteOffset - b.byteOffset + (i * fmt.ch + c) * 2, true) / 32768;
  return W.toMono16k(chans, fmt.sr);
}

(async () => {
  const encP = await ensureAsset('whisper-' + size + '-encoder.onnx');
  const decP = await ensureAsset('whisper-' + size + '-decoder.onnx');
  const t0 = Date.now();
  const enc = await ort.InferenceSession.create(encP), dec = await ort.InferenceSession.create(decP);
  const tok = new W.Tokenizer(JSON.parse(fs.readFileSync(path.join(APP, 'vendor', 'whisper-vocab.json'), 'utf8')), fs.readFileSync(path.join(APP, 'vendor', 'whisper-merges.txt'), 'utf8'));
  const model = new W.WhisperModel(ort, enc, dec, tok, { heads: size === 'base' ? 8 : 6, headDim: 64 });
  console.log('sessions ready in', Date.now() - t0, 'ms (' + size + ')');
  const audio = readWav(file);
  console.log('audio', (audio.length / 16000).toFixed(2), 's from', path.basename(file));
  const r = await model.transcribe(audio, { language: val('--lang') || 'auto', task: flag('--translate') ? 'translate' : 'transcribe', prompt: val('--prompt') || '' });
  console.log('language', r.language, '| tokens', r.tokens.length, '|', r.ms, 'ms');
  console.log('TEXT:', r.text);
  if (/jfk\.wav$/.test(file)) {
    const ok = /ask not what your country can do for you/i.test(r.text) && r.language === 'en';
    console.log((ok ? 'PASS' : 'FAIL') + ' — the JFK sentence comes out of the ' + size + ' model, detected as English');
    process.exit(ok ? 0 : 1);
  }
})().catch((e) => { console.error('ERR', e && e.message || e); process.exit(1); });
