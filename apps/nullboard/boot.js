/* Nullboard — GifOS shell. Hydrate the vendor store, then start. */
(function (root) {
  'use strict';

  var saveDb = null;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function persistLs(data) {
    if (!saveDb) return;
    saveDb.put({ id: 'ls', data: data || {} }).catch(function () {});
  }

  function hydrate() {
    if (!saveDb || !root.NBLocal) return Promise.resolve();
    return saveDb.get('ls').then(function (row) {
      if (row && row.data) root.NBLocal._hydrate(row.data);
    }).catch(function () {});
  }

  function afterSave() {
    if (root.NBLocal) root.NBLocal._flush();
    if (root.NBMp && root.NBMp.noteChange && !(root.NBMp.applying && root.NBMp.applying())) {
      root.NBMp.noteChange();
    }
  }

  function onBack() {
    if (typeof $ === 'undefined') return false;
    if ($('.overlay').is(':visible')) {
      $('.overlay').click();
      return true;
    }
    if ($('.board .editing').length) {
      var $edit = $('.board .editing .edit').first();
      if ($edit.length) $edit.blur();
      return true;
    }
    if (root.NBTouch) root.NBTouch.closeMenus(null);
    if ($('.config').hasClass('open')) {
      $('.config').removeClass('open');
      return true;
    }
    return false;
  }

  function boot() {
    root.NBHooks = { afterSave: afterSave };
    if (root.NBLocal) root.NBLocal._onPersist(persistLs);
    if (typeof root.startNullboard !== 'function') return;
    root.startNullboard();
    if (root.NBTouch) root.NBTouch.start();
    if (root.NBMp) root.NBMp.start();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () { onBack(); return true; });
    }
  }

  function go() {
    hydrate().then(boot).catch(boot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})(typeof window !== 'undefined' ? window : this);
