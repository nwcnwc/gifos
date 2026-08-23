/*
 * CSS Doodle — GifOS chrome around yuanchuan's <css-doodle>.
 *
 * vendor/css-doodle.js registers the custom element. This file is the
 * shell: remix snippets, the recipe box, shuffle, and a private last
 * pattern so the square on this device is the one you left.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MAX = 8000;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var doodle = document.getElementById('doodle');
  var current = { id: 'checker', code: '', seed: 1 };

  var $ = function (id) { return document.getElementById(id); };

  function snippets() { return root.CDSnippets || []; }

  function findSnippet(code) {
    var list = snippets();
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) return list[i];
    }
    return null;
  }

  function paintWhich() {
    var el = $('which');
    if (!el) return;
    var sn = findSnippet(current.code);
    el.textContent = sn ? sn.name : 'Yours';
    current.id = sn ? sn.id : 'yours';
    var chips = $('chips').querySelectorAll('button');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('on', chips[i].getAttribute('data-id') === current.id);
    }
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'pattern',
        code: current.code,
        seed: current.seed,
        snippet: current.id
      }).catch(function () {});
    }, 250);
  }

  function applyToDoodle(code, seed) {
    code = String(code || '').slice(0, MAX);
    seed = (seed >>> 0) || 1;
    current.code = code;
    current.seed = seed;
    if ($('recipe').value !== code) $('recipe').value = code;
    try { doodle.setAttribute('seed', String(seed)); } catch (e) {}
    if (typeof doodle.update === 'function') doodle.update(code);
    paintWhich();
  }

  function applyFromEditor() {
    var code = $('recipe').value;
    if (root.CDMp && root.CDMp.onApply && root.CDMp.onApply(code, current.seed)) return;
    applyToDoodle(code, current.seed);
    persist();
  }

  function loadSnippet(sn, seed) {
    if (!sn) return;
    var s = seed != null ? seed : ((Math.random() * 0x100000000) >>> 0) || 1;
    if (root.CDMp && root.CDMp.onApply && root.CDMp.onApply(sn.code, s, sn.id)) return;
    applyToDoodle(sn.code, s);
    persist();
  }

  function remix() {
    var list = snippets();
    if (!list.length) return;
    var pick = list[(Math.random() * list.length) | 0];
    if (list.length > 1) {
      var guard = 0;
      while (pick.code === current.code && guard++ < 8) {
        pick = list[(Math.random() * list.length) | 0];
      }
    }
    loadSnippet(pick);
  }

  function shuffle() {
    var seed = ((Math.random() * 0x100000000) >>> 0) || 1;
    if (root.CDMp && root.CDMp.onShuffle && root.CDMp.onShuffle(current.code, seed)) return;
    applyToDoodle(current.code, seed);
    persist();
  }

  function bindChips() {
    var box = $('chips');
    box.textContent = '';
    snippets().forEach(function (sn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = sn.name;
      b.setAttribute('data-id', sn.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        loadSnippet(sn);
      });
      box.appendChild(b);
    });
  }

  function bind() {
    $('applyBtn').addEventListener('click', function (e) { e.preventDefault(); applyFromEditor(); });
    $('shuffleBtn').addEventListener('click', function (e) { e.preventDefault(); shuffle(); });
    $('remixBtn').addEventListener('click', function (e) { e.preventDefault(); remix(); });
    doodle.addEventListener('click', function (e) {
      e.preventDefault();
      shuffle();
    });
  }

  function boot() {
    bindChips();
    bind();
    var first = snippets()[0];
    if (first) applyToDoodle(first.code, 1);

    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('pattern').then(function (row) {
      if (!row || (root.CDMp && root.CDMp.busy())) return;
      if (row.code) applyToDoodle(row.code, row.seed || 1);
    }).catch(function () {});
  }

  root.CDApp = {
    applyToDoodle: applyToDoodle,
    persist: persist,
    current: function () { return { code: current.code, seed: current.seed, id: current.id }; },
    paintWhich: paintWhich
  };

  boot();
})(window);
