/*
 * Server Survival — GifOS chrome. Classic IIFE. No fetch, no sockets, no eval.
 * The engine is vendor/game.js. Progress and prefs live in gifos.db('save').
 */
(function () {
  'use strict';

  var saveDb = window.__ssSaveDb || null;
  try { if (!saveDb && window.gifos && window.gifos.db) saveDb = gifos.db('save'); } catch (e) {}
  var saveTimer = 0;
  var ready = false;
  var origSet = null;
  var origRemove = null;

  try {
    origSet = localStorage.setItem.bind(localStorage);
    origRemove = localStorage.removeItem.bind(localStorage);
  } catch (e) {
    return;
  }

  function snapshot() {
    var keys = {}, i, k, v, n;
    try { n = localStorage.length; } catch (e) { return keys; }
    for (i = 0; i < n; i++) {
      k = localStorage.key(i);
      if (!k) continue;
      v = localStorage.getItem(k);
      if (v != null) keys[k] = v;
    }
    return keys;
  }

  function persist() {
    if (!ready || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'last', keys: snapshot() }).catch(function () {});
    }, 400);
  }

  function applyKeys(keys) {
    if (!keys) return;
    var k;
    for (k in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, k) && keys[k] != null) {
        origSet(k, keys[k]);
      }
    }
  }

  function paintSound() {
    if (!window.STATE || !STATE.sound) return;
    var channels = [
      { muted: STATE.sound.musicMuted, tool: 'tool-music', toolIcon: 'music-icon', menu: 'menu-music-btn', menuIcon: 'menu-music-icon' },
      { muted: STATE.sound.sfxMuted, tool: 'tool-sfx', toolIcon: 'sfx-icon', menu: 'menu-sfx-btn', menuIcon: 'menu-sfx-icon' }
    ];
    var i, ch, toolBtn, menuBtn, icon, ids;
    for (i = 0; i < channels.length; i++) {
      ch = channels[i];
      ids = [ch.toolIcon, ch.menuIcon];
      ids.forEach(function (id) {
        icon = document.getElementById(id);
        if (icon) icon.classList.toggle('opacity-40', ch.muted);
      });
      toolBtn = document.getElementById(ch.tool);
      if (toolBtn) {
        toolBtn.classList.toggle('bg-red-900', ch.muted);
        toolBtn.classList.toggle('pulse-green', ch.muted);
      }
      menuBtn = document.getElementById(ch.menu);
      if (menuBtn) menuBtn.classList.toggle('pulse-green', ch.muted);
    }
  }

  function applyLive() {
    var prefs, locale, loadBtn;
    try { prefs = JSON.parse(localStorage.getItem('serverSurvivalSoundPrefs') || 'null'); } catch (e) { prefs = null; }
    if (prefs && window.STATE && STATE.sound) {
      if (typeof prefs.musicMuted === 'boolean') STATE.sound.musicMuted = prefs.musicMuted;
      if (typeof prefs.sfxMuted === 'boolean') STATE.sound.sfxMuted = prefs.sfxMuted;
      paintSound();
    }
    locale = localStorage.getItem('game_locale');
    if (locale && window.i18n && i18n.currentLocale !== locale && typeof i18n.setLocale === 'function') {
      i18n.setLocale(locale);
    }
    loadBtn = document.getElementById('load-btn');
    if (loadBtn && localStorage.getItem('serverSurvivalSave') !== null) {
      loadBtn.style.display = 'block';
    }
  }

  try {
    localStorage.setItem = function (k, v) { origSet(k, v); persist(); };
    localStorage.removeItem = function (k) { origRemove(k); persist(); };
  } catch (e) {}

  function boot(row) {
    if (row && row.keys) applyKeys(row.keys);
    applyLive();
    ready = true;
    persist();
  }

  var pending = window.__ssReady;
  if (pending && typeof pending.then === 'function') pending.then(boot).catch(function () { boot(null); });
  else boot(null);
})();
