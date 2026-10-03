/*
 * Offline Captions (Whisper) — the driver. Serves the computer's
 * **Speech → text** AI role via gifos.provider.serve (docs/providers.md).
 *
 * What rides where:
 *   IN THE GIF   onnxruntime-web (MIT, the JSEP build offline-tts-kokoro
 *                vendors), whisper-core.js (mel front end, tokenizer, decoding),
 *                the multilingual tokenizer tables.
 *   BY ASSET PIN the int8 ONNX exports, all OPTIONAL pins: tiny (41 MB) and
 *                base (77 MB). Read with gifos.assets() on first use — the OS
 *                downloads, verifies and caches; this app has no network path.
 *
 * Pipeline: audio bytes -> PCM 16 kHz mono (a raw-PCM fast path for the
 * meeting, decodeAudioData + an OfflineAudioContext resample for everything
 * else) -> whisper-core: log-mel -> encoder -> language detection (unless
 * told) -> greedy decode with the KV cache -> text.
 */
(function () {
  'use strict';

  var W = window.WhisperCore;
  var MAX_SECONDS = 30 * 20;     // ceiling on one request (ten minutes)
  var WINDOW = 30;               // Whisper's context, seconds
  var SILENCE_RMS = 0.0025;      // below this the model is not asked

  var MODELS = {
    tiny: { enc: 'whisper-tiny-encoder.onnx', dec: 'whisper-tiny-decoder.onnx', heads: 6, headDim: 64, mb: 41, label: 'tiny' },
    base: { enc: 'whisper-base-encoder.onnx', dec: 'whisper-base-decoder.onnx', heads: 8, headDim: 64, mb: 77, label: 'base' }
  };
  var IS_MOBILE = !!((navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent));
  function pickModel(want) {
    var w = String(want || '').toLowerCase();
    if (MODELS[w]) return w;
    return IS_MOBILE ? 'tiny' : 'base';
  }

  function b64ToU8(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function makeBeat(ctx) {
    return function (note, frac) {
      if (ctx && typeof ctx.progress === 'function') { try { ctx.progress(note, frac); } catch (e) { /* the OS went away */ } }
    };
  }

  // ---- the engine -----------------------------------------------------------
  var tokenizer = null, ortReady = false;
  var engines = {}; // model key -> Promise<WhisperModel>
  function ensureOrt() {
    if (ortReady) return;
    if (!window.ort) throw new Error('The inference engine failed to load.');
    if (!window.STT_ORT_WASM_B64) throw new Error('The engine wasm failed to load.');
    if (!window.STT_VOCAB_JSON || !window.STT_MERGES_TXT) throw new Error('The tokenizer tables failed to load.');
    var wasm = b64ToU8(window.STT_ORT_WASM_B64);
    window.ort.env.wasm.wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    window.ort.env.wasm.numThreads = 1;   // an opaque origin has no cross-origin isolation, so no threads
    window.ort.env.wasm.proxy = false;
    window.ort.env.logLevel = 'error';
    tokenizer = new W.Tokenizer(JSON.parse(window.STT_VOCAB_JSON), window.STT_MERGES_TXT);
    ortReady = true;
  }
  function ensureEngine(key, beat) {
    if (engines[key]) return engines[key];
    var m = MODELS[key];
    var p = Promise.resolve().then(function () {
      ensureOrt();
      if (!window.gifos || !gifos.assets) throw new Error('This app needs to run inside GifOS to reach its model files.');
      beat('Fetching the ' + m.label + ' model (' + m.mb + ' MB, once per computer)…');
      var miss = function (which) {
        return function () {
          throw new Error('The ' + m.label + ' model (' + which + ') is not on this device yet and could not be downloaded. Check the connection, then try again — it downloads once and stays.');
        };
      };
      return gifos.assets(m.enc).catch(miss('encoder')).then(function (encBuf) {
        beat('Fetching the ' + m.label + ' model (' + m.mb + ' MB, once per computer)… decoder');
        return gifos.assets(m.dec).catch(miss('decoder')).then(function (decBuf) {
          beat('Starting the ' + m.label + ' model on the CPU…');
          return window.ort.InferenceSession.create(new Uint8Array(encBuf), { executionProviders: ['wasm'] }).then(function (enc) {
            return window.ort.InferenceSession.create(new Uint8Array(decBuf), { executionProviders: ['wasm'] }).then(function (dec) {
              return new W.WhisperModel(window.ort, enc, dec, tokenizer, { heads: m.heads, headDim: m.headDim });
            });
          });
        });
      });
    });
    engines[key] = p;
    p.catch(function () { delete engines[key]; });
    return p;
  }

  // ---- audio in -------------------------------------------------------------
  function parseMime(mime) {
    var parts = String(mime || '').toLowerCase().split(';'), out = { type: parts[0].trim() };
    for (var i = 1; i < parts.length; i++) { var kv = parts[i].split('='); if (kv.length === 2) out[kv[0].trim()] = kv[1].trim(); }
    return out;
  }
  // -> Promise<Float32Array @ 16 kHz mono>
  function toPcm16k(bytes, mime) {
    var mm = parseMime(mime);
    var buf = bytes instanceof ArrayBuffer ? bytes : (bytes && bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : null);
    if (!buf) return Promise.reject(new Error('No audio bytes.'));
    if (mm.type === 'audio/pcm' || mm.type === 'audio/l16' || mm.type === 'audio/f32') {
      var rate = parseInt(mm.rate || '16000', 10) || 16000;
      var bits = parseInt(mm.bits || (mm.type === 'audio/l16' ? '16' : '32'), 10);
      var f32;
      if (bits === 16) { var i16 = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2)); f32 = new Float32Array(i16.length); for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768; }
      else f32 = new Float32Array(buf, 0, Math.floor(buf.byteLength / 4));
      return Promise.resolve(W.toMono16k([f32], rate));
    }
    // Everything else: the browser's decoder, then a proper resample.
    var Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return Promise.reject(new Error('This browser cannot decode audio here.'));
    var probe = new Ctx(1, 1, 16000);
    return new Promise(function (res, rej) {
      var done = false;
      var p = probe.decodeAudioData(buf, function (ab) { if (!done) { done = true; res(ab); } }, function (e) { if (!done) { done = true; rej(e || new Error('decode failed')); } });
      if (p && p.then) p.then(function (ab) { if (!done) { done = true; res(ab); } }, function (e) { if (!done) { done = true; rej(e); } });
    }).catch(function (e) {
      throw new Error('Could not decode this audio (' + (mm.type || 'unknown type') + '). Send WAV, WebM/Opus, MP4/AAC, or raw PCM as audio/pcm;rate=16000;bits=32.');
    }).then(function (ab) {
      var n = Math.ceil(ab.duration * 16000);
      if (ab.sampleRate === 16000 && ab.numberOfChannels === 1) return ab.getChannelData(0);
      var off = new Ctx(1, Math.max(1, n), 16000);
      var src = off.createBufferSource(); src.buffer = ab; src.connect(off.destination); src.start(0);
      return off.startRendering().then(function (out) { return out.getChannelData(0); });
    });
  }

  // ---- the handler ----------------------------------------------------------
  var chain = Promise.resolve(); // one engine, one thread: requests take turns
  function sttHandler(req, ctx) {
    req = req || {};
    var beat = makeBeat(ctx);
    var run = function () {
      var t0 = Date.now();
      var key = pickModel(req.model);
      var language = String(req.language || 'auto').trim().toLowerCase();
      if (!language) language = 'auto';
      var task = String(req.task || '').toLowerCase() === 'translate' ? 'translate' : 'transcribe';
      var prompt = String(req.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      var alive = ctx && typeof ctx.progress === 'function' ? setInterval(function () { beat(); }, 5000) : null;
      var stop = function () { if (alive) clearInterval(alive); };
      return toPcm16k(req.bytes || req.audio, req.mime).then(function (pcm) {
        if (pcm.length > MAX_SECONDS * 16000) pcm = pcm.subarray(0, MAX_SECONDS * 16000);
        var secs = pcm.length / 16000;
        if (!pcm.length || W.rms(pcm) < SILENCE_RMS) return { text: '', language: language === 'auto' ? '' : language, raw: { model: key, ms: Date.now() - t0, seconds: secs, silent: true } };
        return ensureEngine(key, beat).then(function (model) {
          var windows = Math.max(1, Math.ceil(secs / WINDOW)), texts = [], lang = language;
          var step = function (i) {
            if (i >= windows) return Promise.resolve();
            var slice = pcm.subarray(i * WINDOW * 16000, Math.min(pcm.length, (i + 1) * WINDOW * 16000));
            beat('Listening… (' + (windows > 1 ? (i + 1) + ' of ' + windows + ', ' : '') + secs.toFixed(1) + ' s, ' + key + ')', windows > 1 ? i / windows : undefined);
            return model.transcribe(slice, { language: lang, task: task, prompt: prompt, maxTokens: 224 }).then(function (r) {
              if (r.text) texts.push(r.text);
              if (lang === 'auto' && r.language) lang = r.language; // one clip, one language — keep the first verdict
              return step(i + 1);
            });
          };
          return step(0).then(function () {
            beat('Done', 1);
            return { text: texts.join(' ').trim(), language: lang === 'auto' ? '' : lang, raw: { model: key, ms: Date.now() - t0, seconds: secs, task: task } };
          });
        });
      }).then(function (r) { stop(); return r; }, function (e) { stop(); throw e; });
    };
    var p = chain.then(run, run);
    chain = p.catch(function () {});
    return p;
  }

  if (window.gifos && gifos.provider && gifos.provider.serve) {
    gifos.provider.serve({ stt: sttHandler });
  }

  // ---- the visible page: explainer + Try box --------------------------------
  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m) { var el = $('status'); if (el) el.textContent = m || ''; }
  var fileIn = $('file');
  if (fileIn) {
    var modelSel = $('model'), taskSel = $('task'), langIn = $('lang'), promptIn = $('prompt'), out = $('out');
    if (modelSel) modelSel.value = pickModel('');
    fileIn.onchange = function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      out.textContent = ''; setStatus('Reading ' + f.name + '…');
      f.arrayBuffer().then(function (buf) {
        return sttHandler({ bytes: buf, mime: f.type || 'audio/wav', model: modelSel ? modelSel.value : '', task: taskSel ? taskSel.value : '',
          language: langIn ? langIn.value : 'auto', prompt: promptIn ? promptIn.value : '' },
        { progress: function (note) { if (note) setStatus(note); } });
      }).then(function (r) {
        out.textContent = r.text || '(nothing heard)';
        setStatus((r.raw.silent ? 'Silence — the model was not asked.' : 'Heard ' + (r.language ? r.language.toUpperCase() + ', ' : '') + r.raw.seconds.toFixed(1) + ' s of audio with the ' + r.raw.model + ' model in ' + (r.raw.ms / 1000).toFixed(1) + ' s') + ' — on this device, zero network.');
      }).catch(function (e) { setStatus('⚠ ' + (e && e.message || e)); });
    };
  }
})();
