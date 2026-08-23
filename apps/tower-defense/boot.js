/*
 * Tower Defense — GifOS shell.
 *
 * Starts the vendored game, wires the picker, keeps a best wave in gifos.db.
 * Invite is OS chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var prefs = { wave: 0, score: 0 };
  var prefsDb = null;
  var watch = 0;

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    try { prefsDb = root.gifos.db('prefs'); } catch (e) { return Promise.resolve(); }
    return prefsDb.get('best').then(function (row) {
      if (!row) return;
      if (row.wave > prefs.wave) prefs.wave = row.wave | 0;
      if (row.score > prefs.score) prefs.score = row.score | 0;
    }).catch(function () {});
  }

  function savePrefs() {
    if (!prefsDb) return;
    prefsDb.put({ id: 'best', wave: prefs.wave, score: prefs.score }).catch(function () {});
  }

  function noteScore() {
    var TD = root._TD && root._TD.game;
    if (!TD) return;
    var wave = 0;
    try {
      wave = TD.stage && TD.stage.current_act && TD.stage.current_act.current_scene
        ? (TD.stage.current_act.current_scene.wave | 0) : 0;
    } catch (e) {}
    var ch = false;
    if ((TD.score | 0) > prefs.score) { prefs.score = TD.score | 0; ch = true; }
    if (wave > prefs.wave) { prefs.wave = wave; ch = true; }
    if (ch) savePrefs();
  }

  function boot() {
    if (!root._TD || !root._TD.init) return;
    root._TD.init('td-board', false);
    var loading = document.getElementById('td-loading');
    var board = document.getElementById('td-board');
    if (loading) loading.style.display = 'none';
    if (board) board.style.display = 'block';
    if (root.Touch) root.Touch.init();
    if (watch) clearInterval(watch);
    watch = setInterval(noteScore, 1500);
  }

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.TDMp && root.TDMp.isOn()) root.TDMp.leave();
    });
  }

  function start() {
    loadPrefs().then(boot).catch(boot);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
