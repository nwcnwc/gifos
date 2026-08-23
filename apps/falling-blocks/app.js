// Boot the original well, with seams the vendor never had:
//   1. RNG — Math.random in newShape, swapped for a seeded generator when a
//      race is on so both boards spawn the same sequence of shapes.
//   2. Next-piece peek, ghost, gravity curve, score / lose / actuate.
//   3. DAS / ARR on the keyboard (the pad in touch.js uses the same helper).
// The original pop.ogg is not shipped, so clearsound.play is a no-op.
(function (root) {
  'use strict';

  var PTS = [0, 100, 300, 500, 800];
  var RGB = [
    [0, 220, 220],
    [255, 140, 0],
    [50, 90, 220],
    [240, 210, 0],
    [220, 50, 50],
    [40, 170, 70],
    [170, 70, 200]
  ];
  var DAS_MS = 183;
  var ARR_MS = 50;
  var SOFT_MS = 50;

  var saveDb = null;
  var saveTimer = 0;
  var nextId = null;
  var held = {};

  var FB = root.FB = root.FB || {};
  FB.score = 0;
  FB.lines = 0;
  FB.best = 0;
  FB.level = 0;
  FB.over = false;
  FB.frozen = false;
  FB.mp = false;
  FB.random = null;
  FB.nextId = null;
  FB.DAS = DAS_MS;
  FB.ARR = ARR_MS;
  FB.SOFT = SOFT_MS;

  var snd = document.getElementById('clearsound');
  if (snd) snd.play = function () { return Promise.resolve(); };

  function $(id) { return document.getElementById(id); }
  function rnd() { return FB.random ? FB.random() : Math.random(); }

  function gravityMs() {
    var lv = Math.floor((FB.lines || 0) / 10);
    FB.level = lv;
    return Math.max(70, Math.round(720 * Math.pow(0.82, lv)));
  }

  function restartGravity() {
    if (typeof interval !== 'undefined' && interval) clearInterval(interval);
    interval = setInterval(tick, gravityMs());
  }

  function paintHud() {
    var s = $('score'), l = $('lines'), b = $('best'), v = $('level');
    if (s) s.textContent = 'Score ' + (FB.score || 0);
    if (l) l.textContent = 'Lines ' + (FB.lines || 0);
    if (v) v.textContent = 'Lv ' + (FB.level || 0);
    if (b) b.textContent = 'Best ' + (FB.best || 0);
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

  function fillShape(id) {
    var shape = shapes[id];
    var grid = [];
    for (var y = 0; y < 4; ++y) {
      grid[y] = [];
      for (var x = 0; x < 4; ++x) {
        var i = 4 * y + x;
        grid[y][x] = (typeof shape[i] != 'undefined' && shape[i]) ? id + 1 : 0;
      }
    }
    return grid;
  }

  function rollId() { return Math.floor(rnd() * shapes.length); }

  // Same 4×4 fill as the original newShape, with a seeded roll and a peek.
  newShape = function () {
    if (nextId == null) nextId = rollId();
    var id = nextId;
    nextId = rollId();
    FB.nextId = nextId;
    current = fillShape(id);
    freezed = false;
    currentX = 3;
    currentY = 0;
    paintNext();
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
      var lv = Math.floor(FB.lines / 10);
      if (lv !== FB.level) {
        FB.level = lv;
        if (!lose && !FB.frozen) restartGravity();
      }
      noteScore();
    }
  };

  var origNewGame = newGame;
  newGame = function () {
    if (FB.frozen) return;
    FB.score = 0;
    FB.lines = 0;
    FB.level = 0;
    FB.over = false;
    nextId = null;
    FB.nextId = null;
    origNewGame();
    restartGravity();
    paintHud();
    paintNext();
    var bn = $('banner');
    if (bn) { bn.hidden = true; bn.textContent = ''; bn.className = ''; }
    if (FB.Mp) FB.Mp.onActuate();
  };

  var origTick = tick;
  tick = function () {
    if (FB.frozen) return;
    origTick();
    if (lose && !FB.over) {
      FB.over = true;
      noteScore();
      banner('Game over', 'lose');
      inputAllUp();
    }
    if (FB.Mp) FB.Mp.onActuate();
  };

  var origKeyPress = keyPress;
  keyPress = function (key) {
    if (!current || lose || FB.frozen) return;
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

  function rgb(id) { return RGB[(id - 1) % RGB.length] || [140, 140, 140]; }
  function css(c, a) {
    if (a == null || a >= 1) return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function drawCell(tctx, x, y, id, bw, bh, alpha) {
    if (!id || x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    var c = rgb(id);
    var px = bw * x, py = bh * y;
    tctx.globalAlpha = alpha == null ? 1 : alpha;
    tctx.fillStyle = css(c);
    tctx.fillRect(px + 1, py + 1, bw - 2, bh - 2);
    tctx.fillStyle = css(mix(c, [255, 255, 255], 0.38));
    tctx.fillRect(px + 1, py + 1, bw - 2, Math.max(2, (bh - 2) * 0.22));
    tctx.fillStyle = css(mix(c, [0, 0, 0], 0.35));
    tctx.fillRect(px + 1, py + bh - Math.max(2, (bh - 2) * 0.2) - 1, bw - 2, Math.max(2, (bh - 2) * 0.2));
    tctx.globalAlpha = 1;
  }

  function drawGhost(tctx, x, y, id, bw, bh) {
    if (!id || x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
    var c = rgb(id);
    var px = bw * x, py = bh * y;
    tctx.save();
    tctx.globalAlpha = 1;
    tctx.strokeStyle = css(c, 0.85);
    tctx.lineWidth = Math.max(2, bw * 0.1);
    tctx.strokeRect(px + 3, py + 3, bw - 6, bh - 6);
    tctx.fillStyle = css(c, 0.16);
    tctx.fillRect(px + 3, py + 3, bw - 6, bh - 6);
    tctx.restore();
  }

  function ghostDy() {
    if (!current || typeof valid !== 'function') return 0;
    var dy = 0;
    while (valid(0, dy + 1)) dy++;
    return dy;
  }

  render = function () {
    if (!ctx) return;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);
    var bw = W / COLS, bh = H / ROWS;
    for (var y = 0; y < ROWS; ++y) {
      for (var x = 0; x < COLS; ++x) {
        if (board[y] && board[y][x]) drawCell(ctx, x, y, board[y][x], bw, bh, 1);
      }
    }
    if (current) {
      var g = ghostDy();
      if (g > 0) {
        for (var gy = 0; gy < 4; ++gy) {
          for (var gx = 0; gx < 4; ++gx) {
            if (current[gy] && current[gy][gx]) {
              drawGhost(ctx, currentX + gx, currentY + gy + g, current[gy][gx], bw, bh);
            }
          }
        }
      }
      for (var py = 0; py < 4; ++py) {
        for (var px = 0; px < 4; ++px) {
          if (current[py] && current[py][px]) {
            drawCell(ctx, currentX + px, currentY + py, current[py][px], bw, bh, 1);
          }
        }
      }
    }
  };

  function paintNext() {
    var c = $('next');
    if (!c) return;
    var nctx = c.getContext('2d');
    var size = c.width;
    nctx.fillStyle = '#0a0c10';
    nctx.fillRect(0, 0, size, size);
    if (nextId == null || !shapes) return;
    var grid = fillShape(nextId);
    var minx = 4, miny = 4, maxx = -1, maxy = -1;
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) {
      if (grid[y][x]) {
        if (x < minx) minx = x; if (y < miny) miny = y;
        if (x > maxx) maxx = x; if (y > maxy) maxy = y;
      }
    }
    if (maxx < 0) return;
    var w = maxx - minx + 1, h = maxy - miny + 1;
    var cell = Math.floor(size / 5);
    var ox = (size - w * cell) / 2 - minx * cell;
    var oy = (size - h * cell) / 2 - miny * cell;
    for (y = 0; y < 4; y++) for (x = 0; x < 4; x++) {
      if (!grid[y][x]) continue;
      var px = ox + x * cell, py = oy + y * cell;
      var col = rgb(grid[y][x]);
      nctx.fillStyle = css(col);
      nctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      nctx.fillStyle = css(mix(col, [255, 255, 255], 0.38));
      nctx.fillRect(px + 1, py + 1, cell - 2, Math.max(2, (cell - 2) * 0.22));
    }
  }

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
    tctx.fillStyle = '#0a0c10';
    tctx.fillRect(0, 0, c.width, c.height);
    var b = (state && state.board) || '';
    for (var i = 0; i < b.length; i++) {
      var v = b.charCodeAt(i) - 48;
      if (v > 0) drawCell(tctx, i % COLS, (i / COLS) | 0, v, bw, bh, 1);
    }
    var p = (state && state.piece) || '';
    var cx = (state && state.cx) || 0, cy = (state && state.cy) || 0;
    for (var y = 0; y < 4; y++) {
      for (var x = 0; x < 4; x++) {
        var pv = p.charCodeAt(y * 4 + x) - 48;
        if (pv > 0) drawCell(tctx, cx + x, cy + y, pv, bw, bh, 1);
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

  function inputDown(act) {
    if (held[act]) return;
    held[act] = { delay: 0, arr: 0 };
    keyPress(act);
    if (act === 'rotate' || act === 'drop') return;
    var delay = act === 'down' ? SOFT_MS : DAS_MS;
    var rate = act === 'down' ? SOFT_MS : ARR_MS;
    held[act].delay = setTimeout(function () {
      if (!held[act]) return;
      keyPress(act);
      held[act].arr = setInterval(function () {
        if (lose || FB.frozen || !current) { inputUp(act); return; }
        keyPress(act);
      }, rate);
    }, delay);
  }

  function inputUp(act) {
    var h = held[act];
    if (!h) return;
    if (h.delay) clearTimeout(h.delay);
    if (h.arr) clearInterval(h.arr);
    delete held[act];
  }

  function inputAllUp() {
    Object.keys(held).forEach(inputUp);
  }

  var KEYS = { 37: 'left', 39: 'right', 40: 'down', 38: 'rotate', 32: 'drop', 90: 'rotate', 88: 'rotate' };

  function bindKeys() {
    document.body.onkeydown = function (e) {
      var act = KEYS[e.keyCode];
      if (!act) return;
      e.preventDefault();
      if (e.repeat) return;
      inputDown(act);
    };
    document.body.onkeyup = function (e) {
      var act = KEYS[e.keyCode];
      if (!act) return;
      e.preventDefault();
      inputUp(act);
    };
    window.addEventListener('blur', inputAllUp);
  }

  FB.packBoard = packBoard;
  FB.packPiece = packPiece;
  FB.paintThem = paintThem;
  FB.paintHud = paintHud;
  FB.banner = banner;
  FB.noteScore = noteScore;
  FB.paintNext = paintNext;
  FB.inputDown = inputDown;
  FB.inputUp = inputUp;
  FB.inputAllUp = inputAllUp;

  function boot() {
    try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}
    init();
    paintHud();
    paintNext();
    bindKeys();
    loadBest();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (FB.mp && FB.Mp) { FB.Mp.leave(); return true; }
        return false;
      });
    }
    playButtonClicked();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
