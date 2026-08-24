/* My Mind: the map is the save. Register onReady before vendor/my-mind.js runs. */
(function () {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  function persist() {
    if (!ready || !saveDb || !window.MyMind || !window.MyMind.getJSON) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var map = window.MyMind.getJSON();
      if (!map) return;
      saveDb.put({ id: 'last', map: map }).catch(function () {});
    }, 400);
  }

  window.MyMind = window.MyMind || {};
  window.MyMind.onReady = function () {
    function start(rec) {
      if (rec && rec.map) {
        try { window.MyMind.loadJSON(rec.map); } catch (e) {}
      }
      ready = true;
      if (window.MyMind.subscribe) {
        window.MyMind.subscribe('item-change', persist);
        window.MyMind.subscribe('map-new', persist);
        window.MyMind.subscribe('save-done', persist);
        window.MyMind.subscribe('load-done', persist);
      }
    }
    if (saveDb && saveDb.get) saveDb.get('last').then(start).catch(function () { start(null); });
    else start(null);
  };
})();
