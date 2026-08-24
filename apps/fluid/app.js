/* Fluid: save quality/dye panel in a private collection. Nothing is fetched. */
(function () {
  'use strict';

  var KEYS = [
    'SIM_RESOLUTION', 'DYE_RESOLUTION', 'DENSITY_DISSIPATION', 'VELOCITY_DISSIPATION',
    'PRESSURE', 'CURL', 'SPLAT_RADIUS', 'SHADING', 'COLORFUL', 'PAUSED',
    'BLOOM', 'BLOOM_INTENSITY', 'BLOOM_THRESHOLD', 'SUNRAYS', 'SUNRAYS_WEIGHT'
  ];
  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  function snapshot() {
    var c = window.FluidConfig;
    if (!c) return null;
    var out = { id: 'last' };
    KEYS.forEach(function (k) { if (c[k] != null) out[k] = c[k]; });
    return out;
  }

  function persist() {
    if (!ready || !saveDb) return;
    var rec = snapshot();
    if (!rec) return;
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
    if (typeof window.FluidApply === 'function') window.FluidApply();
  }

  function boot() {
    var go = function (rec) {
      apply(rec);
      ready = true;
      persist();
    };
    if (saveDb && saveDb.get) {
      saveDb.get('last').then(go).catch(function () { go(null); });
    } else {
      go(null);
    }
    setInterval(persist, 2500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
