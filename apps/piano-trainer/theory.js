// Scale / chord / fifth / quiz helpers. Destack of ZaneH/piano-trainer (MIT).
(function (g) {
  'use strict';

  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
  var PRETTY = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'F#', 'G#': 'Ab', 'A#': 'Bb' };
  var OCT = 12;
  var MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  var NAT_MIN = [0, 2, 3, 5, 7, 8, 10, 12];
  var MEL_MIN = [0, 2, 3, 5, 7, 9, 11, 12];
  var HAR_MIN = [0, 2, 3, 5, 7, 8, 11, 12];
  var FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  var REL_MIN = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];
  var SHARPS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7 };
  var FLATS = { F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7 };
  var ROMAN_MAJ = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  var ROMAN_NAT = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
  var ROMAN_MEL = ['i', 'ii', 'III+', 'IV', 'V', 'vi°', 'vii°'];
  var ROMAN_HAR = ['i', 'ii°', 'III+', 'iv', 'V', 'VI', 'vii°'];
  var HOME = {
    KeyA: 48, KeyS: 50, KeyD: 52, KeyF: 53, KeyG: 55, KeyH: 57, KeyJ: 59,
    KeyK: 60, KeyL: 62, Semicolon: 64, Quote: 65,
    KeyW: 49, KeyE: 51, KeyT: 54, KeyY: 56, KeyU: 58, KeyO: 61, KeyP: 63
  };
  var HOME_LABEL = {
    48: 'A', 50: 'S', 52: 'D', 53: 'F', 55: 'G', 57: 'H', 59: 'J',
    60: 'K', 62: 'L', 64: ';', 65: "'",
    49: 'W', 51: 'E', 54: 'T', 56: 'Y', 58: 'U', 61: 'O', 63: 'P'
  };
  var WHITES = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
  var BLACKS = [49, 51, 54, 56, 58, 61, 63, 66, 68, 70];
  var MODES = ['scales', 'chords', 'sevenths', 'fifths', 'quiz'];
  var TONICS = [
    { id: 'c-major', label: 'C Major', root: 48, kind: 'major', name: 'C' },
    { id: 'g-major', label: 'G Major', root: 55, kind: 'major', name: 'G' },
    { id: 'd-major', label: 'D Major', root: 50, kind: 'major', name: 'D' },
    { id: 'a-major', label: 'A Major', root: 57, kind: 'major', name: 'A' },
    { id: 'e-major', label: 'E Major', root: 52, kind: 'major', name: 'E' },
    { id: 'b-major', label: 'B Major', root: 59, kind: 'major', name: 'B' },
    { id: 'f-major', label: 'F Major', root: 53, kind: 'major', name: 'F' },
    { id: 'bb-major', label: 'Bb Major', root: 58, kind: 'major', name: 'Bb' },
    { id: 'eb-major', label: 'Eb Major', root: 51, kind: 'major', name: 'Eb' },
    { id: 'ab-major', label: 'Ab Major', root: 56, kind: 'major', name: 'Ab' },
    { id: 'fs-major', label: 'F# Major', root: 54, kind: 'major', name: 'F#' },
    { id: 'a-minor', label: 'A Minor', root: 57, kind: 'nat', name: 'A' },
    { id: 'e-minor', label: 'E Minor', root: 52, kind: 'nat', name: 'E' },
    { id: 'd-minor', label: 'D Minor', root: 50, kind: 'nat', name: 'D' },
    { id: 'c-minor', label: 'C Minor', root: 48, kind: 'nat', name: 'C' },
    { id: 'g-minor', label: 'G Minor', root: 55, kind: 'nat', name: 'G' },
    { id: 'b-minor', label: 'B Minor', root: 59, kind: 'nat', name: 'B' },
    { id: 'fs-minor', label: 'F# Minor', root: 54, kind: 'nat', name: 'F#' },
    { id: 'a-mel', label: 'A Melodic Minor', root: 57, kind: 'mel', name: 'A' },
    { id: 'd-mel', label: 'D Melodic Minor', root: 50, kind: 'mel', name: 'D' },
    { id: 'e-mel', label: 'E Melodic Minor', root: 52, kind: 'mel', name: 'E' },
    { id: 'c-mel', label: 'C Melodic Minor', root: 48, kind: 'mel', name: 'C' },
    { id: 'a-har', label: 'A Harmonic Minor', root: 57, kind: 'har', name: 'A' },
    { id: 'e-har', label: 'E Harmonic Minor', root: 52, kind: 'har', name: 'E' }
  ];
  var QUAL = {
    '0,4,7': 'major',
    '0,3,7': 'minor',
    '0,3,6': 'diminished',
    '0,4,8': 'augmented',
    '0,2,7': 'sus2',
    '0,5,7': 'sus4',
    '0,4,7,10': '7',
    '0,4,7,11': 'maj7',
    '0,3,7,10': 'm7',
    '0,3,6,10': 'm7b5',
    '0,3,6,9': 'dim7',
    '0,4,7,9': '6',
    '0,3,7,9': 'm6'
  };

  function ivs(kind) {
    if (kind === 'nat') return NAT_MIN;
    if (kind === 'mel') return MEL_MIN;
    if (kind === 'har') return HAR_MIN;
    return MAJOR;
  }
  function romanOf(kind) {
    if (kind === 'nat') return ROMAN_NAT;
    if (kind === 'mel') return ROMAN_MEL;
    if (kind === 'har') return ROMAN_HAR;
    return ROMAN_MAJ;
  }
  function pc(midi) { return ((midi % 12) + 12) % 12; }
  function noteName(midi) { return NOTE[pc(midi)]; }
  function prettyName(midi) {
    var n = noteName(midi);
    return PRETTY[n] || n;
  }
  function tonicById(id) {
    var i;
    for (i = 0; i < TONICS.length; i++) if (TONICS[i].id === id) return TONICS[i];
    return TONICS[0];
  }
  function scaleNotes(tonic) {
    var steps = ivs(tonic.kind);
    return steps.map(function (st) { return tonic.root + st; });
  }
  function triad(scale, degree) {
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
      var n = pc(midi);
      for (i = 0; i < scale.length - 1; i++) {
        if (pc(scale[i]) === n) { idx = i; break; }
      }
    }
    if (idx < 0) return midi + 7;
    var f = scale[(idx + 4) % 7];
    if (f < midi) f += OCT;
    return f;
  }
  function samePitch(a, b) { return pc(a) === pc(b); }
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
  function uniqPc(midis) {
    var seen = {}, out = [];
    (midis || []).forEach(function (m) {
      var p = pc(m);
      if (!seen[p]) { seen[p] = 1; out.push(p); }
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }
  function chordName(midis) {
    var pcs = uniqPc(midis);
    if (!pcs.length) return '';
    if (pcs.length === 1) return noteName(pcs[0]);
    if (pcs.length === 2) {
      var iv = (pcs[1] - pcs[0] + 12) % 12;
      if (iv === 7) return noteName(pcs[0]) + ' + fifth';
      if (iv === 5) return noteName(pcs[1]) + ' + fifth';
    }
    var i, rot, q, root, label;
    for (i = 0; i < pcs.length; i++) {
      rot = pcs.map(function (p) { return (p - pcs[i] + 12) % 12; }).sort(function (a, b) { return a - b; });
      q = QUAL[rot.join(',')];
      if (!q) continue;
      root = noteName(pcs[i]);
      if (q === 'major') label = root + ' major';
      else if (q === 'minor') label = root + ' minor';
      else if (q === 'diminished') label = root + ' diminished';
      else if (q === 'augmented') label = root + ' augmented';
      else if (q === '7') label = root + '7';
      else if (q === 'maj7') label = root + 'maj7';
      else if (q === 'm7') label = root + 'm7';
      else if (q === 'm7b5') label = root + 'ø7';
      else if (q === 'dim7') label = root + 'dim7';
      else label = root + ' ' + q;
      return label;
    }
    return pcs.map(function (p) { return noteName(p); }).join(' · ');
  }
  function keySignature(tonic) {
    var i, t, n;
    if (tonic.kind !== 'major') {
      var namePc = NOTE.indexOf(tonic.name);
      if (namePc < 0) {
        var flip = { Bb: 10, Eb: 3, Ab: 8, Db: 1, Gb: 6 };
        namePc = flip[tonic.name];
        if (namePc == null) namePc = pc(tonic.root);
      }
      var majPc = (namePc + 3) % 12;
      for (i = 0; i < TONICS.length; i++) {
        t = TONICS[i];
        if (t.kind === 'major' && pc(t.root) === majPc) return keySignature(t);
      }
    }
    n = tonic.name;
    if (SHARPS[n] != null) {
      return { n: SHARPS[n], kind: SHARPS[n] ? 'sharps' : 'none', label: SHARPS[n] === 0 ? 'none' : (SHARPS[n] + ' sharp' + (SHARPS[n] === 1 ? '' : 's')) };
    }
    if (FLATS[n] != null) {
      return { n: FLATS[n], kind: 'flats', label: FLATS[n] + ' flat' + (FLATS[n] === 1 ? '' : 's') };
    }
    return { n: 0, kind: 'none', label: 'none' };
  }
  function fifthAbove(name) {
    var idx = FIFTHS.indexOf(name);
    if (idx < 0) {
      var syn = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };
      idx = FIFTHS.indexOf(syn[name] || name);
    }
    if (idx < 0) return name;
    return FIFTHS[(idx + 1) % FIFTHS.length];
  }

  function quizItem(rand, force) {
    rand = rand || Math.random;
    var kinds = ['fifth', 'signature', 'chord', 'play', 'relative'];
    var type = force && force.type ? force.type : kinds[Math.floor(rand() * kinds.length)];
    if (type === 'key') type = 'signature';
    if (type === 'fifth') {
      var n = FIFTHS[Math.floor(rand() * FIFTHS.length)];
      var ans = fifthAbove(n);
      var opts = [ans];
      var g1 = 0, k1 = 0;
      while (opts.length < 4 && g1 < 48) {
        g1++;
        var c = FIFTHS[(FIFTHS.indexOf(ans) + ++k1) % FIFTHS.length];
        if (opts.indexOf(c) < 0) opts.push(c);
      }
      return {
        type: 'fifth',
        prompt: 'What is a fifth above ' + n + '?',
        answer: ans,
        options: shuffle(opts, rand),
        midi: null
      };
    }
    if (type === 'signature') {
      var majors = TONICS.filter(function (x) { return x.kind === 'major'; });
      var t = majors[Math.floor(rand() * majors.length)];
      var sig = keySignature(t);
      var pool = ['none', '1 sharp', '2 sharps', '3 sharps', '1 flat', '2 flats', '3 flats', '4 sharps', '4 flats'];
      var opts2 = [sig.label];
      var g2 = 0, k2 = 0;
      while (opts2.length < 4 && g2 < 24) {
        g2++;
        var x = pool[(pool.indexOf(sig.label) + ++k2) % pool.length];
        if (opts2.indexOf(x) < 0) opts2.push(x);
      }
      return {
        type: 'signature',
        prompt: 'Key signature of ' + t.label + '?',
        answer: sig.label,
        options: shuffle(opts2, rand),
        midi: t.root
      };
    }
    if (type === 'relative') {
      var majors2 = TONICS.filter(function (x) { return x.kind === 'major'; });
      var tR = majors2[Math.floor(rand() * majors2.length)];
      var idxR = FIFTHS.indexOf(tR.name);
      if (idxR < 0) idxR = 0;
      var ansR = REL_MIN[idxR];
      var optsR = [ansR];
      var gR = 0, kR = 0;
      while (optsR.length < 4 && gR < 24) {
        gR++;
        var xR = REL_MIN[(idxR + ++kR) % REL_MIN.length];
        if (optsR.indexOf(xR) < 0) optsR.push(xR);
      }
      return {
        type: 'relative',
        prompt: 'Relative minor of ' + tR.label + '?',
        answer: ansR,
        options: shuffle(optsR, rand),
        midi: tR.root
      };
    }
    if (type === 'play') {
      var note = WHITES[Math.floor(rand() * 8)]; // C3–C4 whites, on the left of the keyboard
      var nm = noteName(note);
      var opts3 = [nm];
      var g3 = 0, k3 = 0;
      while (opts3.length < 4 && g3 < 24) {
        g3++;
        var y = NOTE[(NOTE.indexOf(nm) + ++k3) % 12];
        if (opts3.indexOf(y) < 0) opts3.push(y);
      }
      return {
        type: 'play',
        prompt: 'Play ' + nm,
        answer: nm,
        options: shuffle(opts3, rand),
        midi: note
      };
    }
    var t2 = TONICS[Math.floor(rand() * TONICS.length)];
    var sc = scaleNotes(t2);
    var deg = Math.floor(rand() * 7);
    var tri = triad(sc, deg);
    var name = chordName(tri);
    var opts4 = [name];
    var guard = 0, k4 = 0;
    while (opts4.length < 4 && guard < 48) {
      guard++;
      var t3 = TONICS[(TONICS.indexOf(t2) + ++k4) % TONICS.length];
      var sc3 = scaleNotes(t3);
      var nm3 = chordName(triad(sc3, (deg + k4) % 7));
      if (opts4.indexOf(nm3) < 0) opts4.push(nm3);
    }
    return {
      type: 'chord',
      prompt: 'Name this chord: ' + tri.map(noteName).join(' · '),
      answer: name,
      options: shuffle(opts4, rand),
      midi: tri[0],
      notes: tri
    };
  }

  function scoreQuiz(item, answer) {
    if (!item) return { ok: false, delta: 0 };
    var ok = false;
    if (typeof answer === 'number') {
      if (item.type === 'play' && item.midi != null) ok = samePitch(answer, item.midi);
      else if (item.midi != null && item.type === 'key') ok = samePitch(answer, item.midi);
    } else {
      ok = String(answer) === String(item.answer);
    }
    return { ok: ok, delta: ok ? 1 : 0 };
  }

  function buildTarget(state) {
    var t = tonicById(state.tonicId);
    var scale = scaleNotes(t);
    var mode = state.mode;
    var start = 0;
    var rand = state.rand || Math.random;
    if (mode === 'quiz') {
      state.target = [];
      state.quiz = quizItem(rand);
      state.step = 0;
      return state;
    }
    state.quiz = null;
    if (state.shuffle) start = Math.floor(rand() * 7);
    var i;
    if (mode === 'scales') {
      var up = scale.slice(start);
      if (start > 0) {
        up = up.concat(scale.slice(1, start + 1).map(function (n) { return n + 12; }));
      }
      var down = up.slice().reverse().slice(1);
      state.target = up.concat(down);
    } else if (mode === 'chords') {
      state.target = [];
      for (i = 0; i < 7; i++) state.target.push(triad(scale, (start + i) % 7));
    } else if (mode === 'sevenths') {
      state.target = [];
      for (i = 0; i < 7; i++) state.target.push(seventh(scale, (start + i) % 7));
    } else if (mode === 'fifths') {
      state.target = [];
      for (i = 0; i < 7; i++) {
        var note = scale[(start + i) % 7];
        state.target.push([note, fifthOf(scale, note)]);
      }
    } else {
      state.target = scale.slice();
    }
    state.step = 0;
    return state;
  }

  function currentWant(state) {
    var w = state.target[state.step];
    if (w == null) return [];
    return Array.isArray(w) ? w.slice() : [w];
  }

  function emptyProgress() {
    return {
      quizScore: 0, quizAsked: 0, quizCorrect: 0, quizStreak: 0, quizBest: 0,
      rounds: 0, done: {}
    };
  }

  function applySave(state, rec) {
    if (!rec) return state;
    if (rec.mode && MODES.indexOf(rec.mode) >= 0) state.mode = rec.mode;
    if (rec.tonicId && tonicById(rec.tonicId).id === rec.tonicId) state.tonicId = rec.tonicId;
    state.hard = !!rec.hard;
    state.shuffle = !!rec.shuffle;
    if (rec.quizScore != null) state.quizScore = rec.quizScore | 0;
    if (rec.quizAsked != null) state.quizAsked = rec.quizAsked | 0;
    if (rec.quizCorrect != null) state.quizCorrect = rec.quizCorrect | 0;
    if (rec.quizStreak != null) state.quizStreak = rec.quizStreak | 0;
    if (rec.quizBest != null) state.quizBest = rec.quizBest | 0;
    if (rec.rounds != null) state.rounds = rec.rounds | 0;
    if (rec.done && typeof rec.done === 'object') state.done = rec.done;
    state.seen = !!rec.seen;
    return state;
  }

  function snapshot(state) {
    return {
      id: 'last',
      mode: state.mode,
      tonicId: state.tonicId,
      hard: !!state.hard,
      shuffle: !!state.shuffle,
      quizScore: state.quizScore | 0,
      quizAsked: state.quizAsked | 0,
      quizCorrect: state.quizCorrect | 0,
      quizStreak: state.quizStreak | 0,
      quizBest: state.quizBest | 0,
      rounds: state.rounds | 0,
      done: state.done || {},
      seen: !!state.seen
    };
  }

  function Trainer(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'scales';
    this.tonicId = opts.tonicId || 'c-major';
    this.hard = !!opts.hard;
    this.shuffle = !!opts.shuffle;
    this.rand = opts.rand || Math.random;
    this.held = {};
    this.step = 0;
    this.target = [];
    this.quiz = null;
    this.quizScore = 0;
    this.quizAsked = 0;
    this.quizCorrect = 0;
    this.quizStreak = 0;
    this.quizBest = 0;
    this.rounds = 0;
    this.done = {};
    this.seen = false;
    this.lastComplete = false;
    buildTarget(this);
  }
  Trainer.prototype.want = function () { return currentWant(this); };
  Trainer.prototype.tonic = function () { return tonicById(this.tonicId); };
  Trainer.prototype.reset = function () { buildTarget(this); this.lastComplete = false; return this; };
  Trainer.prototype.heldList = function () {
    return Object.keys(this.held).map(Number);
  };
  Trainer.prototype.down = function (midi) {
    var out = { advanced: false, complete: false, quiz: null, ok: false };
    if (this.held[midi]) return out;
    this.held[midi] = 1;
    if (this.mode === 'quiz') {
      if (!this.quiz) return out;
      var scored;
      if (this.quiz.type === 'play') scored = scoreQuiz(this.quiz, midi);
      else scored = { ok: false, delta: 0 };
      if (scored.ok) {
        out.ok = true;
        out.quiz = this._markQuiz(true);
        out.advanced = true;
      }
      return out;
    }
    var want = currentWant(this);
    if (!want.length) return out;
    var held = this.heldList();
    var hit;
    if (want.length === 1) hit = held.some(function (h) { return samePitch(h, want[0]); });
    else hit = chordMatch(held, want);
    if (!hit) return out;
    this.step++;
    out.advanced = true;
    if (this.step >= this.target.length) {
      this.lastComplete = true;
      out.complete = true;
      this.rounds++;
      var key = this.tonicId + ':' + this.mode;
      this.done[key] = (this.done[key] | 0) + 1;
      buildTarget(this);
    }
    return out;
  };
  Trainer.prototype.up = function (midi) {
    delete this.held[midi];
  };
  Trainer.prototype._markQuiz = function (ok) {
    this.quizAsked++;
    if (ok) {
      this.quizScore++;
      this.quizCorrect++;
      this.quizStreak++;
      if (this.quizStreak > this.quizBest) this.quizBest = this.quizStreak;
    } else {
      this.quizStreak = 0;
    }
    var result = { ok: ok, score: this.quizScore, asked: this.quizAsked, streak: this.quizStreak };
    buildTarget(this);
    return result;
  };
  Trainer.prototype.answer = function (opt) {
    if (this.mode !== 'quiz' || !this.quiz) return { ok: false };
    var scored = scoreQuiz(this.quiz, opt);
    var result = this._markQuiz(scored.ok);
    return result;
  };
  Trainer.create = function (opts) { return new Trainer(opts); };

  g.PT = {
    NOTE: NOTE, FLAT: FLAT, OCT: OCT, FIFTHS: FIFTHS, REL_MIN: REL_MIN, TONICS: TONICS,
    HOME: HOME, HOME_LABEL: HOME_LABEL, WHITES: WHITES, BLACKS: BLACKS, MODES: MODES,
    noteName: noteName, prettyName: prettyName, scaleNotes: scaleNotes, triad: triad, seventh: seventh,
    fifthOf: fifthOf, fifthAbove: fifthAbove, samePitch: samePitch, chordMatch: chordMatch,
    shuffle: shuffle, quizItem: quizItem, scoreQuiz: scoreQuiz, chordName: chordName,
    keySignature: keySignature, tonicById: tonicById, romanOf: romanOf, ivs: ivs,
    buildTarget: buildTarget, currentWant: currentWant, applySave: applySave, snapshot: snapshot,
    emptyProgress: emptyProgress, Trainer: Trainer, pc: pc
  };
})(typeof window !== 'undefined' ? window : globalThis);
