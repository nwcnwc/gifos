// Longwave rules. Target is 0..20. Score is 4/3/2/0 by distance, same as
// cynicaloptimist/longwave GetScore. A cooperative bullseye (4) is worth 3
// and keeps the card. Classic script — no modules.
(function (root) {
  'use strict';

  function hashStr(s) {
    var h = 2166136261, i;
    s = String(s || '');
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, seed) {
    var a = arr.slice(), rng = mulberry32(hashStr(seed)), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = (rng() * (i + 1)) | 0;
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function deck(seed) {
    var cards = root.LW_CARDS || [];
    return shuffle(cards, seed || 'lw');
  }

  function cardAt(seed, index) {
    var d = deck(seed);
    if (!d.length) return ['Left', 'Right'];
    return d[((index % d.length) + d.length) % d.length];
  }

  // Same as upstream RandomSpectrumTarget / GetScore.
  function randomTarget() { return (Math.random() * 21) | 0; }
  function score(target, guess) {
    var d = Math.abs((target | 0) - (guess | 0));
    if (d > 2) return 0;
    return 4 - d;
  }
  function coopPoints(raw) { return raw === 4 ? 3 : raw; }
  function coopBonus(raw) { return raw === 4; }

  function randomSeed() {
    var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', i;
    for (i = 0; i < 4; i++) s += a[(Math.random() * a.length) | 0];
    return s;
  }

  function hue(s) { return hashStr(s) % 360; }

  function poleColors(left) {
    var h = hue(left);
    return {
      left: 'hsl(' + h + ',62%,42%)',
      right: 'hsl(' + ((h + 168) % 360) + ',62%,42%)'
    };
  }

  root.LW = {
    MAX: 20,
    TURNS: 7,
    score: score,
    coopPoints: coopPoints,
    coopBonus: coopBonus,
    randomTarget: randomTarget,
    randomSeed: randomSeed,
    deck: deck,
    cardAt: cardAt,
    hue: hue,
    poleColors: poleColors,
    hashStr: hashStr
  };
})(window);
