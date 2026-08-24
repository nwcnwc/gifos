/* My Mind: the map is the save. Register onReady before vendor/my-mind.js runs. */
(function (root) {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var ready = false;
  var applying = false;
  var nid = 0;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function nextId() {
    nid += 1;
    return 'n' + nid;
  }

  function emptyMap() {
    return { root: { id: 'root', text: 'My Mind Map' } };
  }

  function walk(node, fn, parent) {
    if (!node) return;
    fn(node, parent);
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) walk(kids[i], fn, node);
  }

  function findNode(map, id) {
    var found = null;
    if (!map || !map.root) return null;
    walk(map.root, function (n) { if (n.id === id) found = n; });
    return found;
  }

  function addChild(map, parentId, text) {
    if (!map || !map.root) map = emptyMap();
    var p = (parentId && findNode(map, parentId)) || map.root;
    if (!p.children) p.children = [];
    var child = { id: nextId(), text: String(text == null ? 'New item' : text) };
    p.children.push(child);
    return child;
  }

  function isEmpty(map) {
    return !map || !map.root || !map.root.children || !map.root.children.length;
  }

  function cloneMap(map) {
    return JSON.parse(JSON.stringify(map || emptyMap()));
  }

  var MMMap = {
    empty: emptyMap,
    walk: walk,
    find: findNode,
    addChild: addChild,
    isEmpty: isEmpty,
    clone: cloneMap
  };

  function persistLs(data) {
    if (!saveDb) return;
    saveDb.put({ id: 'ls', data: data || {} }).catch(function () {});
  }

  function persistNow() {
    if (applying || !saveDb) return Promise.resolve(null);
    var map = root.MyMind && root.MyMind.getJSON ? root.MyMind.getJSON() : null;
    if (!map) return Promise.resolve(null);
    var rec = { id: 'last', map: map };
    return saveDb.put(rec).catch(function () { return null; });
  }

  function persist() {
    if (!ready || applying || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      persistNow().then(function () {
        if (root.MMMp && root.MMMp.noteChange) root.MMMp.noteChange();
        paintEmpty();
      });
    }, 400);
  }

  function paintEmpty() {
    var el = typeof document !== 'undefined' ? document.getElementById('empty') : null;
    if (!el) return;
    var map = root.MyMind && root.MyMind.getJSON ? root.MyMind.getJSON() : null;
    el.hidden = !isEmpty(map);
  }

  function fireCmd(name) {
    if (typeof document === 'undefined') return;
    var btn = document.querySelector('#context-menu [data-command="' + name + '"]');
    if (btn) {
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: root }));
      return;
    }
    var b2 = document.querySelector('[data-command="' + name + '"]');
    if (b2) b2.click();
  }

  function wirePhone() {
    if (typeof document === 'undefined') return;
    var bar = document.getElementById('phone-bar');
    if (bar) {
      bar.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== bar && !t.getAttribute('data-cmd')) t = t.parentNode;
        var name = t && t.getAttribute && t.getAttribute('data-cmd');
        if (name) { e.preventDefault(); fireCmd(name); }
      });
    }
    var port = document.querySelector('main');
    if (!port) return;
    var tapEdit = false;
    var downX = 0, downY = 0;
    port.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY;
      var cur = port.querySelector('.item.current .content');
      var tog = e.target && e.target.closest ? e.target.closest('.toggle') : null;
      tapEdit = !!(cur && cur.contains(e.target) && !tog);
    }, true);
    port.addEventListener('pointerup', function (e) {
      if (!tapEdit) return;
      tapEdit = false;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 10) return;
      if (e.target && (e.target.isContentEditable || (e.target.closest && e.target.closest('[contenteditable=true], [contenteditable=""]')))) return;
      fireCmd('edit');
    });
  }

  function wireBack() {
    if (!root.gifos || !root.gifos.onBack || typeof document === 'undefined') return;
    root.gifos.onBack(function () {
      var ids = ['io', 'help', 'notes'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && !el.hidden) { el.hidden = true; return true; }
      }
      var ctx = document.getElementById('context-menu');
      if (ctx && !ctx.hidden) { ctx.hidden = true; return true; }
      var ui = document.getElementById('ui');
      if (ui && !ui.hidden) { ui.hidden = true; return true; }
      return false;
    });
  }

  root.MyMind = root.MyMind || {};
  root.MyMind.onReady = function () {
    function start(rec) {
      if (rec && rec.map) {
        applying = true;
        try { root.MyMind.loadJSON(rec.map); } catch (e) {}
        applying = false;
      }
      ready = true;
      paintEmpty();
      if (root.MyMind.subscribe) {
        root.MyMind.subscribe('item-change', persist);
        root.MyMind.subscribe('map-new', persist);
        root.MyMind.subscribe('save-done', persist);
        root.MyMind.subscribe('load-done', persist);
      }
      if (root.MMMp && root.MMMp.start) root.MMMp.start();
    }
    function hydrateLs(rec) {
      if (rec && rec.data && root.MMLocal && root.MMLocal._hydrate) root.MMLocal._hydrate(rec.data);
    }
    if (saveDb && saveDb.get) {
      return Promise.all([saveDb.get('last'), saveDb.get('ls')]).then(function (pair) {
        hydrateLs(pair[1]);
        start(pair[0]);
      }).catch(function () { start(null); });
    }
    start(null);
  };

  if (root.MMLocal && root.MMLocal._onPersist) root.MMLocal._onPersist(persistLs);

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { wirePhone(); wireBack(); });
    } else {
      wirePhone();
      wireBack();
    }
  }

  root.MMMap = MMMap;
  root.MMSave = {
    persistNow: persistNow,
    persist: persist,
    applying: function (v) {
      if (arguments.length) applying = !!v;
      return applying;
    },
    fireCmd: fireCmd,
    paintEmpty: paintEmpty
  };
})(typeof window !== 'undefined' ? window : this);
