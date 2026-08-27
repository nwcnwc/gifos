/* GBP2 — reading a translation pack.
 *
 *   "GBP2" | deflate-raw( u32 headerLen | header JSON | body | layout | heads | notes | xrefs )
 *
 * One inflate yields the whole text. The body stays ONE string and a verse is a
 * slice of it, so opening a chapter costs no parsing and a whole-Bible search is
 * a single indexOf over four megabytes.
 *
 * Nothing here touches the network. DecompressionStream is a browser built-in,
 * so a pack needs no decoder shipped beside it.
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

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('This browser cannot unpack a translation.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer();
  }

  // Verse starts, found once. Int32Array so a 31,000-verse index is 124 KB and
  // never grows the heap the way an array of strings would.
  function indexLines(s) {
    var n = 1, i;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
    var starts = new Int32Array(n + 1);
    var k = 1;
    for (i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) starts[k++] = i + 1;
    starts[n] = s.length + 1;
    return starts;
  }

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

  function Pack(header, sections) {
    this.header = header;
    this.id = header.id;
    this.name = header.name;
    this.title = header.title;
    this.language = header.language;
    this.languageNative = header.languageNative;
    this.lang = header.lang;
    this.dir = header.dir || 'ltr';
    this.copyright = header.copyright;
    this.body = sections.body;
    this.layout = sections.layout;
    this._starts = indexLines(sections.body);
    this._lstarts = indexLines(sections.layout);
    this.heads = keyedLines(sections.heads);
    this.notes = keyedLines(sections.notes);
    this.xrefs = keyedLines(sections.xrefs);

    // book code -> { order, index of its first verse, chapters }
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
    var out = [];
    for (var v = 0; v < count; v++) {
      var i = start + v;
      var text = this.textAt(i);
      out.push({
        index: i, verse: v + 1, text: text,
        style: this.styleAt(i),
        head: (this.heads[i] || [null])[0],
        notes: this.notes[i] || [],
        xrefs: this.xrefs[i] || [],
        empty: !text
      });
    }
    return { book: b, code: code, chapter: chapter, name: b.name || code,
             verses: out, dir: this.dir };
  };

  Pack.prototype.refOf = function (index) {
    for (var i = 0; i < this.books.length; i++) {
      var b = this.books[i];
      if (index < b.end) {
        for (var c = b.chapters.length - 1; c >= 0; c--) {
          if (index >= b.first[c]) {
            return { code: b.code, name: b.name || b.code,
                     chapter: b.chapters[c][0], verse: index - b.first[c] + 1 };
          }
        }
      }
    }
    return null;
  };

  function open(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'GBP2') return Promise.reject(new Error('Not a translation pack.'));
    return inflateRaw(bytes.subarray(4)).then(function (buf) {
      var all = new Uint8Array(buf);
      var hlen = all[0] | (all[1] << 8) | (all[2] << 16) | (all[3] << 24);
      var dec = new TextDecoder();
      var header = JSON.parse(dec.decode(all.subarray(4, 4 + hlen)));
      var at = 4 + hlen, s = header.sec, sections = {};
      ['body', 'layout', 'heads', 'notes', 'xrefs'].forEach(function (k) {
        sections[k] = dec.decode(all.subarray(at, at + s[k]));
        at += s[k];
      });
      return new Pack(header, sections);
    });
  }

  root.GifosBiblePack = { open: open, MARK: MARK, Pack: Pack };
})(typeof globalThis !== 'undefined' ? globalThis : this);
