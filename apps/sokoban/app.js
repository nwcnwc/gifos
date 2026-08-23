// Sokoban shell: warehouse canvas, keys, private save.
(function (root) {
  'use strict';

  var SK = root.SK;
  var $ = function (id) { return document.getElementById(id); };

  var G = null;
  var solvedSet = {};
  var saveDb = null;
  var saveTimer = 0;
  var anim = null;
  var animRaf = 0;
  var lastPaint = 0;

  try {
    if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save');
  } catch (e) {}

  function word(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function fillSelect() {
    var sel = $('levels');
    var html = '', i, lv, mark;
    var list = SK.levels || [];
    for (i = 0; i < list.length; i++) {
      lv = list[i];
      mark = solvedSet[lv.id] ? ' ✓' : '';
      html += '<option value="' + lv.id + '"' +
        (G && lv.id === G.id ? ' selected' : '') + '>' +
        'Level ' + lv.id + mark + '</option>';
    }
    sel.innerHTML = html;
  }

  function hud() {
    if (!G) return;
    $('stat-level').textContent = 'Level ' + G.id;
    $('stat-moves').textContent = word(G.moves, 'move', 'moves');
    $('stat-pushes').textContent = word(G.pushes, 'push', 'pushes');
    $('stat-boxes').textContent = SK.boxesOnGoal(G.map) + ' / ' + G.total;
    var msg = $('message');
    var stats = $('won-stats');
    msg.hidden = !G.solved;
    if (G.solved) {
      stats.textContent = word(G.moves, 'move', 'moves') + ' · ' +
        word(G.pushes, 'push', 'pushes');
    }
  }

  function ease(t) { return t * t * (3 - 2 * t); }

  function animT() {
    if (!anim) return 1;
    var t = (performance.now() - anim.t0) / anim.dur;
    if (t >= 1) { anim = null; return 1; }
    return ease(t);
  }

  function rr(ctx, x, y, w, h, r) {
    var rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function drawBox(ctx, x, y, s, onGoal) {
    var m = s * 0.12;
    ctx.fillStyle = onGoal ? '#d4a017' : '#c4782a';
    rr(ctx, x + m, y + m, s - m * 2, s - m * 2, s * 0.08);
    ctx.fill();
    ctx.fillStyle = onGoal ? '#f0c45c' : '#e09a4a';
    rr(ctx, x + m + s * 0.08, y + m + s * 0.08, s - m * 2 - s * 0.16, s * 0.22, 2);
    ctx.fill();
    ctx.strokeStyle = onGoal ? '#8a6a12' : '#7a4a18';
    ctx.lineWidth = Math.max(1, s * 0.05);
    rr(ctx, x + m, y + m, s - m * 2, s - m * 2, s * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.5, y + m + 2);
    ctx.lineTo(x + s * 0.5, y + s - m - 2);
    ctx.stroke();
  }

  function drawKeeper(ctx, x, y, s) {
    var cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, y + s * 0.82, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f6f8f';
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.08, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4fa3c8';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.12, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#faf0dc';
    ctx.beginPath();
    ctx.arc(cx - s * 0.07, cy - s * 0.14, s * 0.045, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.07, cy - s * 0.14, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  function skipBox(x, y, t) {
    if (!anim || !anim.box || t >= 1) return false;
    return x === anim.box.x1 && y === anim.box.y1;
  }

  function skipPlayer(x, y, t) {
    if (!anim || t >= 1) return false;
    return x === anim.px1 && y === anim.py1;
  }

  function paint() {
    var canvas = $('board');
    if (!canvas || !G) return;
    var dpr = root.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(1, rect.width);
    var cssH = Math.max(1, rect.height);
    var pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(0, 0, cssW, cssH);

    var pad = 10;
    var tile = Math.floor(Math.min((cssW - pad * 2) / G.w, (cssH - pad * 2) / G.h));
    if (tile < 8) tile = 8;
    var ox = Math.floor((cssW - G.w * tile) / 2);
    var oy = Math.floor((cssH - G.h * tile) / 2);
    var t = animT();
    var x, y, ch, px, py;

    for (y = 0; y < G.h; y++) {
      for (x = 0; x < G.w; x++) {
        ch = SK.at(G.map, G.w, x, y);
        if (ch === ' ') continue;
        px = ox + x * tile;
        py = oy + y * tile;
        if (ch === '#') {
          ctx.fillStyle = (x + y) % 2 ? '#5a381c' : '#6b4423';
          ctx.fillRect(px, py, tile + 0.5, tile + 0.5);
          ctx.fillStyle = '#8a5a32';
          ctx.fillRect(px, py, tile + 0.5, Math.max(2, tile * 0.16));
          ctx.fillStyle = '#4a2e18';
          ctx.fillRect(px, py + tile - Math.max(2, tile * 0.12), tile + 0.5, Math.max(2, tile * 0.12));
          continue;
        }
        ctx.fillStyle = (x + y) % 2 ? '#c9a66b' : '#bf9a5e';
        ctx.fillRect(px, py, tile + 0.5, tile + 0.5);
        if (ch === '.' || ch === '*' || ch === '+') {
          ctx.strokeStyle = '#e8c547';
          ctx.lineWidth = Math.max(2, tile * 0.1);
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, tile * 0.22, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(232, 197, 71, 0.28)';
          ctx.beginPath();
          ctx.arc(px + tile / 2, py + tile / 2, tile * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        if ((ch === '$' || ch === '*') && !skipBox(x, y, t)) {
          drawBox(ctx, px, py, tile, ch === '*');
        }
        if ((ch === '@' || ch === '+') && !skipPlayer(x, y, t)) {
          drawKeeper(ctx, px, py, tile);
        }
      }
    }

    if (anim && t < 1) {
      if (anim.box) {
        px = ox + (anim.box.x0 + (anim.box.x1 - anim.box.x0) * t) * tile;
        py = oy + (anim.box.y0 + (anim.box.y1 - anim.box.y0) * t) * tile;
        var destCh = SK.at(G.map, G.w, anim.box.x1, anim.box.y1);
        drawBox(ctx, px, py, tile, destCh === '*');
      }
      px = ox + (anim.px0 + (anim.px1 - anim.px0) * t) * tile;
      py = oy + (anim.py0 + (anim.py1 - anim.py0) * t) * tile;
      drawKeeper(ctx, px, py, tile);
    }

    if (anim) {
      if (animRaf) cancelAnimationFrame(animRaf);
      animRaf = requestAnimationFrame(paint);
    } else {
      animRaf = 0;
    }
    lastPaint = performance.now();
  }

  function saveSoon() {
    if (!saveDb || (root.SKMp && root.SKMp.on)) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveDb.put({
        id: 'save',
        level: G.id,
        map: G.map,
        moves: G.moves,
        pushes: G.pushes,
        solved: solvedSet
      }).catch(function () {});
    }, 200);
  }

  function render() {
    fillSelect();
    hud();
    paint();
    if (root.SKMp) root.SKMp.onChange();
  }

  function goLevel(id, opt) {
    opt = opt || {};
    id = parseInt(id, 10);
    if (!SK.byId(id)) return;
    G = SK.loadLevel(id);
    anim = null;
    fillSelect();
    hud();
    paint();
    if (!opt.race) saveSoon();
    if (root.SKMp && !opt.race) root.SKMp.onChange();
  }

  function afterMove(kind, dx, dy) {
    if (kind === 'push') {
      anim = {
        px0: G.player.x - dx, py0: G.player.y - dy,
        px1: G.player.x, py1: G.player.y,
        box: {
          x0: G.player.x, y0: G.player.y,
          x1: G.player.x + dx, y1: G.player.y + dy
        },
        t0: performance.now(),
        dur: 90
      };
    } else {
      anim = {
        px0: G.player.x - dx, py0: G.player.y - dy,
        px1: G.player.x, py1: G.player.y,
        box: null,
        t0: performance.now(),
        dur: 80
      };
    }
    var was = G.solved;
    hud();
    paint();
    saveSoon();
    if (root.SKMp) root.SKMp.onChange();
    if (G.solved) {
      solvedSet[G.id] = { moves: G.moves, pushes: G.pushes };
      fillSelect();
      if (!was) {
        var badge = $('solved');
        badge.classList.remove('flash');
        void badge.offsetWidth;
        badge.classList.add('flash');
        if (root.SKMp) root.SKMp.onSolved();
      }
    }
  }

  function move(dx, dy) {
    if (!G) return false;
    var kind = SK.tryMove(G, dx, dy);
    if (!kind) return false;
    afterMove(kind, dx, dy);
    return true;
  }

  function undo() {
    if (!G) return;
    if (!SK.undo(G)) return;
    anim = null;
    hud();
    paint();
    saveSoon();
    if (root.SKMp) root.SKMp.onChange();
  }

  function resetLevel() {
    if (!G) return;
    SK.restart(G);
    anim = null;
    hud();
    paint();
    saveSoon();
    if (root.SKMp) root.SKMp.onChange();
  }

  function nextLevel() {
    if (root.SKMp && root.SKMp.on) {
      root.SKMp.playAgain();
      return;
    }
    goLevel(SK.nextId(G.id));
  }

  root.SKGame = {
    get levelId() { return G ? G.id : 1; },
    get moves() { return G ? G.moves : 0; },
    get pushes() { return G ? G.pushes : 0; },
    get parked() { return G ? SK.boxesOnGoal(G.map) : 0; },
    get total() { return G ? G.total : 0; },
    get solved() { return !!(G && G.solved); },
    goLevel: goLevel,
    move: move
  };

  $('levels').addEventListener('change', function () {
    if (root.SKMp && root.SKMp.on) {
      this.value = G.id;
      return;
    }
    goLevel(this.value);
  });
  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', resetLevel);
  $('nextBtn').addEventListener('click', nextLevel);

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    var k = e.key;
    var dx = 0, dy = 0;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') dx = -1;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') dx = 1;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') dy = -1;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') dy = 1;
    if (dx || dy) {
      e.preventDefault();
      move(dx, dy);
      return;
    }
    if (k === 'u' || k === 'U' || k === 'Backspace' || k === 'z' || k === 'Z') {
      e.preventDefault();
      undo();
    } else if (k === 'r' || k === 'R') {
      e.preventDefault();
      resetLevel();
    } else if (k === 'n' || k === 'N') {
      e.preventDefault();
      nextLevel();
    }
  });

  var resizeTimer = 0;
  root.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(paint, 50);
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.SKMp && root.SKMp.on) root.SKMp.leave();
    });
  }

  function boot(row) {
    var startId = 1;
    if (row && row.solved) solvedSet = row.solved;
    if (row && row.level && SK.byId(row.level)) startId = row.level;
    if (row && row.map && SK.byId(startId)) {
      G = SK.restore(startId, row.map, row.moves, row.pushes);
    } else {
      G = SK.loadLevel(startId);
    }
    fillSelect();
    hud();
    paint();
    if (root.ResizeObserver) {
      var ro = new ResizeObserver(function () { paint(); });
      ro.observe($('stage'));
    }
    if (root.SKMp) root.SKMp.watch();
  }

  if (saveDb && saveDb.get) {
    saveDb.get('save').then(function (row) { boot(row); }).catch(function () { boot(null); });
  } else {
    boot(null);
  }
})(window);
