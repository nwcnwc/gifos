/*
 * Server Survival — GifOS chrome. Classic IIFE. No fetch, no sockets, no eval.
 * The engine is vendor/game.js. Progress and prefs live in gifos.db('save').
 * The memory localStorage in shim.js is only the game's scratch pad.
 */
(function () {
  'use strict';

  var saveDb = window.__ssSaveDb || null;
  try { if (!saveDb && window.gifos && window.gifos.db) saveDb = gifos.db('save'); } catch (e) {}
  var saveTimer = 0;
  var ready = false;
  var origSet = null;
  var origRemove = null;
  var silentSave = false;

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

  function isNarrow() {
    return window.innerWidth < 700 || window.innerHeight < 640;
  }

  function markNarrow() {
    document.documentElement.classList.toggle('ss-narrow', isNarrow());
    var sand = document.getElementById('sandboxPanel');
    if (!sand || document.getElementById('ss-lab-toggle')) return;
    var t = document.createElement('button');
    t.id = 'ss-lab-toggle';
    t.className = 'ss-lab-toggle';
    t.type = 'button';
    t.textContent = 'Lab';
    t.setAttribute('aria-label', 'Sandbox lab controls');
    t.addEventListener('click', function () {
      sand.classList.toggle('ss-open');
    });
    document.body.appendChild(t);
  }

  function hideShareLink() {
    var btn = document.getElementById('btn-share-link');
    var desc = document.getElementById('share-desc');
    if (btn) btn.style.display = 'none';
    if (desc) {
      desc.textContent = 'Download a snapshot of the board. Sharing the app itself is the GifOS bar above this window.';
    }
    var hud = document.getElementById('btn-share');
    if (hud) {
      hud.setAttribute('title', 'Download board snapshot');
      hud.setAttribute('data-i18n-title', '');
    }
  }

  function fitTutorial() {
    var tut = window.tutorial;
    if (!tut || typeof tut.positionPopup !== 'function') return;
    var orig = tut.positionPopup.bind(tut);
    tut.positionPopup = function (step) {
      orig(step);
      if (!isNarrow() || !this.popup) return;
      this.popup.style.left = '8px';
      this.popup.style.right = '8px';
      this.popup.style.top = '8px';
      this.popup.style.bottom = 'auto';
      this.popup.style.transform = 'none';
      this.popup.style.maxWidth = 'none';
      this.popup.style.maxHeight = '36vh';
      this.popup.style.overflowY = 'auto';
    };
  }

  function wrapSilentSave() {
    var inner = window.saveGameState;
    if (typeof inner !== 'function') return;
    window.saveGameState = function (saveAs) {
      if (saveAs === 'silent') {
        if (silentSave) return;
        silentSave = true;
        var play = window.STATE && STATE.sound && STATE.sound.playPlace;
        if (play) STATE.sound.playPlace = function () {};
        try { inner('browser'); } catch (e) {}
        if (play) STATE.sound.playPlace = play;
        var modal = document.getElementById('save-modal');
        if (modal) modal.classList.add('hidden');
        silentSave = false;
        return;
      }
      return inner(saveAs);
    };
  }

  function snapshotRun() {
    if (typeof window.saveGameState !== 'function') return;
    if (!window.STATE || !STATE.gameStarted) return;
    try { window.saveGameState('silent'); } catch (e) {}
  }

  function topModal() {
    var ids = [
      'tutorial-modal', 'faq-modal', 'save-modal', 'share-modal',
      'trophies-modal', 'campaign-debrief-modal', 'campaign-briefing-modal',
      'campaign-select-modal', 'modal'
    ];
    var i, el;
    for (i = 0; i < ids.length; i++) {
      el = document.getElementById(ids[i]);
      if (el && !el.classList.contains('hidden')) return ids[i];
    }
    el = document.getElementById('main-menu-modal');
    if (el && !el.classList.contains('hidden')) return 'main-menu-modal';
    return null;
  }

  function closeTop() {
    var which = topModal();
    if (which === 'tutorial-modal' && window.tutorial && typeof window.tutorial.skip === 'function') {
      window.tutorial.skip();
      return true;
    }
    if (which === 'faq-modal' && typeof window.closeFAQ === 'function') {
      window.closeFAQ();
      return true;
    }
    if (which === 'save-modal' && typeof window.closeSaveModal === 'function') {
      window.closeSaveModal();
      return true;
    }
    if (which === 'share-modal' && typeof window.closeShareModal === 'function') {
      window.closeShareModal();
      return true;
    }
    if (which === 'trophies-modal' && typeof window.closeTrophies === 'function') {
      window.closeTrophies();
      return true;
    }
    if (which === 'campaign-debrief-modal' && typeof window.exitCampaignToMap === 'function') {
      window.exitCampaignToMap();
      return true;
    }
    if (which === 'campaign-briefing-modal' && typeof window.exitCampaignToMap === 'function') {
      window.exitCampaignToMap();
      return true;
    }
    if (which === 'campaign-select-modal' && typeof window.exitCampaignToMenu === 'function') {
      window.exitCampaignToMenu();
      return true;
    }
    if (which === 'modal' && typeof window.toggleFailureModal === 'function') {
      window.toggleFailureModal();
      return true;
    }
    if (which !== 'main-menu-modal' && window.STATE && STATE.gameStarted) {
      snapshotRun();
      var ev = document.createEvent('Event');
      ev.initEvent('keydown', true, true);
      ev.key = 'Escape';
      document.dispatchEvent(ev);
      return true;
    }
    return false;
  }

  function boot(row) {
    applyLive();
    markNarrow();
    hideShareLink();
    fitTutorial();
    wrapSilentSave();
    ready = true;
    persist();
    if (window.gifos && typeof gifos.onBack === 'function') {
      gifos.onBack(function () { return closeTop(); });
    }
  }

  window.addEventListener('resize', markNarrow);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) snapshotRun();
  });

  var pending = window.__ssReady;
  if (pending && typeof pending.then === 'function') pending.then(boot).catch(function () { boot(null); });
  else boot(null);
})();
