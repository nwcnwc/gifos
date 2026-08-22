/*
 * app.js — the screen, and the order the passes run in.
 *
 * The separation itself is mdx.js (the transcribed UVR algorithm); this file
 * decides which models run on what, drives ONNX Runtime Web, and keeps the
 * page honest about how long it is going to take.
 *
 * The two-model job is UVR's VOCAL SPLIT CHAIN: the main model produces
 * Vocals + Instrumental, then the karaoke model is run on the VOCAL STEM (not
 * the original mix) to give Lead + Backing. That is what
 * SeperateAttributes.process_vocal_split_chain does with vocal_stem_path.
 */
(function () {
  'use strict';

  var MODELS = window.VR_MODELS.models, JOBS = window.VR_MODELS.jobs;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    file: null, buf: null, job: 'split', bits: 16, maxSec: 0,
    running: false, stop: false, gpu: false, ep: null, cpuOnly: false, gpuNote: null,
    sessions: {}, selfTest: false, results: [], urls: [],
  };

  // ---- engine ---------------------------------------------------------------

  function b64ToU8(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function initOrt() {
    if (!window.ort) throw new Error('The inference engine failed to load.');
    if (!window.VR_ORT_WASM_B64) throw new Error('The engine wasm failed to load.');
    var wasm = b64ToU8(window.VR_ORT_WASM_B64);
    // The sandbox has no network, so ORT is handed the wasm as bytes rather
    // than left to fetch it. Single-threaded and unproxied: SharedArrayBuffer
    // needs cross-origin isolation, which an opaque-origin app frame does not
    // have, so asking for threads only produces a failed worker.
    window.ort.env.wasm.wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    window.ort.env.wasm.numThreads = 1;
    window.ort.env.wasm.proxy = false;
    window.ort.env.logLevel = 'error';
  }

  async function haveGpu() {
    try {
      if (!navigator.gpu) return false;
      var a = await navigator.gpu.requestAdapter();
      return !!a;
    } catch (e) { return false; }
  }

  // ---- when the GPU goes away ------------------------------------------------
  // A phone can lose its WebGPU device to this model: 543 buffers into loading
  // the weights, the device dies and every promise ORT is holding simply never
  // settles. Nothing throws, so there is nothing to catch and nothing to fall
  // back from — measured on a Moto G24, where the app sat on "Loading…" for as
  // long as anyone was willing to watch it. A hang is worse than an error: an
  // error at least tells you to try the processor.
  //
  // Two signals, because one is honest and the other is a backstop. The
  // device's own `lost` promise is the real answer, and ORT publishes the
  // device on env.webgpu.device as soon as its backend initialises — before
  // the upload that dies — so it can be watched while the create that
  // triggered it is still pending. The timeout catches the other shape, where
  // the driver stops answering without ever declaring a loss.
  var gpuLost = null;
  function gpuLossSignal() {
    if (gpuLost) return gpuLost;
    gpuLost = new Promise(function (resolve) {
      var tries = 0;
      (function poll() {
        var d = window.ort && window.ort.env && window.ort.env.webgpu && window.ort.env.webgpu.device;
        if (d && d.lost && d.lost.then) { d.lost.then(function (i) { resolve(i || {}); }); return; }
        if (++tries < 3000) setTimeout(poll, 100);   // five minutes of looking
      })();
    });
    return gpuLost;
  }

  // Run a GPU-bound promise under both signals, so a dead device becomes a
  // thrown error the fallbacks below already know what to do with.
  function underGpuWatch(p, what, seconds) {
    if (!S.gpu) return p;
    var timer = null;
    var done = function (v) { clearTimeout(timer); return v; };
    var fail = function (e) { clearTimeout(timer); throw e; };
    return Promise.race([
      p,
      gpuLossSignal().then(function (i) {
        throw gone('the GPU device was lost' + (i && i.message ? ': ' + i.message : '') + ' — ' + what);
      }),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(gone('the GPU stopped answering after ' + seconds + 's — ' + what));
        }, seconds * 1000);
      }),
    ]).then(done, fail);
  }
  // Tagged, because the two ways a GPU fails need different answers. An
  // ordinary create() refusal — no kernel for some op — throws cleanly, ORT's
  // `finally { Eb = null }` runs, and the engine is fine to reuse on the CPU in
  // place. A LOST DEVICE is not clean: the JSEP operation it was in never
  // returns, so the marker stays set and the wasm module stays suspended inside
  // Asyncify with nothing coming to resume it. Every later session then dies on
  // "Session already started" — including the CPU one meant to rescue it
  // (measured). That engine is gone, and only a reload brings back a new one.
  function gone(msg) { var e = new Error(msg); e.gpuGone = true; return e; }

  // So the recovery for a lost device is a RESTART, not a retry: reload the
  // frame for a fresh engine, with the GPU switched off for good on this
  // computer, and say so on the way back in. It costs one press of Separate.
  // The alternative, measured on a Moto G24, was the app sitting on "Loading…"
  // for as long as anyone was willing to watch it.
  async function restartOnCpu(err) {
    S.stop = true;
    S.cpuOnly = true;
    S.gpuNote = 'The GPU dropped out mid-run (' + String((err && err.message) || err)
      + '), so this app has switched to the processor on this computer and restarted itself. '
      + 'It is slower — see the time estimate — but it finishes. Press Separate to start again.';
    // Said BEFORE the reload as well as after it. If a sandbox ever refuses the
    // reload, the note on screen is the difference between "the GPU died, here
    // is what to do" and the silent hang this whole branch exists to end.
    setStatus(S.gpuNote, 'err');
    try { await savePrefs(); } catch (e) {}
    location.reload();
    await new Promise(function () {});   // nothing after the reload runs
  }

  async function makeSession(bytes) {
    // ORT-web does not fall back on its own — a WebGPU session that cannot
    // place an op throws at create() — so the fallback is written out here.
    var eps = S.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    try {
      var s = await underGpuWatch(
        window.ort.InferenceSession.create(bytes, { executionProviders: eps }),
        'loading the model onto the GPU', 150);
      S.ep = S.gpu ? 'webgpu' : 'wasm';
      return s;
    } catch (e) {
      if (!S.gpu) throw e;
      if (e && e.gpuGone) return restartOnCpu(e);
      // Say WHY on screen. This branch used to be silent because the only way
      // in was "no GPU kernel for some op", which nobody can act on; a lost
      // device is different — it is the difference between the app being slow
      // and the app being broken, and the user is about to wait ten times as
      // long as they were told.
      sayGpuGone(e);
      var s2 = await window.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
      S.ep = 'wasm';
      return s2;
    }
  }

  // Drop to the processor for good: every cached session goes too, because they
  // all sit on the one device that just said no, and sessionFor() rebuilds them
  // on wasm now that S.gpu is false.
  function sayGpuGone(err) {
    S.gpu = false;
    S.ep = 'wasm';
    var old = S.sessions;
    S.sessions = {};
    Object.keys(old).forEach(function (k) {
      Promise.resolve(old[k]).then(function (s) { try { s.release(); } catch (e) {} }, function () {});
    });
    $('engineline').textContent = 'ONNX Runtime Web on the processor — the GPU dropped out ('
      + String((err && err.message) || err) + '), so the rest of this runs on the CPU. It is slower, and it finishes.';
  }

  async function modelBytes(id) {
    var m = MODELS[id];
    if (m.selfTest) return b64ToU8(window.VR_SELFTEST_B64);
    if (!(window.gifos && gifos.assets)) throw new Error('no asset store');
    var buf = await gifos.assets(m.asset);
    return new Uint8Array(buf);
  }

  async function sessionFor(id) {
    if (S.sessions[id]) return S.sessions[id];
    setStatus('Loading ' + MODELS[id].label + '…');
    var p = modelBytes(id).then(makeSession);
    S.sessions[id] = p;
    try { return await p; }
    catch (e) { delete S.sessions[id]; throw e; }
  }

  // ---- the run --------------------------------------------------------------

  var MATCH_WEIGHT = 0.05;   // a match-mix chunk is FFT only; a model chunk is not

  // A GPU that compiled the graph can still refuse to RUN it: the tensor here
  // is 12 MB, one buffer per chunk, and on a phone that allocation is a real
  // thing to fail halfway through a song. ORT-web does not fall back on its own
  // and the run is the second place this shows up, so the demotion is written
  // out here as well as in makeSession — a job that dies at 1% has thrown away
  // the whole wait, and the processor would have finished it.
  function runner(id, dimF, dimT) {
    return async function (tensor) {
      var feeds = { input: new window.ort.Tensor('float32', tensor, [1, 4, dimF, dimT]) };
      var session = await sessionFor(id);
      var out;
      try {
        out = await underGpuWatch(session.run(feeds), 'separating a piece of the track', 120);
      } catch (e) {
        if (!S.gpu || S.stop) throw e;
        if (e && e.gpuGone) return restartOnCpu(e);
        sayGpuGone(e);
        session = await sessionFor(id);
        out = await session.run(feeds);
      }
      var name = session.outputNames && session.outputNames[0] ? session.outputNames[0] : 'output';
      var t = out[name] || out.output;
      if (!t) throw new Error('the model returned no output tensor');
      return t.data;
    };
  }

  function subtract(a, b) {
    var out = [new Float32Array(a[0].length), new Float32Array(a[0].length)];
    for (var c = 0; c < 2; c++) for (var i = 0; i < a[c].length; i++) out[c][i] = a[c][i] - b[c][i];
    return out;
  }

  // A pass is one model over one signal: the model's own stem, plus (when UVR
  // would frequency-cut) the band-limited copy of the input it gets subtracted
  // from. Returns { primary, secondary } named by the model.
  async function pass(id, mix, tick) {
    var m = MODELS[id];
    await sessionFor(id);
    var run = runner(id, m.dimF, m.dimT);
    var primary = await window.VRMDX.demix(mix, m, run, {
      onProgress: function () { tick(1); },
      shouldStop: function () { return S.stop; },
    });
    var base = mix;
    if (m.freqCut) {
      // is_match_mix: the same STFT/iSTFT with no model in it, so the residual
      // does not carry back the band the model never saw.
      base = await window.VRMDX.demix(mix, m, null, {
        matchMix: true,
        onProgress: function () { tick(MATCH_WEIGHT); },
        shouldStop: function () { return S.stop; },
      });
    }
    return { primary: primary, secondary: subtract(base, primary) };
  }

  function unitsFor(id, T) {
    var m = MODELS[id];
    var u = window.VRMDX.chunkCount(T, m, false);
    if (m.freqCut) u += window.VRMDX.chunkCount(T, m, true) * MATCH_WEIGHT;
    return u;
  }

  async function separate() {
    S.running = true; S.stop = false; S.results = [];
    $('go').disabled = true; $('stop').hidden = false;
    $('results').hidden = true; $('stems').textContent = '';
    $('progwrap').hidden = false;
    setStatus('Decoding…');
    try {
      var audio = await window.VRWAV.decodeTo44kStereo(S.buf, { maxSec: S.maxSec });
      var mix = audio.mix, T = mix[0].length;
      var chain = JOBS[S.job].chain.slice();

      // Load every model this job needs BEFORE the progress bar starts, so a
      // missing weight is a sentence on screen rather than a stall at 40%.
      // There is no cheap way to ask the asset store "is it there?" — reading
      // it IS the answer — so the probe is the load, and the session is cached.
      try {
        for (var c0 = 0; c0 < chain.length; c0++) await sessionFor(chain[c0]);
        S.selfTest = false;
        $('selftest-note').hidden = true;
      } catch (e0) {
        S.selfTest = true;
        $('selftest-note').hidden = false;
        chain = ['self-test'];
        await sessionFor('self-test');
      }
      $('modelline').textContent = S.selfTest
        ? 'Running the built-in self-test model — the UVR weights are not on this computer.'
        : 'Loaded: ' + chain.map(function (k) { return MODELS[k].label; }).join(' · ');

      var total = 0, i;
      for (i = 0; i < chain.length; i++) total += unitsFor(chain[i], T);
      var doneUnits = 0, t0 = Date.now();
      function tick(w) {
        doneUnits += w;
        var frac = Math.min(1, doneUnits / total);
        $('bar').style.width = (frac * 100).toFixed(1) + '%';
        var el = (Date.now() - t0) / 1000;
        var eta = doneUnits > 0.5 ? (el / doneUnits) * (total - doneUnits) : 0;
        $('progtext').textContent = Math.round(frac * 100) + '%'
          + (eta > 1 ? ' — about ' + fmtDur(eta) + ' left' : '')
          + ' · running on ' + (S.ep === 'webgpu' ? 'your GPU' : 'the processor');
      }

      var stems = [];
      var first = await namedPass(chain[0], mix, tick);
      stems.push(first.a, first.b);
      if (chain.length > 1) {
        // The chain's second model runs on the VOCAL stem, not the mix.
        var vocal = first.a.name === 'Vocals' ? first.a : first.b;
        setStatus('Splitting the vocal…');
        var second = await namedPass(chain[1], vocal.audio, tick);
        stems.push(second.a, second.b);
      }

      $('bar').style.width = '100%';
      S.results = stems;
      var note = renderStems(stems);
      // What the track's own sample rate was is NOT knowable here —
      // decodeAudioData reports the context's rate, not the file's — so nothing
      // is claimed about it. Its channel count is knowable, and worth saying:
      // a mono track cannot come back with anything different in each ear.
      setStatus('Done — ' + stems.length + ' stems in ' + fmtDur((Date.now() - t0) / 1000) + '.'
        + (audio.sourceChannels === 1 ? ' (The track was mono, so each stem is the same in both ears.)' : '')
        + note, 'ok');
    } catch (e) {
      if (String(e && e.message) === 'stopped') setStatus('Stopped.');
      else setStatus(String((e && e.message) || e), 'err');
    } finally {
      S.running = false;
      $('go').disabled = !S.buf; $('stop').hidden = true;
    }
  }

  async function namedPass(id, mix, tick) {
    var m = MODELS[id];
    var r = await pass(id, mix, tick);
    return {
      a: { name: m.primaryStem, audio: r.primary },
      b: { name: m.secondaryStem, audio: r.secondary },
    };
  }

  // ---- output ---------------------------------------------------------------

  function baseName() {
    var n = (S.file && S.file.name) || 'audio';
    return n.replace(/\.[^.]+$/, '');
  }

  function renderStems(stems) {
    var host = $('stems');
    host.textContent = '';
    // A stem is tens of megabytes and a second run makes a whole new set, so
    // the last run's object URLs are released rather than left holding them.
    S.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    S.urls = [];
    stems.forEach(function (s) {
      var enc = window.VRWAV.encodeWav(s.audio, 44100, S.bits);
      var blob = new Blob([enc.bytes], { type: 'audio/wav' });
      var url = URL.createObjectURL(blob);
      S.urls.push(url);
      var name = baseName() + '_(' + s.name + ').wav';

      var el = document.createElement('div');
      el.className = 'stem';
      var h = document.createElement('div'); h.className = 'h';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = s.name;
      var meta = document.createElement('div'); meta.className = 'm';
      meta.textContent = (enc.bytes.length / 1e6).toFixed(1) + ' MB · ' + S.bits + '-bit';
      var dl = document.createElement('a');
      dl.href = url; dl.download = name;
      var btn = document.createElement('button'); btn.className = 'small'; btn.textContent = '⬇ Download';
      dl.appendChild(btn);
      h.appendChild(n); h.appendChild(meta); h.appendChild(dl);
      el.appendChild(h);
      if (enc.clipped) {
        var c = document.createElement('div'); c.className = 'clip';
        c.textContent = enc.clipped.toLocaleString() + ' samples clipped — switch the output to 32-bit float to keep them.';
        el.appendChild(c);
      }
      var a = document.createElement('audio'); a.controls = true; a.src = url; a.preload = 'none';
      el.appendChild(a);
      host.appendChild(el);
    });
    $('results').hidden = false;
    return S.selfTest ? ' These are SELF-TEST output, not a separation.' : '';
  }

  // ---- chrome ---------------------------------------------------------------

  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 90) return sec + 's';
    var m = Math.round(sec / 60);
    if (m < 90) return m + ' min';
    return (m / 60).toFixed(1) + ' hours';
  }

  function setStatus(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function renderJobs() {
    var host = $('jobs');
    host.textContent = '';
    Object.keys(JOBS).forEach(function (id) {
      var j = JOBS[id];
      var lab = document.createElement('label');
      lab.className = 'job' + (S.job === id ? ' on' : '');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'job'; r.value = id; r.checked = S.job === id;
      r.setAttribute('aria-label', j.label);
      r.onchange = function () { S.job = id; savePrefs(); renderJobs(); };
      var box = document.createElement('div');
      var t = document.createElement('div'); t.className = 't'; t.textContent = j.label;
      var d = document.createElement('div'); d.className = 'd'; d.textContent = j.detail;
      box.appendChild(t); box.appendChild(d);
      lab.appendChild(r); lab.appendChild(box);
      host.appendChild(lab);
    });
  }

  function takeFile(f) {
    if (!f) return;
    S.file = f;
    $('fileinfo').textContent = f.name + ' · ' + (f.size / 1e6).toFixed(1) + ' MB';
    setStatus('Reading…');
    f.arrayBuffer().then(function (b) {
      S.buf = b;
      $('go').disabled = S.running;
      setStatus('');
    }, function (e) { setStatus(String(e), 'err'); });
  }

  function savePrefs() {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    try {
      return Promise.resolve(gifos.db('prefs').put({
        id: 'prefs', job: S.job, bits: S.bits, maxSec: S.maxSec,
        cpuOnly: S.cpuOnly, gpuNote: S.gpuNote,
      }));
    } catch (e) { return Promise.resolve(); }
  }

  async function loadPrefs() {
    if (!(window.gifos && gifos.db)) return;
    try {
      var rows = await gifos.db('prefs').getAll();
      var p = rows && rows[0];
      if (!p) return;
      if (JOBS[p.job]) S.job = p.job;
      if (p.bits === 16 || p.bits === 32) S.bits = p.bits;
      if (typeof p.maxSec === 'number') S.maxSec = p.maxSec;
      S.cpuOnly = !!p.cpuOnly;
      S.gpuNote = p.gpuNote || null;
    } catch (e) {}
  }

  async function boot() {
    renderJobs();
    await loadPrefs();
    $('bits').value = String(S.bits);
    $('length').value = String(S.maxSec);
    renderJobs();

    $('file').onchange = function (e) { takeFile(e.target.files && e.target.files[0]); };
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    $('bits').onchange = function (e) { S.bits = Number(e.target.value); savePrefs(); };
    $('length').onchange = function (e) { S.maxSec = Number(e.target.value); savePrefs(); };
    $('go').onclick = function () { if (!S.running && S.buf) separate(); };
    $('stop').onclick = function () { S.stop = true; setStatus('Stopping after this piece…'); };
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () { if (S.running) { S.stop = true; setStatus('Stopping after this piece…'); } });
    }

    try { initOrt(); } catch (e) { setStatus(String(e.message || e), 'err'); return; }
    // A computer that has already lost its GPU to this model is not asked
    // again: the failure costs minutes and takes the engine down with it, and
    // it is a property of the device, not of the track. The switch is
    // remembered per computer and can be handed back — a driver update, or a
    // phone that was simply out of memory that day, deserves another go.
    S.gpu = S.cpuOnly ? false : await haveGpu();
    if (S.cpuOnly) {
      $('engineline').textContent = 'ONNX Runtime Web on the processor — the GPU dropped out on this '
        + 'computer once, so the app is not asking for it again. It is slower than the music, and it finishes.';
      var again = document.createElement('button');
      again.className = 'small'; again.textContent = 'Try the GPU again';
      again.onclick = function () { S.cpuOnly = false; S.gpuNote = null; savePrefs(); location.reload(); };
      $('engineline').appendChild(document.createTextNode(' '));
      $('engineline').appendChild(again);
    } else {
      $('engineline').innerHTML = S.gpu
        ? 'ONNX Runtime Web on <b>your GPU</b> (WebGPU), falling back to the processor if an operation has no GPU kernel.'
        : 'ONNX Runtime Web on <b>the processor</b> — this device exposes no WebGPU adapter. It works; it is just slower than the music.';
    }
    S.ep = S.gpu ? 'webgpu' : 'wasm';
    // The reason it restarted, said once, on the way back in.
    if (S.gpuNote) { setStatus(S.gpuNote); S.gpuNote = null; savePrefs(); }

    var names = Object.keys(MODELS).filter(function (k) { return !MODELS[k].selfTest; })
      .map(function (k) { return MODELS[k].label; }).join(' · ');
    $('modelline').textContent = 'Models: ' + names
      + ' — read from this computer\u2019s store the first time you press Separate.';
  }

  boot();
})();
