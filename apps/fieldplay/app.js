/*
 * Field Play — GifOS chrome around anvaka's vector-field explorer.
 * vendor/fieldplay.js is the GPU loop. This file is the shell: presets,
 * the GLSL box, sliders, and a private last field so the square on this
 * device is the one you left.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var FP = root.FieldPlay;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var currentId = '';
  var $ = function (id) { return document.getElementById(id); };

  function presets() { return root.FPPresets || []; }

  function findPreset(code) {
    var list = presets();
    var i;
    for (i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  function paintWhich() {
    var st = FP.getState();
    var sn = findPreset(st.code);
    currentId = sn ? sn.id : 'yours';
    var el = $('which');
    if (el) el.textContent = sn ? sn.name : 'Yours';
    var chips = $('chips').querySelectorAll('button');
    var i;
    for (i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === currentId);
    }
    var err = FP.lastError();
    var box = $('err');
    if (box) {
      box.hidden = !err;
      box.textContent = err || '';
    }
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var st = FP.getState();
      saveDb.put({
        id: 'field',
        code: st.code,
        timeStep: st.timeStep,
        fadeOut: st.fadeOut,
        dropProbability: st.dropProbability,
        colorMode: st.colorMode,
        cx: st.cx, cy: st.cy, w: st.w, h: st.h,
        snippet: currentId
      }).catch(function () {});
    }, 350);
  }

  function paintSliders() {
    var st = FP.getState();
    $('dt').value = st.timeStep;
    $('dtN').textContent = Number(st.timeStep).toFixed(3);
    $('fade').value = st.fadeOut;
    $('drop').value = st.dropProbability;
    $('color').value = String(st.colorMode);
  }

  function applyCode(code, fromPreset) {
    if (root.FPMp && root.FPMp.onApply && root.FPMp.onApply(code)) return;
    var r = FP.setCode(code);
    if ($('recipe').value !== code) $('recipe').value = code;
    paintWhich();
    if (!fromPreset) persist();
    return r;
  }

  function loadPreset(p) {
    if (!p) return;
    if (root.FPMp && root.FPMp.onPreset && root.FPMp.onPreset(p)) return;
    FP.applyPreset(p);
    $('recipe').value = p.code;
    paintSliders();
    paintWhich();
    persist();
  }

  function applyFromEditor() {
    applyCode($('recipe').value);
  }

  function bindChips() {
    var box = $('chips');
    box.textContent = '';
    presets().forEach(function (sn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = sn.name.replace(/\s*\[interactive\]/i, '');
      b.setAttribute('data-id', sn.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        loadPreset(sn);
      });
      box.appendChild(b);
    });
  }

  function bind() {
    $('applyBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (root.FPMp && root.FPMp.onReset && root.FPMp.onReset()) return;
      FP.reset();
    });
    $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (FP.isRunning()) { FP.pause(); this.textContent = 'Play'; }
      else { FP.play(); this.textContent = 'Pause'; }
    });
    $('dt').addEventListener('input', function () {
      FP.setSettings({ timeStep: parseFloat(this.value) });
      $('dtN').textContent = Number(this.value).toFixed(3);
      persist();
    });
    $('fade').addEventListener('input', function () {
      FP.setSettings({ fadeOut: parseFloat(this.value) });
      persist();
    });
    $('drop').addEventListener('input', function () {
      FP.setSettings({ dropProbability: parseFloat(this.value) });
      persist();
    });
    $('color').addEventListener('change', function () {
      FP.setSettings({ colorMode: parseInt(this.value, 10) });
      FP.setCode(FP.getState().code);
      persist();
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.FPMp && root.FPMp.busy && root.FPMp.busy()) {
          root.FPMp.leave();
          return true;
        }
        return false;
      });
    }
    root.addEventListener('resize', function () { FP.fitCanvas(); });
  }

  function boot() {
    var canvas = $('field');
    if (!FP.mount(canvas)) {
      $('err').hidden = false;
      $('err').textContent = FP.lastError() || 'This toy needs WebGL.';
      return;
    }
    bindChips();
    bind();
    var first = presets()[0];
    if (first) loadPreset(first);
    else applyCode('vec2 get_velocity(vec2 p) {\n  vec2 v = vec2(0.);\n  v.x = cos(p.y);\n  v.y = cos(p.x);\n  return v;\n}');
    FP.play();

    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('field').then(function (row) {
      if (!row || (root.FPMp && root.FPMp.busy && root.FPMp.busy())) return;
      if (row.code) {
        FP.setSettings({
          timeStep: row.timeStep,
          fadeOut: row.fadeOut,
          dropProbability: row.dropProbability,
          colorMode: row.colorMode,
          cx: row.cx, cy: row.cy, w: row.w, h: row.h
        });
        $('recipe').value = row.code;
        FP.reset();
        applyCode(row.code);
        paintSliders();
      }
    }).catch(function () {});
  }

  root.FPApp = {
    applyCode: applyCode,
    loadPreset: loadPreset,
    persist: persist,
    paintWhich: paintWhich,
    paintSliders: paintSliders,
    currentId: function () { return currentId; }
  };

  boot();
})(window);
