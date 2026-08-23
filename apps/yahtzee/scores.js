// Official yacht / Yahtzee box values. The original Alhissar table is a
// French Yams variant (full house 50+sum, Yahtzee 100+sum, upper bonus 25).
// Those numbers are wrong for a game that calls itself Yahtzee — this file
// is the floor. DOM-free so build.mjs can prove it.
(function (root) {
  'use strict';

  function counts(dice) {
    var c = [0, 0, 0, 0, 0, 0, 0];
    var sum = 0;
    var i, n, d;
    for (i = 0; i < (dice || []).length; i++) {
      d = dice[i];
      n = (d && typeof d === 'object') ? d.number : d;
      n = +n || 0;
      if (n >= 1 && n <= 6) c[n] += 1;
      sum += n;
    }
    return { c: c, sum: sum };
  }

  function maxSame(c) {
    var m = 0, i;
    for (i = 1; i <= 6; i++) if (c[i] > m) m = c[i];
    return m;
  }

  function longestRun(c) {
    var run = 0, best = 0, i;
    for (i = 1; i <= 6; i++) {
      if (c[i]) { run += 1; if (run > best) best = run; }
      else run = 0;
    }
    return best;
  }

  // Three of one face and two of another. Five-of-a-kind is a Yahtzee, not
  // a full house — jokers handle that separately.
  function isFullHouse(c) {
    var has3 = false, has2 = false, i;
    for (i = 1; i <= 6; i++) {
      if (c[i] === 3) has3 = true;
      else if (c[i] === 2) has2 = true;
      else if (c[i] >= 4) return false;
    }
    return has3 && has2;
  }

  function yahtzeeFace(c) {
    var i;
    for (i = 1; i <= 6; i++) if (c[i] === 5) return i;
    return 0;
  }

  var S = {
    UPPER_BONUS: 35,
    UPPER_AT: 63,
    FULL_HOUSE: 25,
    SMALL_STRAIGHT: 30,
    LARGE_STRAIGHT: 40,
    YAHTZEE: 50,
    EXTRA_YAHTZEE: 100,

    counts: counts,
    maxSame: maxSame,
    longestRun: longestRun,
    isFullHouse: isFullHouse,
    yahtzeeFace: yahtzeeFace,

    // Live preview for the thirteen boxes, in card order.
    // upper[0..5], then 3oak, 4oak, sm, lg, fh, chance, yahtzee.
    preview: function (dice) {
      var x = counts(dice);
      var n = maxSame(x.c);
      var run = longestRun(x.c);
      return {
        upper: [1, 2, 3, 4, 5, 6].map(function (f) { return x.c[f] * f; }),
        three: n >= 3 ? x.sum : 0,
        four: n >= 4 ? x.sum : 0,
        sm: run >= 4 ? S.SMALL_STRAIGHT : 0,
        lg: run >= 5 ? S.LARGE_STRAIGHT : 0,
        fh: isFullHouse(x.c) ? S.FULL_HOUSE : 0,
        chance: x.sum,
        yahtzee: n >= 5 ? S.YAHTZEE : 0,
        face: yahtzeeFace(x.c),
        sum: x.sum
      };
    },

    upperBonus: function (upperTotal) {
      return (upperTotal >= S.UPPER_AT) ? S.UPPER_BONUS : 0;
    }
  };

  root.YahtzeeScores = S;
})(typeof window !== 'undefined' ? window : globalThis);
