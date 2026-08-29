/* My Mind: the map is the save. Register onReady before vendor/my-mind.js runs. */
(function (root) {

  // window.prompt does NOTHING in an app frame: the sandbox carries no
  // allow-modals, so it returns NULL without asking, and the one place
  // my-mind's Set value command uses it was unreachable. prompt() cannot be shimmed the way the
  // runtime shims alert() and confirm() — its contract is a STRING returned
  // synchronously, and there is no honest way to invent one. So ask properly
  // and take the answer late: gifosAsk(label, initial) resolves to the typed
  // string, or null if it was dismissed.
  root.gifosAsk = function (label, initial) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;'
        + 'align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px';
      var card = document.createElement('div');
      card.style.cssText = 'background:#1b1b1f;color:#f4f4f5;border:1px solid #3f3f46;'
        + 'border-radius:12px;padding:16px;max-width:24rem;width:100%;'
        + 'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        + 'box-shadow:0 12px 40px rgba(0,0,0,.5)';
      var p = document.createElement('p');
      p.textContent = label;
      p.style.cssText = 'margin:0 0 10px';
      var input = document.createElement('input');
      input.type = 'text';
      input.value = initial == null ? '' : String(initial);
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:0 0 12px;'
        + 'padding:8px 10px;border-radius:8px;border:1px solid #3f3f46;background:#101014;'
        + 'color:inherit;font:inherit';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'OK';
      var btn = 'padding:7px 14px;border-radius:8px;border:1px solid #3f3f46;'
        + 'background:#26262b;color:inherit;font:inherit;cursor:pointer';
      cancel.style.cssText = btn;
      ok.style.cssText = btn + ';background:#3b82f6;border-color:#3b82f6;color:#fff';
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      cancel.addEventListener('click', function () { done(null); });
      ok.addEventListener('click', function () { done(input.value); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
        else if (e.key === 'Enter') { e.preventDefault(); done(input.value); }
      });
      row.appendChild(cancel); row.appendChild(ok);
      card.appendChild(p); card.appendChild(input); card.appendChild(row);
      wrap.appendChild(card);
      (document.body || document.documentElement).appendChild(wrap);
      input.focus(); input.select();
    });
  };
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
      fitChrome();
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

  function fitChrome() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    var ui = document.getElementById('ui');
    if (!ui) return;
    var wide = window.innerWidth > 700;
    if (wide && ui.hidden) { ui.hidden = false; window.dispatchEvent(new Event('resize')); }
    if (!wide && !ui.hidden) { ui.hidden = true; window.dispatchEvent(new Event('resize')); }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { wirePhone(); wireBack(); fitChrome(); });
    } else {
      wirePhone();
      wireBack();
      fitChrome();
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
