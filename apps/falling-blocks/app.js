// Boot the original well, with two seams:
//   1. RNG — Math.random in newShape, swapped for a seeded generator when a
//      race is on so both boards spawn the same sequence of shapes.
//   2. score / lose / actuate — the original has no score. Line clears count
//      here; friend-mode publishes the row. The original pop.ogg is not
//      shipped, so clearsound.play is a no-op.
(function (root) {
  'use strict';

  var PTS = [0, 100, 300, 500, 800];
  var saveDb = null;
  var saveTimer = 0;

  var FB = root.FB = root.FB || {};
  FB.score = 0;
  FB.lines = 0;
  FB.best = 0;
  FB.over = false;
  FB.frozen = false;
  FB.mp = false;
  FB.random = null;

  var snd = document.getElementById('clearsound');
  if (snd) snd.play = function () { return Promise.resolve(); };

  function $(id) { return document.getElementById(id); }
  function rnd() { return FB.random ? FB.random() : Math.random(); }

  function paintHud() {
    var s = $('score'), l = $('lines'), b = $('best');
    if (s) s.textContent = 'Score: ' + (FB.score || 0);
    if (l) l.textContent = 'Lines: ' + (FB.lines || 0);
    if (b) b.textContent = 'Best: ' + (FB.best || 0);
  }

  function persistBest() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'best', score: FB.best || 0 }).catch(function () {});
    }, 200);
  }

  function noteScore() {
    if (FB.score > FB.best) {
      FB.best = FB.score;
      persistBest();
    }
    paintHud();
  }

  // Same 4×4 fill as the original newShape, with a seeded roll.
  newShape = function () {
    var id = Math.floor(rnd() * shapes.length);
    var shape = shapes[id];
    current = [];
    for (var y = 0; y < 4; ++y) {
      current[y] = [];
      for (var x = 0; x < 4; ++x) {
        var i = 4 * y + x;
        if (typeof shape[i] != 'undefined' && shape[i]) current[y][x] = id + 1;
        else current[y][x] = 0;
      }
    }
    freezed = false;
    currentX = 5;
    currentY = 0;
  };

  var origClearLines = clearLines;
  clearLines = function () {
    var n = 0;
    for (var y = 0; y < ROWS; ++y) {
      var filled = true;
      for (var x = 0; x < COLS; ++x) {
        if (board[y][x] == 0) { filled = false; break; }
      }
      if (filled) n++;
    }
    origClearLines();
    if (n) {
      FB.score += PTS[n] || (n * 200);
      FB.lines += n;
      noteScore();
    }
  };

  var origNewGame = newGame;
  newGame = function () {
    if (FB.frozen) return;
    FB.score = 0;
    FB.lines = 0;
    FB.over = false;
    origNewGame();
    paintHud();
    var bn = $('banner');
    if (bn) { bn.hidden = true; bn.textContent = ''; }
    if (FB.Mp) FB.Mp.onActuate();
  };

  var origTick = tick;
  tick = function () {
    if (FB.frozen) return;
    origTick();
    if (lose && !FB.over) {
      FB.over = true;
      noteScore();
    }
    if (FB.Mp) FB.Mp.onActuate();
  };

  var origKeyPress = keyPress;
  keyPress = function (key) {
    if (lose || FB.frozen) return;
    origKeyPress(key);
    if (typeof render === 'function') render();
    if (FB.Mp) FB.Mp.onActuate();
  };

  var origPlay = playButtonClicked;
  playButtonClicked = function () {
    if (FB.mp && FB.Mp && FB.Mp.onRestart()) return;
    origPlay();
    paintHud();
  };

  function packBoard() {
    var s = '';
    for (var y = 0; y < ROWS; ++y) {
      for (var x = 0; x < COLS; ++x) s += String((board[y] && board[y][x]) || 0);
    }
    return s;
  }
  function packPiece() {
    var s = '';
    if (!current) return s;
    for (var y = 0; y < 4; ++y) {
      for (var x = 0; x < 4; ++x) s += String((current[y] && current[y][x]) || 0);
    }
    return s;
  }

  function paintThem(state) {
    var c = $('them');
    if (!c) return;
    var tctx = c.getContext('2d');
    var bw = c.width / COLS, bh = c.height / ROWS;
    tctx.clearRect(0, 0, c.width, c.height);
    function block(x, y, id) {
      if (!id || x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
      tctx.fillStyle = colors[id - 1] || '#888';
      tctx.fillRect(bw * x, bh * y, bw - 1, bh - 1);
      tctx.strokeStyle = 'black';
      tctx.strokeRect(bw * x, bh * y, bw - 1, bh - 1);
    }
    var b = (state && state.board) || '';
    for (var i = 0; i < b.length; i++) {
      var v = b.charCodeAt(i) - 48;
      if (v > 0) block(i % COLS, (i / COLS) | 0, v);
    }
    var p = (state && state.piece) || '';
    var cx = (state && state.cx) || 0, cy = (state && state.cy) || 0;
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 4; x++) {
        var pv = p.charCodeAt(y * 4 + x) - 48;
        if (pv > 0) block(cx + x, cy + y, pv);
      }
    }
  }

  function banner(text, kind) {
    var el = $('banner');
    if (!el) return;
    if (!text) { el.hidden = true; el.textContent = ''; el.className = ''; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = kind || '';
  }

  function loadBest() {
    if (!saveDb) return Promise.resolve();
    return Promise.resolve(saveDb.get('best')).then(function (row) {
      if (row && row.score > FB.best) FB.best = +row.score || 0;
      paintHud();
    }).catch(function () {});
  }

  document.addEventListener('keydown', function (e) {
    if ([37, 38, 39, 40, 32].indexOf(e.keyCode) >= 0) e.preventDefault();
  });

  FB.packBoard = packBoard;
  FB.packPiece = packPiece;
  FB.paintThem = paintThem;
  FB.paintHud = paintHud;
  FB.banner = banner;
  FB.noteScore = noteScore;

  function boot() {
    try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}
    init();
    paintHud();
    loadBest();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (FB.mp && FB.Mp) { FB.Mp.leave(); return true; }
        return false;
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
