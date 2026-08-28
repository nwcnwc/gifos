/* The study apparatus: open the pinned GBX packs and answer questions about a
 * verse.
 *
 * WHICH PACKS EXIST IS GENERATED, NOT TYPED. build.mjs walks packs/*.gbx to pin
 * them in the manifest and writes the same list to js/packs-sealed.js, so a
 * pack that is pinned is a pack this file will open. It used to name them by
 * hand beside a build that globbed the directory: adding one pinned a download
 * that nothing ever opened, and nothing anywhere said so.
 *
 * A reader who never taps a verse never pays for these packs. The first tap
 * starts the downloads; later taps reuse them. Sections arrive as each pack
 * opens, so the verse sheet fills in rather than waiting for every file.
 *
 * Nothing here fetches. Bytes arrive through gifos.assets, which checks the
 * hash the manifest named.
 */
(function (root) {
  'use strict';

  var Helps = root.GifosBibleHelps;
  var Lex = root.GifosBibleLexicon;

  var SEALED = root.GIFOS_BIBLE_SEALED || [];
  function filesOfKind(kind) {
    var out = [];
    for (var i = 0; i < SEALED.length; i++) {
      if (SEALED[i].kind === kind) out.push(SEALED[i].file);
    }
    return out;
  }
  var HELP_FILES = filesOfKind('helps');
  var LEX_FILES = filesOfKind('lexicon');
  var INT_FILES = filesOfKind('interlinear');

  var shelf = new Helps.Shelf();
  var lexicons = [];
  var interlinears = [];
  var loading = Object.create(null);
  var started = false;

  function bytesOf(path) {
    if (root.gifos && root.gifos.assets) {
      return root.gifos.assets(path).then(function (buf) { return new Uint8Array(buf); });
    }
    return Promise.reject(new Error('This copy cannot download study packs.'));
  }

  // A pack that fails to open is remembered as failed rather than retried on
  // every tap, and it is REPORTED: the old code swallowed the error and let
  // whenReady resolve, so a corrupt pack looked exactly like a pack with
  // nothing to say about this verse.
  var broken = Object.create(null);
  function loadOne(file, opener, onOpen) {
    if (loading[file]) return loading[file];
    loading[file] = bytesOf('packs/' + file)
      .then(function (b) { return opener(b); })
      .then(function (pack) { onOpen(pack); return pack; })
      .catch(function (e) {
        broken[file] = (e && e.message) || 'could not be opened';
        return null;
      });
    return loading[file];
  }

  function brokenPacks() {
    var out = [];
    for (var f in broken) out.push({ file: f, why: broken[f] });
    return out;
  }

  function start() {
    if (started) return;
    started = true;
    HELP_FILES.forEach(function (f) {
      loadOne(f, Helps.open, function (h) { if (h) shelf.add(h); });
    });
    LEX_FILES.forEach(function (f) {
      loadOne(f, Lex.open, function (h) { if (h) lexicons.push(h); });
    });
    INT_FILES.forEach(function (f) {
      loadOne(f, Lex.open, function (h) { if (h) interlinears.push(h); });
    });
  }

  function whenReady(fn) {
    start();
    var files = HELP_FILES.concat(LEX_FILES, INT_FILES);
    var waits = files.map(function (f) { return loading[f] || Promise.resolve(); });
    Promise.all(waits).then(function () { fn(); });
  }

  function lookupStrong(num) {
    for (var i = 0; i < lexicons.length; i++) {
      var e = lexicons[i].lookup(num);
      if (e) return e;
    }
    return null;
  }

  function collect(ref) {
    var out = [];
    var x = shelf.get('xrefs');
    if (x) {
      var groups = x.crossRefs(ref.code, ref.chapter, ref.verse);
      if (groups.length) {
        var items = [];
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (g.catchword) items.push({ text: g.catchword });
          for (var j = 0; j < g.refs.length; j++) items.push({ ref: true, text: g.refs[j] });
        }
        out.push({ id: 'xrefs', title: 'Treasury of Scripture Knowledge', items: items });
      }
    }
    var mh = shelf.get('mhcc');
    if (mh) {
      var note = mh.commentary(ref.code, ref.chapter, ref.verse);
      if (note && note.text) {
        out.push({
          id: 'mhcc', title: 'Matthew Henry',
          items: [{ text: note.paragraphs ? note.paragraphs.join('\n\n') : note.text }]
        });
      }
    }
    for (var k = 0; k < interlinears.length; k++) {
      var il = interlinears[k];
      if (!il.hasBook || !il.hasBook(ref.code)) continue;
      var words = il.words(ref.code, ref.chapter, ref.verse);
      if (!words.length) continue;
      var line = [];
      var strongs = [];
      var seen = Object.create(null);
      for (var w = 0; w < words.length; w++) {
        var wd = words[w];
        line.push(wd.surface + (wd.parse ? ' (' + wd.parse + ')' : ''));
        if (wd.strong && !seen[wd.strong]) {
          seen[wd.strong] = 1;
          var entry = lookupStrong(wd.strong);
          if (entry) {
            strongs.push({
              text: entry.num + '  ' + entry.lemma +
                (entry.translit ? '  ' + entry.translit : '') +
                (entry.definition ? ' — ' + entry.definition : '')
            });
          }
        }
      }
      var intItems = [{ text: line.join('  ') }];
      if (il.attribution) intItems.push({ text: il.attribution });
      out.push({ id: 'int-' + il.id, title: il.name, items: intItems });
      if (strongs.length) out.push({ id: 'str-' + il.id, title: "Strong’s numbers", items: strongs });
    }
    return out;
  }

  function forVerse(ref, cb) {
    start();
    var seen = Object.create(null);
    function emit() {
      var sections = collect(ref);
      for (var i = 0; i < sections.length; i++) {
        if (seen[sections[i].id]) continue;
        seen[sections[i].id] = 1;
        cb(sections[i]);
      }
    }
    emit();
    whenReady(emit);
  }

  root.GifosBibleApparatus = {
    start: start,
    whenReady: whenReady,
    sealed: SEALED,
    broken: brokenPacks,
    forVerse: forVerse,
    shelf: shelf,
    lexicons: lexicons,
    interlinears: interlinears,
    lookupStrong: lookupStrong,
    lookup: function (word) { return shelf.lookup(word); },
    searchHeadwords: function (prefix, limit) {
      var d = shelf.get('dict');
      return d ? d.searchHeadwords(prefix, limit) : [];
    },
    topic: function (name) { return shelf.topic(name); },
    searchTopics: function (prefix, limit) {
      var t = shelf.get('topics');
      return t ? t.searchTopics(prefix, limit) : [];
    },
    place: function (name) { return shelf.place(name); },
    searchPlaces: function (prefix, limit) {
      var p = shelf.get('places');
      return p ? p.searchPlaces(prefix, limit) : [];
    },
    plans: function () {
      var p = shelf.get('plans');
      return p ? p.plans() : [];
    },
    planDay: function (id, day) {
      var p = shelf.get('plans');
      return p ? p.planDay(id, day) : null;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
