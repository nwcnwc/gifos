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
  var best = { coins: 0, stomps: 0 };
  var dirty = false;

  function db() { return api && api.db ? api.db('prefs') : null; }

  function paint(p) {
    var c = (p && p.collected) || 0;
    var k = (p && p.killed) || 0;
    coinsEl.textContent = 'coins ' + c;
    killsEl.textContent = 'stomps ' + k;
    if (c > best.coins || (c === best.coins && k > best.stomps)) {
      best.coins = c;
      best.stomps = k;
      dirty = true;
      bestEl.textContent = 'best ' + best.coins + ' / ' + best.stomps;
    }
  }

  function save() {
    var d = db();
    if (!d || !dirty) return;
    dirty = false;
    d.put({ id: 'best', coins: best.coins, stomps: best.stomps }).catch(function () {});
  }

  root.Tiny = root.Tiny || {};
  root.Tiny.onProgress = function (p) { paint(p); save(); };
  root.Tiny.onFrame = function (p) { paint(p); };

  function boot() {
    paint(null);
    var d = db();
    if (!d) return;
    d.get('best').then(function (row) {
      if (!row) return;
      best.coins = row.coins || 0;
      best.stomps = row.stomps || 0;
      if (best.coins || best.stomps) {
        bestEl.textContent = 'best ' + best.coins + ' / ' + best.stomps;
      }
    }).catch(function () {});
  }

  boot();
})(window);
