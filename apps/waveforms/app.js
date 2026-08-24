/*
 * Waveforms explorable — classic port of Josh Comeau's teaching toy.
 * Graph + sliders + air grid + additive harmonics. Last place is private.
 */
(function (root) {
  'use strict';

  var STEPS = [
    { id: 'title', title: 'Waveforms', body: 'This interactive guide introduces and explores waveforms. We will cover how to read these funny shapes, go over the fundamental physics of sound, learn how it relates to music, and discover how to build complex tones from simple ones.\n\nNo prior knowledge is required.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'listen', title: 'Listen in', body: 'This guide deals with audio waves, so it helps to hear them. Volume starts muted. Drag Volume up (or press M) to hear a constant bass tone. The graph is slow so you can see it; the sound is about 100 times faster.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'reading', title: '1. Reading waveforms', body: 'The blue line is a graph of a sound wave. It tells us about the wave\'s displacement, and how it changes over time.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'time', title: 'Time', body: 'The horizontal line, our X axis, represents time. In this case, the graph shows a 1-second interval.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'disp', title: 'Displacement', body: 'When you pluck a guitar string, it wobbles. That wobble pushes the air molecules around it. The Y axis measures displacement of those molecules — how far they move from rest. A bigger move is a louder sound.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false },
    { id: 'amp', title: 'Amplitude', body: 'Amplitude is an abstract 0–1 stand-in for that displacement. 0 is silent; 1 is as far as this graph goes. Drag Amplitude and watch the line flatten or grow. Try 0.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true },
    { id: 'freq', title: 'Frequency', body: 'The waveform now repeats twice in that second. Frequency is how many times the shape repeats per second, in Hertz. This one is 2Hz. Higher frequency is a higher pitch — an A4 is 440Hz. The graph stays slow so you can see it; unmute to hear the faster tone.', shape: 'sine', amp: 1, freq: 2, air: false, harm: false, showAmp: true, showFreq: true },
    { id: 'tweak', title: 'Tweak it', body: 'Drag frequency and amplitude together. Unmute. Frequency changes pitch; amplitude changes loudness. A waveform is a graph of displacement over time.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true },
    { id: 'air', title: '2. How sound works', body: 'The air is full of molecules. A speaker vibrates; that vibration moves through the molecules like a chain reaction until it reaches your ear. Each dot below is a molecule. They wobble in place — they do not fly across. The wobble travels.', shape: 'sine', amp: 1, freq: 1, air: true, harm: false, showAmp: true, showFreq: true },
    { id: 'sine', title: '3. Harmonics — sine', body: 'So far the shape has been a sine, the fundamental waveform. Play a 440Hz sine and 440Hz is the only frequency you hear. No side effects. When a waveform has extra frequencies, we call them harmonics.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true, showShape: true },
    { id: 'square', title: 'Square', body: 'A square wave jumps between +amplitude and −amplitude. It is made of odd harmonics: 3×, 5×, 7×… each quieter. Drag Harmonics up, then Converge, and the stacked sines become the square.', shape: 'square', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'tri', title: 'Triangle', body: 'A triangle also uses odd harmonics, but they fall off faster (1/n²) and every second one is inverted. Brighter than a sine, softer than a square.', shape: 'triangle', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'saw', title: 'Sawtooth', body: 'A saw uses every integer harmonic: 2×, 3×, 4×… It is the buzzy one, the classic synth lead. Converge the harmonics to hear it assemble.', shape: 'sawtooth', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'add', title: 'Additive synthesis', body: 'Any periodic tone can be built from sines. That is additive synthesis, and it is how the square, triangle and saw above are made. Play with shape, harmonics, and converge. Music is these shapes, plus time.', shape: 'sawtooth', amp: 1, freq: 1, air: false, harm: true, showAmp: true, showFreq: true, showShape: true },
    { id: 'end', title: 'That is a waveform', body: 'A graph of displacement over time. Amplitude is how far. Frequency is how often. Shape is the extra frequencies on top of the fundamental. You can hear all of that on this device — nothing is uploaded.', shape: 'sine', amp: 1, freq: 1, air: false, harm: false, showAmp: true, showFreq: true, showShape: true }
  ];

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

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function persist() {
    if (!saveDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      saveDb.put({
        id: 'state', step: step, amp: amp, freq: freq, shape: shape,
        harm: harm, conv: conv, vol: vol, at: Date.now()
      }).catch(function () {});
    }, 250);
  }

  function ensureAudio() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
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
      osc.type = audioType(shape);
      osc.frequency.value = audibleHz();
      osc.connect(gain);
      osc.start();
    }
  }

  function audioType(s) {
    if (s === 'square' || s === 'sawtooth' || s === 'triangle' || s === 'sine') return s;
    return 'sine';
  }

  function audibleHz() {
    return Math.max(40, freq * 110);
  }

  function syncAudio() {
    if (!osc) return;
    try { osc.type = audioType(shape); } catch (e) {}
    osc.frequency.setValueAtTime(audibleHz(), actx.currentTime);
    gain.gain.setTargetAtTime(vol * amp * 0.18, actx.currentTime, 0.02);
  }

  function drawWave() {
    var canvas = $('wave');
    if (!canvas || !M) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();
    var offset = (phase * 100) % 100;
    var main = M.getPointsForWaveform(shape, freq, amp, w, offset);
    var points = main;
    if (harm > 0) {
      var extras = M.getHarmonicsForWave(shape, freq, amp, harm);
      var waves = extras.map(function (ex) {
        return M.getPointsForWaveform(ex.shape, ex.frequency, ex.amplitude, w, offset);
      });
      points = M.applyWaveformAddition(main, waves, conv);
    }
    ctx.strokeStyle = '#0380f4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach(function (p, i) {
      var y = M.translateAxisRelativeYValue(p.y, h);
      if (i === 0) ctx.moveTo(p.x, y);
      else ctx.lineTo(p.x, y);
    });
    ctx.stroke();
  }

  function drawAir() {
    var canvas = $('air');
    if (!canvas || canvas.hidden) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var cols = 18, rows = 7, c, r, x, y, dx;
    for (c = 0; c < cols; c++) for (r = 0; r < rows; r++) {
      dx = Math.sin((phase * Math.PI * 2 * freq) - c * 0.45) * amp * 10;
      x = 24 + c * ((w - 48) / (cols - 1)) + dx;
      y = 16 + r * ((h - 32) / (rows - 1));
      ctx.fillStyle = c === 0 ? '#0380f4' : '#616161';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick() {
    if (playing) phase += 0.012;
    drawWave();
    drawAir();
    raf = root.requestAnimationFrame(tick);
  }

  function applyStep() {
    var s = STEPS[step];
    var html = '<h2>' + s.title + '</h2>';
    s.body.split('\n\n').forEach(function (p) {
      html += '<p' + (s.id === 'end' || s.id === 'tweak' ? ' class="sum"' : '') + '>' + p + '</p>';
    });
    $('copy').innerHTML = html;
    $('stepn').textContent = (step + 1) + ' / ' + STEPS.length;
    $('backBtn').disabled = step === 0;
    $('nextBtn').disabled = step === STEPS.length - 1;
    $('air').hidden = !s.air;
    $('ampRow').style.display = s.showAmp ? '' : 'none';
    $('freqRow').style.display = s.showFreq ? '' : 'none';
    $('shapeRow').style.display = s.showShape ? '' : 'none';
    $('harmRow').hidden = !s.harm;
    $('convRow').hidden = !s.harm;
    if (s.amp != null && !s.showAmp) { amp = s.amp; $('amp').value = String(amp); }
    if (s.freq != null && !s.showFreq) { freq = s.freq; $('freq').value = String(freq); }
    if (s.shape && !s.showShape) { shape = s.shape; $('shape').value = shape; }
    if (s.shape && s.showShape) { shape = s.shape; $('shape').value = shape; }
    $('ampVal').textContent = amp.toFixed(2);
    $('freqVal').textContent = freq.toFixed(1);
    syncAudio();
    persist();
  }

  function readControls() {
    amp = +$('amp').value;
    freq = +$('freq').value;
    shape = $('shape').value;
    harm = +$('harm').value;
    conv = +$('conv').value;
    vol = +$('vol').value;
    $('ampVal').textContent = amp.toFixed(2);
    $('freqVal').textContent = freq.toFixed(1);
    $('harmVal').textContent = String(harm);
    $('convVal').textContent = conv.toFixed(2);
    $('volVal').textContent = vol.toFixed(2);
    if (vol > 0) ensureAudio();
    syncAudio();
    persist();
  }

  function boot() {
    if (!$('wave') || !M) return;
    ['amp', 'freq', 'shape', 'harm', 'conv', 'vol'].forEach(function (id) {
      $(id).addEventListener('input', readControls);
    });
    $('nextBtn').addEventListener('click', function () {
      if (step < STEPS.length - 1) { step++; applyStep(); }
    });
    $('backBtn').addEventListener('click', function () {
      if (step > 0) { step--; applyStep(); }
    });
    root.document.addEventListener('keydown', function (e) {
      if (e.key === 'm' || e.key === 'M') {
        vol = vol > 0 ? 0 : 0.4;
        $('vol').value = String(vol);
        readControls();
      }
    });
    $('vol').addEventListener('pointerdown', function () { ensureAudio(); });
    var ready = Promise.resolve();
    if (saveDb) {
      ready = saveDb.get('state').then(function (row) {
        if (!row) return;
        if (row.step != null) step = Math.max(0, Math.min(STEPS.length - 1, row.step | 0));
        if (row.amp != null) { amp = +row.amp; $('amp').value = String(amp); }
        if (row.freq != null) { freq = +row.freq; $('freq').value = String(freq); }
        if (row.shape) { shape = row.shape; $('shape').value = shape; }
        if (row.harm != null) { harm = +row.harm; $('harm').value = String(harm); }
        if (row.conv != null) { conv = +row.conv; $('conv').value = String(conv); }
        if (row.vol != null) { vol = +row.vol; $('vol').value = String(vol); }
      }).catch(function () {});
    }
    ready.then(function () {
      applyStep();
      readControls();
      tick();
    });
  }

  root.WaveformsApp = { STEPS: STEPS, audibleHz: function () { return Math.max(40, freq * 110); } };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
