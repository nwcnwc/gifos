/*
 * Tuner: record a clip (never a live mic), run PitchDetect autocorrelation.
 * Last reading is private.
 */
(function (root) {
  'use strict';

  var WIN = 2048;
  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var last = null;
  var actx = null;

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

  function paintReading(r) {
    var det = $('detector');
    if (!r) {
      det.className = 'vague';
      $('note').textContent = '—';
      $('pitch').textContent = '—';
      $('detune').className = '';
      $('detune_amt').textContent = '—';
      drawNeedle(null);
      return;
    }
    det.className = 'confident';
    $('note').textContent = r.name + (r.octave != null ? r.octave : '');
    $('pitch').textContent = String(Math.round(r.hz));
    if (!r.cents) {
      $('detune').className = '';
      $('detune_amt').textContent = '0';
    } else if (r.cents < 0) {
      $('detune').className = 'flat';
      $('detune_amt').textContent = String(Math.abs(r.cents));
    } else {
      $('detune').className = 'sharp';
      $('detune_amt').textContent = String(Math.abs(r.cents));
    }
    drawNeedle(r.cents);
  }

  function drawNeedle(cents) {
    var c = $('needle');
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#555a66';
    ctx.beginPath();
    ctx.moveTo(20, h - 18); ctx.lineTo(w - 20, h - 18);
    ctx.stroke();
    ctx.fillStyle = '#348781';
    ctx.beginPath();
    ctx.arc(w / 2, h - 18, 4, 0, Math.PI * 2);
    ctx.fill();
    if (cents == null) return;
    var t = Math.max(-50, Math.min(50, cents)) / 50;
    var x = w / 2 + t * (w / 2 - 28);
    ctx.strokeStyle = cents < 0 ? '#6ec8ff' : (cents > 0 ? '#ff8a6e' : '#348781');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 18);
    ctx.lineTo(x, 16);
    ctx.stroke();
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

  function windowSamples(samples) {
    var best = 0, bestAt = 0, i, j, e;
    var n = Math.min(WIN, samples.length);
    if (samples.length <= WIN) return samples.slice ? samples.slice() : samples;
    for (i = 0; i + n < samples.length; i += 256) {
      e = 0;
      for (j = 0; j < n; j++) e += samples[i + j] * samples[i + j];
      if (e > best) { best = e; bestAt = i; }
    }
    var out = [];
    for (i = 0; i < n; i++) out[i] = samples[bestAt + i];
    return out;
  }

  function persist(row) {
    if (!saveDb || !row) return;
    saveDb.put({
      id: 'last',
      hz: row.hz,
      name: row.name,
      octave: row.octave,
      cents: row.cents,
      at: Date.now()
    }).catch(function () {});
  }

  function decodeClip(clip) {
    var ctx = ac();
    if (!ctx || !clip || !clip.bytes) return Promise.reject(new Error('no audio'));
    var copy = clip.bytes.slice ? clip.bytes.slice(0) : clip.bytes;
    return ctx.decodeAudioData(copy).then(function (buf) {
      var ch = buf.getChannelData(0);
      var samples = [];
      var i;
      for (i = 0; i < ch.length; i++) samples[i] = ch[i];
      return { samples: samples, rate: buf.sampleRate };
    });
  }

  function recordNote() {
    var api = root.gifos;
    if (!api || typeof api.recordAudio !== 'function') {
      say('Open this inside GifOS to record a note.', true);
      return;
    }
    var btn = $('recBtn');
    btn.disabled = true;
    say('Recording — play or sing one pitch, then stop.');
    api.recordAudio({ maxSeconds: 3 }).then(function (clip) {
      return decodeClip(clip);
    }).then(function (aud) {
      var win = windowSamples(aud.samples);
      plotWave(win);
      var r = root.PitchDetect.detect(win, aud.rate);
      last = r;
      paintReading(r);
      if (!r) say('No clear pitch. Try a louder, simpler tone — a whistle or one guitar string.');
      else {
        say('Last reading on this device.');
        persist(r);
      }
    }).catch(function (e) {
      var m = (e && e.message) || String(e);
      if (/cancel/i.test(m)) say('Recording cancelled.');
      else say(m, true);
    }).then(function () { btn.disabled = false; });
  }

  function boot() {
    if (!$('recBtn') || !root.PitchDetect) return;
    $('recBtn').addEventListener('click', recordNote);
    plotWave(null);
    drawNeedle(null);
    if (saveDb) {
      saveDb.get('last').then(function (row) {
        if (!row || !row.hz) return;
        last = { hz: row.hz, name: row.name, octave: row.octave, cents: row.cents };
        paintReading(last);
        say('Last reading on this device.');
      }).catch(function () {});
    }
  }

  root.TunerApp = { windowSamples: windowSamples, WIN: WIN };

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot);
  } else if (root.document) {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
