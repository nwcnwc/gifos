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
  var sheetOpen = false;
  var fpsDropped = false;
  var frames = 0;
  var fpsAt = 0;
  var $ = function (id) { return document.getElementById(id); };

  var DEFAULTS = {
    factor: 0.5, evolution: 0.5, rotation: 0.5,
    radius: 2, pulsate: false, scale: 1
  };

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var p = PS.getParams();
      p.id = 'shred';
      p.quality = PS.quality ? PS.quality() : 64;
      saveDb.put(p).catch(function () {});
    }, 300);
  }

  function paintSliders() {
    var p = PS.getParams();
    ['factor', 'evolution', 'rotation', 'radius', 'scale'].forEach(function (k) {
      var el = $(k);
      if (el) el.value = p[k];
    });
    if ($('pulsate')) $('pulsate').checked = !!p.pulsate;
    if ($('quality') && PS.quality) $('quality').value = String(PS.quality());
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

  function setSheet(open) {
    sheetOpen = !!open;
    document.body.classList.toggle('show-knobs', sheetOpen);
    var btn = $('knobsBtn');
    if (btn) {
      btn.textContent = sheetOpen ? 'Hide knobs' : 'Knobs';
      btn.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false');
    }
  }

  function note(msg) {
    var el = $('gpu-note');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function remount(q) {
    var stage = $('stage');
    var was = PS.isRunning();
    if (!PS.mount(stage, q)) {
      $('err').hidden = false;
      $('err').textContent = (PS.lastError && PS.lastError()) || 'This toy needs WebGL.';
      return false;
    }
    $('err').hidden = true;
    if (was) PS.play();
    paintSliders();
    persist();
    return true;
  }

  function bootMount() {
    var stage = $('stage');
    var want = (stage.clientWidth < 500) ? 32 : 64;
    if (PS.mount(stage, want)) return true;
    if (want !== 32 && PS.mount(stage, 32)) {
      note('This GPU is happier with a smaller cloud.');
      return true;
    }
    if (PS.mount(stage, 16)) {
      note('Lite cloud — this GPU cannot run the full shred.');
      return true;
    }
    $('err').hidden = false;
    $('err').textContent = (PS.lastError && PS.lastError()) || 'This toy needs WebGL, and this browser does not have it.';
    return false;
  }

  function watchFps() {
    if (!PS.onFrame) return;
    fpsAt = Date.now();
    frames = 0;
    PS.onFrame(function () {
      frames += 1;
      var t = Date.now();
      if (t - fpsAt < 2500) return;
      var fps = frames / ((t - fpsAt) / 1000);
      frames = 0;
      fpsAt = t;
      if (fpsDropped) return;
      var q = PS.quality ? PS.quality() : 64;
      if (fps < 18 && q > 16) {
        fpsDropped = true;
        var next = q > 32 ? 32 : 16;
        remount(next);
        note('Dropped to a smaller cloud so it stays smooth.');
      }
    });
  }

  function boot() {
    ['factor', 'evolution', 'rotation', 'radius', 'scale'].forEach(function (k) {
      $(k).addEventListener('input', readSliders);
    });
    $('pulsate').addEventListener('change', readSliders);
    $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (PS.isRunning()) { PS.pause(); this.textContent = 'Play'; }
      else { PS.play(); this.textContent = 'Pause'; }
    });
    if ($('knobsBtn')) $('knobsBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setSheet(!sheetOpen);
    });
    if ($('resetKnobs')) $('resetKnobs').addEventListener('click', function (e) {
      e.preventDefault();
      if (root.PSMp && root.PSMp.onParams && root.PSMp.onParams(DEFAULTS)) {
        paintSliders();
        return;
      }
      PS.setParams(DEFAULTS);
      paintSliders();
      persist();
    });
    if ($('quality')) $('quality').addEventListener('change', function () {
      remount(parseInt(this.value, 10));
    });
    root.addEventListener('resize', function () { PS.fit(); });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (sheetOpen) { setSheet(false); return true; }
        if (root.PSMp && root.PSMp.busy && root.PSMp.busy()) { root.PSMp.leave(); return true; }
        return false;
      });
    }
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches) setSheet(false);
    else setSheet(true);

    if (!bootMount()) return;
    watchFps();
    PS.play();

    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('shred').then(function (row) {
      if (!row || (root.PSMp && root.PSMp.busy && root.PSMp.busy())) return;
      PS.setParams(row);
      paintSliders();
      if (row.quality && PS.quality && row.quality !== PS.quality() && (row.quality === 16 || row.quality === 32 || row.quality === 64)) {
        remount(row.quality);
      }
    }).catch(function () {});
  }

  root.PSApp = { persist: persist, paintSliders: paintSliders, readSliders: readSliders, defaults: DEFAULTS };
  boot();
})(window);
