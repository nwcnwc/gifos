/* PitchDetect autocorrelation (ACF2+) from cwilso/PitchDetect js/pitchdetect.js.
 * Classic IIFE. No live mic, no fetch, no analyser loop.
 */
(function (root) {
  'use strict';

  var noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function noteFromPitch(frequency) {
    var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  }

  function frequencyFromNoteNumber(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function centsOffFromPitch(frequency, note) {
    return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
  }

  function autoCorrelate(buf, sampleRate) {
    var SIZE = buf.length;
    var rms = 0;
    var i, j, val;
    for (i = 0; i < SIZE; i++) {
      val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    var r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    var sliced = [];
    for (i = r1; i < r2; i++) sliced.push(buf[i]);
    buf = sliced;
    SIZE = buf.length;
    if (SIZE < 32) return -1;

    var c = [];
    for (i = 0; i < SIZE; i++) c[i] = 0;
    for (i = 0; i < SIZE; i++) {
      for (j = 0; j < SIZE - i; j++) c[i] = c[i] + buf[j] * buf[j + i];
    }

    var d = 0;
    while (d + 1 < SIZE && c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (i = d; i < SIZE; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    var T0 = maxpos;
    if (!(T0 > 0) || T0 + 1 >= SIZE) return -1;

    var x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    var a = (x1 + x3 - 2 * x2) / 2;
    var b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  }

  function detect(samples, sampleRate) {
    var hz = autoCorrelate(samples, sampleRate);
    if (!(hz > 0) || hz === -1) return null;
    var note = noteFromPitch(hz);
    var name = noteStrings[((note % 12) + 12) % 12];
    var octave = Math.floor(note / 12) - 1;
    var cents = centsOffFromPitch(hz, note);
    return { hz: hz, note: note, name: name, octave: octave, cents: cents };
  }

  function sine(hz, rate, n) {
    var out = [];
    var i, w = 2 * Math.PI * hz / rate;
    for (i = 0; i < n; i++) out[i] = Math.sin(w * i);
    return out;
  }

  root.PitchDetect = {
    noteStrings: noteStrings,
    noteFromPitch: noteFromPitch,
    frequencyFromNoteNumber: frequencyFromNoteNumber,
    centsOffFromPitch: centsOffFromPitch,
    autoCorrelate: autoCorrelate,
    detect: detect,
    sine: sine
  };
})(typeof window !== 'undefined' ? window : this);
