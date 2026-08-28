/* Boot: build the library, restore the reader's place, and open the page.
 *
 * Order matters only this much: prefs first (they say what to open), then the
 * first translation, then paint. Everything else — the shared cursor, launch
 * arguments, the apparatus — attaches after first paint, because a person who
 * opened a Bible should be reading one before anything optional loads.
 */
(function (root) {
  'use strict';

  var catalog = root.GIFOS_BIBLE_CATALOG || [];
  var builtIn = root.GIFOS_BIBLE_BUILTIN || {};

  var lib = new root.GifosBibleLibrary.Library(catalog, builtIn);
  var store = new root.GifosBibleStore.Store();

  function boot() {
    store.start().then(function () {
      return store.prefs();
    }).then(function (prefs) {
      applyChrome(prefs);
      var reader = new root.GifosBibleReader.Reader({ library: lib, store: store, prefs: prefs });
      root.bibleReader = reader;   // one handle, for the console and the tests

      // Open the first column; fall back to a built-in when a preferred
      // translation is not on this computer (a fresh guest mount, say).
      var want = (prefs.columns && prefs.columns[0]) || 'engwebp';
      var open = lib.load(want).catch(function () {
        var fallback = null;
        for (var k in builtIn) { fallback = k; break; }
        if (!fallback) throw new Error('No translation could be opened.');
        reader.columns = [fallback];
        return lib.load(fallback);
      });

      return open.then(function () {
        reader.at = prefs.at || reader.at;
        reader.paint();

        // The rest of the columns restore quietly after first paint.
        var rest = (prefs.columns || []).slice(1);
        var chain = Promise.resolve();
        rest.forEach(function (id) {
          chain = chain.then(function () {
            return lib.load(id).then(function () { reader.paint(); }, function () {
              reader.columns = reader.columns.filter(function (c) { return c !== id; });
            });
          });
        });

        // Marks repaint the page when they change — including a change that
        // arrives from another tab of this same computer.
        store.onMarks(function (rows) {
          var map = Object.create(null);
          for (var i = 0; i < rows.length; i++) {
            map[rows[i].id] = rows[i];
          }
          reader.marks = map;
          reader.paint({ keepScroll: true });
        });

        reader.startFollowing();
        readLaunch(reader);

        if (root.GifosBibleApparatus) root.GifosBibleApparatus.start();

        if (!prefs.seenWelcome) welcome(reader, prefs);
      });
    }).catch(function (e) {
      var el = document.getElementById('empty');
      el.hidden = false;
      el.textContent = e && e.message ? e.message : 'The Bible could not open.';
    });
  }

  function applyChrome(prefs) {
    document.body.setAttribute('data-theme', prefs.theme || 'night');
    document.body.setAttribute('data-size', String(prefs.size || 3));
    document.body.setAttribute('data-face', prefs.face || 'serif');
    document.body.setAttribute('data-red', prefs.redLetter === false ? '0' : '1');
    document.body.setAttribute('data-notes', prefs.notes === false ? '0' : '1');
  }
  root.GifosBibleChrome = applyChrome;

  /* A link may carry ?go.ref=John+3:16 and ?go.trans=<id>. It resolves LATE —
   * after the person reads what the link asked and agrees — so it lands as a
   * navigation on an already-open app, which is exactly what it is. */
  function readLaunch(reader) {
    if (!root.gifos || !root.gifos.launch) return;
    root.gifos.launch().then(function (args) {
      if (!args) return;
      var open = Promise.resolve();
      if (args.trans && lib.byId[args.trans]) {
        open = lib.load(args.trans).then(function () {
          reader.columns = [args.trans];
        }, function () {});
      }
      open.then(function () {
        if (args.ref && root.GifosRefs) {
          var r = root.GifosRefs.parseOne(args.ref);
          if (r) { reader.go({ code: r.code, chapter: r.chapter, verse: r.verse || 0 }, { flash: !!r.verse, jump: true }); return; }
        }
        reader.paint();
      });
    }).catch(function () {});
  }

  /* First boot: one toast, not a tour. If the catalog has a Bible in the
   * person's own language that is not built in, offer it in one tap. */
  function welcome(reader, prefs) {
    var suggestion = lib.suggestForLocale();
    var cur = reader.pack(0);
    var curMeta = cur && lib.byId[cur.id];
    if (suggestion && curMeta && suggestion.language === curMeta.language) suggestion = null;
    if (suggestion) {
      var t = reader.toast('This Bible also comes in ' + suggestion.language + ' — tap to open it.', true);
      t.style.cursor = 'pointer';
      t.onclick = function () {
        t.onclick = null; t.style.cursor = '';
        reader.hideToast();
        reader._transSlot = 0;
        reader.chooseTranslation(suggestion.id);
      };
      setTimeout(function () { if (t.onclick) { t.onclick = null; t.style.cursor = ''; reader.hideToast(); } }, 12000);
    }
    store.savePrefs({ seenWelcome: true });
    void prefs;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
