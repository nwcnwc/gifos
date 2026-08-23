/*
 * Boot the original TowerGame, with two seams:
 *   1. Assets — TOWER_ASSETS data URLs (vendor/main.js already reads them).
 *   2. Replay — upstream reloaded the page; a srcdoc iframe cannot. We reset
 *      the engine in place and call start() again.
 *
 * Tap (or click, or space) drops a floor. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var game = null;
  var started = false;
  var score = 0;
  var successCount = 0;
  var best = 0;
  var prefsDb = null;
  var gameWidth = 0;
  var gameHeight = 0;

  root.Tower = root.Tower || {};

  function assets() { return root.TOWER_ASSETS || {}; }

  function setImgs() {
    var A = assets();
    function bind(id, key) {
      var el = $(id);
      if (el && A[key]) el.src = A[key];
    }
    bind('titleImg', 'main-index-title.png');
    bind('startImg', 'main-index-start.png');
    bind('overImg', 'main-modal-over.png');
    bind('againImg', 'main-modal-again-b.png');
    if (A['wenxue.woff']) {
      var s = document.createElement('style');
      s.textContent = '@font-face{font-family:wenxue;src:url("' + A['wenxue.woff'] + '") format("woff");font-weight:normal;font-style:normal;}';
      document.head.appendChild(s);
    }
    // Sky, not the original brick wallpaper: on a wide GifOS window the brick
    // tiled the letterbox and ate the scene. The canvas already paints the city.
    document.body.style.background = '#7ecce8';
  }

  function size() {
    gameWidth = window.innerWidth;
    gameHeight = window.innerHeight;
    if (gameHeight / gameWidth < 1.5) gameWidth = Math.ceil(gameHeight / 1.5);
    var wrap = $('wrap');
    if (wrap) {
      wrap.style.height = gameHeight + 'px';
      wrap.style.width = gameWidth + 'px';
    }
  }

  function saveBest() {
    if (!prefsDb) return;
    try { prefsDb.put({ id: 'best', n: best }).catch(function () {}); } catch (e) {}
  }

  function loadBest() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    try { prefsDb = root.gifos.db('prefs'); } catch (e) { return Promise.resolve(); }
    return prefsDb.get('best').then(function (row) {
      if (row && row.n > best) best = row.n | 0;
      paintBest();
    }).catch(function () {});
  }

  function paintBest() {
    var el = $('bestLine');
    if (el) el.textContent = best ? ('Best ' + best) : '';
  }

  function resetEngine(g) {
    var n = g.getVariable('BLOCK_COUNT') || 0;
    var i;
    for (i = 1; i <= n + 4; i++) g.removeInstance('block_' + i);
    for (i = 1; i <= 7; i++) g.removeInstance('flight_' + i, 'FLIGHT_LAYER');
    g.removeInstance('tutorial');
    g.removeInstance('tutorial-arrow');
    ['BLOCK_COUNT', 'SUCCESS_COUNT', 'FAILED_COUNT', 'GAME_SCORE', 'PERFECT_COUNT', 'FLIGHT_COUNT'].forEach(function (k) {
      g.setVariable(k, 0);
    });
    g.setVariable('HARD_MODE', false);
    g.setVariable('ROPE_HEIGHT', g.height * 0.4);
    g.setVariable('BACKGROUND_IMG_OFFSET_HEIGHT', 0);
    g.setVariable('BACKGROUND_LINEAR_GRADIENT_OFFSET_HEIGHT', 0);
    g.setVariable('GAME_START_NOW', false);
    g.timeMovement = {};
    g.timeMovementStartArr = [];
    g.timeMovementFinishArr = [];
    var line = g.getInstance('line');
    if (line) { line.ready = false; line.x = 0; line.collisionX = 0; }
    var hook = g.getInstance('hook');
    if (hook) hook.ready = false;
    for (i = 1; i <= 4; i++) {
      var c = g.getInstance('cloud_' + i);
      if (c) c.ready = false;
    }
  }

  function begin() {
    if (started || !game) return;
    started = true;
    $('landing').classList.add('hide');
    $('modal').classList.add('hide');
    var again = $('again');
    if (again) again.hidden = false;
    var tip = $('overTip');
    if (tip) tip.textContent = 'Try again!';
    score = 0;
    successCount = 0;
    if (root.TowerMp) root.TowerMp.onBegin();
    rerollDecor();
    try { game.playBgm(); } catch (e) {}
    game.start();
    if (root.TowerMp) root.TowerMp.publish(true);
  }

  function retry() {
    if (!game) return;
    if (root.TowerMp && !root.TowerMp.canRetry()) return;
    $('modal').classList.add('hide');
    started = false;
    resetEngine(game);
    if (root.TowerMp) root.TowerMp.onRetry();
    begin();
  }

  function over() {
    started = false;
    $('score').textContent = String(score);
    if (score > best) { best = score; saveBest(); }
    paintBest();
    $('modal').classList.remove('hide');
    if (root.TowerMp) root.TowerMp.onOver();
  }

  function onKey(e) {
    var k = e.key || e.code;
    if (k !== ' ' && k !== 'Spacebar' && k !== 'Space' && k !== 'Enter') return;
    e.preventDefault();
    if (!$('landing').classList.contains('hide')) { begin(); return; }
    if (!$('modal').classList.contains('hide')) { retry(); return; }
    if (started && game && game.touchStartListener) game.touchStartListener();
  }

  // The engine binds touchstart on document. A tap on Start would otherwise
  // drop a floor (or no-op) and never fire click. pointerdown + click, and
  // stop the engine from seeing the chrome taps.
  function bindTap(id, fn) {
    var el = $(id);
    if (!el) return;
    var last = 0;
    var go = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var t = Date.now();
      if (t - last < 400) return;
      last = t;
      fn();
    };
    el.addEventListener('pointerup', go, false);
    el.addEventListener('click', go, false);
    el.addEventListener('touchend', go, false);
  }

  function hideLoading() {
    $('canvas').classList.remove('hide');
    $('loading').classList.add('hide');
    $('landing').classList.remove('hide');
    paintBest();
  }

  function updateLoading(status) {
    var total = status.total || 1;
    var pct = Math.min(100, Math.round((status.success / total) * 100));
    if (status.failed > 0) {
      $('loadPct').textContent = 'Error';
      return;
    }
    $('loadPct').textContent = pct + '%';
    $('loadBar').style.width = pct + '%';
  }

  function boot() {
    size();
    setImgs();
    if (typeof root.TowerGame !== 'function') {
      $('loadPct').textContent = 'Error';
      return;
    }
    game = root.TowerGame({
      width: gameWidth,
      height: gameHeight,
      canvasId: 'canvas',
      soundOn: true,
      setGameScore: function (s) { score = s; if (root.TowerMp) root.TowerMp.publish(false); },
      setGameSuccess: function (s) { successCount = s; if (root.TowerMp) root.TowerMp.publish(true); },
      setGameFailed: function (f) {
        if (root.TowerMp) root.TowerMp.publish(true);
        if (f >= 3) over();
      }
    });
    root.Tower.game = game;
    game.load(function () {
      game.init();
      hideLoading();
    }, updateLoading);
  }

  function rerollDecor() {
    if (!game) return;
    for (var i = 1; i <= 4; i++) {
      var c = game.getInstance('cloud_' + i);
      if (c) c.ready = false;
    }
  }

  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('keydown', onKey, false);

  bindTap('start', begin);
  bindTap('again', retry);
  ['landing', 'modal'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('touchstart', function (e) { e.stopPropagation(); }, true);
    el.addEventListener('mousedown', function (e) { e.stopPropagation(); }, true);
  });

  loadBest().then(boot, boot);
})(window);
