/*
 * Waveforms explorable — classic port of Josh Comeau's teaching toy.
 * Phone-first walk-through: graph, Hear, shape chips, air grid, additive
 * harmonics you can hear assembling. Last place is private in the file.
 */
(function (root) {
  'use strict';

  var STEPS = [
    { id: 'title', title: 'Waveforms', body: 'A sound is a wobble in the air. This walk-through shows that wobble as a graph, then lets you hear it. No prior knowledge needed.\n\nTap Next. Volume starts muted so nothing surprises you.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'listen', title: 'Listen in', body: 'Tap Hear. You get a low bass tone. The graph is slow on purpose so you can see it; the sound is about 100 times faster.\n\nMute with Hear again, or drag Volume. M works on a keyboard.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'reading', title: '1. Reading the graph', body: 'The blue line is a sound wave. Height is displacement — how far the air has moved from rest. Left to right is time.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'time', title: 'Time', body: 'The graph shows one second. A shape that repeats twice in that second is 2 hertz. An A4 on a piano is 440 Hz — far too fast to draw, which is why this graph stays slow.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'disp', title: 'Displacement', body: 'Pluck a guitar string and it wobbles. That wobble pushes the air. The Y axis is how far those molecules move. A bigger move is a louder sound.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'amp', title: 'Amplitude', body: 'Amplitude is a 0–1 stand-in for that displacement. 0 is silence; 1 is as far as this graph goes. Drag Amplitude. Try 0 — the line goes flat and the tone dies.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true },
    { id: 'freq', title: 'Frequency', body: 'The waveform now repeats twice in that second. Frequency is how many times the shape repeats per second. Higher is a higher pitch. The Hz badge is the audible tone, not the slow graph.', shape: 'sine', amp: 1, freq: 2, air: false, harm: false, showAmp: true, showFreq: true },
    { id: 'tweak', title: 'Tweak it', body: 'Drag frequency and amplitude together. Unmute. Frequency is pitch; amplitude is loudness. A waveform is displacement over time. That is the whole idea.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true },
    { id: 'air', title: '2. How sound works', body: 'Air is full of molecules. A speaker vibrates; that vibration moves through them like a chain until it reaches your ear.\n\nEach dot is a molecule. They wobble in place — they do not fly across. The wobble travels.', shape: 'sine', amp: 1, freq: 1, air: true, harm: false, showAmp: true, showFreq: true },
    { id: 'sine', title: '3. A pure sine', body: 'So far the shape has been a sine, the fundamental waveform. A 440 Hz sine is only 440 Hz. No extras. When a waveform has extra frequencies, we call them harmonics.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true, showShape: true },
    { id: 'square', title: 'Square', body: 'A square jumps between +amplitude and −amplitude. It is odd harmonics: 3×, 5×, 7×… each quieter. Drag Harmonics up, then Converge — the stacked sines become the square, and you hear it assemble.', shape: 'square', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'tri', title: 'Triangle', body: 'A triangle also uses odd harmonics, but they fall off faster (1/n²) and every second one is inverted. Brighter than a sine, softer than a square.', shape: 'triangle', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'saw', title: 'Sawtooth', body: 'A saw uses every integer harmonic: 2×, 3×, 4×… The buzzy one, the classic synth lead. Converge the harmonics to hear it assemble.', shape: 'sawtooth', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'add', title: 'Additive synthesis', body: 'Any periodic tone can be built from sines. That is additive synthesis — how the square, triangle and saw above are made. Play with shape, harmonics, and converge.', shape: 'sawtooth', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'end', title: 'That is a waveform', body: 'A graph of displacement over time. Amplitude is how far. Frequency is how often. Shape is the extra frequencies on top of the fundamental.\n\nYou can hear all of that on this device. Nothing is uploaded. Your place in the guide lives in this file.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true, showShape: true }
  ];

  var SHAPES = ['sine', 'triangle', 'square', 'sawtooth'];
  var GHOST = { sine: '#4da3ff', triangle: '#7dffb3', square: '#ffb347', sawtooth: '#ff5d8f' };

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };
  var M = root.WaveformMath;
  var saveDb = null;
  var timer = 0;
  var step = 0;
  var amp = 1, freq = 1, shape = 'sine', harm = 0, conv = 0, vol = 0;
  var playing = true;
  var phase = 0;
  var raf = 0;
  var actx = null, osc = null, gain = null, filter = null;
  var audioErr = '';
  var persistErr = '';
  var sized = false;
  var armed = false;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function clampStep(n) {
    n = n | 0;
    if (n < 0) return 0;
    if (n >= STEPS.length) return STEPS.length - 1;
    return n;
  }

  function audibleHz(f) {
    if (f == null) f = freq;
    return Math.round(Math.max(40, f * 110));
  }

  function audioType(s) {
    if (s === 'square' || s === 'sawtooth' || s === 'triangle' || s === 'sine') return s;
    return 'sine';
  }

  function toRecord() {
    return {
      id: 'state',
      step: step, amp: amp, freq: freq, shape: shape,
      harm: harm, conv: conv, vol: vol, at: Date.now()
    };
  }

  function loadRecord(row) {
    if (!row) return;
    if (row.step != null) step = clampStep(row.step);
    if (row.amp != null) amp = +row.amp;
    if (row.freq != null) freq = +row.freq;
    if (row.shape && SHAPES.indexOf(row.shape) >= 0) shape = row.shape;
    if (row.harm != null) harm = +row.harm;
    if (row.conv != null) conv = +row.conv;
    if (row.vol != null) vol = +row.vol;
    if (!(amp >= 0 && amp <= 1)) amp = 1;
    if (!(freq >= 0.5 && freq <= 4)) freq = 1;
    if (!(harm >= 0)) harm = 0;
    if (harm > 12) harm = 12;
    if (!(conv >= 0 && conv <= 1)) conv = 0;
    if (!(vol >= 0 && vol <= 1)) vol = 0;
  }

  function pointsFor(width, offset) {
    if (!M) return { main: [], extras: [], mixed: [] };
    var main = M.getPointsForWaveform(shape, freq, amp, width, offset);
    var extras = [];
    var mixed = main;
    if (harm > 0 && shape !== 'sine') {
      var specs = M.getHarmonicsForWave(shape, freq, amp, harm);
      extras = specs.map(function (ex) {
        return {
          spec: ex,
          points: M.getPointsForWaveform(ex.shape, ex.frequency, ex.amplitude, width, offset)
        };
      });
      mixed = M.applyWaveformAddition(main, extras.map(function (e) { return e.points; }), conv);
    }
    return { main: main, extras: extras, mixed: mixed };
  }

  function persist() {
    if (!saveDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      saveDb.put(toRecord()).then(function () {
        persistErr = '';
        paintStatus();
      }).catch(function (e) {
        persistErr = String((e && e.message) || e || 'Could not save.');
        paintStatus();
      });
    }, 250);
  }

  function paintStatus() {
    var el = $('status');
    if (!el) return;
    if (audioErr) { el.textContent = audioErr; el.className = 'err'; return; }
    if (persistErr) { el.textContent = persistErr; el.className = 'err'; return; }
    el.className = '';
    el.textContent = saveDb ? 'Your place lives in this file.' : 'Running outside GifOS — nothing is stored.';
  }

  function sayAudio(msg) {
    audioErr = msg || '';
    paintStatus();
  }

  function ensureAudio() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { sayAudio('This browser has no Web Audio — the graph still works.'); return null; }
    try {
      if (!actx) {
        actx = new AC();
        gain = actx.createGain();
        gain.gain.value = 0;
        filter = actx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 5000;
        gain.connect(filter);
        filter.connect(actx.destination);
      }
      if (actx.state === 'suspended' && actx.resume) actx.resume();
      if (!osc) {
        osc = actx.createOscillator();
        osc.frequency.value = audibleHz();
        osc.connect(gain);
        osc.start();
      }
      armed = true;
      sayAudio('');
      return actx;
    } catch (e) {
      sayAudio(String((e && e.message) || e));
      return null;
    }
  }

  function harmonicTable(s, nHarm, mix) {
    var n = 32;
    var imag = new Float32Array(n);
    var real = new Float32Array(n);
    imag[1] = 1;
    if (nHarm > 0 && s !== 'sine' && M) {
      var extras = M.getHarmonicsForWave(s, 1, 1, nHarm);
      extras.forEach(function (ex) {
        var idx = Math.round(ex.frequency);
        if (idx > 1 && idx < n) imag[idx] = ex.amplitude * mix;
      });
    }
    return { real: real, imag: imag };
  }

  function syncAudio() {
    if (!osc || !actx) return;
    try {
      if (harm > 0 && shape !== 'sine' && actx.createPeriodicWave) {
        var tab = harmonicTable(shape, harm, conv);
        osc.setPeriodicWave(actx.createPeriodicWave(tab.real, tab.imag));
      } else {
        osc.type = audioType(shape);
      }
    } catch (e) {
      try { osc.type = audioType(shape); } catch (e2) {}
    }
    try {
      osc.frequency.setValueAtTime(audibleHz(), actx.currentTime);
      gain.gain.setTargetAtTime(vol * amp * 0.18, actx.currentTime, 0.02);
    } catch (e) {}
  }

  function sizeCanvases() {
    var wave = $('wave');
    if (!wave) return;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var cssW = Math.max(280, wave.clientWidth || wave.parentNode.clientWidth || 320);
    var cssH = cssW < 420 ? 160 : 200;
    wave.width = Math.round(cssW * dpr);
    wave.height = Math.round(cssH * dpr);
    var air = $('air');
    if (air) {
      air.width = wave.width;
      air.height = Math.round((cssW < 420 ? 88 : 110) * dpr);
    }
    sized = true;
  }

  function strokePoints(ctx, points, h, color, width) {
    if (!points || !points.length || !M) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var y = M.translateAxisRelativeYValue(p.y, h);
      if (i === 0) ctx.moveTo(p.x, y);
      else ctx.lineTo(p.x, y);
    });
    ctx.stroke();
  }

  function drawWave() {
    var canvas = $('wave');
    if (!canvas || !M) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#cfc8b8';
    ctx.lineWidth = Math.max(1, w / 640);
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    var offset = (phase * 100) % 100;
    var pack = pointsFor(w, offset);
    if (harm > 0 && conv < 1) {
      pack.extras.forEach(function (ex, i) {
        var a = 0.18 + (1 - conv) * 0.12;
        strokePoints(ctx, ex.points, h, i % 2 ? 'rgba(255,93,143,' + a + ')' : 'rgba(125,255,179,' + a + ')', 1);
      });
    }
    strokePoints(ctx, pack.mixed, h, '#0380f4', Math.max(2.5, w / 220));
  }

  function drawAir() {
    var canvas = $('air');
    if (!canvas || canvas.hidden) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var cols = 16, rows = 6, c, r, x, y, dx;
    var rad = Math.max(3, w / 160);
    for (c = 0; c < cols; c++) for (r = 0; r < rows; r++) {
      dx = Math.sin((phase * Math.PI * 2 * freq) - c * 0.45) * amp * (w / 64);
      x = (w * 0.06) + c * ((w * 0.88) / (cols - 1)) + dx;
      y = (h * 0.16) + r * ((h * 0.68) / (rows - 1));
      ctx.fillStyle = c === 0 ? '#0380f4' : '#5a564c';
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMinis() {
    if (!M || !root.document) return;
    var nodes = root.document.querySelectorAll('canvas.mini');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var c = nodes[i];
      var sh = c.getAttribute('data-mini');
      var ctx = c.getContext('2d');
      var w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);
      var pts = M.getPointsForWaveform(sh, 2, 0.85, w, 0);
      ctx.strokeStyle = GHOST[sh] || '#4da3ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach(function (p, n) {
        var y = M.translateAxisRelativeYValue(p.y, h);
        if (n === 0) ctx.moveTo(p.x, y);
        else ctx.lineTo(p.x, y);
      });
      ctx.stroke();
    }
  }

  function tick() {
    if (playing) phase += 0.012;
    drawWave();
    drawAir();
    raf = root.requestAnimationFrame ? root.requestAnimationFrame(tick) : 0;
  }

  function paintHear() {
    var btn = $('hearBtn');
    if (!btn) return;
    btn.textContent = (vol > 0 && armed) ? 'Mute' : 'Hear';
    btn.setAttribute('data-on', (vol > 0 && armed) ? '1' : '0');
    var hz = $('hz');
    if (hz) hz.textContent = audibleHz() + ' Hz';
    var pause = $('pauseBtn');
    if (pause) pause.textContent = playing ? 'Pause' : 'Play';
  }

  function paintChips() {
    var row = $('shapeRow');
    if (!row) return;
    var chips = row.querySelectorAll('.chip');
    var i;
    for (i = 0; i < chips.length; i++) {
      var sh = chips[i].getAttribute('data-shape');
      chips[i].setAttribute('aria-pressed', sh === shape ? 'true' : 'false');
    }
    if ($('shape')) $('shape').value = shape;
  }

  function paintDots() {
    var host = $('dots');
    if (!host) return;
    host.innerHTML = '';
    STEPS.forEach(function (s, i) {
      var b = root.document.createElement('button');
      b.type = 'button';
      b.className = (i <= step ? 'on' : '') + (i === step ? ' here' : '');
      b.setAttribute('aria-label', 'Step ' + (i + 1));
      b.addEventListener('click', function () {
        step = i;
        applyStep();
      });
      host.appendChild(b);
    });
  }

  function applyStepDefaults(s) {
    if (!s) return;
    if (s.amp != null && !s.showAmp) amp = s.amp;
    if (s.freq != null && !s.showFreq) freq = s.freq;
    if (s.shape) shape = s.shape;
  }

  function applyStep() {
    var s = STEPS[step];
    if (!s) return;
    applyStepDefaults(s);
    if ($('copy')) {
      var html = '<h2>' + s.title + '</h2>';
      s.body.split('\n\n').forEach(function (p) {
        html += '<p' + (s.id === 'end' || s.id === 'tweak' ? ' class="sum"' : '') + '>' + p + '</p>';
      });
      $('copy').innerHTML = html;
    }
    if ($('stepn')) $('stepn').textContent = (step + 1) + ' / ' + STEPS.length;
    if ($('backBtn')) $('backBtn').disabled = step === 0;
    if ($('nextBtn')) $('nextBtn').disabled = step === STEPS.length - 1;
    if ($('air')) $('air').hidden = !s.air;
    if ($('ampRow')) $('ampRow').style.display = s.showAmp ? '' : 'none';
    if ($('freqRow')) $('freqRow').style.display = s.showFreq ? '' : 'none';
    if ($('shapeRow')) $('shapeRow').hidden = !s.showShape;
    if ($('harmRow')) $('harmRow').hidden = !s.harm;
    if ($('convRow')) $('convRow').hidden = !s.harm;
    if ($('amp')) $('amp').value = String(amp);
    if ($('freq')) $('freq').value = String(freq);
    if ($('harm')) $('harm').value = String(harm);
    if ($('conv')) $('conv').value = String(conv);
    if ($('vol')) $('vol').value = String(vol);
    if ($('ampVal')) $('ampVal').textContent = amp.toFixed(2);
    if ($('freqVal')) $('freqVal').textContent = freq.toFixed(1);
    if ($('harmVal')) $('harmVal').textContent = String(harm);
    if ($('convVal')) $('convVal').textContent = conv.toFixed(2);
    if ($('volVal')) $('volVal').textContent = vol.toFixed(2);
    paintChips();
    paintDots();
    paintHear();
    if (vol > 0) ensureAudio();
    syncAudio();
    persist();
    paintStatus();
  }

  function readControls() {
    if ($('amp')) amp = +$('amp').value;
    if ($('freq')) freq = +$('freq').value;
    if ($('shape')) shape = $('shape').value;
    if ($('harm')) harm = +$('harm').value;
    if ($('conv')) conv = +$('conv').value;
    if ($('vol')) vol = +$('vol').value;
    if ($('ampVal')) $('ampVal').textContent = amp.toFixed(2);
    if ($('freqVal')) $('freqVal').textContent = freq.toFixed(1);
    if ($('harmVal')) $('harmVal').textContent = String(harm);
    if ($('convVal')) $('convVal').textContent = conv.toFixed(2);
    if ($('volVal')) $('volVal').textContent = vol.toFixed(2);
    paintChips();
    paintHear();
    if (vol > 0) ensureAudio();
    syncAudio();
    persist();
  }

  function setShape(s) {
    if (SHAPES.indexOf(s) < 0) return;
    shape = s;
    if ($('shape')) $('shape').value = s;
    readControls();
  }

  function toggleHear() {
    if (vol > 0 && armed) {
      vol = 0;
    } else {
      if (!(vol > 0)) vol = 0.4;
      ensureAudio();
    }
    if ($('vol')) $('vol').value = String(vol);
    readControls();
  }

  function go(delta) {
    var n = clampStep(step + delta);
    if (n === step) return false;
    step = n;
    applyStep();
    return true;
  }

  function applyLaunch(goArgs) {
    if (!goArgs) return;
    if (goArgs.step != null) {
      var raw = goArgs.step;
      var idx = parseInt(raw, 10);
      if (isNaN(idx)) {
        STEPS.forEach(function (s, i) { if (s.id === String(raw)) idx = i; });
      } else if (idx >= 1 && idx <= STEPS.length) {
        idx = idx - 1;
      }
      if (idx >= 0) step = clampStep(idx);
    }
    if (goArgs.shape) {
      var sh = String(goArgs.shape).toLowerCase();
      if (sh === 'saw') sh = 'sawtooth';
      if (sh === 'tri') sh = 'triangle';
      if (SHAPES.indexOf(sh) >= 0) shape = sh;
    }
  }

  function boot() {
    if (!$('wave') || !M) return;
    sizeCanvases();
    if (root.addEventListener) root.addEventListener('resize', function () {
      sizeCanvases();
      drawWave();
      drawAir();
    });
    ['amp', 'freq', 'harm', 'conv', 'vol'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('input', readControls);
    });
    $('nextBtn').addEventListener('click', function () { go(1); });
    $('backBtn').addEventListener('click', function () { go(-1); });
    $('hearBtn').addEventListener('click', function () { toggleHear(); });
    $('pauseBtn').addEventListener('click', function () {
      playing = !playing;
      paintHear();
    });
    $('wave').addEventListener('click', function () {
      playing = !playing;
      paintHear();
    });
    if ($('shapeRow')) {
      $('shapeRow').addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== $('shapeRow') && !(t.getAttribute && t.getAttribute('data-shape'))) t = t.parentNode;
        if (t && t.getAttribute) setShape(t.getAttribute('data-shape'));
      });
    }
    $('vol').addEventListener('pointerdown', function () { ensureAudio(); });
    $('hearBtn').addEventListener('pointerdown', function () { ensureAudio(); });
    root.document.addEventListener('keydown', function (e) {
      if (e.key === 'm' || e.key === 'M') { toggleHear(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
      else if (e.key === ' ') { playing = !playing; paintHear(); e.preventDefault(); }
    });
    if (root.gifos && root.gifos.onBack) {
      try {
        root.gifos.onBack(function () { return go(-1); });
      } catch (e) {}
    }
    drawMinis();
    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        loadRecord(row);
      }).catch(function () {});
    }
    ready.then(function () {
      applyStep();
      tick();
      if (root.gifos && root.gifos.launch) {
        Promise.resolve(root.gifos.launch()).then(function (goArgs) {
          if (!goArgs) return;
          applyLaunch(goArgs);
          applyStep();
        }).catch(function () {});
      }
    });
  }

  root.WaveformsApp = {
    STEPS: STEPS,
    SHAPES: SHAPES,
    audibleHz: audibleHz,
    audioType: audioType,
    clampStep: clampStep,
    toRecord: toRecord,
    loadRecord: loadRecord,
    pointsFor: pointsFor,
    harmonicTable: harmonicTable,
    applyStepDefaults: applyStepDefaults,
    applyLaunch: applyLaunch,
    go: go,
    setShape: setShape,
    toggleHear: toggleHear,
    getState: function () {
      return { step: step, amp: amp, freq: freq, shape: shape, harm: harm, conv: conv, vol: vol, playing: playing };
    }
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
