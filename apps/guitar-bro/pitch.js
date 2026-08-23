// Peak-in-band detector from makaroni4/guitar_bro's AudioProcessor, plus a
// tiny FFT so a recorded clip (never a live mic) can name a note.
(function (root) {
  'use strict';

  var N = 8192;
  var COS = new Float64Array(N);
  var SIN = new Float64Array(N);
  var i;
  for (i = 0; i < N; i++) {
    COS[i] = Math.cos(-2 * Math.PI * i / N);
    SIN[i] = Math.sin(-2 * Math.PI * i / N);
  }

  function fftMag(samples) {
    var re = new Float64Array(N);
    var im = new Float64Array(N);
    var n = Math.min(samples.length, N);
    var j, k, bit, step, half, wr, wi, cr, ci, ur, ui, vr, vi, len, t;
    for (i = 0; i < n; i++) {
      t = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1 || 1)));
      re[i] = samples[i] * t;
    }
    j = 0;
    for (i = 1; i < N; i++) {
      bit = N >> 1;
      while (j & bit) { j ^= bit; bit >>= 1; }
      j ^= bit;
      if (i < j) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (step = 2; step <= N; step <<= 1) {
      half = step >> 1;
      len = N / step;
      for (i = 0; i < N; i += step) {
        k = 0;
        for (j = 0; j < half; j++) {
          wr = COS[k]; wi = SIN[k];
          ur = re[i + j]; ui = im[i + j];
          vr = re[i + j + half] * wr - im[i + j + half] * wi;
          vi = re[i + j + half] * wr + im[i + j + half] * wi;
          re[i + j] = ur + vr;
          im[i + j] = ui + vi;
          re[i + j + half] = ur - vr;
          im[i + j + half] = ui - vi;
          k += len;
        }
      }
    }
    var mag = new Float64Array(N / 2);
    for (i = 0; i < N / 2; i++) mag[i] = re[i] * re[i] + im[i] * im[i];
    return mag;
  }

  function peakHz(samples, rate, range) {
    var mag = fftMag(samples);
    var step = rate / N;
    var lo = Math.round(range[0] / step);
    var hi = Math.round(range[1] / step);
    if (lo < 1) lo = 1;
    if (hi > mag.length - 1) hi = mag.length - 1;
    var maxA = -1, arg = -1, total = 0, i, around, energy;
    for (i = lo; i < hi; i++) {
      total += mag[i];
      if (mag[i] > maxA) { maxA = mag[i]; arg = i; }
    }
    if (arg < 0 || total <= 0) return -1;
    around = Math.round(20 / step) + 1;
    energy = 0;
    for (i = Math.max(0, arg - around); i <= Math.min(mag.length - 1, arg + around); i++) energy += mag[i];
    if (energy / total < 0.5) return -1;
    if (arg > 0 && arg < mag.length - 1) {
      var a = mag[arg - 1], b = mag[arg], c = mag[arg + 1], d = a - 2 * b + c;
      if (Math.abs(d) > 1e-18) arg = arg + 0.5 * (a - c) / d;
    }
    return arg * step;
  }

  function nearestNote(hz, stringCfg) {
    if (!(hz > 0) || !stringCfg) return null;
    var best = null, bestErr = 1e9, i, err, row;
    for (i = 0; i < stringCfg.freqs.length; i++) {
      row = stringCfg.freqs[i];
      err = Math.abs(row[0] - hz);
      if (err < bestErr) { bestErr = err; best = row[1]; }
    }
    if (bestErr >= 20) return null;
    return best;
  }

  var actx = null;
  function ac() {
    if (actx) return actx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    return actx;
  }

  root.GBPitch = {
    N: N,
    fftMag: fftMag,
    peakHz: peakHz,
    detect: function (samples, rate, stringCfg) {
      return nearestNote(peakHz(samples, rate, stringCfg.range), stringCfg);
    },
    nearestNote: nearestNote,
    sine: function (hz, rate, n) {
      var out = new Float32Array(n || N);
      var i, w = 2 * Math.PI * hz / rate;
      for (i = 0; i < out.length; i++) out[i] = Math.sin(w * i);
      return out;
    },
    ac: ac,
    beep: function (hz, seconds) {
      var ctx = ac();
      if (!ctx || !(hz > 0)) return;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var t = ctx.currentTime;
      var dur = seconds || 0.55;
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    decode: function (clip) {
      var ctx = ac();
      if (!ctx || !clip || !clip.bytes) return Promise.reject(new Error('no audio'));
      var copy = clip.bytes.slice ? clip.bytes.slice(0) : clip.bytes;
      return ctx.decodeAudioData(copy).then(function (buf) {
        var ch = buf.getChannelData(0);
        var samples = new Float32Array(ch.length);
        samples.set(ch);
        return { samples: samples, rate: buf.sampleRate };
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
