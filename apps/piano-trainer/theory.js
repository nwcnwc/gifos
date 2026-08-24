// Scale / chord / fifth / quiz helpers. Destack of ZaneH/piano-trainer (MIT).
(function (g) {
  'use strict';

  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
  var OCT = 12;
  var MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  var NAT_MIN = [0, 2, 3, 5, 7, 8, 10, 12];
  var MEL_MIN = [0, 2, 3, 5, 7, 9, 11, 12];
  var FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  var TONICS = [
    { id: 'c-major', label: 'C Major', root: 48, kind: 'major', name: 'C' },
    { id: 'g-major', label: 'G Major', root: 55, kind: 'major', name: 'G' },
    { id: 'd-major', label: 'D Major', root: 50, kind: 'major', name: 'D' },
    { id: 'a-major', label: 'A Major', root: 57, kind: 'major', name: 'A' },
    { id: 'e-major', label: 'E Major', root: 52, kind: 'major', name: 'E' },
    { id: 'f-major', label: 'F Major', root: 53, kind: 'major', name: 'F' },
    { id: 'bb-major', label: 'Bb Major', root: 58, kind: 'major', name: 'Bb' },
    { id: 'a-minor', label: 'A Minor', root: 57, kind: 'nat', name: 'A' },
    { id: 'e-minor', label: 'E Minor', root: 52, kind: 'nat', name: 'E' },
    { id: 'd-minor', label: 'D Minor', root: 50, kind: 'nat', name: 'D' },
    { id: 'c-minor', label: 'C Minor', root: 48, kind: 'nat', name: 'C' },
    { id: 'a-mel', label: 'A Melodic Minor', root: 57, kind: 'mel', name: 'A' },
    { id: 'd-mel', label: 'D Melodic Minor', root: 50, kind: 'mel', name: 'D' }
  ];

  function ivs(kind) {
    if (kind === 'nat') return NAT_MIN;
    if (kind === 'mel') return MEL_MIN;
    return MAJOR;
  }
  function noteName(midi) { return NOTE[((midi % 12) + 12) % 12]; }
  function scaleNotes(tonic) {
    var steps = ivs(tonic.kind);
    return steps.map(function (st) { return tonic.root + st; });
  }
  function triad(scale, degree) {
    // degree 0..6; notes wrap an octave
    var a = scale[degree];
    var b = scale[(degree + 2) % 7];
    var c = scale[(degree + 4) % 7];
    if (b < a) b += OCT;
    if (c < b) c += OCT;
    return [a, b, c];
  }
  function seventh(scale, degree) {
    var t = triad(scale, degree);
    var d = scale[(degree + 6) % 7];
    if (d < t[2]) d += OCT;
    return t.concat([d]);
  }
  function fifthOf(scale, midi) {
    var i, idx = -1;
    for (i = 0; i < scale.length - 1; i++) if (scale[i] === midi) { idx = i; break; }
    if (idx < 0) {
      var n = ((midi % 12) + 12) % 12;
      for (i = 0; i < scale.length - 1; i++) {
        if (((scale[i] % 12) + 12) % 12 === n) { idx = i; break; }
      }
    }
    if (idx < 0) return midi + 7;
    var f = scale[(idx + 4) % 7];
    if (f < midi) f += OCT;
    return f;
  }
  function samePitch(a, b) {
    return ((a % 12) + 12) % 12 === ((b % 12) + 12) % 12;
  }
  function chordMatch(held, want) {
    if (held.length < want.length) return false;
    var i, ok;
    for (i = 0; i < want.length; i++) {
      ok = held.some(function (h) { return samePitch(h, want[i]); });
      if (!ok) return false;
    }
    return true;
  }
  function shuffle(list, rand) {
    rand = rand || Math.random;
    var a = list.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rand() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function quizItem(rand) {
    rand = rand || Math.random;
    var fifthQ = rand() < 0.5;
    if (fifthQ) {
      var n = FIFTHS[Math.floor(rand() * FIFTHS.length)];
      var idx = FIFTHS.indexOf(n);
      var ans = FIFTHS[(idx + 1) % FIFTHS.length];
      var opts = [ans];
      while (opts.length < 4) {
        var c = FIFTHS[Math.floor(rand() * FIFTHS.length)];
        if (opts.indexOf(c) < 0) opts.push(c);
      }
      return {
        type: 'fifth',
        prompt: 'What is a fifth above ' + n + '?',
        answer: ans,
        options: shuffle(opts, rand)
      };
    }
    var t = TONICS[Math.floor(rand() * TONICS.length)];
    var opts2 = [t.label];
    while (opts2.length < 4) {
      var x = TONICS[Math.floor(rand() * TONICS.length)].label;
      if (opts2.indexOf(x) < 0) opts2.push(x);
    }
    return {
      type: 'key',
      prompt: 'Which scale starts on ' + t.name + (t.kind === 'major' ? ' major' : ' minor') + '?',
      answer: t.label,
      options: shuffle(opts2, rand)
    };
  }

  g.PT = {
    NOTE: NOTE, FLAT: FLAT, OCT: OCT, FIFTHS: FIFTHS, TONICS: TONICS,
    noteName: noteName, scaleNotes: scaleNotes, triad: triad, seventh: seventh,
    fifthOf: fifthOf, samePitch: samePitch, chordMatch: chordMatch,
    shuffle: shuffle, quizItem: quizItem
  };
})(typeof window !== 'undefined' ? window : globalThis);
