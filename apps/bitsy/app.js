/*
 * Bitsy — GifOS chrome around Adam le Doux's player.
 *
 * The last world stays in gifos.db('save'). Playing together shares the
 * world writing, not the walk. Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MAX = 80000;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var current = '';
  var currentId = 'example';
  var sysOn = false;
  var pad = { up: 0, down: 0, left: 0, right: 0, ok: 0 };
  var editing = false;

  var $ = function (id) { return document.getElementById(id); };

  function worlds() { return root.BitsyWorlds || []; }

  function findWorld(data) {
    var list = worlds();
    for (var i = 0; i < list.length; i++) {
      if (list[i].data === data) return list[i];
    }
    return null;
  }

  function titleOf(data) {
    var line = String(data || '').split('\n')[0] || '';
    return line.trim() || 'untitled';
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'world',
        data: current,
        worldId: currentId,
        title: titleOf(current)
      }).catch(function () {});
    }, 250);
  }

  function paintWhich() {
    var el = $('which');
    if (el) el.textContent = titleOf(current);
    var chips = $('chips').querySelectorAll('button');
    var sn = findWorld(current);
    currentId = sn ? sn.id : 'yours';
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === currentId);
    }
  }

  function ensureFont() {
    if (typeof fontManager !== 'undefined' && fontManager && root.BITSY_DEFAULT_FONT) {
      fontManager.AddResource('ascii_small.bitsyfont', root.BITSY_DEFAULT_FONT);
    }
  }

  function playWorld(data) {
    data = String(data || '').slice(0, MAX).replace(/\r\n/g, '\n');
    if (!data.trim()) return;
    current = data;
    paintWhich();
    persist();
    if (editing) return;
    try {
      if (typeof bitsy !== 'undefined' && bitsy._active) bitsy._exit();
      isGameLoaded = false;
      isGameOver = false;
      isEnding = false;
      ensureFont();
      loadGame($('game'), current, root.BITSY_DEFAULT_FONT);
      if (!sysOn) {
        initSystem();
        sysOn = true;
      }
      bitsy._injectPreLoop = function () {
        if (pad.up) bitsy._poke(bitsy._buttonBlock, bitsy.BTN_UP, 1);
        if (pad.down) bitsy._poke(bitsy._buttonBlock, bitsy.BTN_DOWN, 1);
        if (pad.left) bitsy._poke(bitsy._buttonBlock, bitsy.BTN_LEFT, 1);
        if (pad.right) bitsy._poke(bitsy._buttonBlock, bitsy.BTN_RIGHT, 1);
        if (pad.ok) bitsy._poke(bitsy._buttonBlock, bitsy.BTN_OK, 1);
      };
    } catch (e) {}
  }

  function stopPlay() {
    try {
      if (typeof bitsy !== 'undefined' && bitsy._active) bitsy._exit();
    } catch (e) {}
  }

  function showPlay() {
    editing = false;
    document.body.classList.remove('making');
    $('editor').hidden = true;
    $('stage').hidden = false;
    $('pad').hidden = false;
    $('editBtn').hidden = false;
    $('playBtn').hidden = true;
    playWorld(current);
  }

  function showEdit() {
    editing = true;
    stopPlay();
    document.body.classList.add('making');
    $('editor').hidden = false;
    $('stage').hidden = true;
    $('pad').hidden = true;
    $('editBtn').hidden = true;
    $('playBtn').hidden = false;
    if (root.BitsyEdit) root.BitsyEdit.load(current);
  }

  function loadLibrary(sn) {
    if (!sn) return;
    currentId = sn.id;
    if (!(root.BitsyMp && root.BitsyMp.onApply && root.BitsyMp.onApply(sn.data, sn.id))) {
      playWorld(sn.data);
    }
    if (editing && root.BitsyEdit) root.BitsyEdit.load(current);
  }

  function applyFromEditor() {
    var data = root.BitsyEdit ? root.BitsyEdit.src() : current;
    if (!(root.BitsyMp && root.BitsyMp.onApply && root.BitsyMp.onApply(data))) {
      playWorld(data);
    }
    showPlay();
  }

  function bindChips() {
    var box = $('chips');
    box.textContent = '';
    worlds().forEach(function (sn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = sn.name;
      b.setAttribute('data-id', sn.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        loadLibrary(sn);
      });
      box.appendChild(b);
    });
  }

  function hold(el, key) {
    if (!el) return;
    function down(e) {
      e.preventDefault();
      pad[key] = 1;
    }
    function up(e) {
      e.preventDefault();
      pad[key] = 0;
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }

  function bind() {
    $('editBtn').addEventListener('click', function (e) { e.preventDefault(); showEdit(); });
    $('playBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    $('restartBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof reset_cur_game === 'function') reset_cur_game();
    });
    hold($('padUp'), 'up');
    hold($('padDown'), 'down');
    hold($('padLeft'), 'left');
    hold($('padRight'), 'right');
    hold($('padTalk'), 'ok');
    if (root.BitsyEdit) {
      root.BitsyEdit.bind();
      root.BitsyEdit.onChange(function (data) {
        current = data;
        currentId = 'yours';
        paintWhich();
        persist();
      });
    }
  }

  function boot() {
    bindChips();
    bind();
    var first = worlds()[0];
    if (first) {
      current = first.data;
      currentId = first.id;
    }
    paintWhich();

    if (!api || !api.db) {
      playWorld(current);
      return;
    }
    saveDb = api.db('save');
    saveDb.get('world').then(function (row) {
      if (root.BitsyMp && root.BitsyMp.busy()) return;
      if (row && row.data) {
        current = row.data;
        currentId = row.worldId || 'yours';
      }
      playWorld(current);
    }).catch(function () { playWorld(current); });
  }

  root.BitsyApp = {
    playWorld: playWorld,
    persist: persist,
    current: function () { return current; },
    titleOf: titleOf,
    paintWhich: paintWhich,
    showPlay: showPlay,
    editing: function () { return editing; }
  };

  if (api && api.onBack) {
    api.onBack(function () {
      if (editing) { showPlay(); return true; }
      if (root.BitsyMp && root.BitsyMp.busy()) { root.BitsyMp.leave(); return true; }
      return false;
    });
  }

  root.addEventListener('pagehide', function () {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    persist();
  });

  boot();
})(window);
