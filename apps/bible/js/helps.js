/* GBX1 — reading a study-helps pack.
 *
 *   "GBX1" | deflate-raw( u32 headerLen | header JSON | section | section | … )
 *
 * Same container as GBP2 (pack.js) and opened the same way: one inflate yields
 * every section, and a section is a slice. Nothing here touches the network —
 * DecompressionStream is a browser built-in, so a pack needs no decoder shipped
 * beside it. apps/bible/tools/build-helps.mjs documents each pack's sections.
 *
 * Six kinds, one reader. The kind is in the header and decides which methods
 * mean anything; calling the wrong one returns nothing rather than throwing,
 * because a surface that has only some of the packs installed is normal.
 *
 * WHAT A LOOKUP COSTS. Every keyed section is written in sorted order, so a
 * query is a binary search and nothing is indexed into an object at open time:
 *
 *   xrefs, mhcc     keyed by bcv = book*1000000 + chapter*1000 + verse, read
 *                   once into an Int32Array — 29,000 verses is 116 KB, where a
 *                   29,000-key object is several megabytes of heap.
 *   dict, topics,   keyed by the FOLDED headword, which is also the sort order,
 *   places          so a prefix search is one binary search and a walk forward.
 *
 * REFERENCES ARE PLAIN STRINGS. The packs carry `Genesis 1:1`, `Mark 13:19-21`,
 * `Psalms 119:1-24`, `Exodus 6` — English book names from data/books.json, no
 * source abbreviation anywhere. This file never parses one; it hands them out.
 */
(function (root) {
  'use strict';

  var PARA = '\u0011';   // paragraph break inside a record
  var FS = '\u0012';     // field break inside a record

  // The 66-book canon in shelf order. A pack's key is a book NUMBER — the
  // position in this list — so the reader has to turn a USFM code or an English
  // name into that number without a second fetch, which is why the table is
  // here and not read from data/books.json.
  var CANON = [
    ['GEN', 'Genesis'], ['EXO', 'Exodus'], ['LEV', 'Leviticus'], ['NUM', 'Numbers'],
    ['DEU', 'Deuteronomy'], ['JOS', 'Joshua'], ['JDG', 'Judges'], ['RUT', 'Ruth'],
    ['1SA', '1 Samuel'], ['2SA', '2 Samuel'], ['1KI', '1 Kings'], ['2KI', '2 Kings'],
    ['1CH', '1 Chronicles'], ['2CH', '2 Chronicles'], ['EZR', 'Ezra'], ['NEH', 'Nehemiah'],
    ['EST', 'Esther'], ['JOB', 'Job'], ['PSA', 'Psalms'], ['PRO', 'Proverbs'],
    ['ECC', 'Ecclesiastes'], ['SNG', 'Song of Solomon'], ['ISA', 'Isaiah'], ['JER', 'Jeremiah'],
    ['LAM', 'Lamentations'], ['EZK', 'Ezekiel'], ['DAN', 'Daniel'], ['HOS', 'Hosea'],
    ['JOL', 'Joel'], ['AMO', 'Amos'], ['OBA', 'Obadiah'], ['JON', 'Jonah'], ['MIC', 'Micah'],
    ['NAM', 'Nahum'], ['HAB', 'Habakkuk'], ['ZEP', 'Zephaniah'], ['HAG', 'Haggai'],
    ['ZEC', 'Zechariah'], ['MAL', 'Malachi'], ['MAT', 'Matthew'], ['MRK', 'Mark'],
    ['LUK', 'Luke'], ['JHN', 'John'], ['ACT', 'Acts'], ['ROM', 'Romans'],
    ['1CO', '1 Corinthians'], ['2CO', '2 Corinthians'], ['GAL', 'Galatians'],
    ['EPH', 'Ephesians'], ['PHP', 'Philippians'], ['COL', 'Colossians'],
    ['1TH', '1 Thessalonians'], ['2TH', '2 Thessalonians'], ['1TI', '1 Timothy'],
    ['2TI', '2 Timothy'], ['TIT', 'Titus'], ['PHM', 'Philemon'], ['HEB', 'Hebrews'],
    ['JAS', 'James'], ['1PE', '1 Peter'], ['2PE', '2 Peter'], ['1JN', '1 John'],
    ['2JN', '2 John'], ['3JN', '3 John'], ['JUD', 'Jude'], ['REV', 'Revelation']
  ];

  var NUM_BY_KEY = Object.create(null);     // code and English name -> 1..66
  var CODE_BY_NUM = [null];
  var NAME_BY_NUM = [null];
  (function () {
    for (var i = 0; i < CANON.length; i++) {
      NUM_BY_KEY[CANON[i][0]] = i + 1;
      NUM_BY_KEY[fold(CANON[i][1])] = i + 1;
      CODE_BY_NUM.push(CANON[i][0]);
      NAME_BY_NUM.push(CANON[i][1]);
    }
  })();

  // The fold a pack's key column is written in: uppercase, accents stripped,
  // punctuation to a single space. `Abel-beth-maachah` and `ABEL BETH MAACHAH`
  // fold alike, so a user typing either finds the entry.
  function fold(s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function bookNumber(book) {
    if (typeof book === 'number') return book >= 1 && book <= 66 ? book : 0;
    if (!book) return 0;
    var n = NUM_BY_KEY[String(book).toUpperCase()];
    if (n) return n;
    n = NUM_BY_KEY[fold(book)];
    return n || 0;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('This browser cannot unpack study helps.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer();
  }

  // Line starts, found once. Int32Array so an 8,600-entry dictionary index is
  // 34 KB and never becomes an array of substrings.
  function indexLines(s) {
    var n = 1, i;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
    var starts = new Int32Array(n + 1), k = 1;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) starts[k++] = i + 1;
    starts[n] = s.length + 1;
    return starts;
  }

  function lineAt(s, starts, i) {
    if (i < 0 || i >= starts.length - 1) return '';
    return s.slice(starts[i], starts[i + 1] - 1);
  }

  function splitRefs(s) { return s ? s.split(';') : []; }

  /* ── the pack ─────────────────────────────────────────────────────────── */

  function Helps(header, sections) {
    this.header = header;
    this.kind = header.kind;
    this.title = header.title;
    this.license = header.license;
    this.attribution = header.attribution || null;
    this.sections = sections;
    this._starts = Object.create(null);
    for (var k in sections) this._starts[k] = indexLines(sections[k]);

    if (this.kind === 'xrefs') this._loadKeyed('index', 3);
    if (this.kind === 'mhcc') this._loadKeyed('index', 3);
  }

  Helps.prototype.line = function (name, i) {
    return lineAt(this.sections[name], this._starts[name], i);
  };

  Helps.prototype.count = function (name) {
    var s = this.sections[name];
    return s ? this._starts[name].length - 1 : 0;
  };

  // A tab-separated index of `key<TAB>a<TAB>b` read into three Int32Arrays.
  // Parsing 29,000 lines once beats holding 29,000 strings forever, and the
  // keys come out sorted, which is what makes the lookups a binary search.
  Helps.prototype._loadKeyed = function (name, fields) {
    var s = this.sections[name] || '';
    var n = s ? this._starts[name].length - 1 : 0;
    var keys = new Int32Array(n), a = new Int32Array(n), b = new Int32Array(n);
    for (var i = 0; i < n; i++) {
      var parts = this.line(name, i).split('\t');
      keys[i] = +parts[0] || 0;
      a[i] = +parts[1] || 0;
      b[i] = fields > 2 ? (+parts[2] || 0) : 0;
    }
    this._keys = keys; this._a = a; this._b = b;
  };

  // Last index whose key is <= want, or -1. Every keyed section is ascending.
  function floorIndex(keys, want) {
    var lo = 0, hi = keys.length - 1, best = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (keys[mid] <= want) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  }

  function exactIndex(keys, want) {
    var i = floorIndex(keys, want);
    return i >= 0 && keys[i] === want ? i : -1;
  }

  // First line whose first tab-field is >= want. The sorted fold column is the
  // search index, so this one search serves lookup, prefix search and the
  // alphabetical walk a dictionary surface scrolls through.
  Helps.prototype._foldFloor = function (name, want) {
    var lo = 0, hi = this.count(name) - 1, best = this.count(name);
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      var k = this.line(name, mid).split('\t')[0];
      if (k >= want) { best = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return best;
  };

  /* ── cross references (help-xrefs.gbx) ────────────────────────────────── */

  // Every Treasury of Scripture Knowledge entry anchored at one verse, in the
  // order the printed book gives them: a catchword from the verse and the
  // passages it sends you to.
  Helps.prototype.crossRefs = function (book, chapter, verse) {
    if (this.kind !== 'xrefs') return [];
    var bn = bookNumber(book);
    if (!bn || !chapter || !verse) return [];
    var i = exactIndex(this._keys, bn * 1000000 + chapter * 1000 + verse);
    if (i < 0) return [];
    var out = [];
    for (var r = this._a[i]; r < this._a[i] + this._b[i]; r++) {
      var parts = this.line('rows', r).split('\t');
      out.push({ catchword: parts[0], refs: splitRefs(parts[1]) });
    }
    return out;
  };

  // Every reference the verse points at, catchwords collapsed — what a "see
  // also" strip under a verse shows.
  Helps.prototype.crossRefList = function (book, chapter, verse) {
    var groups = this.crossRefs(book, chapter, verse), seen = Object.create(null), out = [];
    for (var i = 0; i < groups.length; i++) {
      for (var j = 0; j < groups[i].refs.length; j++) {
        var r = groups[i].refs[j];
        if (!seen[r]) { seen[r] = 1; out.push(r); }
      }
    }
    return out;
  };

  /* ── dictionary (help-dict.gbx) ───────────────────────────────────────── */

  var DICT_SOURCE = { E: "Easton's Bible Dictionary", S: "Smith's Bible Dictionary" };

  Helps.prototype._dictAt = function (i) {
    var parts = this.line('heads', i).split('\t');
    return {
      index: i, headword: parts[1], source: parts[2],
      sourceName: DICT_SOURCE[parts[2]] || parts[2],
      text: this.line('bodies', i),
      paragraphs: this.line('bodies', i).split(PARA),
      refs: splitRefs(this.line('refs', i))
    };
  };

  // Every entry for a headword — two, when both dictionaries carry the word.
  Helps.prototype.lookup = function (word) {
    if (this.kind !== 'dict') return [];
    var want = fold(word);
    if (!want) return [];
    var out = [];
    for (var i = this._foldFloor('heads', want); i < this.count('heads'); i++) {
      if (this.line('heads', i).split('\t')[0] !== want) break;
      out.push(this._dictAt(i));
    }
    return out;
  };

  // Headwords that BEGIN with what has been typed, in alphabetical order —
  // one binary search and a walk, so a keystroke costs nothing.
  Helps.prototype.searchHeadwords = function (prefix, limit) {
    if (this.kind !== 'dict') return [];
    var want = fold(prefix);
    if (!want) return [];
    var cap = limit || 50, out = [];
    for (var i = this._foldFloor('heads', want); i < this.count('heads') && out.length < cap; i++) {
      var parts = this.line('heads', i).split('\t');
      if (parts[0].slice(0, want.length) !== want) break;
      out.push({ index: i, headword: parts[1], source: parts[2],
                 sourceName: DICT_SOURCE[parts[2]] || parts[2] });
    }
    return out;
  };

  Helps.prototype.entry = function (index) {
    return this.kind === 'dict' && index >= 0 && index < this.count('heads')
      ? this._dictAt(index) : null;
  };

  /* ── topics (help-topics.gbx) ─────────────────────────────────────────── */

  var TOPIC_SOURCE = { N: "Nave's Topical Bible", T: "Torrey's New Topical Textbook" };

  Helps.prototype._topicAt = function (i) {
    var parts = this.line('topics', i).split('\t');
    var subs = [], raw = this.line('subs', i).split(PARA);
    for (var k = 0; k < raw.length; k++) {
      var f = raw[k].split(FS);
      if (f[0] || f[1]) subs.push({ label: f[0], refs: splitRefs(f[1]) });
    }
    return { index: i, topic: parts[1], source: parts[2],
             sourceName: TOPIC_SOURCE[parts[2]] || parts[2],
             subs: subs, refs: splitRefs(this.line('refs', i)) };
  };

  Helps.prototype.topic = function (name) {
    if (this.kind !== 'topics') return [];
    var want = fold(name);
    if (!want) return [];
    var out = [];
    for (var i = this._foldFloor('topics', want); i < this.count('topics'); i++) {
      if (this.line('topics', i).split('\t')[0] !== want) break;
      out.push(this._topicAt(i));
    }
    return out;
  };

  Helps.prototype.searchTopics = function (prefix, limit) {
    if (this.kind !== 'topics') return [];
    var want = fold(prefix);
    if (!want) return [];
    var cap = limit || 50, out = [];
    for (var i = this._foldFloor('topics', want); i < this.count('topics') && out.length < cap; i++) {
      var parts = this.line('topics', i).split('\t');
      if (parts[0].slice(0, want.length) !== want) break;
      out.push({ index: i, topic: parts[1], source: parts[2],
                 sourceName: TOPIC_SOURCE[parts[2]] || parts[2] });
    }
    return out;
  };

  /* ── commentary (help-mhcc.gbx) ───────────────────────────────────────── */

  // Matthew Henry keys his notes to verse RANGES, never to single verses, so
  // this is an interval query and not a lookup. Ranges within a chapter do not
  // overlap and are stored ascending, so the covering note is the last one
  // starting at or before the verse — provided it also reaches it, and that the
  // row found is in the same chapter of the same book.
  Helps.prototype.commentary = function (book, chapter, verse) {
    if (this.kind !== 'mhcc') return null;
    var bn = bookNumber(book);
    if (!bn || !chapter || !verse) return null;
    var want = bn * 1000000 + chapter * 1000 + verse;
    var i = floorIndex(this._keys, want);
    if (i < 0) return null;
    var key = this._keys[i];
    if (Math.floor(key / 1000000) !== bn || Math.floor(key / 1000) % 1000 !== chapter) return null;
    var from = key % 1000, to = this._a[i];
    if (verse > to) return null;
    return {
      book: CODE_BY_NUM[bn], bookName: NAME_BY_NUM[bn], chapter: chapter,
      from: from, to: to,
      reference: NAME_BY_NUM[bn] + ' ' + chapter + ':' + from + (to !== from ? '-' + to : ''),
      text: this.line('notes', this._b[i]),
      paragraphs: this.line('notes', this._b[i]).split(PARA)
    };
  };

  // Every note in a chapter, in order — what a chapter view sets beside the
  // text without asking 30 separate interval questions.
  Helps.prototype.commentaryChapter = function (book, chapter) {
    if (this.kind !== 'mhcc') return [];
    var bn = bookNumber(book);
    if (!bn || !chapter) return [];
    var out = [];
    var i = floorIndex(this._keys, bn * 1000000 + chapter * 1000);
    for (i = i < 0 ? 0 : i; i < this._keys.length; i++) {
      var key = this._keys[i];
      if (key < bn * 1000000 + chapter * 1000) continue;
      if (key >= bn * 1000000 + (chapter + 1) * 1000) break;
      out.push({ from: key % 1000, to: this._a[i], text: this.line('notes', this._b[i]) });
    }
    return out;
  };

  /* ── places (help-places.gbx) ─────────────────────────────────────────── */

  Helps.prototype._placeAt = function (i) {
    var p = this.line('places', i).split('\t');
    return { index: i, name: p[1], lat: parseFloat(p[2]), lon: parseFloat(p[3]),
             refs: splitRefs(p[4]) };
  };

  Helps.prototype.place = function (name) {
    if (this.kind !== 'places') return null;
    var want = fold(name);
    if (!want) return null;
    var i = this._foldFloor('places', want);
    if (i >= this.count('places')) return null;
    return this.line('places', i).split('\t')[0] === want ? this._placeAt(i) : null;
  };

  Helps.prototype.searchPlaces = function (prefix, limit) {
    if (this.kind !== 'places') return [];
    var want = fold(prefix);
    if (!want) return [];
    var cap = limit || 50, out = [];
    for (var i = this._foldFloor('places', want); i < this.count('places') && out.length < cap; i++) {
      if (this.line('places', i).split('\t')[0].slice(0, want.length) !== want) break;
      out.push(this._placeAt(i));
    }
    return out;
  };

  Helps.prototype.allPlaces = function () {
    if (this.kind !== 'places') return [];
    var out = [];
    for (var i = 0; i < this.count('places'); i++) out.push(this._placeAt(i));
    return out;
  };

  /* ── reading plans (help-plans.gbx) ───────────────────────────────────── */

  Helps.prototype.plans = function () {
    return this.kind === 'plans' ? (this.header.plans || []) : [];
  };

  Helps.prototype._plan = function (id) {
    var list = this.plans();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  // Day numbers are 1-based and a plan has exactly dayCount of them. A plan of
  // 365 days has NO 366th: on a leap year the reader repeats the last day
  // rather than shifting the calendar, which is what the clamp here does and
  // what the header's `leapDay` says in words.
  Helps.prototype.planDay = function (id, day) {
    var p = this._plan(id);
    if (!p) return null;
    var d = Math.max(1, Math.min(p.dayCount, Math.round(day) || 1));
    return { plan: p.id, name: p.name, origin: p.origin, day: d, dayCount: p.dayCount,
             readings: this.line('days', p.first + d - 1).split('\t').filter(Boolean) };
  };

  Helps.prototype.stepPlan = function (id, day, delta) {
    var p = this._plan(id);
    if (!p) return null;
    return this.planDay(id, (Math.round(day) || 1) + (delta == null ? 1 : delta));
  };

  // Which day of the plan a calendar date falls on, with 29 February folded
  // onto the 28th so a leap year never pushes the plan off its own last day.
  Helps.prototype.planDayForDate = function (id, date) {
    var p = this._plan(id);
    if (!p) return null;
    var d = date || new Date();
    var start = Date.UTC(d.getFullYear(), 0, 1);
    var n = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000) + 1;
    return this.planDay(id, n);
  };

  /* ── opening ──────────────────────────────────────────────────────────── */

  function open(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'GBX1') return Promise.reject(new Error('Not a study-helps pack.'));
    return inflateRaw(bytes.subarray(4)).then(function (buf) {
      var all = new Uint8Array(buf);
      var hlen = all[0] | (all[1] << 8) | (all[2] << 16) | (all[3] << 24);
      var dec = new TextDecoder();
      var header = JSON.parse(dec.decode(all.subarray(4, 4 + hlen)));
      var at = 4 + hlen, sections = {};
      for (var i = 0; i < header.order.length; i++) {
        var k = header.order[i];
        sections[k] = dec.decode(all.subarray(at, at + header.sec[k]));
        at += header.sec[k];
      }
      return new Helps(header, sections);
    });
  }

  // A surface holds several packs at once and asks each question of whichever
  // one answers it, so nothing above has to know which files got installed.
  function Shelf() { this.byKind = Object.create(null); }
  Shelf.prototype.add = function (helps) { this.byKind[helps.kind] = helps; return this; };
  Shelf.prototype.has = function (kind) { return !!this.byKind[kind]; };
  Shelf.prototype.get = function (kind) { return this.byKind[kind] || null; };
  Shelf.prototype.crossRefs = function (b, c, v) {
    return this.byKind.xrefs ? this.byKind.xrefs.crossRefs(b, c, v) : [];
  };
  Shelf.prototype.lookup = function (w) {
    return this.byKind.dict ? this.byKind.dict.lookup(w) : [];
  };
  Shelf.prototype.topic = function (t) {
    return this.byKind.topics ? this.byKind.topics.topic(t) : [];
  };
  Shelf.prototype.commentary = function (b, c, v) {
    return this.byKind.mhcc ? this.byKind.mhcc.commentary(b, c, v) : null;
  };
  Shelf.prototype.place = function (n) {
    return this.byKind.places ? this.byKind.places.place(n) : null;
  };
  Shelf.prototype.plans = function () {
    return this.byKind.plans ? this.byKind.plans.plans() : [];
  };

  root.GifosBibleHelps = {
    open: open, Helps: Helps, Shelf: Shelf,
    MARK: { PARA: PARA, FS: FS },
    fold: fold, bookNumber: bookNumber, CANON: CANON
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
