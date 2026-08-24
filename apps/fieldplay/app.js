/*
 * Field Play — GifOS chrome around anvaka's vector-field explorer.
 * vendor/fieldplay.js is the GPU loop. This file is the shell: presets,
 * the recipe box, sliders, and a private last field so the square on this
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
  var launched = false;
  var sheetOpen = false;
  var $ = function (id) { return document.getElementById(id); };

  var EXTRA = [
    {
      id: 'follow-finger',
      name: 'Follow the finger',
      timeStep: 0.012, fadeOut: 0.992, dropProbability: 0.012, colorMode: 2,
      cx: 0, cy: 0, w: 12, h: 12,
      code: 'vec2 get_velocity(vec2 p) {\n' +
        '  vec2 c = cursor.zw;\n' +
        '  vec2 d = p - c;\n' +
        '  float r = length(d) + 0.08;\n' +
        '  vec2 swirl = vec2(-d.y, d.x) / r;\n' +
        '  vec2 pull = -d * 0.12;\n' +
        '  return swirl * 2.4 + pull;\n' +
        '}'
    },
    {
      id: 'around-the-tap',
      name: 'Around the tap',
      timeStep: 0.01, fadeOut: 0.996, dropProbability: 0.008, colorMode: 3,
      cx: 0, cy: 0, w: 10, h: 10,
      code: 'vec2 get_velocity(vec2 p) {\n' +
        '  vec2 c = cursor.xy;\n' +
        '  vec2 d = p - c;\n' +
        '  float r2 = dot(d, d) + 0.15;\n' +
        '  return vec2(-d.y, d.x) / r2 - 0.08 * d;\n' +
        '}'
    }
  ];

  function presets() { return (root.FPPresets || []).concat(EXTRA); }

  function findPreset(code) {
    var list = presets();
    var i;
    for (i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }

  function findPresetByKey(key) {
    var want = String(key || '').toLowerCase().replace(/\s+/g, '-');
    if (!want) return null;
    var list = presets();
    var i, p, name;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      name = String(p.name || '').toLowerCase();
      if (p.id === want || name === String(key).toLowerCase()) return p;
      if (name.replace(/\s+/g, '-') === want) return p;
    }
    return null;
  }

  function paintWhich() {
    var st = FP.getState();
    var sn = findPreset(st.code);
    currentId = sn ? sn.id : 'yours';
    var el = $('which');
    if (el) el.textContent = sn ? sn.name : 'Yours';
    var box = $('chips');
    if (box) {
      var chips = box.querySelectorAll('button');
      var i;
      for (i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === currentId);
      }
    }
    var err = FP.lastError();
    var errBox = $('err');
    if (errBox) {
      errBox.hidden = !err;
      errBox.textContent = err || '';
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
        particleRes: st.particleRes,
        snippet: currentId
      }).catch(function () {});
    }, 350);
  }

  function paintSliders() {
    var st = FP.getState();
    if ($('dt')) {
      $('dt').value = st.timeStep;
      $('dtN').textContent = Number(st.timeStep).toFixed(3);
    }
    if ($('fade')) $('fade').value = st.fadeOut;
    if ($('drop')) $('drop').value = st.dropProbability;
    if ($('color')) $('color').value = String(st.colorMode === 3 ? 3 : (st.colorMode === 2 ? 2 : 1));
    if ($('quality')) $('quality').value = String(st.particleRes >= 128 ? 128 : (st.particleRes >= 96 ? 96 : 64));
  }

  function hideHint() {
    var h = $('hint');
    if (h) h.hidden = true;
  }

  function setSheet(open) {
    sheetOpen = !!open;
    document.body.classList.toggle('show-recipe', sheetOpen);
    var btn = $('recipeBtn');
    if (btn) {
      btn.textContent = sheetOpen ? 'Hide recipe' : 'Recipe';
      btn.setAttribute('aria-expanded', sheetOpen ? 'true' : 'false');
    }
    var sheet = $('sheet');
    if (sheet) sheet.hidden = false;
  }

  function applyCode(code, fromPreset) {
    if (root.FPMp && root.FPMp.onApply && root.FPMp.onApply(code)) return;
    var r = FP.setCode(code);
    if ($('recipe') && $('recipe').value !== code) $('recipe').value = code;
    paintWhich();
    if (!fromPreset && r && r.ok) persist();
    return r;
  }

  function loadPreset(p) {
    if (!p) return;
    if (root.FPMp && root.FPMp.onPreset && root.FPMp.onPreset(p)) return;
    FP.applyPreset(p);
    if ($('recipe')) $('recipe').value = p.code;
    paintSliders();
    paintWhich();
    persist();
  }

  function applyFromEditor() {
    var code = $('recipe') ? $('recipe').value : '';
    if (!String(code).replace(/\s+/g, '')) {
      var box = $('err');
      if (box) {
        box.hidden = false;
        box.textContent = 'The recipe box is empty. Paste a get_velocity function, or tap a named field.';
      }
      return;
    }
    applyCode(code);
  }

  function bindChips() {
    var box = $('chips');
    if (!box) return;
    box.textContent = '';
    var SHORT = {
      'four-counterclockwise-cogs-pushing-parti': 'Four cogs',
      'particle-grinder': 'Grinder',
      'follow-finger': 'Follow the finger',
      'around-the-tap': 'Around the tap'
    };
    presets().forEach(function (sn) {
      var b = document.createElement('button');
      b.type = 'button';
      var name = SHORT[sn.id] || sn.name.replace(/\s*\[interactive\]/i, '');
      b.textContent = name;
      b.title = sn.name;
      b.setAttribute('data-id', sn.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        loadPreset(sn);
      });
      box.appendChild(b);
    });
  }

  function bind() {
    if ($('applyBtn')) $('applyBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    if ($('resetBtn')) $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (root.FPMp && root.FPMp.onReset && root.FPMp.onReset()) return;
      FP.reset();
    });
    if ($('pauseBtn')) $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (FP.isRunning()) { FP.pause(); this.textContent = 'Play'; }
      else { FP.play(); this.textContent = 'Pause'; }
    });
    if ($('recipeBtn')) $('recipeBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setSheet(!sheetOpen);
    });
    if ($('dt')) $('dt').addEventListener('input', function () {
      FP.setSettings({ timeStep: parseFloat(this.value) });
      if ($('dtN')) $('dtN').textContent = Number(this.value).toFixed(3);
      persist();
    });
    if ($('fade')) $('fade').addEventListener('input', function () {
      FP.setSettings({ fadeOut: parseFloat(this.value) });
      persist();
    });
    if ($('drop')) $('drop').addEventListener('input', function () {
      FP.setSettings({ dropProbability: parseFloat(this.value) });
      persist();
    });
    if ($('color')) $('color').addEventListener('change', function () {
      FP.setSettings({ colorMode: parseInt(this.value, 10) });
      FP.setCode(FP.getState().code);
      persist();
    });
    if ($('quality')) $('quality').addEventListener('change', function () {
      FP.setSettings({ particleRes: parseInt(this.value, 10) });
      persist();
    });
    if ($('recipe')) {
      $('recipe').addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          applyFromEditor();
        }
      });
    }
    var canvas = $('field');
    if (canvas) {
      canvas.addEventListener('pointerdown', hideHint);
    }
    if (FP.onView) FP.onView(persist);
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (sheetOpen) { setSheet(false); return true; }
        if (root.FPMp && root.FPMp.busy && root.FPMp.busy()) {
          root.FPMp.leave();
          return true;
        }
        return false;
      });
    }
    root.addEventListener('resize', function () { FP.fitCanvas(); });
  }

  function restoreRow(row) {
    if (!row || (root.FPMp && root.FPMp.busy && root.FPMp.busy())) return;
    if (!row.code) return;
    FP.setSettings({
      timeStep: row.timeStep,
      fadeOut: row.fadeOut,
      dropProbability: row.dropProbability,
      colorMode: row.colorMode,
      cx: row.cx, cy: row.cy, w: row.w, h: row.h,
      particleRes: row.particleRes
    });
    if ($('recipe')) $('recipe').value = row.code;
    FP.reset();
    applyCode(row.code);
    paintSliders();
  }

  function bootSave() {
    if (!saveDb) return;
    saveDb.get('field').then(function (row) {
      if (launched) return;
      restoreRow(row);
    }).catch(function () {});
  }

  function bootLaunch() {
    if (!api || !api.launch) { bootSave(); return; }
    api.launch().then(function (go) {
      if (go && go.field) {
        var p = findPresetByKey(go.field);
        if (p) {
          launched = true;
          loadPreset(p);
          var el = $('which');
          if (el) el.textContent = p.name;
          return;
        }
      }
      bootSave();
    }).catch(function () { bootSave(); });
  }

  function boot() {
    bindChips();
    bind();
    var canvas = $('field');
    if (!FP.mount(canvas)) {
      var box = $('err');
      if (box) {
        box.hidden = false;
        box.textContent = FP.lastError() || 'This toy needs WebGL, and this browser does not have it.';
      }
      hideHint();
      return;
    }
    var first = presets()[0];
    if (first) loadPreset(first);
    else applyCode('vec2 get_velocity(vec2 p) {\n  vec2 v = vec2(0.);\n  v.x = cos(p.y);\n  v.y = cos(p.x);\n  return v;\n}');
    FP.play();
    setSheet(false);

    if (!api || !api.db) return;
    saveDb = api.db('save');
    bootLaunch();
  }

  root.FPApp = {
    applyCode: applyCode,
    loadPreset: loadPreset,
    persist: persist,
    paintWhich: paintWhich,
    paintSliders: paintSliders,
    currentId: function () { return currentId; },
    extras: EXTRA,
    findPresetByKey: findPresetByKey
  };

  boot();
})(window);
