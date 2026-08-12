/*
 * Offline Neural TTS (Kokoro) — the driver. Serves the computer's
 * **Text → speech** AI role via gifos.provider.serve (docs/providers.md).
 *
 * The GPU sibling of apps/offline-tts-neural (KittenTTS). Same pipeline, same
 * ONNX Runtime Web engine — but Kokoro-82M is an fp16 transformer whose ops
 * DO have WebGPU kernels, so this one declares capabilities.gpu and runs on the
 * device's GPU when there is one, falling back to CPU/WASM where there isn't.
 * KittenTTS stays the tiny, instant, always-CPU option; the user picks one in
 * Settings → AI models.
 *
 * What rides where (docs/providers.md):
 *   IN THE GIF   onnxruntime-web (MIT) — the WebGPU-capable JSEP build — the
 *                espeak-ng phonemizer (phonemizer.js), 8 style tables, the
 *                token vocabulary, and a ~1.6 KB self-test model.
 *   BY ASSET PIN model_fp16.onnx (163 MB, Apache-2.0), hash-pinned in the
 *                manifest and cached by the OS. Read with gifos.assets() — this
 *                app has, and needs, no network path.
 *
 * Pipeline (kokoro-onnx's, replicated char-for-char against its tokenizer):
 *   text -> espeak-ng IPA (punctuation + stress preserved) -> token ids ->
 *   ONNX (input_ids, style[len], speed) -> waveform @ 24 kHz -> RIFF WAV.
 */
(function () {
  'use strict';

  var SR = 24000;              // Kokoro's output rate
  var MAX_CHARS = 20000;       // ceiling on one request
  var CHUNK_CHARS = 400;       // split long text into speakable passages
  var MAX_PHON = 510;          // MAX_PHONEME_LENGTH — the model's context

  // Eight Kokoro voices, a balanced English set. Friendly names on top of the
  // upstream ids; OpenAI names mapped so an app written for a cloud voice works.
  var VOICES = [
    { id: 'af_heart', name: 'Heart' },
    { id: 'af_bella', name: 'Bella' },
    { id: 'af_nicole', name: 'Nicole' },
    { id: 'af_sarah', name: 'Sarah' },
    { id: 'am_michael', name: 'Michael' },
    { id: 'am_fenrir', name: 'Fenrir' },
    { id: 'bf_emma', name: 'Emma' },
    { id: 'bm_george', name: 'George' }
  ];
  var DEFAULT_VOICE = 'af_heart';
  // A RESERVED VOICE NAME (see the sibling): asking for "self-test" runs the
  // ~1.6 KB stand-in that ships in this GIF instead of the 163 MB weights, so
  // the pipeline can be proved end to end — by a person or the gate — on a
  // machine that has never downloaded them.
  var SELFTEST_VOICE = 'self-test';
  var OPENAI_MAP = {
    alloy: 'af_heart', nova: 'af_bella', shimmer: 'af_nicole', fable: 'bf_emma',
    echo: 'am_michael', onyx: 'am_fenrir', ash: 'am_fenrir'
  };
  function resolveVoice(want) {
    var w = String(want || '').trim();
    if (!w) return DEFAULT_VOICE;
    var lower = w.toLowerCase();
    for (var i = 0; i < VOICES.length; i++) {
      if (VOICES[i].id === lower) return VOICES[i].id;
      if (VOICES[i].name.toLowerCase() === lower) return VOICES[i].id;
    }
    if (OPENAI_MAP[lower]) return OPENAI_MAP[lower];
    return DEFAULT_VOICE;    // unknown names fall through rather than failing
  }

  function b64ToU8(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ---- phonemes -------------------------------------------------------------
  // The JS espeak wrapper drops punctuation, but Kokoro's vocab CONTAINS the
  // marks and its prosody was trained with them (the reference asks espeak for
  // preserve_punctuation=True). Same fix as the sibling: split around the marks,
  // phonemize the spans, put the marks back. Stress marks (ˈˌ) come through from
  // espeak's IPA and are in the vocab, so with_stress needs no special handling.
  var MARKS = ';:,.!?¡¿—…"«»“”';
  function escapeClass(s) { return s.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&'); }
  var SPLIT_RE = new RegExp('([' + escapeClass(MARKS) + '])', 'g');
  var MARK_RE = new RegExp('^[' + escapeClass(MARKS) + ']$');

  function phonemizeText(text) {
    var parts = String(text).split(SPLIT_RE);
    var out = '';
    var chain = Promise.resolve();
    parts.forEach(function (part) {
      chain = chain.then(function () {
        if (!part) return null;
        if (MARK_RE.test(part)) { out += part; return null; }
        if (!part.trim()) { out += ' '; return null; }
        return window.Phonemizer.phonemize(part, 'en-us').then(function (r) {
          var s = (Array.isArray(r) ? r.join(' ') : String(r || '')).replace(/\s+/g, ' ').trim();
          if (s) out += (out && !/\s$/.test(out) ? ' ' : '') + s;
        });
      });
    });
    return chain.then(function () { return out.replace(/\s+/g, ' ').trim(); });
  }

  // ---- tokens ---------------------------------------------------------------
  // kokoro_onnx.Tokenizer.tokenize is a plain char→id map that DROPS anything
  // outside the vocab and keeps spaces (id 16) — no word-splitting. The pad 0
  // brackets and the length cap live in synthChunk, matching create().
  var VOCAB = null;
  function tokenize(phonemes) {
    var ids = [];
    for (var i = 0; i < phonemes.length && ids.length < MAX_PHON; i++) {
      var v = VOCAB[phonemes.charAt(i)];
      if (v !== undefined) ids.push(v);
    }
    return ids;   // real tokens, no pads
  }

  // ---- chunking -------------------------------------------------------------
  function ensurePunctuation(s) {
    s = s.trim();
    if (!s) return s;
    return '.!?,;:'.indexOf(s.charAt(s.length - 1)) === -1 ? s + ',' : s;
  }
  function chunkText(text) {
    var chunks = [];
    var sentences = String(text).split(/[.!?]+/);
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;
      if (s.length <= CHUNK_CHARS) { chunks.push(ensurePunctuation(s)); continue; }
      var words = s.split(/\s+/), cur = '';
      for (var w = 0; w < words.length; w++) {
        if (cur.length + words[w].length + 1 <= CHUNK_CHARS) cur += (cur ? ' ' : '') + words[w];
        else { if (cur) chunks.push(ensurePunctuation(cur)); cur = words[w]; }
      }
      if (cur) chunks.push(ensurePunctuation(cur));
    }
    return chunks;
  }

  // ---- the engine -----------------------------------------------------------
  var VOICE_INDEX = null, VOICE_DATA = null;   // Float32Array, [voice][row][256]
  var INPUT_NAME = 'input_ids';                // resolved from the session
  var USED_EP = null;                          // 'webgpu' | 'wasm' — what ran
  var enginePromise = null;
  var loadedKind = null, wantedKind = null;

  function styleRow(voiceId, row) {
    var vi = VOICE_INDEX.voices.indexOf(voiceId);
    if (vi < 0) vi = VOICE_INDEX.voices.indexOf(DEFAULT_VOICE);
    var cols = VOICE_INDEX.cols;
    var off = (vi * VOICE_INDEX.rows + row) * cols;
    return VOICE_DATA.subarray(off, off + cols);
  }

  function makeBeat(ctx) {
    return function (note, frac) {
      if (ctx && typeof ctx.progress === 'function') {
        try { ctx.progress(note, frac); } catch (e) { /* the OS went away */ }
      }
    };
  }

  // Prefer WebGPU, fall back to CPU/WASM. ORT-web does not auto-fall-back
  // between EPs when the first fails to INITIALISE, so we probe for an adapter
  // ourselves and retry pure-wasm if the GPU session throws. USED_EP records
  // which one actually ran, so the page (and logs) can say so honestly.
  function createSession(bytes, beat) {
    var haveGpu = Promise.resolve(false);
    try {
      if (navigator.gpu && navigator.gpu.requestAdapter) {
        haveGpu = navigator.gpu.requestAdapter().then(function (a) { return !!a; }, function () { return false; });
      }
    } catch (e) { /* no navigator.gpu */ }
    return haveGpu.then(function (gpu) {
      var eps = gpu ? ['webgpu', 'wasm'] : ['wasm'];
      beat(gpu ? 'Starting the voice on your GPU…' : 'Starting the voice on the CPU…');
      return window.ort.InferenceSession.create(bytes, { executionProviders: eps }).then(
        function (sess) { USED_EP = eps[0]; return sess; },
        function (err) {
          if (eps[0] !== 'webgpu') throw err;
          // GPU init refused (blocklisted driver, no adapter after all) — CPU it is.
          beat('GPU was unavailable — starting on the CPU…');
          return window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] })
            .then(function (sess) { USED_EP = 'wasm'; return sess; });
        }
      );
    });
  }

  function ensureEngine(beat, wantSelftest) {
    var want = wantSelftest ? 'selftest' : 'kokoro';
    if (enginePromise && wantedKind === want) return enginePromise;
    wantedKind = want;
    enginePromise = Promise.resolve().then(function () {
      if (!window.ort) throw new Error('The inference engine failed to load.');
      if (!window.Phonemizer) throw new Error('The pronunciation engine failed to load.');
      if (!window.TTS_ORT_WASM_B64) throw new Error('The engine wasm failed to load.');
      if (!window.TTS_VOICES_B64 || !window.TTS_VOICE_INDEX_JSON || !window.TTS_VOCAB_JSON) {
        throw new Error('The voice data failed to load.');
      }
      VOCAB = JSON.parse(window.TTS_VOCAB_JSON).map;
      VOICE_INDEX = JSON.parse(window.TTS_VOICE_INDEX_JSON);
      var vb = b64ToU8(window.TTS_VOICES_B64);
      VOICE_DATA = new Float32Array(vb.buffer, vb.byteOffset, vb.byteLength / 4);

      // The engine reaches the sandbox as bytes — no network to fetch a .wasm
      // from. This is the WebGPU-capable JSEP build; single-threaded because
      // threads need a cross-origin isolation an opaque origin never has, but
      // the GPU work does not run on the wasm threads anyway.
      var wasm = b64ToU8(window.TTS_ORT_WASM_B64);
      window.ort.env.wasm.wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
      window.ort.env.wasm.numThreads = 1;
      window.ort.env.wasm.proxy = false;
      window.ort.env.logLevel = 'error';

      beat('Warming up the voice engine…');
      var getModel;
      if (wantSelftest) {
        getModel = Promise.resolve({ bytes: b64ToU8(window.TTS_SELFTEST_B64), kind: 'selftest' });
      } else if (window.gifos && gifos.assets) {
        beat('Loading the voice (163 MB, once per computer)…');
        getModel = gifos.assets('kokoro.onnx').then(function (buf) {
          return { bytes: new Uint8Array(buf), kind: 'kokoro' };
        }, function () {
          throw new Error('The voice weights are not on this device yet. Open the app once (or reinstall it from the App Store) to download the 163 MB voice, then try again.');
        });
      } else {
        throw new Error('This app needs to run inside GifOS to reach its voice weights.');
      }
      return getModel.then(function (m) {
        return createSession(m.bytes, beat).then(function (sess) {
          loadedKind = m.kind;
          var names = sess.inputNames || [];
          INPUT_NAME = names.indexOf('input_ids') >= 0 ? 'input_ids'
            : (names.indexOf('tokens') >= 0 ? 'tokens' : 'input_ids');
          return sess;
        });
      });
    });
    enginePromise.catch(function () { enginePromise = null; loadedKind = null; wantedKind = null; USED_EP = null; });
    return enginePromise;
  }

  // ---- synthesis ------------------------------------------------------------
  function synthChunk(sess, chunk, voiceId, speed) {
    return phonemizeText(chunk).then(function (ipa) {
      var ids = tokenize(ipa);
      if (!ids.length) return new Float32Array(0);   // nothing pronounceable
      var row = Math.min(ids.length, VOICE_INDEX.rows - 1);  // style by TOKEN count
      var input = [0].concat(ids).concat([0]);               // pad-0 brackets
      var feeds = {};
      feeds[INPUT_NAME] = new window.ort.Tensor('int64', BigInt64Array.from(input.map(function (n) { return BigInt(n); })), [1, input.length]);
      feeds.style = new window.ort.Tensor('float32', Float32Array.from(styleRow(voiceId, row)), [1, VOICE_INDEX.cols]);
      feeds.speed = new window.ort.Tensor('float32', Float32Array.from([speed]), [1]);
      return sess.run(feeds).then(function (res) {
        return res[sess.outputNames[0]].data;   // [1, num_samples] flattens to num_samples
      });
    });
  }

  function toWav(chunks) {
    var total = 0, i;
    for (i = 0; i < chunks.length; i++) total += chunks[i].length;
    var buf = new ArrayBuffer(44 + total * 2);
    var dv = new DataView(buf);
    var ascii = function (off, s) { for (var k = 0; k < s.length; k++) dv.setUint8(off + k, s.charCodeAt(k)); };
    ascii(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); ascii(8, 'WAVE');
    ascii(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ascii(36, 'data'); dv.setUint32(40, total * 2, true);
    var p = 44;
    for (i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      for (var j = 0; j < c.length; j++) {
        var v = Math.max(-1, Math.min(1, c[j]));
        dv.setInt16(p, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        p += 2;
      }
    }
    return buf;
  }

  function clampSpeed(v) { var n = Number(v); return (n >= 0.5 && n <= 2) ? n : 1; }

  function ttsHandler(req, ctx) {
    req = req || {};
    var beat = makeBeat(ctx);
    var text = String(req.text || '').slice(0, MAX_CHARS);
    if (!text.trim()) return Promise.reject(new Error('Nothing to say — empty text.'));
    var asked = String(req.voice || '').trim().toLowerCase();
    var selftest = asked === SELFTEST_VOICE || asked === 'selftest';
    var voiceId = resolveVoice(selftest ? DEFAULT_VOICE : req.voice);
    var speed = clampSpeed(req.speed);

    var alive = ctx && typeof ctx.progress === 'function'
      ? setInterval(function () { beat(); }, 5000) : null;
    var stop = function () { if (alive) clearInterval(alive); };

    return ensureEngine(beat, selftest).then(function (sess) {
      var chunks = chunkText(text);
      if (!chunks.length) chunks = [ensurePunctuation(text)];
      var audio = [];
      var run = function (i) {
        if (i >= chunks.length) return Promise.resolve();
        beat(selftest ? 'Self-test tone (the real voice is not loaded)…'
          : 'Speaking… (' + (i + 1) + ' of ' + chunks.length + ')', chunks.length > 1 ? i / chunks.length : undefined);
        return synthChunk(sess, chunks[i], voiceId, speed).then(function (a) {
          if (a.length) audio.push(a);
          return run(i + 1);
        });
      };
      return run(0).then(function () {
        if (!audio.length) throw new Error('Nothing pronounceable in that text.');
        beat('Finishing…', 1);
        return { bytes: toWav(audio), mime: 'audio/wav' };
      });
    }).then(function (r) { stop(); return r; }, function (e) { stop(); throw e; });
  }

  if (window.gifos && gifos.provider && gifos.provider.serve) {
    gifos.provider.serve({ tts: ttsHandler });
  }

  // ---- the visible page: explainer + Try box --------------------------------
  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m) { var el = $('status'); if (el) el.textContent = m || ''; }
  function epLabel() { return USED_EP === 'webgpu' ? 'your GPU' : 'the CPU'; }
  if ($('speak')) {
    var sel = $('voice');
    if (sel) {
      VOICES.forEach(function (v) {
        var o = document.createElement('option');
        o.value = v.id; o.textContent = v.name;
        if (v.id === DEFAULT_VOICE) o.selected = true;
        sel.appendChild(o);
      });
    }
    var playWav = function (buf) {
      return new Promise(function (res) {
        var url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
        var a = new Audio(url);
        var done = function () { URL.revokeObjectURL(url); res(); };
        a.onended = done; a.onerror = done;
        a.play().then(null, done);
      });
    };
    var speak = function () {
      $('speak').disabled = true;
      setStatus('Warming up…');
      var t0 = Date.now(), firstAt = 0, totalAudio = 0;
      var text = String($('text').value || '');
      var voiceId = resolveVoice(sel ? sel.value : '');
      ensureEngine(function (n) { if (n) setStatus(n); }, false)
        .then(function (sess) {
          var chunks = chunkText(text);
          if (!chunks.length) chunks = [ensurePunctuation(text)];
          var playChain = Promise.resolve();
          var step = function (i) {
            if (i >= chunks.length) return playChain;
            setStatus('Speaking on ' + epLabel() + '… (' + (i + 1) + ' of ' + chunks.length + ')');
            return synthChunk(sess, chunks[i], voiceId, 1).then(function (a) {
              if (!a.length) return step(i + 1);
              totalAudio += a.length / SR;
              if (!firstAt) firstAt = (Date.now() - t0) / 1000;
              playChain = playChain.then(function () { return playWav(toWav([a])); });
              return step(i + 1);
            });
          };
          return step(0).then(function () {
            setStatus('Spoken on ' + epLabel() + ' — ' + totalAudio.toFixed(1)
              + 's of audio, first sound after ' + firstAt.toFixed(1)
              + 's, all of it made here, zero network.');
            return playChain;
          });
        })
        .catch(function (e) { setStatus('⚠ ' + (e && e.message || e)); })
        .then(function () { $('speak').disabled = false; });
    };
    $('speak').onclick = speak;
  }

  // ---- a link that asks this computer to say something ----------------------
  function speakFromLink(args) {
    if (!args || !args.say) return;
    var text = String(args.say);
    var voice = String(args.voice || '');
    var card = $('linkcard'), btn = $('linkplay');
    var say = function (m) { var el = $('linkstatus'); if (el) el.textContent = m || ''; };
    if (card) { card.hidden = false; $('linkmsg').textContent = '“' + text + '”'; }
    if ($('text')) $('text').value = text;
    if (voice && $('voice')) $('voice').value = voice;

    var play = null;
    say('Warming up the voice…');
    ttsHandler({ text: text, voice: voice }, { progress: function (note) { if (note) say(note); } })
      .then(function (r) {
        var url = URL.createObjectURL(new Blob([r.bytes], { type: r.mime }));
        var audio = new Audio(url);
        audio.onended = function () { URL.revokeObjectURL(url); };
        play = function () { return audio.play(); };
        say('Speaking — on ' + epLabel() + ', with nothing sent anywhere.');
        return audio.play();
      })
      .then(function () { if (btn) btn.hidden = true; })
      .catch(function (e) {
        if (!play) { say('⚠ ' + (e && e.message || e)); return; }
        if (btn) {
          btn.hidden = false;
          btn.onclick = function () { btn.hidden = true; say('Speaking…'); play(); };
        }
        say('Ready to speak — your browser wants one tap before it will make a sound.');
      });
  }
  if (window.gifos && gifos.launch) gifos.launch().then(speakFromLink, function () {});
})();
