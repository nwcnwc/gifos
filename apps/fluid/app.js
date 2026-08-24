/* Fluid: save quality/dye panel + a still of the swirl. Nothing is fetched. */
(function () {
  'use strict';

  var KEYS = [
    'SIM_RESOLUTION', 'DYE_RESOLUTION', 'DENSITY_DISSIPATION', 'VELOCITY_DISSIPATION',
    'PRESSURE', 'CURL', 'SPLAT_RADIUS', 'SHADING', 'COLORFUL', 'PAUSED',
    'BLOOM', 'BLOOM_INTENSITY', 'BLOOM_THRESHOLD', 'SUNRAYS', 'SUNRAYS_WEIGHT',
    'TRANSPARENT'
  ];
  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  var degraded = false;
  var slowFrames = 0;
  var lastSnap = null;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  var hint = document.getElementById('hint');
  var nogl = document.getElementById('nogl');
  var lastStill = document.getElementById('lastStill');
  var note = document.getElementById('note');

  function showNote(text) {
    if (!note) return;
    note.textContent = text;
    note.hidden = false;
    setTimeout(function () { note.hidden = true; }, 4200);
  }

  if (window.FluidNoGL) {
    if (nogl) nogl.hidden = false;
    if (hint) hint.hidden = true;
    return;
  }

  function snapshot() {
    var c = window.FluidConfig;
    if (!c) return null;
    var out = { id: 'last' };
    KEYS.forEach(function (k) { if (c[k] != null) out[k] = c[k]; });
    if (c.BACK_COLOR) out.BACK_COLOR = { r: c.BACK_COLOR.r, g: c.BACK_COLOR.g, b: c.BACK_COLOR.b };
    return out;
  }

  function persist(extra) {
    if (!ready || !saveDb) return;
    var rec = snapshot();
    if (!rec) return;
    if (extra) Object.keys(extra).forEach(function (k) { rec[k] = extra[k]; });
    if (rec.snap) lastSnap = rec.snap;
    else if (lastSnap) rec.snap = lastSnap;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put(rec).catch(function () {});
    }, 400);
  }

  function apply(rec) {
    var c = window.FluidConfig;
    if (!c || !rec) return;
    KEYS.forEach(function (k) {
      if (rec[k] != null) c[k] = rec[k];
    });
    if (rec.BACK_COLOR && typeof rec.BACK_COLOR === 'object') {
      c.BACK_COLOR = rec.BACK_COLOR;
    }
    if (typeof window.FluidApply === 'function') window.FluidApply();
  }

  function hideHint() {
    if (hint) hint.classList.add('gone');
  }
  function hideStill() {
    if (lastStill) lastStill.hidden = true;
  }

  function grabStill(cb) {
    var src = document.querySelector('canvas');
    if (!src) { if (cb) cb(null); return; }
    try {
      var w = 320, h = Math.max(1, Math.round(320 * (src.height / Math.max(1, src.width))));
      var off = document.createElement('canvas');
      off.width = w; off.height = h;
      var x = off.getContext('2d');
      x.drawImage(src, 0, 0, w, h);
      var url = off.toDataURL('image/jpeg', 0.55);
      if (cb) cb(url);
    } catch (e) {
      if (cb) cb(null);
    }
  }

  function showStill(url) {
    if (!url || !lastStill) return;
    lastStill.src = url;
    lastStill.hidden = false;
  }

  window.FluidOnChange = function () { persist(); };
  window.FluidOnCapture = function (datauri) {
    persist({ snap: datauri || null, snapAt: Date.now() });
    showNote('Saved in this file.');
  };
  window.FluidFrame = function (realDt) {
    if (degraded) return;
    if (realDt > 0.05) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames < 45) return;
    degraded = true;
    var c = window.FluidConfig;
    if (!c) return;
    c.DYE_RESOLUTION = Math.min(c.DYE_RESOLUTION || 512, 256);
    c.SIM_RESOLUTION = Math.min(c.SIM_RESOLUTION || 128, 64);
    c.BLOOM = false;
    c.SUNRAYS = false;
    c.SHADING = false;
    if (typeof window.FluidApply === 'function') window.FluidApply();
    persist();
    showNote('This phone is warm — quality dropped.');
  };

  ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) {
    document.addEventListener(ev, function () { hideHint(); hideStill(); }, { passive: true });
  });

  function boot() {
    var go = function (rec) {
      apply(rec);
      if (rec && rec.snap) { lastSnap = rec.snap; showStill(rec.snap); }
      ready = true;
      persist();
    };
    if (saveDb && saveDb.get) {
      saveDb.get('last').then(go).catch(function () { go(null); });
    } else {
      go(null);
    }
    setInterval(function () {
      persist();
      var c = window.FluidConfig;
      if (c && c.PAUSED) {
        grabStill(function (url) { if (url) persist({ snap: url, snapAt: Date.now() }); });
      }
    }, 2500);
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      var gui = window.FluidGUI;
      if (gui && !gui.closed) { gui.close(); return true; }
      return false;
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
