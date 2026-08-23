/*
 * Math Race — equation generator + scoring.
 *
 * Easy is iloire/math-race Operation() (MIT): two integers 0–20, '+' or '−'.
 * Medium is × of 2–12. Hard mixes the three. First correct scores; a wrong
 * answer does not. No eval — apply() is the only arithmetic.
 */
(function (root) {
  'use strict';

  var OPS_EASY = ['+', '-'];
  var OPS_MED = ['\u00d7'];
  var OPS_HARD = ['+', '-', '\u00d7'];

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFrom(s) {
    if (typeof s === 'function') return s;
    if (typeof s === 'number' && s === s) return mulberry32(s >>> 0);
    var h = 2166136261;
    var str = String(s == null ? 'math-race' : s);
    var i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return mulberry32(h >>> 0);
  }

  function apply(a, op, b) {
    if (op === '+') return a + b;
    if (op === '-' || op === '\u2212') return a - b;
    if (op === '\u00d7' || op === '*') return a * b;
    return null;
  }

  function make(difficulty, rng) {
    rng = rng || Math.random;
    var d = difficulty === 'medium' || difficulty === 'hard' ? difficulty : 'easy';
    var ops = d === 'medium' ? OPS_MED : (d === 'hard' ? OPS_HARD : OPS_EASY);
    var op = ops[Math.floor(rng() * ops.length)];
    var a, b;
    if (op === '\u00d7' || op === '*') {
      a = randInt(rng, 2, 12);
      b = randInt(rng, 2, 12);
      op = '\u00d7';
    } else {
      a = randInt(rng, 0, 20);
      b = randInt(rng, 0, 20);
    }
    var displayOp = op === '-' ? '\u2212' : op;
    return {
      a: a,
      b: b,
      op: op,
      quest: String(a) + op + String(b),
      display: String(a) + ' ' + displayOp + ' ' + String(b),
      solution: apply(a, op, b)
    };
  }

  function parseAnswer(s) {
    if (s == null) return null;
    var t = String(s).replace(/\s/g, '').replace('\u2212', '-');
    if (!t || t === '-' || t === '+') return null;
    if (!/^-?\d+$/.test(t)) return null;
    var n = parseInt(t, 10);
    if (n !== n) return null;
    return n;
  }

  function isCorrect(eq, answer) {
    if (!eq) return false;
    var n = typeof answer === 'number' ? answer : parseAnswer(answer);
    if (n == null) return false;
    return n === eq.solution;
  }

  function packEq(eq) {
    if (!eq) return null;
    return { a: eq.a, b: eq.b, op: eq.op, solution: eq.solution };
  }

  function unpackEq(p) {
    if (!p || typeof p.a !== 'number' || typeof p.b !== 'number') return null;
    var op = p.op === '*' ? '\u00d7' : p.op;
    var sol = apply(p.a, op, p.b);
    if (sol == null) return null;
    var displayOp = op === '-' ? '\u2212' : op;
    return {
      a: p.a, b: p.b, op: op,
      quest: String(p.a) + op + String(p.b),
      display: String(p.a) + ' ' + displayOp + ' ' + String(p.b),
      solution: sol
    };
  }

  function bestKey(difficulty, duration) {
    return String(difficulty || 'easy') + '-' + String(duration || 60);
  }

  function pickWinner(candidates) {
    if (!candidates || !candidates.length) return null;
    var copy = candidates.slice();
    copy.sort(function (a, b) {
      var at = (a.at || 0) - (b.at || 0);
      if (at) return at;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return copy[0];
  }

  root.MathRace = {
    make: make,
    apply: apply,
    parseAnswer: parseAnswer,
    isCorrect: isCorrect,
    packEq: packEq,
    unpackEq: unpackEq,
    seedFrom: seedFrom,
    bestKey: bestKey,
    pickWinner: pickWinner,
    durations: [30, 60, 90],
    difficulties: ['easy', 'medium', 'hard']
  };
})(this);
