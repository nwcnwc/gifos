// Typing engine — WPM, accuracy, score. Classic script.
// Standard: 5 characters = 1 word. 100 chars in 30s with 0 errors → 40 WPM.
(function (root) {
  'use strict';
  var T = root.Typing || {};

  T.wpm = function (chars, ms) {
    if (!ms || ms <= 0 || !chars) return 0;
    return (chars / 5) * (60000 / ms);
  };

  T.accuracy = function (correct, typed) {
    if (!typed) return 100;
    return (correct / typed) * 100;
  };

  T.score = function (passage, typed, ms) {
    passage = passage || '';
    typed = typed || '';
    var correct = 0, errors = 0, i, n = typed.length;
    for (i = 0; i < n; i++) {
      if (i < passage.length && typed.charAt(i) === passage.charAt(i)) correct++;
      else errors++;
    }
    return {
      correct: correct,
      errors: errors,
      typed: n,
      total: passage.length,
      done: n >= passage.length && passage.length > 0,
      wpm: T.wpm(n, ms),
      acc: T.accuracy(correct, n)
    };
  };

  T.round1 = function (n) {
    return Math.round(n * 10) / 10;
  };

  T.fmtTime = function (ms) {
    if (!ms || ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  T.mulberry32 = function (a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };

  root.Typing = T;
})(typeof window !== 'undefined' ? window : this);
