// whisper-core.js — the on-device speech-to-text engine's pure parts, in
// Node, with no model: the log-mel front end, the byte-level BPE tokenizer
// (decode, encode, round trips, the multilingual special tokens), the
// decoding loop guard, the language table, and the manifest pins the
// provider app relies on. The model-driven path is test/tools/whisper-smoke.js
// (downloads the tiny pair; not a gate).
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..', '..', 'apps', 'offline-stt-whisper');
const W = require(path.join(APP, 'whisper-core.js'));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- the log-mel front end ----
{
  const silence = new Float32Array(16000);
  const m0 = W.logMel(silence);
  check('a mel spectrogram is 80 bins x 3000 frames, mel-major', m0.data.length === 80 * 3000);
  // Centred frames: frame t covers [t*160-200, t*160+200), so the last frame
  // touching sample 15999 is t = 101 → 102 frames hold audio.
  check('one second of audio occupies 102 frames (hop 160, centred, half-window reach)', m0.frames === 102, String(m0.frames));
  // Whisper's normalisation: silence sits at the floor, (max-8+4)/4; with
  // nothing above the floor every value is the same.
  const v = m0.data[0];
  let same = true; for (let i = 0; i < m0.data.length; i++) if (Math.abs(m0.data[i] - v) > 1e-6) { same = false; break; }
  check('silence is flat across every bin and frame', same);
  // A 1 kHz tone lights the bins around 1 kHz and nothing far from it.
  const tone = new Float32Array(16000); for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 16000);
  const m1 = W.logMel(tone);
  let best = -1, bv = -Infinity; for (let b = 0; b < 80; b++) { const x = m1.data[b * 3000 + 50]; if (x > bv) { bv = x; best = b; } }
  // slaney mel: 1 kHz is at mel 15 of ~(hzToMel(8000)=~44.5) → bin ~ 15/44.5*81 ≈ 27
  check('a 1 kHz tone peaks in the bins around 1 kHz (bin 24..30)', best >= 24 && best <= 30, 'peak bin ' + best);
  check('the loudest value is normalised to 1 (max log → (max+4)/4 ≈ 1 when max≈0)', bv > 0.6 && bv <= 1.6, bv.toFixed(3));
  check('frames past the audio are at the floor', m1.data[best * 3000 + 2999] < m1.data[best * 3000 + 50]);
  // Longer than 30 s is cut, never overflowed.
  const long = new Float32Array(16000 * 40);
  check('audio over 30 s fills exactly 3000 frames', W.logMel(long).frames === 3000);
}

// ---- the tokenizer ----
{
  const vocab = JSON.parse(fs.readFileSync(path.join(APP, 'vendor', 'whisper-vocab.json'), 'utf8'));
  const merges = fs.readFileSync(path.join(APP, 'vendor', 'whisper-merges.txt'), 'utf8');
  const tok = new W.Tokenizer(vocab, merges);
  check('the multilingual vocabulary: <|endoftext|> is 50257 and the table holds 50k+ tokens', vocab['<|endoftext|>'] === 50257 && Object.keys(vocab).length > 50000);
  const sample = ' And so my fellow Americans, ask not what your country can do for you.';
  const ids = tok.encode(sample);
  check('encode produces ids below the special range', ids.length > 5 && ids.every((i) => i < 50257), JSON.stringify(ids.slice(0, 6)));
  check('decode(encode(x)) round-trips English with punctuation', tok.decode(ids) === sample, JSON.stringify(tok.decode(ids)));
  const ru = ' Давайте продолжим, это первый тест.';
  check('…and Cyrillic (multi-byte UTF-8 through the byte-level BPE)', tok.decode(tok.encode(ru)) === ru, JSON.stringify(tok.decode(tok.encode(ru))));
  const names = ' Nano AG, Boreal, Lima, Plant Defender';
  check('…and a vocabulary prompt of product names', tok.decode(tok.encode(names)) === names);
  check('special tokens never print', tok.decode([W.tokens.SOT, 50259, W.tokens.TRANSCRIBE, W.tokens.NO_TS, W.tokens.EOT]) === '');
  check('the 99-language table matches Whisper\'s token range', W.LANGS.length === 99 && W.LANGS[0] === 'en' && W.LANGS[4] === 'ru' && W.LANGS[98] === 'su');
  check('the special ids are Whisper\'s', W.tokens.SOT === 50258 && W.tokens.EOT === 50257 && W.tokens.NO_TS === 50363 && W.tokens.SOP === 50361 && W.tokens.TRANSCRIBE === 50359 && W.tokens.TRANSLATE === 50358);
}

// ---- the decoding scaffolding, without a model ----
{
  // A fake ORT + fake sessions: the decoder returns a scripted token per step
  // and asserts the cache plumbing (empty first-pass cache shaped by the
  // caller; encoder presents carried across cached steps).
  const calls = [];
  const FakeTensor = function (type, data, dims) { this.type = type; this.data = data; this.dims = dims; };
  const script = [50259 /* lang guess */, 400, 401, 402, 50257];
  let step = 0;
  const fakeOrt = { Tensor: FakeTensor };
  const enc = { inputNames: ['input_features'], outputNames: ['last_hidden_state'], run: async (f) => { calls.push(['enc', f.input_features.dims.join('x')]); return { last_hidden_state: new FakeTensor('float32', new Float32Array(10), [1, 1500, 384]) }; } };
  const dec = {
    inputNames: ['input_ids', 'encoder_hidden_states', 'past_key_values.0.decoder.key', 'past_key_values.0.decoder.value', 'past_key_values.0.encoder.key', 'past_key_values.0.encoder.value', 'use_cache_branch'],
    outputNames: ['logits', 'present.0.decoder.key', 'present.0.decoder.value', 'present.0.encoder.key', 'present.0.encoder.value'],
    run: async (f) => {
      const T = f.input_ids.dims[1], cached = f.use_cache_branch.data[0] === 1;
      calls.push(['dec', T, cached, f['past_key_values.0.decoder.key'].dims.join('x'), f['past_key_values.0.encoder.key'].dims.join('x')]);
      const V = 51865, logits = new Float32Array(T * V).fill(-100);
      const want = script[Math.min(step++, script.length - 1)];
      logits[(T - 1) * V + want] = 10;
      if (T > 1 && !cached) logits[(T - 1) * V + 220] = 11; // begin-suppressed: must be skipped at the first step
      const prevLen = f['past_key_values.0.decoder.key'].dims[2];
      return {
        logits: new FakeTensor('float32', logits, [1, T, V]),
        'present.0.decoder.key': new FakeTensor('float32', new Float32Array(0), [1, 6, prevLen + T, 64]),
        'present.0.decoder.value': new FakeTensor('float32', new Float32Array(0), [1, 6, prevLen + T, 64]),
        'present.0.encoder.key': new FakeTensor('float32', new Float32Array(0), cached ? [0, 6, 1, 64] : [1, 6, 1500, 64]),
        'present.0.encoder.value': new FakeTensor('float32', new Float32Array(0), cached ? [0, 6, 1, 64] : [1, 6, 1500, 64]),
      };
    },
  };
  const vocab = {}; vocab['<|endoftext|>'] = 50257; vocab['a'] = 400; vocab['b'] = 401; vocab['c'] = 402;
  const tok = new W.Tokenizer(vocab, '');
  const model = new W.WhisperModel(fakeOrt, enc, dec, tok, { heads: 6, headDim: 64 });
  model.transcribe(new Float32Array(16000), { language: 'auto' }).then((r) => {
    check('language detection reads the first decoder pass', r.language === 'en', r.language);
    check('the first real pass carries the 4-token prefix and an EMPTY cache shaped for the model', calls.some((c) => c[0] === 'dec' && c[1] === 4 && c[2] === false && c[3] === '1x6x0x64'), JSON.stringify(calls));
    check('later passes feed ONE token with the cache branch on', calls.some((c) => c[0] === 'dec' && c[1] === 1 && c[2] === true));
    const cachedCalls = calls.filter((c) => c[0] === 'dec' && c[2] === true);
    check('the encoder cache from the first pass carries across cached steps (never the empty [0,…])', cachedCalls.length > 0 && cachedCalls.every((c) => c[4] === '1x6x1500x64'), JSON.stringify(cachedCalls));
    check('begin-suppressed tokens are skipped at the first step, and EOT ends the loop', r.tokens.join(',') === '400,401,402', r.tokens.join(','));
    check('the text is the decoded tokens', r.text === 'abc', JSON.stringify(r.text));
    return model.transcribe(new Float32Array(16000), { language: 'ru', task: 'translate', prompt: 'a b' });
  }).then((r) => {
    check('a fixed language skips detection and is reported back', r.language === 'ru');
    const first = calls.filter((c) => c[0] === 'dec' && c[2] === false).pop();
    check('a prompt rides as <|startofprev|> + tokens ahead of the 4-token prefix', first && first[1] === 4 + 1 + 2, first && String(first[1]));
  }).catch((e) => check('the fake-model decode ran without throwing', false, e && e.stack || String(e))).then(() => {
    // ---- the manifest pins the engine relies on ----
    const m = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
    check('the provider serves stt and nothing networky', m.provides.ai.indexOf('stt') >= 0 && !(m.capabilities || {}).network && !(m.capabilities || {}).api);
    const paths = (m.assets || []).map((a) => a.path);
    check('both model sizes are pinned, encoder and decoder each', ['whisper-tiny-encoder.onnx', 'whisper-tiny-decoder.onnx', 'whisper-base-encoder.onnx', 'whisper-base-decoder.onnx'].every((p) => paths.indexOf(p) >= 0), paths.join(','));
    check('every pin is optional (nothing downloads at install) with a 64-hex sha256 and a byte count', (m.assets || []).every((a) => a.optional === true && /^[0-9a-f]{64}$/.test(a.sha256) && a.bytes > 1e6));
    check('the app.js model table names the same files', ['whisper-tiny-encoder.onnx', 'whisper-base-decoder.onnx'].every((p) => fs.readFileSync(path.join(APP, 'app.js'), 'utf8').indexOf(p) >= 0));
    // ---- helpers ----
    const mono = W.toMono16k([new Float32Array([0, 1, 0, -1, 0, 1]), new Float32Array([0, 1, 0, -1, 0, 1])], 48000);
    check('toMono16k averages channels and resamples 48k → 16k (6 → 2 samples)', mono.length === 2);
    check('rms of silence is 0', W.rms(new Float32Array(100)) === 0);
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  });
}
