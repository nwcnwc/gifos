/*
 * TiddlyWiki — GifOS shell.
 *
 * The vendored empty wiki boots only after we preload tiddlers from
 * gifos.db (suppressBoot is set in the wiki HTML). A change listener
 * writes them back. Invite is the same collection at read-write; the
 * story river stays in prefs so each person keeps their own open tabs.
 */
(function (root) {
  'use strict';

  function installStorageShim() {
    function memStore() {
      var mem = Object.create(null);
      var keys = function () { return Object.keys(mem); };
      return {
        getItem: function (k) {
          return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
        },
        setItem: function (k, v) { mem[String(k)] = String(v); },
        removeItem: function (k) { delete mem[k]; },
        clear: function () { mem = Object.create(null); },
        key: function (i) { return keys()[i] || null; },
        get length() { return keys().length; }
      };
    }
    function dead(name) {
      try {
        var s = root[name];
        if (s && typeof s.getItem === 'function') { s.getItem('gifos-probe'); return; }
      } catch (e) { /* opaque-origin throw */ }
      try { Object.defineProperty(root, name, { value: memStore(), configurable: true }); } catch (e2) {
        try { root[name] = memStore(); } catch (e3) {}
      }
    }
    dead('localStorage');
    dead('sessionStorage');
  }
  installStorageShim();

  var $tw = root.$tw;
  var bootMsg = document.getElementById('gifos-boot');
  function say(t) { if (bootMsg) bootMsg.textContent = t; }
  function hideBoot() {
    if (bootMsg && bootMsg.parentNode) bootMsg.parentNode.removeChild(bootMsg);
    bootMsg = null;
  }

  if (!$tw || !$tw.boot || typeof $tw.boot.boot !== 'function') {
    say('TiddlyWiki did not load.');
    return;
  }

  if ($tw.modules && typeof $tw.modules.define === 'function') {
    $tw.modules.define('$:/plugins/gifos/saver.js', 'saver', {
      canSave: function () { return true; },
      create: function () {
        return {
          info: { name: 'gifos', priority: 4000, capabilities: ['save'] },
          save: function (text, method, callback) {
            if (typeof callback === 'function') callback(null);
            return true;
          }
        };
      }
    });
  }

  function recId(title) { return 't:' + title; }

  function shouldPersist(title) {
    if (!title) return false;
    if (title.indexOf('$:/temp/') === 0) return false;
    if (title.indexOf('$:/status/') === 0) return false;
    if (title.indexOf('$:/info/') === 0) return false;
    if (title.indexOf('$:/core') === 0) return false;
    if (title.indexOf('$:/themes/') === 0) return false;
    if (title.indexOf('$:/plugins/') === 0) return false;
    if (title.indexOf('$:/language/') === 0) return false;
    if (title.indexOf('$:/languages/') === 0) return false;
    if (title.indexOf('$:/boot/') === 0) return false;
    if (title.indexOf('$:/library/') === 0) return false;
    if (title.indexOf('$:/config/gifos/') === 0) return false;
    return true;
  }

  function isPrivate(title) {
    if (title === '$:/StoryList' || title === '$:/HistoryList') return true;
    if (title.indexOf('$:/HistoryList') === 0) return true;
    if (title.indexOf('$:/state/') === 0) return true;
    return false;
  }

  function collFor(title) { return isPrivate(title) ? 'prefs' : 'tiddlers'; }

  function fieldsOf(tiddler) {
    if (!tiddler || typeof tiddler.getFieldStrings !== 'function') return null;
    return tiddler.getFieldStrings();
  }

  function snapOf(fields) { return JSON.stringify(fields || { deleted: true }); }

  var echo = Object.create(null);
  var timers = Object.create(null);
  var applying = 0;
  var hasGifos = !!(root.gifos && root.gifos.db);
  var dbT = hasGifos ? root.gifos.db('tiddlers') : null;
  var dbP = hasGifos ? root.gifos.db('prefs') : null;

  function dbFor(title) { return collFor(title) === 'prefs' ? dbP : dbT; }

  function persistNow(title) {
    if (!shouldPersist(title) || applying) return;
    var wiki = $tw.wiki;
    if (!wiki) return;
    var tiddler = wiki.getTiddler(title);
    var rec;
    if (tiddler && wiki.tiddlerExists(title)) {
      rec = { id: recId(title), title: title, fields: fieldsOf(tiddler) };
    } else {
      rec = { id: recId(title), title: title, deleted: true };
    }
    echo[title] = snapOf(rec.fields);
    var db = dbFor(title);
    if (!db) return;
    db.put(rec).catch(function (err) {
      var msg = String(err && err.message || err || 'Could not save.');
      if ($tw.utils && $tw.utils.Logger) {
        try { new $tw.utils.Logger('gifos').alert(msg); } catch (e) { root.alert(msg); }
      } else {
        root.alert(msg);
      }
    });
  }

  function persist(title, immediate) {
    if (!shouldPersist(title)) return;
    if (immediate) {
      if (timers[title]) { clearTimeout(timers[title]); delete timers[title]; }
      persistNow(title);
      return;
    }
    if (timers[title]) clearTimeout(timers[title]);
    timers[title] = setTimeout(function () {
      delete timers[title];
      persistNow(title);
    }, 280);
  }

  function flushAll() {
    Object.keys(timers).forEach(function (title) {
      clearTimeout(timers[title]);
      delete timers[title];
      persistNow(title);
    });
  }

  function applyRow(row) {
    if (!row || !row.title || !shouldPersist(row.title)) return;
    var snap = snapOf(row.fields);
    if (echo[row.title] === snap) return;
    var wiki = $tw.wiki;
    if (row.deleted) {
      if (wiki.tiddlerExists(row.title) || wiki.getTiddler(row.title)) {
        echo[row.title] = snap;
        applying++;
        try { wiki.deleteTiddler(row.title); } finally { applying--; }
      }
      return;
    }
    if (!row.fields) return;
    var cur = wiki.getTiddler(row.title);
    if (cur && snapOf(fieldsOf(cur)) === snap) {
      echo[row.title] = snap;
      return;
    }
    echo[row.title] = snap;
    applying++;
    try { wiki.addTiddler(new $tw.Tiddler(row.fields)); } finally { applying--; }
  }

  function loadAll() {
    if (!hasGifos) return Promise.resolve({ tiddlers: [], prefs: [] });
    return Promise.all([
      dbT.getAll().catch(function () { return []; }),
      dbP.getAll().catch(function () { return []; })
    ]).then(function (pair) {
      return { tiddlers: pair[0] || [], prefs: pair[1] || [] };
    });
  }

  function preload(rows) {
    $tw.preloadTiddlers = $tw.preloadTiddlers || [];
    var tombs = [];
    (rows || []).forEach(function (row) {
      if (!row || !row.title || !shouldPersist(row.title)) return;
      if (row.deleted) {
        tombs.push(row.title);
        echo[row.title] = snapOf(null);
        return;
      }
      if (row.fields) {
        echo[row.title] = snapOf(row.fields);
        $tw.preloadTiddler(row.fields);
      }
    });
    return tombs;
  }

  function applyTombs(tombs) {
    var wiki = $tw.wiki;
    applying++;
    try {
      (tombs || []).forEach(function (title) {
        if (wiki.getTiddler(title)) wiki.deleteTiddler(title);
      });
    } finally { applying--; }
  }

  function wireChanges() {
    $tw.wiki.addEventListener('change', function (changes) {
      if (applying) return;
      Object.keys(changes).forEach(function (title) {
        var ch = changes[title];
        persist(title, !!(ch && ch.deleted));
      });
    });
    root.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushAll();
    });
    root.addEventListener('pagehide', flushAll);
  }

  function wireSubscribe() {
    if (!hasGifos) return;
    function onRows(rows) {
      if (applying) return;
      (rows || []).forEach(applyRow);
    }
    dbT.subscribe(onRows);
    dbP.subscribe(onRows);
  }

  function wireBack() {
    if (!root.gifos || typeof root.gifos.onBack !== 'function') return;
    root.gifos.onBack(function () {
      var wiki = $tw.wiki;
      var widget = $tw.rootWidget;
      if (!wiki || !widget) return;
      var drafts = wiki.filterTiddlers('[has[draft.of]]');
      if (drafts && drafts.length) {
        widget.dispatchEvent({ type: 'tm-cancel-tiddler', param: drafts[drafts.length - 1] });
        return;
      }
      var storyText = wiki.getTiddlerText('$:/StoryList', '');
      var story = ($tw.utils && $tw.utils.parseStringArray)
        ? $tw.utils.parseStringArray(storyText || '')
        : String(storyText || '').split(/\s+/).filter(Boolean);
      if (story && story.length) {
        widget.dispatchEvent({ type: 'tm-close-tiddler', param: story[0] });
        return;
      }
      var sidebar = wiki.getTiddlerText('$:/state/sidebar');
      if (sidebar === 'yes' || sidebar === 'open') {
        wiki.addTiddler({ title: '$:/state/sidebar', text: 'no' });
      }
    });
  }

  function wireLaunch() {
    if (!root.gifos || typeof root.gifos.launch !== 'function') return;
    root.gifos.launch().then(function (a) {
      if (!a || !a.tiddler || !$tw.rootWidget) return;
      $tw.rootWidget.dispatchEvent({
        type: 'tm-navigate',
        navigateTo: String(a.tiddler)
      });
    }).catch(function () {});
  }

  function wireMe() {
    if (!root.gifos || typeof root.gifos.me !== 'function') return;
    root.gifos.me().then(function (me) {
      var name = me && (me.name || me.id);
      if (!name || !$tw.wiki) return;
      applying++;
      try {
        $tw.wiki.addTiddler({ title: '$:/status/UserName', text: String(name) });
      } finally { applying--; }
    }).catch(function () {});
  }

  function afterBoot(tombs) {
    applyTombs(tombs);
    hideBoot();
    wireChanges();
    wireSubscribe();
    wireBack();
    wireMe();
    wireLaunch();
  }

  function bootWiki(rows) {
    var tombs = preload((rows.tiddlers || []).concat(rows.prefs || []));
    $tw.boot.boot(function () { afterBoot(tombs); });
  }

  say('Opening notebook…');
  loadAll().then(bootWiki).catch(function (err) {
    say('Could not open the notebook. ' + String(err && err.message || err || ''));
    try { $tw.boot.boot(function () { hideBoot(); }); } catch (e) {}
  });
})(window);
