/*
 * A Dark Room — GifOS shell.
 * Hydrate the save, load packed FLAC through gifos.assets, start the engine.
 */
(function (root) {
  'use strict';

  var saveDb = root.__adrSaveDb || null;
  try { if (!saveDb && root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}
  var saveTimer = 0;
  var origSave = null;
  var audioCache = {};
  var audioIndex = root.__ADR_AUDIO_INDEX || {};

  function persistNow() {
    if (!saveDb || !saveDb.put) return;
    var raw;
    try { raw = localStorage.gameState; } catch (e) { raw = null; }
    if (raw == null && root.State) {
      try { raw = JSON.stringify(root.State); } catch (e2) { return; }
    }
    if (raw == null) return;
    saveDb.put({ id: 'game', gameState: raw, at: Date.now() }).catch(function () {});
    if (root.Net && root.Net.owner && root.Net.owner()) root.Net.publish(true);
  }

  function persistSoon() {
    if (root.Net && root.Net.applying && root.Net.applying()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      persistNow();
    }, 350);
  }

  function wrapSave() {
    if (!root.Engine || origSave) return;
    origSave = Engine.saveGame.bind(Engine);
    Engine.saveGame = function () {
      origSave();
      persistSoon();
    };
  }

  function loadAudio(rel) {
    var path = String(rel || '');
    var m = path.match(/audio\/[^?#]+/);
    if (m) path = m[0];
    if (path.indexOf('audio/') !== 0) path = 'audio/' + path.replace(/^.*\//, '');
    if (audioCache[path]) return Promise.resolve(audioCache[path]);
    var g = root.gifos;
    if (!g || typeof g.assets !== 'function') {
      return Promise.reject(new Error('no assets'));
    }
    return g.assets(path).then(function (buf) {
      audioCache[path] = buf;
      return buf;
    });
  }

  function bootNote(msg) {
    var el = document.getElementById('adr-boot-note');
    if (el) el.textContent = msg;
  }

  function hideBoot() {
    var el = document.getElementById('adr-boot');
    if (!el) return;
    el.classList.add('gone');
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 500);
  }

  function startEngine() {
    wrapSave();
    if (root.__adrPatch) root.__adrPatch();
    var origTravel = Engine.travelTo.bind(Engine);
    Engine.travelTo = function (mod) {
      origTravel(mod);
      $('.location').removeClass('adr-active');
      if (mod && mod.panel) $(mod.panel).addClass('adr-active');
      if (root.Touch && root.Touch.sync) root.Touch.sync();
    };
    Engine.init();
    wrapSave();
    if (root.Room && Room.panel) $(Room.panel).addClass('adr-active');
    if (root.Touch) root.Touch.init();
    var roomP = root.Net ? root.Net.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function () {
      if (root.Net && root.Net.onRoster) root.Net.onRoster(function () {});
    }).catch(function () {});
    document.addEventListener('click', function () {
      if (root.AudioEngine && AudioEngine.tryResumingAudioContext) {
        AudioEngine.tryResumingAudioContext();
      }
    }, true);
    hideBoot();
  }

  function boot() {
    root.__adrLoadAudio = loadAudio;
    var keys = Object.keys(audioIndex);
    bootNote(keys.length
      ? 'the room is still. carrying the fire in…'
      : 'the room is still.');
    var ready = root.__adrReady || Promise.resolve(null);
    ready.then(function () {
      startEngine();
    }).catch(function () {
      startEngine();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
