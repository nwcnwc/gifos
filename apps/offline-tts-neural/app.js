/*
 * Offline Neural Text to Speech — the driver. Serves the computer's
 * **Text → speech** AI role via gifos.provider.serve (docs/providers.md).
 *
 * This is the SECOND tts provider, not a replacement for the first. Offline
 * Text to Speech (eSpeak) stays the tiny, instant, zero-download option; this
 * one sounds like a person and costs a 24 MB download and a slower start. The
 * user keeps both and picks in Settings → AI models.
 *
 * What rides where (docs/tts-neural.md, docs/providers.md):
 *   IN THE GIF   onnxruntime-web's WASM build (MIT), the espeak-ng phonemizer
 *                (phonemizer.js), the 8 style tables, the token vocabulary,
 *                and a ~1.6 KB self-test model.
 *   BY ASSET PIN kitten_tts_nano_v0_8.onnx (24 MB, Apache-2.0), hash-pinned in
 *                the manifest and cached by the OS in the computer's asset
 *                store. Read with gifos.assets() — this app never has, and
 *                never needs, a network path.
 *
 * The pipeline, which is the reference implementation's, checked against it:
 *   text -> espeak-ng IPA (punctuation preserved) -> token ids -> ONNX
 *   (input_ids, style, speed) -> waveform @ 24 kHz -> RIFF WAV.
 */
(function () {
  'use strict';

  var SR = 24000;              // the model's output rate
  var TAIL_TRIM = 5000;        // the reference trims this tail off every chunk
  var MAX_CHARS = 20000;       // same ceiling as the eSpeak provider
  var CHUNK_CHARS = 400;       // reference chunk_text(); also the style table's height

  // The eight voices, and their speed priors, from the model's own config.json.
  // Friendly names are the upstream aliases; the OpenAI names are mapped on top
  // so an app written against a cloud TTS just works when this answers instead.
  var VOICES = [
    { id: 'expr-voice-2-f', name: 'Bella', prior: 0.8 },
    { id: 'expr-voice-2-m', name: 'Jasper', prior: 0.8 },
    { id: 'expr-voice-3-f', name: 'Luna', prior: 0.8 },
    { id: 'expr-voice-3-m', name: 'Bruno', prior: 0.8 },
    { id: 'expr-voice-4-f', name: 'Rosie', prior: 0.8 },
    { id: 'expr-voice-4-m', name: 'Hugo', prior: 0.9 },
    { id: 'expr-voice-5-f', name: 'Kiki', prior: 0.8 },
    { id: 'expr-voice-5-m', name: 'Leo', prior: 0.8 }
  ];
  var DEFAULT_VOICE = 'expr-voice-5-m';
  // A RESERVED VOICE NAME, not a hidden flag. Asking for the voice "self-test"
  // runs the ~1.6 KB stand-in model that ships inside this GIF instead of the
  // 24 MB weights, so the engine can be proved end to end — by a person, or by
  // the gate — on a machine that has never downloaded them.
  //
  // It is a VOICE and not a `selftest: true` field because the OS forwards a
  // fixed whitelist to a provider (runtime.js providerReq: text, voice, format,
  // speed, pitch) and drops everything else. Widening that boundary so a test
  // could reach through it would be the wrong trade entirely; a named voice
  // rides the channel that already exists.
  var SELFTEST_VOICE = 'self-test';
  var OPENAI_MAP = {
    alloy: 'expr-voice-5-m', echo: 'expr-voice-3-m', fable: 'expr-voice-3-f',
    onyx: 'expr-voice-2-m', nova: 'expr-voice-4-f', shimmer: 'expr-voice-5-f',
    // eSpeak's provider accepts these too; keep the vocabulary identical so
    // swapping providers in Settings never changes what a voice name means.
    whisper: 'expr-voice-2-f'
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
  function priorOf(id) {
    for (var i = 0; i < VOICES.length; i++) if (VOICES[i].id === id) return VOICES[i].prior;
    return 1;
  }

  function b64ToU8(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ---- phonemes -------------------------------------------------------------
  // espeak-ng emits IPA but DROPS punctuation, while the model's vocabulary
  // contains the marks and its prosody was trained with them — the reference
  // gets them back via phonemizer(preserve_punctuation=True), which is wrapper
  // behaviour and not an espeak flag. Same algorithm here: split the text
  // around the marks, phonemize the spans, put the marks back.
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
  // The reference splits the phoneme string into words/marks and rejoins them
  // space-separated before mapping characters to ids, which puts a space either
  // side of every mark. Characters outside the vocabulary are DROPPED, exactly
  // as TextCleaner does. 0 brackets the sequence.
  var VOCAB = null;
  function tokenize(phonemes) {
    var words = phonemes.match(/[\p{L}\p{M}\p{S}\p{N}_]+|[^\p{L}\p{M}\p{S}\p{N}\s_]/gu) || [];
    var joined = words.join(' ');
    var ids = [0];
    for (var i = 0; i < joined.length; i++) {
      var v = VOCAB[joined[i]];
      if (v !== undefined) ids.push(v);
    }
    ids.push(0);
    return ids;
  }

  // ---- chunking -------------------------------------------------------------
  // The reference splits on sentence enders and caps each chunk, then makes
  // sure every chunk ends in punctuation (a bare fragment reads flat).
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
  var enginePromise = null;
  var loadedKind = null;                       // 'kitten' | 'selftest'

  function styleRow(voiceId, row) {
    var vi = VOICE_INDEX.voices.indexOf(voiceId);
    if (vi < 0) vi = VOICE_INDEX.voices.indexOf(DEFAULT_VOICE);
    var cols = VOICE_INDEX.cols;
    var off = (vi * VOICE_INDEX.rows + row) * cols;
    return VOICE_DATA.subarray(off, off + cols);
  }

  // beat() is the heartbeat AND the only thing standing between a slow answer
  // and the OS's idle timeout (docs/providers.md): the clock is re-armed by
  // every ctx.progress, so silence means wedged, not busy.
  function makeBeat(ctx) {
    return function (note, frac) {
      if (ctx && typeof ctx.progress === 'function') {
        try { ctx.progress(note, frac); } catch (e) { /* the OS went away */ }
      }
    };
  }

  function ensureEngine(beat, wantSelftest) {
    // A self-test boot and a real boot are different sessions; never hand back
    // a tone because a previous call happened to warm the stand-in.
    if (enginePromise && (loadedKind === 'kitten' || wantSelftest)) return enginePromise;
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

      // Hand ORT the wasm BYTES rather than a path: the sandbox has no network
      // and nothing to fetch from. Single-threaded and un-proxied on purpose —
      // threads need cross-origin isolation this opaque origin will never have,
      // and the int8 graph is a CPU/WASM one by construction anyway
      // (MatMulInteger/DynamicQuantizeLSTM have no WebGPU kernels).
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
        beat('Loading the voice (24 MB, once per computer)…');
        getModel = gifos.assets('kitten.onnx').then(function (buf) {
          return { bytes: new Uint8Array(buf), kind: 'kitten' };
        }, function () {
          // FAIL, never fall back to the tone. A consumer app handed a beep
          // instead of speech has no way to tell the difference, and the user
          // would hear a defect rather than a fixable message.
          throw new Error('The voice weights are not on this device yet. Open the app once (or reinstall it from the App Store) to download the 24 MB voice, then try again.');
        });
      } else {
        throw new Error('This app needs to run inside GifOS to reach its voice weights.');
      }
      return getModel.then(function (m) {
        beat('Starting the voice…');
        return window.ort.InferenceSession.create(m.bytes, { executionProviders: ['wasm'] })
          .then(function (sess) { loadedKind = m.kind; return sess; });
      });
    });
    enginePromise.catch(function () { enginePromise = null; loadedKind = null; }); // retryable
    return enginePromise;
  }

  // ---- synthesis ------------------------------------------------------------
  function synthChunk(sess, chunk, voiceId, speed) {
    return phonemizeText(chunk).then(function (ipa) {
      var ids = tokenize(ipa);
      if (ids.length <= 2) return new Float32Array(0);   // nothing pronounceable
      var row = Math.min(chunk.length, VOICE_INDEX.rows - 1);
      var feeds = {
        input_ids: new window.ort.Tensor('int64', BigInt64Array.from(ids.map(function (n) { return BigInt(n); })), [1, ids.length]),
        style: new window.ort.Tensor('float32', Float32Array.from(styleRow(voiceId, row)), [1, VOICE_INDEX.cols]),
        speed: new window.ort.Tensor('float32', Float32Array.from([speed]), [1])
      };
      return sess.run(feeds).then(function (res) {
        var out = res[sess.outputNames[0]];
        var a = out.data;
        var keep = Math.max(0, a.length - TAIL_TRIM);
        return a.subarray(0, keep);
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

  function ttsHandler(req, ctx) {
    req = req || {};
    var beat = makeBeat(ctx);
    var text = String(req.text || '').slice(0, MAX_CHARS);
    if (!text.trim()) return Promise.reject(new Error('Nothing to say — empty text.'));
    var asked = String(req.voice || '').trim().toLowerCase();
    var selftest = req.selftest === true || asked === SELFTEST_VOICE || asked === 'selftest';
    var voiceId = resolveVoice(selftest ? DEFAULT_VOICE : req.voice);
    var mult = Number(req.speed);
    var speed = (mult >= 0.25 && mult <= 4 ? mult : 1) * priorOf(voiceId);

    // A long load and a long synthesis both look like nothing happening, so the
    // beat runs on a timer as well as at each step — a single chunk of a long
    // sentence can outlast the idle window on a phone all by itself.
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

  // Serve the role. In a normal (visible) mount this registration is inert —
  // requests only arrive when the OS mounts us as a hidden provider service.
  if (window.gifos && gifos.provider && gifos.provider.serve) {
    gifos.provider.serve({ tts: ttsHandler });
  }

  // ---- the visible page: explainer + Try box --------------------------------
  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m) { var el = $('status'); if (el) el.textContent = m || ''; }
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
    var speak = function (selftest) {
      $('speak').disabled = true; $('selftest').disabled = true;
      setStatus(selftest ? 'Running the self-test…' : 'Warming up…');
      var t0 = Date.now();
      ttsHandler({ text: $('text').value, voice: sel ? sel.value : '', selftest: selftest },
        { progress: function (note) { if (note) setStatus(note); } })
        .then(function (r) {
          var secs = (r.bytes.byteLength - 44) / 2 / SR;
          var url = URL.createObjectURL(new Blob([r.bytes], { type: r.mime }));
          var audio = new Audio(url);
          audio.onended = function () { URL.revokeObjectURL(url); };
          setStatus((selftest ? 'Self-test tone — NOT the voice. ' : 'Spoken on this device — ')
            + secs.toFixed(1) + 's of audio in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, zero network.');
          return audio.play();
        })
        .catch(function (e) { setStatus('⚠ ' + (e && e.message || e)); })
        .then(function () { $('speak').disabled = false; $('selftest').disabled = false; });
    };
    $('speak').onclick = function () { speak(false); };
    $('selftest').onclick = function () { speak(true); };
  }
})();
