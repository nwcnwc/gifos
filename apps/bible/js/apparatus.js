/* The study apparatus: lazy-load GBX packs and answer questions about a verse.
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

  var HELP_FILES = [
    'help-xrefs.gbx', 'help-mhcc.gbx', 'help-dict.gbx',
    'help-topics.gbx', 'help-places.gbx', 'help-plans.gbx'
  ];
  var LEX_FILES = ['lex-strongs-h.gbx', 'lex-strongs-g.gbx'];
  var INT_FILES = ['int-wlc.gbx', 'int-grcbyz.gbx', 'int-grctisch.gbx'];

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

  function loadOne(file, opener, onOpen) {
    if (loading[file]) return loading[file];
    loading[file] = bytesOf('packs/' + file)
      .then(function (b) { return opener(b); })
      .then(function (pack) { onOpen(pack); return pack; })
      .catch(function () { delete loading[file]; return null; });
    return loading[file];
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
    var files = HELP_FILES.concat(LEX_FILES, INT_FILES);
    files.forEach(function (f) {
      if (loading[f]) loading[f].then(function () { fn(); });
    });
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
