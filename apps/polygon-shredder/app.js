/*
 * Polygon Shredder — GifOS chrome around spite's confetti toy.
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var PS = root.PolygonShredder;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var p = PS.getParams();
      p.id = 'shred';
      saveDb.put(p).catch(function () {});
    }, 300);
  }

  function paintSliders() {
    var p = PS.getParams();
    ['factor', 'evolution', 'rotation', 'radius', 'scale'].forEach(function (k) {
      var el = $(k);
      if (el) el.value = p[k];
    });
    $('pulsate').checked = !!p.pulsate;
  }

  function readSliders() {
    var p = {
      factor: parseFloat($('factor').value),
      evolution: parseFloat($('evolution').value),
      rotation: parseFloat($('rotation').value),
      radius: parseFloat($('radius').value),
      scale: parseFloat($('scale').value),
      pulsate: $('pulsate').checked
    };
    if (root.PSMp && root.PSMp.onParams && root.PSMp.onParams(p)) return;
    PS.setParams(p);
    persist();
  }

  function boot() {
    var stage = $('stage');
    if (!PS.mount(stage, 64)) {
      $('err').hidden = false;
      $('err').textContent = 'This toy needs WebGL.';
      return;
    }
    ['factor', 'evolution', 'rotation', 'radius', 'scale'].forEach(function (k) {
      $(k).addEventListener('input', readSliders);
    });
    $('pulsate').addEventListener('change', readSliders);
    $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (PS.isRunning()) { PS.pause(); this.textContent = 'Play'; }
      else { PS.play(); this.textContent = 'Pause'; }
    });
    root.addEventListener('resize', function () { PS.fit(); });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.PSMp && root.PSMp.busy && root.PSMp.busy()) { root.PSMp.leave(); return true; }
        return false;
      });
    }
    PS.play();

    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('shred').then(function (row) {
      if (!row || (root.PSMp && root.PSMp.busy && root.PSMp.busy())) return;
      PS.setParams(row);
      paintSliders();
    }).catch(function () {});
  }

  root.PSApp = { persist: persist, paintSliders: paintSliders, readSliders: readSliders };
  boot();
})(window);
