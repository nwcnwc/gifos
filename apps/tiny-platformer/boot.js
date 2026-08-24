/*
 * Tiny Platformer — GifOS shell.
 * Loads the Tiled map as TINY_LEVEL (no XHR), keeps the best run in gifos.db.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var coinsEl = document.getElementById('coins');
  var killsEl = document.getElementById('kills');
  var bestEl = document.getElementById('best');
  var bannerEl = document.getElementById('banner');
  var canvas = document.getElementById('canvas');
  var best = { coins: 0, stomps: 0 };
  var dirty = false;
  var lastCleared = false;
  var VIEW_W = 640, VIEW_H = 480;

  function db() { return api && api.db ? api.db('prefs') : null; }

  function totals() {
    var t = root.Tiny && root.Tiny.totals && root.Tiny.totals();
    return t || { coins: 0, stomps: 0 };
  }

  function paint(p) {
    var tot = totals();
    var c = (p && p.collected) || 0;
    var k = (p && p.killed) || 0;
    coinsEl.textContent = 'gold ' + c + '/' + tot.coins;
    killsEl.textContent = 'stomps ' + k + '/' + tot.stomps;
    if (best.coins || best.stomps) {
      bestEl.textContent = 'best ' + best.coins + '/' + tot.coins;
    } else {
      bestEl.textContent = '';
    }
    if (c > best.coins || (c === best.coins && k > best.stomps)) {
      best.coins = c;
      best.stomps = k;
      dirty = true;
      bestEl.textContent = 'best ' + best.coins + '/' + tot.coins;
    }
    var cleared = !!(root.Tiny && root.Tiny.cleared && root.Tiny.cleared());
    if (cleared && !lastCleared) {
      lastCleared = true;
      dirty = true;
      if (bannerEl) {
        bannerEl.hidden = false;
        bannerEl.textContent = 'Cave cleared — ' + c + ' gold, ' + k + ' stomps. R or RESTART to run it again.';
      }
    } else if (!cleared && lastCleared) {
      lastCleared = false;
      if (bannerEl) bannerEl.hidden = true;
    }
  }

  function save() {
    var d = db();
    if (!d || !dirty) return;
    dirty = false;
    d.put({ id: 'best', coins: best.coins, stomps: best.stomps }).catch(function (err) {
      if (bestEl) bestEl.textContent = (err && err.message) || 'could not save';
    });
  }

  function fit() {
    if (!canvas) return;
    var touch = document.body.classList.contains('touch');
    var pad = touch ? Math.min(220, Math.max(148, root.innerHeight * 0.22)) : 0;
    var w = root.innerWidth;
    var h = Math.max(120, root.innerHeight - pad);
    var scale = Math.min(w / VIEW_W, h / VIEW_H);
    canvas.style.width = Math.round(VIEW_W * scale) + 'px';
    canvas.style.height = Math.round(VIEW_H * scale) + 'px';
    document.body.style.paddingBottom = pad ? pad + 'px' : '';
  }

  root.Tiny = root.Tiny || {};
  root.Tiny.onProgress = function (p) { paint(p); save(); };
  root.Tiny.onFrame = function (p) { paint(p); };
  root.Tiny.onHurt = function () {};

  if (api && api.onBack) {
    api.onBack(function () {
      if (root.Tiny && root.Tiny.restart) {
        root.Tiny.restart();
        return true;
      }
      return false;
    });
  }

  function boot() {
    paint(null);
    fit();
    root.addEventListener('resize', fit);
    if (root.visualViewport) root.visualViewport.addEventListener('resize', fit);
    var d = db();
    if (!d) return;
    d.get('best').then(function (row) {
      if (!row) return;
      best.coins = row.coins || 0;
      best.stomps = row.stomps || 0;
      paint(root.Tiny && root.Tiny.player ? root.Tiny.player() : null);
    }).catch(function () {});
  }

  root.Tiny.fit = fit;
  boot();
})(window);
