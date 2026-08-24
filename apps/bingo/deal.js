// American 75-ball. Same seed + player id → same card. Same seed → same bag.
// Classic script: GifOS drops type=module.
(function (root) {
  'use strict';
  var BG = root.BG = root.BG || {};

  var LETTERS = ['B', 'I', 'N', 'G', 'O'];
  var RANGES = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];

  function hash(s) {
    var h = 2166136261 >>> 0, i;
    s = String(s);
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    var a = hash(seed) || 1;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rand() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickN(lo, hi, n, rand) {
    var pool = [], i, j, t;
    for (i = lo; i <= hi; i++) pool.push(i);
    for (i = 0; i < n; i++) {
      j = i + Math.floor(rand() * (pool.length - i));
      t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, n);
  }

  // cols[c][r]. Centre is 0 (FREE).
  function card(seed, playerId) {
    var rand = rng(String(seed) + '\ncard\n' + String(playerId));
    var cols = [], c;
    for (c = 0; c < 5; c++) cols.push(pickN(RANGES[c][0], RANGES[c][1], 5, rand));
    cols[2][2] = 0;
    return cols;
  }

  function bag(seed) {
    var nums = [], i;
    for (i = 1; i <= 75; i++) nums.push(i);
    return shuffle(nums, rng(String(seed) + '\nbag'));
  }

  function letter(n) {
    n = n | 0;
    if (n <= 15) return 'B';
    if (n <= 30) return 'I';
    if (n <= 45) return 'N';
    if (n <= 60) return 'G';
    return 'O';
  }

  function callName(n) {
    return letter(n) + ' ' + (n | 0);
  }

  function key(c, r) { return c + ',' + r; }

  function markedSet(marked) {
    var s = {}, i, k;
    s[key(2, 2)] = true;
    if (!marked) return s;
    if (Object.prototype.toString.call(marked) === '[object Array]') {
      for (i = 0; i < marked.length; i++) s[String(marked[i])] = true;
    } else {
      for (k in marked) if (Object.prototype.hasOwnProperty.call(marked, k) && marked[k]) s[k] = true;
    }
    s[key(2, 2)] = true;
    return s;
  }

  function markedList(marked) {
    var s = markedSet(marked), out = [], c, r, k;
    for (c = 0; c < 5; c++) for (r = 0; r < 5; r++) {
      k = key(c, r);
      if (s[k]) out.push(k);
    }
    return out;
  }

  // The four pattern families as cell lists, in claim-priority order.
  function patterns() {
    var out = [], r, c, i, cells;
    for (r = 0; r < 5; r++) {
      cells = [];
      for (c = 0; c < 5; c++) cells.push([c, r]);
      out.push({ kind: 'row', at: r, cells: cells });
    }
    for (c = 0; c < 5; c++) {
      cells = [];
      for (r = 0; r < 5; r++) cells.push([c, r]);
      out.push({ kind: 'col', at: c, cells: cells });
    }
    cells = [];
    for (i = 0; i < 5; i++) cells.push([i, i]);
    out.push({ kind: 'diag', at: 0, cells: cells });
    cells = [];
    for (i = 0; i < 5; i++) cells.push([i, 4 - i]);
    out.push({ kind: 'diag', at: 1, cells: cells });
    out.push({ kind: 'corners', cells: [[0, 0], [4, 0], [0, 4], [4, 4]] });
    return out;
  }

  function won(p) {
    return p.kind === 'corners' ? { kind: 'corners' } : { kind: p.kind, at: p.at };
  }

  function hasWin(grid, marked) {
    var m = markedSet(marked), ps = patterns(), i, j, ok, cells;
    for (i = 0; i < ps.length; i++) {
      cells = ps[i].cells;
      ok = true;
      for (j = 0; j < cells.length; j++) {
        if (!m[key(cells[j][0], cells[j][1])]) { ok = false; break; }
      }
      if (ok) return won(ps[i]);
    }
    return null;
  }

  function callSet(called) {
    var s = {}, i;
    for (i = 0; i < (called || []).length; i++) s[called[i] | 0] = true;
    return s;
  }

  // A bingo claim is honest if SOME fully-daubed pattern is also fully
  // CALLED (FREE counts as called). Checked per pattern, the way a hall
  // checks the claimed line: a mis-daub elsewhere on the card does not
  // spoil an honest row — but a mis-daub INSIDE the claimed line kills it.
  function validClaim(grid, marked, called) {
    var cs = callSet(called), m = markedSet(marked), ps = patterns(), i, j, cells, ok, n;
    if (!grid) return null;
    for (i = 0; i < ps.length; i++) {
      cells = ps[i].cells;
      ok = true;
      for (j = 0; j < cells.length; j++) {
        if (!m[key(cells[j][0], cells[j][1])]) { ok = false; break; }
        n = grid[cells[j][0]][cells[j][1]];
        if (n !== 0 && !cs[n]) { ok = false; break; }
      }
      if (ok) return won(ps[i]);
    }
    return null;
  }

  function inCall(called, n) {
    var i;
    n = n | 0;
    for (i = 0; i < (called || []).length; i++) if ((called[i] | 0) === n) return true;
    return false;
  }

  BG.LETTERS = LETTERS;
  BG.RANGES = RANGES;
  BG.hash = hash;
  BG.rng = rng;
  BG.shuffle = shuffle;
  BG.card = card;
  BG.bag = bag;
  BG.letter = letter;
  BG.callName = callName;
  BG.key = key;
  BG.markedSet = markedSet;
  BG.markedList = markedList;
  BG.hasWin = hasWin;
  BG.validClaim = validClaim;
  BG.inCall = inCall;
})(typeof window !== 'undefined' ? window : globalThis);
