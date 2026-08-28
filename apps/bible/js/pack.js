/* GBP2 — reading a translation pack.
 *
 *   "GBP2" | deflate-raw( u32 headerLen | header JSON | body | layout | heads | notes | xrefs )
 *
 * container.js reads that shape; this file decides what the sections mean.
 * The body stays ONE string and a verse is a slice of it, so opening a chapter
 * costs no parsing and a whole-Bible search is a single indexOf over four
 * megabytes.
 *
 * body and layout are read at open, because every verse lookup needs their line
 * indexes. heads, notes and xrefs are read the first time a chapter asks for
 * them: a translation whose section headings are switched off, or that is open
 * only to be searched, never pays for them.
 */
(function (root) {
  'use strict';

  var MARK = {
    WJ_ON: '\u0001', WJ_OFF: '\u0002',
    NOTE: '\u0003', XREF: '\u0004',
    ADD_ON: '\u0005', ADD_OFF: '\u0006',
    ND_ON: '\u000e', ND_OFF: '\u000f',
    BREAK: '\u0010', PARA: '\u0011'
  };

  function keyedLines(s) {
    var map = Object.create(null);
    if (!s) return map;
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].indexOf('\t');
      if (t < 0) continue;
      var k = lines[i].slice(0, t);
      (map[k] || (map[k] = [])).push(lines[i].slice(t + 1));
    }
    return map;
  }

  function Pack(store) {
    var header = store.header;
    this.store = store;
    this.header = header;
    this.id = header.id;
    this.name = header.name;
    this.title = header.title;
    this.language = header.language;
    this.languageNative = header.languageNative;
    this.lang = header.lang;
    this.dir = header.dir || 'ltr';
    this.copyright = header.copyright;
    this.body = store.text('body');
    this.layout = store.text('layout');
    this._starts = store.lines('body');
    this._lstarts = store.lines('layout');

    // book code -> { order, index of its first verse, chapters }
    this._keyed = Object.create(null);
    this.books = [];
    this.byCode = Object.create(null);
    var at = 0;
    for (var i = 0; i < header.books.length; i++) {
      var b = header.books[i];
      var rec = { code: b[0], name: b[1], abbr: b[2], chapters: b[3], start: at, first: [] };
      var off = at;
      for (var c = 0; c < b[3].length; c++) { rec.first.push(off); off += b[3][c][1]; }
      rec.end = off;
      at = off;
      this.books.push(rec);
      this.byCode[b[0]] = rec;
    }
    this.verseCount = at;
  }

  /* heads, notes and xrefs are "index<TAB>text" lines keyed by verse. The map
   * is built the first time a chapter wants one and kept after that — building
   * it costs a pass over the section, and a chapter asks for all three. */
  Pack.prototype.keyed = function (name) {
    var hit = this._keyed[name];
    if (hit) return hit;
    var map = keyedLines(this.store.text(name));
    this._keyed[name] = map;
    return map;
  };

  Pack.prototype.hasBook = function (code) { return !!this.byCode[code]; };

  Pack.prototype.chapterCount = function (code) {
    var b = this.byCode[code];
    return b ? b.chapters.length : 0;
  };

  // Chapters are addressed by their PRINTED number, which is not always their
  // slot: the Greek additions to Esther begin at chapter 10.
  Pack.prototype.chapterSlot = function (code, chapter) {
    var b = this.byCode[code];
    if (!b) return -1;
    for (var i = 0; i < b.chapters.length; i++) if (b.chapters[i][0] === chapter) return i;
    return -1;
  };

  Pack.prototype.chapterNumbers = function (code) {
    var b = this.byCode[code];
    if (!b) return [];
    var out = [];
    for (var i = 0; i < b.chapters.length; i++) out.push(b.chapters[i][0]);
    return out;
  };

  Pack.prototype.indexOfVerse = function (code, chapter, verse) {
    var b = this.byCode[code];
    if (!b) return -1;
    var slot = this.chapterSlot(code, chapter);
    if (slot < 0) return -1;
    if (verse < 1 || verse > b.chapters[slot][1]) return -1;
    return b.first[slot] + verse - 1;
  };

  Pack.prototype.line = function (s, starts, i) {
    if (i < 0 || i >= starts.length - 1) return '';
    return s.slice(starts[i], starts[i + 1] - 1);
  };

  Pack.prototype.textAt = function (i) { return this.line(this.body, this._starts, i); };
  Pack.prototype.styleAt = function (i) { return this.line(this.layout, this._lstarts, i); };

  // A whole chapter, ready to set: every verse with its number, the block style
  // in force, any section heading above it, and the translators' own notes.
  Pack.prototype.chapter = function (code, chapter) {
    var b = this.byCode[code];
    if (!b) return null;
    var slot = this.chapterSlot(code, chapter);
    if (slot < 0) return null;
    var start = b.first[slot], count = b.chapters[slot][1];
    var heads = this.keyed('heads'), notes = this.keyed('notes'), xrefs = this.keyed('xrefs');
    var out = [];
    for (var v = 0; v < count; v++) {
      var i = start + v;
      var text = this.textAt(i);
      out.push({
        index: i, verse: v + 1, text: text,
        style: this.styleAt(i),
        head: (heads[i] || [null])[0],
        notes: notes[i] || [],
        xrefs: xrefs[i] || [],
        empty: !text
      });
    }
    return { book: b, code: code, chapter: chapter, name: b.name || code,
             verses: out, dir: this.dir };
  };

  /* Which verse is at this index? Books are laid out in order and each book's
   * chapters likewise, so both steps are a binary search. Search calls this
   * once per hit — up to 400 times for one query — and a linear walk over 66
   * books and their chapters made a common word measurably slower to report
   * than to find. */
  Pack.prototype.refOf = function (index) {
    var books = this.books;
    if (!books.length || index < 0 || index >= books[books.length - 1].end) return null;
    var lo = 0, hi = books.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (index < books[mid].end) hi = mid; else lo = mid + 1;
    }
    var b = books[lo];
    if (index < b.start) return null;
    var clo = 0, chi = b.first.length - 1;
    while (clo < chi) {
      var cmid = (clo + chi + 1) >> 1;
      if (b.first[cmid] <= index) clo = cmid; else chi = cmid - 1;
    }
    return { code: b.code, name: b.name || b.code,
             chapter: b.chapters[clo][0], verse: index - b.first[clo] + 1 };
  };

  var SECTIONS = ['body', 'layout', 'heads', 'notes', 'xrefs'];

  function open(buffer) {
    return root.GifosBibleContainer.open(buffer, 'GBP2', function (header) {
      return SECTIONS.map(function (k) { return [k, header.sec[k] || 0]; });
    }).then(function (store) { return new Pack(store); });
  }

  root.GifosBiblePack = { open: open, MARK: MARK, Pack: Pack };
})(typeof globalThis !== 'undefined' ? globalThis : this);
