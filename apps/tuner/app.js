/*
 * Tuner: record a clip (never a live mic), run PitchDetect autocorrelation.
 * Last reading is private. Honest when it cannot hear.
 */
(function (root) {
  'use strict';

  var WIN = 4096;
  var NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var A4_MIN = 415, A4_MAX = 466;
  var STRINGS = {
    guitar: [
      { id: 'E2', name: 'E', octave: 2, hz440: 82.40689 },
      { id: 'A2', name: 'A', octave: 2, hz440: 110.0 },
      { id: 'D3', name: 'D', octave: 3, hz440: 146.8324 },
      { id: 'G3', name: 'G', octave: 3, hz440: 196.0 },
      { id: 'B3', name: 'B', octave: 3, hz440: 246.9417 },
      { id: 'E4', name: 'E', octave: 4, hz440: 329.6276 }
    ],
    uke: [
      { id: 'G4', name: 'G', octave: 4, hz440: 392.0 },
      { id: 'C4', name: 'C', octave: 4, hz440: 261.6256 },
      { id: 'E4', name: 'E', octave: 4, hz440: 329.6276 },
      { id: 'A4', name: 'A', octave: 4, hz440: 440.0 }
    ],
    bass: [
      { id: 'E1', name: 'E', octave: 1, hz440: 41.20344 },
      { id: 'A1', name: 'A', octave: 1, hz440: 55.0 },
      { id: 'D2', name: 'D', octave: 2, hz440: 73.41619 },
      { id: 'G2', name: 'G', octave: 2, hz440: 97.99886 }
    ]
  };

  function clampA4(n) {
    n = Math.round(Number(n) || 0);
    if (n < A4_MIN) return A4_MIN;
    if (n > A4_MAX) return A4_MAX;
    return n;
  }
  function rmsOf(samples) {
    var e = 0, i, n = samples && samples.length || 0;
    if (!n) return 0;
    for (i = 0; i < n; i++) e += samples[i] * samples[i];
    return Math.sqrt(e / n);
  }
  function centsVs(hz, target) {
    if (!(hz > 0) || !(target > 0)) return 0;
    return Math.round(1200 * Math.log(hz / target) / Math.log(2));
  }
  function hzOfString(s, a4) {
    return s.hz440 * ((a4 || 440) / 440);
  }
  function noteFromPitchA4(hz, a4) {
    return Math.round(12 * (Math.log(hz / (a4 || 440)) / Math.log(2))) + 69;
  }
  function frequencyFromNoteA4(note, a4) {
    return (a4 || 440) * Math.pow(2, (note - 69) / 12);
  }
  function detectAt(samples, sampleRate, a4) {
    a4 = a4 || 440;
    var P = root.PitchDetect;
    if (!P) return null;
    var hz = P.autoCorrelate(samples, sampleRate);
    if (!(hz > 0)) return null;
    var note = noteFromPitchA4(hz, a4);
    var name = NOTE_STRINGS[((note % 12) + 12) % 12];
    var octave = Math.floor(note / 12) - 1;
    var cents = centsVs(hz, frequencyFromNoteA4(note, a4));
    return { hz: hz, note: note, name: name, octave: octave, cents: cents, a4: a4 };
  }
  function nearestString(hz, list, a4) {
    if (!list || !list.length || !(hz > 0)) return null;
    var best = null, bestAbs = 1e9, i, c;
    for (i = 0; i < list.length; i++) {
      c = Math.abs(centsVs(hz, hzOfString(list[i], a4)));
      if (c < bestAbs) { bestAbs = c; best = list[i]; }
    }
    return best ? { string: best, cents: centsVs(hz, hzOfString(best, a4)), abs: bestAbs } : null;
  }
  function inTune(cents) {
    return Math.abs(cents) <= 5;
  }
  function windowSamples(samples, size) {
    size = size || WIN;
    var best = 0, bestAt = 0, i, j, e;
    var n = Math.min(size, samples.length);
    if (samples.length <= n) {
      var copy = [];
      for (i = 0; i < samples.length; i++) copy[i] = samples[i];
      return copy;
    }
    for (i = 0; i + n <= samples.length; i += 256) {
      e = 0;
      for (j = 0; j < n; j++) e += samples[i + j] * samples[i + j];
      if (e > best) { best = e; bestAt = i; }
    }
    var out = [];
    for (i = 0; i < n; i++) out[i] = samples[bestAt + i];
    return out;
  }
  function classify(samples, sampleRate, a4) {
    var rmsAll = rmsOf(samples);
    if (rmsAll < 0.01) return { kind: 'quiet', rms: rmsAll, reading: null };
    var sizes = samples.length >= 8192 ? [WIN, 8192] : [Math.min(WIN, samples.length)];
    var i, win, r, best = null, bestRms = 0;
    for (i = 0; i < sizes.length; i++) {
      win = windowSamples(samples, sizes[i]);
      r = detectAt(win, sampleRate, a4);
      if (r) {
        var wRms = rmsOf(win);
        if (wRms >= bestRms) { bestRms = wRms; best = r; }
      }
    }
    if (best) return { kind: 'ok', rms: bestRms || rmsAll, reading: best };
    if (rmsAll < 0.02) return { kind: 'quiet', rms: rmsAll, reading: null };
    return { kind: 'none', rms: rmsAll, reading: null };
  }
  function applyTarget(reading, instrument, targetId, a4) {
    if (!reading) return null;
    var list = STRINGS[instrument];
    var out = {
      hz: reading.hz, note: reading.note, name: reading.name, octave: reading.octave,
      cents: reading.cents, a4: a4, instrument: instrument, target: targetId || 'auto'
    };
    if (!list) return out;
    if (targetId && targetId !== 'auto') {
      var s = null, i;
      for (i = 0; i < list.length; i++) if (list[i].id === targetId) s = list[i];
      if (s) {
        out.target = s.id;
        out.aimed = s.name + s.octave;
        out.cents = centsVs(reading.hz, hzOfString(s, a4));
        out.name = s.name;
        out.octave = s.octave;
      }
    } else {
      var near = nearestString(reading.hz, list, a4);
      if (near && near.abs <= 100) {
        out.aimed = near.string.name + near.string.octave;
        out.nearId = near.string.id;
      }
    }
    return out;
  }

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var last = null;
  var actx = null;
  var tone = null, toneGain = null, toneTimer = 0;
  var settings = { a4: 440, instrument: 'chromatic', target: 'auto' };
  var holdTimer = 0, holdRepeat = 0;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function say(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = err ? 'err' : '';
  }

  function ac() {
    if (actx) return actx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    return actx;
  }

  function stopTone() {
    if (toneTimer) { clearTimeout(toneTimer); toneTimer = 0; }
    if (tone) {
      try { tone.stop(); } catch (e) {}
      tone = null;
    }
    toneGain = null;
  }

  function playHz(hz, ms) {
    var ctx = ac();
    if (!ctx || !(hz > 0)) return;
    if (ctx.resume) ctx.resume();
    stopTone();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    var now = ctx.currentTime;
    var dur = (ms || 1200) / 1000;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    tone = osc;
    toneGain = g;
    toneTimer = setTimeout(function () { tone = null; }, (ms || 1200) + 80);
  }

  function pipeHz() {
    if (settings.target && settings.target !== 'auto') {
      var list = STRINGS[settings.instrument] || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === settings.target) return hzOfString(list[i], settings.a4);
      }
    }
    if (last && last.hz) return last.hz;
    return settings.a4;
  }

  function paintNeedle(cents) {
    var c = $('needle');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h - 18, rad = Math.min(w * 0.42, h - 36);
    ctx.strokeStyle = '#3a4050';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, Math.PI, 0, false);
    ctx.stroke();
    function tick(centsVal, len, col) {
      var t = centsVal / 50;
      var ang = Math.PI + (t + 1) * (Math.PI / 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (rad - len), cy + Math.sin(ang) * (rad - len));
      ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
      ctx.stroke();
    }
    tick(-50, 14, '#6ec8ff');
    tick(-20, 10, '#6ec8ff');
    tick(-5, 8, '#3dba7a');
    tick(0, 16, '#3dba7a');
    tick(5, 8, '#3dba7a');
    tick(20, 10, '#ff8a6e');
    tick(50, 14, '#ff8a6e');
    ctx.fillStyle = '#348781';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    if (cents == null) return;
    var clamped = Math.max(-50, Math.min(50, cents));
    var t = clamped / 50;
    var ang = Math.PI + (t + 1) * (Math.PI / 2);
    ctx.strokeStyle = cents < -5 ? '#6ec8ff' : (cents > 5 ? '#ff8a6e' : '#3dba7a');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * (rad - 8), cy + Math.sin(ang) * (rad - 8));
    ctx.stroke();
  }

  function paintReading(r) {
    var det = $('detector');
    if (r && root.document && root.document.body) {
      root.document.body.classList.remove('empty');
    }
    if (!r) {
      if (det) det.className = 'vague';
      if ($('note')) $('note').textContent = '—';
      if ($('oct')) $('oct').textContent = '';
      if ($('pitch')) $('pitch').textContent = '—';
      if ($('detune')) $('detune').className = '';
      if ($('detune_amt')) $('detune_amt').textContent = '—';
      var aimed0 = $('aimed');
      if (aimed0) { aimed0.hidden = true; aimed0.textContent = ''; }
      paintNeedle(null);
      return;
    }
    var cents = r.cents || 0;
    var tuned = inTune(cents);
    if (det) det.className = tuned ? 'confident intune' : 'confident';
    if ($('note')) $('note').textContent = r.name + (r.octave != null ? String(r.octave) : '');
    if ($('oct')) $('oct').textContent = r.aimed ? 'aimed at ' + r.aimed : '';
    if ($('pitch')) $('pitch').textContent = String(Math.round(r.hz * 10) / 10);
    var du = $('detune');
    if (du) {
      if (tuned) du.className = 'ok';
      else if (cents < 0) du.className = 'flat';
      else du.className = 'sharp';
    }
    if ($('detune_amt')) $('detune_amt').textContent = tuned ? '0' : String(Math.abs(cents));
    var aimed = $('aimed');
    if (aimed) {
      if (r.aimed && r.target && r.target !== 'auto') {
        aimed.hidden = false;
        aimed.textContent = 'versus ' + r.aimed + ' at A4=' + settings.a4;
      } else {
        aimed.hidden = true;
        aimed.textContent = '';
      }
    }
    paintNeedle(cents);
    highlightNear(r.nearId || (r.target !== 'auto' ? r.target : null));
  }

  function highlightNear(id) {
    var box = $('strings');
    if (!box) return;
    var btns = box.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('near', !!id && btns[i].getAttribute('data-id') === id);
      btns[i].classList.toggle('on', settings.target === btns[i].getAttribute('data-id'));
    }
  }

  function plotWave(samples) {
    var c = $('wave');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width, h = c.height, i, n, start = 0;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#9aa0ae';
    ctx.beginPath();
    if (!samples || !samples.length) {
      ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      return;
    }
    for (i = 0; i < samples.length - 1; i++) {
      if (samples[i] < 0 && samples[i + 1] >= 0) { start = i; break; }
    }
    n = Math.min(WIN, samples.length - start);
    for (i = 0; i < n; i++) {
      var x = i / (n - 1) * w;
      var y = h / 2 - samples[start + i] * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function persist(row) {
    if (!saveDb) return;
    saveDb.put({
      id: 'last',
      hz: row ? row.hz : null,
      name: row ? row.name : null,
      octave: row ? row.octave : null,
      cents: row ? row.cents : null,
      at: Date.now(),
      a4: settings.a4,
      instrument: settings.instrument,
      target: settings.target
    }).catch(function () {});
  }

  function persistPrefs() {
    if (!saveDb) return;
    var row = last ? {
      id: 'last', hz: last.hz, name: last.name, octave: last.octave, cents: last.cents,
      at: Date.now(), a4: settings.a4, instrument: settings.instrument, target: settings.target
    } : {
      id: 'last', a4: settings.a4, instrument: settings.instrument, target: settings.target, at: Date.now()
    };
    saveDb.put(row).catch(function () {});
  }

  function decodeClip(clip) {
    var ctx = ac();
    if (!ctx || !clip || !clip.bytes) return Promise.reject(new Error('That take had no audio.'));
    var copy = clip.bytes.slice ? clip.bytes.slice(0) : clip.bytes;
    return ctx.decodeAudioData(copy).then(function (buf) {
      var ch = buf.getChannelData(0);
      var samples = [];
      var i;
      for (i = 0; i < ch.length; i++) samples[i] = ch[i];
      return { samples: samples, rate: buf.sampleRate };
    });
  }

  function showEmpty() {
    last = null;
    paintReading(null);
    plotWave(null);
    if (root.document && root.document.body) root.document.body.classList.add('empty');
  }

  function recordNote() {
    var api = root.gifos;
    if (!api || typeof api.recordAudio !== 'function') {
      say('Open this inside GifOS to record a note. There is no live microphone in here.', true);
      return;
    }
    var btn = $('recBtn');
    if (btn) btn.disabled = true;
    stopTone();
    say('Recording — play or sing one pitch, then stop.');
    api.recordAudio({ maxSeconds: 4 }).then(function (clip) {
      return decodeClip(clip);
    }).then(function (aud) {
      var win = windowSamples(aud.samples, Math.min(WIN, aud.samples.length));
      plotWave(win);
      var cls = classify(aud.samples, aud.rate, settings.a4);
      if (cls.kind === 'quiet') {
        say('Too quiet — nothing to read. Get closer, or play a louder single note.', true);
        return;
      }
      if (cls.kind !== 'ok') {
        say('Heard sound, but no clear pitch. Try one string, a whistle, or a hummed tone.', true);
        return;
      }
      var r = applyTarget(cls.reading, settings.instrument, settings.target, settings.a4);
      last = r;
      if (root.document && root.document.body) root.document.body.classList.remove('empty');
      paintReading(r);
      if (inTune(r.cents)) say('In tune. Last reading on this device.');
      else if (r.cents < 0) say('Flat of ' + (r.aimed || (r.name + r.octave)) + '. Last reading on this device.');
      else say('Sharp of ' + (r.aimed || (r.name + r.octave)) + '. Last reading on this device.');
      persist(r);
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Recording cancelled.');
      else say(m, true);
    }).then(function () { if (btn) btn.disabled = false; });
  }

  function renderStrings() {
    var box = $('strings');
    if (!box) return;
    var list = STRINGS[settings.instrument];
    box.innerHTML = '';
    if (!list) { box.hidden = true; return; }
    box.hidden = false;
    var auto = document.createElement('button');
    auto.type = 'button';
    auto.textContent = 'Auto';
    auto.setAttribute('data-id', 'auto');
    if (settings.target === 'auto') auto.classList.add('on');
    box.appendChild(auto);
    list.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.name + s.octave;
      b.setAttribute('data-id', s.id);
      if (settings.target === s.id) b.classList.add('on');
      box.appendChild(b);
    });
  }

  function setInstrument(id) {
    if (id !== 'chromatic' && !STRINGS[id]) return;
    settings.instrument = id;
    settings.target = 'auto';
    renderStrings();
    var insts = $('insts');
    if (insts) {
      var btns = insts.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('on', btns[i].getAttribute('data-inst') === id);
      }
    }
    if (last && last.hz) {
      last = applyTarget(last, settings.instrument, settings.target, settings.a4);
      paintReading(last);
    }
    persistPrefs();
    updatePipeLabel();
  }

  function setTarget(id) {
    var list = STRINGS[settings.instrument];
    if (id !== 'auto' && !(list && list.some(function (s) { return s.id === id; }))) return;
    settings.target = id;
    renderStrings();
    if (last && last.hz) {
      last = applyTarget(last, settings.instrument, settings.target, settings.a4);
      paintReading(last);
    }
    persistPrefs();
    updatePipeLabel();
    if (id !== 'auto') {
      var s = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === id) s = list[i];
      if (s) playHz(hzOfString(s, settings.a4), 900);
    }
  }

  function setA4(n) {
    settings.a4 = clampA4(n);
    var el = $('a4');
    if (el) el.textContent = String(settings.a4);
    if (last && last.hz) {
      var note = noteFromPitchA4(last.hz, settings.a4);
      var rebuilt = {
        hz: last.hz,
        note: note,
        name: NOTE_STRINGS[((note % 12) + 12) % 12],
        octave: Math.floor(note / 12) - 1,
        cents: centsVs(last.hz, frequencyFromNoteA4(note, settings.a4)),
        a4: settings.a4
      };
      last = applyTarget(rebuilt, settings.instrument, settings.target, settings.a4);
      paintReading(last);
    }
    persistPrefs();
    updatePipeLabel();
  }

  function updatePipeLabel() {
    var btn = $('pipeBtn');
    if (!btn) return;
    if (settings.target && settings.target !== 'auto') btn.textContent = 'Play ' + settings.target;
    else btn.textContent = 'Play A4';
  }

  function holdStart(dir) {
    holdStop();
    setA4(settings.a4 + dir);
    holdTimer = setTimeout(function () {
      holdRepeat = setInterval(function () { setA4(settings.a4 + dir); }, 80);
    }, 380);
  }
  function holdStop() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    if (holdRepeat) { clearInterval(holdRepeat); holdRepeat = 0; }
  }
  function bindHold(el, dir) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      holdStart(dir);
    });
    el.addEventListener('pointerup', holdStop);
    el.addEventListener('pointercancel', holdStop);
    el.addEventListener('pointerleave', holdStop);
  }

  function boot() {
    if (!$('recBtn') || !root.PitchDetect) return;
    $('recBtn').addEventListener('click', recordNote);
    var pipe = $('pipeBtn');
    if (pipe) pipe.addEventListener('click', function () { playHz(pipeHz(), 1200); });
    var insts = $('insts');
    if (insts) insts.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      setInstrument(t.getAttribute('data-inst'));
    });
    var str = $('strings');
    if (str) str.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      setTarget(t.getAttribute('data-id'));
    });
    bindHold($('a4Down'), -1);
    bindHold($('a4Up'), +1);
    plotWave(null);
    paintNeedle(null);
    renderStrings();
    updatePipeLabel();
    try {
      if (root.gifos && typeof root.gifos.onBack === 'function') {
        root.gifos.onBack(function () {
          if (tone) { stopTone(); return true; }
          return false;
        });
      }
    } catch (e) {}
    if (saveDb) {
      saveDb.get('last').then(function (row) {
        if (!row) return;
        if (row.a4) settings.a4 = clampA4(row.a4);
        if (row.instrument) settings.instrument = row.instrument;
        if (row.target) settings.target = row.target;
        var a4el = $('a4');
        if (a4el) a4el.textContent = String(settings.a4);
        renderStrings();
        updatePipeLabel();
        if (!row.hz) return;
        last = applyTarget({
          hz: row.hz, note: row.note, name: row.name, octave: row.octave, cents: row.cents, a4: settings.a4
        }, settings.instrument, settings.target, settings.a4);
        if (root.document && root.document.body) root.document.body.classList.remove('empty');
        paintReading(last);
        say('Last reading on this device. Record a note to replace it.');
      }).catch(function () {});
    }
  }

  root.TunerApp = {
    WIN: WIN,
    A4_MIN: A4_MIN,
    A4_MAX: A4_MAX,
    STRINGS: STRINGS,
    clampA4: clampA4,
    rmsOf: rmsOf,
    centsVs: centsVs,
    hzOfString: hzOfString,
    noteFromPitchA4: noteFromPitchA4,
    frequencyFromNoteA4: frequencyFromNoteA4,
    detectAt: detectAt,
    nearestString: nearestString,
    inTune: inTune,
    windowSamples: windowSamples,
    classify: classify,
    applyTarget: applyTarget
  };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
