/*
 * whisper-core.js — Whisper speech-to-text on ONNX Runtime, dependency-free.
 *
 * Runs the onnx-community Whisper exports (encoder_model + decoder_model_merged,
 * the KV-cached "merged" decoder with its use_cache_branch switch) with
 * nothing but an `ort` object (InferenceSession, Tensor). Everything the
 * Python side normally does lives here, written against the reference:
 *   - the log-mel front end (n_fft 400, hop 160, 80 slaney mel bins, Whisper's
 *     log10 / clamp / (x+4)/4 normalisation), computed only over the frames
 *     that hold audio;
 *   - the byte-level BPE tokenizer (GPT-2 style), decode AND encode — encode
 *     is what a vocabulary prompt needs;
 *   - greedy decoding with the KV cache, Whisper's suppress lists, a loop
 *     guard, language detection, the translate task, and prompting.
 *
 * Same file runs in Node (onnxruntime-node, the prototype) and in the browser
 * (onnxruntime-web inside the provider sandbox). No DOM, no fetch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WhisperCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SR = 16000, N_FFT = 400, HOP = 160, N_MELS = 80, N_FRAMES = 3000, N_SAMPLES = 480000;
  var SOT = 50258, EOT = 50257, NO_TS = 50363, SOP = 50361, TRANSCRIBE = 50359, TRANSLATE = 50358;
  var LANG_FIRST = 50259, LANG_LAST = 50357; // 99 language tokens, in Whisper's LANGUAGES order
  var MAX_LEN = 448;
  var LANGS = ['en', 'zh', 'de', 'es', 'ru', 'ko', 'fr', 'ja', 'pt', 'tr', 'pl', 'ca', 'nl', 'ar', 'sv', 'it', 'id', 'hi', 'fi', 'vi', 'he', 'uk', 'el', 'ms', 'cs', 'ro', 'da', 'hu', 'ta', 'no', 'th', 'ur', 'hr', 'bg', 'lt', 'la', 'mi', 'ml', 'cy', 'sk', 'te', 'fa', 'lv', 'bn', 'sr', 'az', 'sl', 'kn', 'et', 'mk', 'br', 'eu', 'is', 'hy', 'ne', 'mn', 'bs', 'kk', 'sq', 'sw', 'gl', 'mr', 'pa', 'si', 'km', 'sn', 'yo', 'so', 'af', 'oc', 'ka', 'be', 'tg', 'sd', 'gu', 'am', 'yi', 'lo', 'uz', 'fo', 'ht', 'ps', 'tk', 'nn', 'mt', 'sa', 'lb', 'my', 'bo', 'tl', 'mg', 'as', 'tt', 'haw', 'ln', 'ha', 'ba', 'jw', 'su'];
  // generation_config.json suppress_tokens (multilingual Whisper, the same list
  // for tiny/base/small) — punctuation-joined tokens, bracketed noise, etc.
  var SUPPRESS = [1, 2, 7, 8, 9, 10, 14, 25, 26, 27, 28, 29, 31, 58, 59, 60, 61, 62, 63, 90, 91, 92, 93, 359, 503, 522, 542, 873, 893, 902, 918, 922, 931, 1350, 1853, 1982, 2460, 2627, 3246, 3253, 3268, 3536, 3846, 3961, 4183, 4667, 6585, 6647, 7273, 9061, 9383, 10428, 10929, 11938, 12033, 12331, 12562, 13793, 14157, 14635, 15265, 15618, 16553, 16604, 18362, 18956, 20075, 21675, 22520, 26130, 26161, 26435, 28279, 29464, 31650, 32302, 32470, 36865, 42863, 47425, 49870, 50254, 50258, 50358, 50359, 50360, 50361, 50362];
  var BEGIN_SUPPRESS = [220, EOT];

  // ---- log-mel ----------------------------------------------------------------
  function hzToMel(hz) { // slaney (librosa htk=False)
    var fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
    return hz < minLogHz ? hz / fSp : minLogMel + Math.log(hz / minLogHz) / logstep;
  }
  function melToHz(mel) {
    var fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
    return mel < minLogMel ? mel * fSp : minLogHz * Math.exp(logstep * (mel - minLogMel));
  }
  var melBank = null; // [N_MELS][201] sparse-ish, built once
  function buildMelBank() {
    if (melBank) return melBank;
    var nBins = N_FFT / 2 + 1, i, j;
    var fftFreqs = new Float64Array(nBins);
    for (i = 0; i < nBins; i++) fftFreqs[i] = i * SR / N_FFT;
    var melMin = hzToMel(0), melMax = hzToMel(SR / 2);
    var melF = new Float64Array(N_MELS + 2);
    for (i = 0; i < N_MELS + 2; i++) melF[i] = melToHz(melMin + (melMax - melMin) * i / (N_MELS + 1));
    var bank = [];
    for (i = 0; i < N_MELS; i++) {
      var row = new Float32Array(nBins), lo = melF[i], mid = melF[i + 1], hi = melF[i + 2];
      var enorm = 2 / (hi - lo);
      var first = -1, last = -1;
      for (j = 0; j < nBins; j++) {
        var f = fftFreqs[j];
        var lower = (f - lo) / (mid - lo), upper = (hi - f) / (hi - mid);
        var w = Math.max(0, Math.min(lower, upper));
        if (w > 0) { row[j] = w * enorm; if (first < 0) first = j; last = j; }
      }
      bank.push({ w: row, first: first, last: last });
    }
    melBank = bank;
    return bank;
  }
  // Direct DFT over the 201 needed bins with precomputed tables (N=400 has no
  // clean radix-2; 3000 frames x 201 x 400 is ~0.25 s of JS for a full
  // 30 s window, and short utterances only pay for their own frames).
  var dftCos = null, dftSin = null, hann = null;
  function buildTables() {
    if (dftCos) return;
    var nBins = N_FFT / 2 + 1;
    dftCos = new Float32Array(nBins * N_FFT); dftSin = new Float32Array(nBins * N_FFT);
    for (var k = 0; k < nBins; k++) for (var n = 0; n < N_FFT; n++) {
      var a = 2 * Math.PI * k * n / N_FFT;
      dftCos[k * N_FFT + n] = Math.cos(a); dftSin[k * N_FFT + n] = Math.sin(a);
    }
    hann = new Float32Array(N_FFT);
    for (var m = 0; m < N_FFT; m++) hann[m] = 0.5 - 0.5 * Math.cos(2 * Math.PI * m / N_FFT); // periodic Hann (torch.hann_window)
  }
  /**
   * audio: Float32Array at 16 kHz, any length up to 30 s (longer is cut).
   * Returns { data: Float32Array[80*3000] (mel-major, as the model wants it),
   *           frames: number of frames that held audio }.
   */
  function logMel(audio) {
    buildTables(); var bank = buildMelBank();
    var nBins = N_FFT / 2 + 1, half = N_FFT / 2;
    var len = Math.min(audio.length, N_SAMPLES);
    // frames with any real sample: torch.stft(center=True) frame t covers
    // [t*HOP - half, t*HOP + half); the last frame of the padded 30 s window is dropped.
    var live = Math.min(N_FRAMES, Math.floor((len + half) / HOP) + 1);
    var out = new Float32Array(N_MELS * N_FRAMES);
    var frame = new Float32Array(N_FFT), power = new Float32Array(nBins);
    var t, n, k, m, j;
    var maxLog = -Infinity;
    var logs = new Float32Array(N_MELS * live);
    for (t = 0; t < live; t++) {
      var start = t * HOP - half;
      for (n = 0; n < N_FFT; n++) {
        var idx = start + n;
        // reflect padding at both ends (torch pad_mode="reflect")
        if (idx < 0) idx = -idx;
        else if (idx >= len) idx = 2 * (len - 1) - idx;
        var v = (idx >= 0 && idx < len) ? audio[idx] : 0;
        frame[n] = v * hann[n];
      }
      for (k = 0; k < nBins; k++) {
        var re = 0, im = 0, base = k * N_FFT;
        for (n = 0; n < N_FFT; n++) { re += frame[n] * dftCos[base + n]; im -= frame[n] * dftSin[base + n]; }
        power[k] = re * re + im * im;
      }
      for (m = 0; m < N_MELS; m++) {
        var b = bank[m], acc = 0;
        for (j = b.first; j <= b.last; j++) acc += b.w[j] * power[j];
        var lg = Math.log10(Math.max(acc, 1e-10));
        logs[m * live + t] = lg;
        if (lg > maxLog) maxLog = lg;
      }
    }
    // Frames past the audio are pure zero padding: power 0 → log10(1e-10) = -10.
    var pad = -10;
    if (pad > maxLog) maxLog = pad;
    var floor = maxLog - 8;
    for (m = 0; m < N_MELS; m++) {
      var rowOff = m * N_FRAMES;
      for (t = 0; t < live; t++) out[rowOff + t] = (Math.max(logs[m * live + t], floor) + 4) / 4;
      var padV = (Math.max(pad, floor) + 4) / 4;
      for (t = live; t < N_FRAMES; t++) out[rowOff + t] = padV;
    }
    return { data: out, frames: live };
  }

  // ---- byte-level BPE (GPT-2 style; Whisper's multilingual vocab) ---------------
  function bytesToUnicode() {
    var bs = [], i;
    for (i = 33; i <= 126; i++) bs.push(i);
    for (i = 161; i <= 172; i++) bs.push(i);
    for (i = 174; i <= 255; i++) bs.push(i);
    var cs = bs.slice(), n = 0;
    for (i = 0; i < 256; i++) if (bs.indexOf(i) < 0) { bs.push(i); cs.push(256 + n); n++; }
    var b2u = {}, u2b = {};
    for (i = 0; i < bs.length; i++) { var ch = String.fromCharCode(cs[i]); b2u[bs[i]] = ch; u2b[ch] = bs[i]; }
    return { b2u: b2u, u2b: u2b };
  }
  function Tokenizer(vocab, mergesText) {
    var maps = bytesToUnicode();
    this.b2u = maps.b2u; this.u2b = maps.u2b;
    this.vocab = vocab; // token -> id
    this.inv = new Array(Object.keys(vocab).length);
    for (var tok in vocab) this.inv[vocab[tok]] = tok;
    this.ranks = {};
    var lines = String(mergesText || '').split('\n'), r = 0;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i]; if (!ln || ln.charAt(0) === '#') continue;
      this.ranks[ln] = r++;
    }
    this.cache = {};
  }
  Tokenizer.prototype.decode = function (ids) {
    var bytes = [], i, j;
    for (i = 0; i < ids.length; i++) {
      var id = ids[i]; if (id >= EOT) continue; // special tokens never print
      var tok = this.inv[id]; if (tok == null) continue;
      for (j = 0; j < tok.length; j++) { var b = this.u2b[tok.charAt(j)]; if (b != null) bytes.push(b); }
    }
    var u8 = new Uint8Array(bytes);
    try { return new TextDecoder('utf-8').decode(u8); } catch (e) { return ''; }
  };
  var PRE_RE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;
  Tokenizer.prototype.bpe = function (word) {
    if (this.cache[word]) return this.cache[word];
    var parts = Array.from(word);
    if (parts.length < 2) { this.cache[word] = parts; return parts; }
    for (;;) {
      var best = null, bestRank = Infinity, bi = -1;
      for (var i = 0; i < parts.length - 1; i++) {
        var key = parts[i] + ' ' + parts[i + 1], rk = this.ranks[key];
        if (rk != null && rk < bestRank) { bestRank = rk; best = key; bi = i; }
      }
      if (best == null) break;
      var merged = [];
      for (var k = 0; k < parts.length; k++) {
        if (k === bi) { merged.push(parts[k] + parts[k + 1]); k++; } else merged.push(parts[k]);
      }
      parts = merged;
      if (parts.length < 2) break;
    }
    this.cache[word] = parts;
    return parts;
  };
  Tokenizer.prototype.encode = function (text) {
    var ids = [], self = this;
    var pieces = String(text || '').match(PRE_RE) || [];
    for (var p = 0; p < pieces.length; p++) {
      var u8 = new TextEncoder().encode(pieces[p]), s = '';
      for (var i = 0; i < u8.length; i++) s += this.b2u[u8[i]];
      var parts = this.bpe(s);
      for (var j = 0; j < parts.length; j++) { var id = self.vocab[parts[j]]; if (id != null) ids.push(id); }
    }
    return ids;
  };

  // ---- the model --------------------------------------------------------------
  function tensorEmpty(t) { var d = t.dims || []; for (var i = 0; i < d.length; i++) if (d[i] === 0) return true; return !d.length; }
  function argmaxRow(data, off, n, skip) {
    var best = -1, bv = -Infinity;
    for (var i = 0; i < n; i++) { if (skip && skip[i]) continue; var v = data[off + i]; if (v > bv) { bv = v; best = i; } }
    return best;
  }
  /**
   * new WhisperModel(ort, encoderSession, decoderSession, tokenizer)
   * .transcribe(audioF32, { language, task, prompt, onToken, maxTokens })
   *   -> { text, language, tokens, ms }
   */
  function WhisperModel(ort, enc, dec, tokenizer, opts) {
    opts = opts || {};
    this.ort = ort; this.enc = enc; this.dec = dec; this.tok = tokenizer;
    var pasts = dec.inputNames.filter(function (n) { return n.indexOf('past_key_values.') === 0; });
    this.layers = 0;
    pasts.forEach(function (n) { var L = parseInt(n.split('.')[1], 10); if (L + 1 > this.layers) this.layers = L + 1; }, this);
    this.hasCacheBranch = dec.inputNames.indexOf('use_cache_branch') >= 0;
    // The decoder's attention geometry (tiny 6x64, base 8x64, small 12x64):
    // the empty first-pass cache must be shaped for it, and ORT exposes no
    // input metadata to read it from — so the caller says (config.json).
    this.heads = opts.heads || null; this.headDim = opts.headDim || 64;
    this.vocab = null;
    this.suppress = new Uint8Array(51865); for (var i = 0; i < SUPPRESS.length; i++) this.suppress[SUPPRESS[i]] = 1;
    this.beginSuppress = new Uint8Array(51865); for (var j = 0; j < SUPPRESS.length; j++) this.beginSuppress[SUPPRESS[j]] = 1;
    for (var k = 0; k < BEGIN_SUPPRESS.length; k++) this.beginSuppress[BEGIN_SUPPRESS[k]] = 1;
  }
  WhisperModel.prototype.encode = function (audio) {
    var ort = this.ort;
    var mel = logMel(audio);
    var feeds = { input_features: new ort.Tensor('float32', mel.data, [1, N_MELS, N_FRAMES]) };
    return this.enc.run(feeds).then(function (res) { return { hidden: res.last_hidden_state, frames: mel.frames }; });
  };
  WhisperModel.prototype.emptyPast = function () {
    var ort = this.ort, heads = this.heads || 6, hd = this.headDim || 64, feeds = {};
    for (var L = 0; L < this.layers; L++) {
      ['decoder.key', 'decoder.value', 'encoder.key', 'encoder.value'].forEach(function (s) {
        feeds['past_key_values.' + L + '.' + s] = new ort.Tensor('float32', new Float32Array(0), [1, heads, 0, hd]);
      });
    }
    return feeds;
  };
  // One decoder pass. `ids` are the new tokens; `past` is null (fresh) or the
  // presents of the previous pass. Resolves { logits: Float32Array (last
  // position), presents }.
  WhisperModel.prototype.step = function (ids, hidden, past) {
    var ort = this.ort, self = this;
    var feeds = past ? {} : this.emptyPast();
    feeds.input_ids = new ort.Tensor('int64', BigInt64Array.from(ids.map(function (n) { return BigInt(n); })), [1, ids.length]);
    feeds.encoder_hidden_states = hidden;
    if (past) for (var k in past) feeds[k.replace('present.', 'past_key_values.')] = past[k];
    if (this.hasCacheBranch) feeds.use_cache_branch = new ort.Tensor('bool', new Uint8Array([past ? 1 : 0]), [1]);
    return this.dec.run(feeds).then(function (res) {
      var logits = res.logits, dims = logits.dims, V = dims[2], T = dims[1];
      self.vocab = V;
      var last = logits.data.subarray((T - 1) * V, T * V);
      var presents = {};
      for (var name in res) {
        if (name.indexOf('present.') !== 0) continue;
        presents[name] = res[name];
        if (self.heads == null && res[name].dims.length === 4) { self.heads = res[name].dims[1]; self.headDim = res[name].dims[3]; }
      }
      // With the cache branch the encoder presents come back as the pasts we
      // fed (possibly empty on a fresh pass, where the no-cache branch fills them).
      // With the cache branch the model does not recompute the cross-attention
      // keys: present.*.encoder.* come back EMPTY (a zero-sized tensor, [0,h,1,d]
      // from optimum's export) and the ones from the first pass must carry on.
      if (past) for (var p in past) if (p.indexOf('.encoder.') > 0 && (!presents[p] || tensorEmpty(presents[p]))) presents[p] = past[p];
      return { logits: last, presents: presents };
    });
  };
  WhisperModel.prototype.detectLanguage = function (hidden) {
    var self = this;
    return this.step([SOT], hidden, null).then(function (r) {
      var best = -1, bv = -Infinity, lg = r.logits;
      for (var t = LANG_FIRST; t <= LANG_LAST; t++) if (lg[t] > bv) { bv = lg[t]; best = t; }
      return { token: best, code: LANGS[best - LANG_FIRST] || 'en' };
    });
  };
  WhisperModel.prototype.transcribe = function (audio, opts) {
    opts = opts || {};
    var self = this, t0 = Date.now();
    var task = opts.task === 'translate' ? TRANSLATE : TRANSCRIBE;
    var maxTokens = Math.min(opts.maxTokens || 224, MAX_LEN - 8);
    var langToken = null, langCode = null;
    if (opts.language && opts.language !== 'auto') {
      var li = LANGS.indexOf(String(opts.language).toLowerCase().slice(0, 2) === 'ha' && opts.language.length > 2 ? opts.language : String(opts.language).toLowerCase().split('-')[0]);
      if (li >= 0) { langToken = LANG_FIRST + li; langCode = LANGS[li]; }
    }
    return this.encode(audio).then(function (e) {
      var hidden = e.hidden;
      var pickLang = langToken != null ? Promise.resolve({ token: langToken, code: langCode })
        : self.detectLanguage(hidden);
      return pickLang.then(function (lang) {
        var prefix = [];
        if (opts.prompt) {
          var pt = self.tok.encode(' ' + String(opts.prompt).trim()).slice(-(MAX_LEN / 2 - 1));
          if (pt.length) prefix = [SOP].concat(pt);
        }
        var start = prefix.concat([SOT, lang.token, task, NO_TS]);
        var out = [], past = null, ids = start, text = '';
        var loop = function () {
          return self.step(ids, hidden, past).then(function (r) {
            past = r.presents;
            var skip = out.length === 0 ? self.beginSuppress : self.suppress;
            var next = argmaxRow(r.logits, 0, self.vocab, skip);
            if (next === EOT || next < 0) return;
            out.push(next);
            if (opts.onToken) { var partial = self.tok.decode(out); if (partial !== text) { text = partial; try { opts.onToken(text); } catch (e) {} } }
            if (out.length >= maxTokens) return;
            if (loopy(out)) { out.length = Math.max(0, out.length - 8); return; }
            ids = [next];
            return loop();
          });
        };
        return loop().then(function () {
          return { text: self.tok.decode(out).trim(), language: lang.code, tokens: out, ms: Date.now() - t0, frames: e.frames };
        });
      });
    });
  };
  // Whisper's failure mode on noise is a stuck loop ("the the the", or a
  // sentence repeated forever). Stop when the last 4-gram already appeared
  // twice before in the last 48 tokens.
  function loopy(out) {
    var n = out.length; if (n < 16) return false;
    var tail = out.slice(n - 4).join(','), count = 0;
    for (var i = Math.max(0, n - 48); i <= n - 8; i++) if (out.slice(i, i + 4).join(',') === tail) count++;
    return count >= 2;
  }

  // ---- helpers for callers ------------------------------------------------------
  // Mix to mono and resample to 16 kHz with linear interpolation — fine for
  // speech out of a browser decoder that already resampled once.
  function toMono16k(channels, sampleRate) {
    var n = channels[0].length, c, i, mono = new Float32Array(n);
    for (c = 0; c < channels.length; c++) for (i = 0; i < n; i++) mono[i] += channels[c][i] / channels.length;
    if (sampleRate === SR) return mono;
    var ratio = sampleRate / SR, outLen = Math.floor(n / ratio), out = new Float32Array(outLen);
    for (i = 0; i < outLen; i++) {
      var pos = i * ratio, i0 = Math.floor(pos), i1 = Math.min(n - 1, i0 + 1), fr = pos - i0;
      out[i] = mono[i0] * (1 - fr) + mono[i1] * fr;
    }
    return out;
  }
  function rms(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, a.length)); }

  return { SR: SR, LANGS: LANGS, logMel: logMel, Tokenizer: Tokenizer, WhisperModel: WhisperModel, toMono16k: toMono16k, rms: rms,
    tokens: { SOT: SOT, EOT: EOT, NO_TS: NO_TS, SOP: SOP, TRANSCRIBE: TRANSCRIBE, TRANSLATE: TRANSLATE } };
});
