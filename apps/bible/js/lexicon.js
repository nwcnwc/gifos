/* GBX1 — reading a lexicon or an interlinear pack.
 *
 *   "GBX1" | deflate-raw( u32 headerLen | header JSON | section | section | ... )
 *
 * The header names its sections IN ORDER (`sec: [[name, byteLength], ...]`), so
 * one open() serves a dictionary and a word-by-word text without a fixed key
 * list baked in. One inflate yields the lot and every section is a slice — the
 * same discipline as GBP2 in pack.js, and for the same reason: nothing here
 * touches the network, and DecompressionStream is a browser built-in, so a pack
 * needs no decoder shipped beside it.
 *
 * A lexicon keeps `nums` and `entries` line for line, so a Strong's number is a
 * line number and a line is an entry with no per-entry object built at open.
 * `search` is ONE string over every definition: hunting the English is a single
 * indexOf, and the hit's offset names the line, which names the entry.
 *
 * An interlinear's `books` table is COPIED from the translation pack it pairs
 * with, so verse index i here is verse index i there. The verse math below is
 * therefore the same math pack.js runs, on the same numbers.
 *
 * MORPHOLOGY IS DECODED FROM A TABLE THE PACK CARRIES, never from anything
 * known here. Robinson's Greek codes and Open Scriptures' Hebrew codes are
 * different alphabets of different lengths; what this file knows is how to read
 * a slot spec — [mapName, characterCount] — and how to pick, among the patterns
 * a part of speech allows, the one whose width matches the segment and whose
 * every character is in its map. That last rule is what separates P-1AP
 * (person, case, number) from P-GSM (case, number, gender), and a participle's
 * Vqrmsa (gender, number, state) from a finite verb's Vqp3ms (person, gender,
 * number), with no special case written down.
 */
(function (root) {
  'use strict';

  var FS = '';                        // between a word's fields

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('This browser cannot unpack a lexicon.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer();
  }

  // Line starts, found once. Int32Array so a 23,000-line index is 92 KB and
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

  function lineAt(s, starts, i) {
    if (i < 0 || i >= starts.length - 1) return '';
    return s.slice(starts[i], starts[i + 1] - 1);
  }

  // -------------------------------------------------------------- numbers

  // `00430`, `H0430`, `430` and `1254 a` all name one entry. One spelling wins:
  // a prefix letter, the number with no padding, no homonym letter. The build
  // folds every source to this at ingest (build-lexicon.mjs) so a reader never
  // has to guess which spelling a pack used.
  function normalize(raw, fallbackPrefix) {
    if (raw === null || raw === undefined) return '';
    var m = String(raw).trim().match(/^([HGhg])?\s*0*(\d+)\s*([a-z])?$/);
    if (!m) return '';
    var prefix = (m[1] || fallbackPrefix || '').toUpperCase();
    if (prefix !== 'H' && prefix !== 'G') return '';
    return prefix + String(parseInt(m[2], 10));
  }

  // The Hebrew Bible's lemma is augmented Strong's: `b/7225` is an inseparable
  // preposition then H7225, `c/853` a conjunction then H853, `1254 a` a homonym
  // letter on H1254, and a bare `b` is a prefix with no number of its own. The
  // word's own number is the LAST numbered morpheme.
  function strongOf(lemma, fallbackPrefix) {
    var parts = String(lemma == null ? '' : lemma).split('/');
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var n = normalize(parts[i], fallbackPrefix || 'H');
      if (n) out = n;
    }
    return out;
  }

  // -------------------------------------------------------------- lexicon

  function Lexicon(header, sections) {
    this.header = header;
    this.id = header.id;
    this.name = header.name;
    this.prefix = header.prefix;
    this.lang = header.lang;
    this.script = header.script;
    this.count = header.count;
    // Numbers Strong never used. The Greek runs 1-5624 but 2717 and 3203-3302
    // are blank in the concordance itself, so the pack ships no entry for them
    // and says so here rather than shipping 101 empty ones.
    this.absent = header.absent || [];
    this.fields = header.fields;
    this._nums = sections.nums;
    this._entries = sections.entries;
    this._search = sections.search;
    this._estarts = indexLines(sections.entries);
    this._sstarts = indexLines(sections.search);

    this._byNum = Object.create(null);
    var nums = sections.nums.split('\n');
    for (var i = 0; i < nums.length; i++) this._byNum[nums[i]] = i;
    this.numbers = nums;
  }

  Lexicon.prototype.slotOf = function (num) {
    var k = normalize(num, this.prefix);
    var at = k ? this._byNum[k] : undefined;
    return at === undefined ? -1 : at;
  };

  Lexicon.prototype.has = function (num) { return this.slotOf(num) >= 0; };

  Lexicon.prototype.at = function (i) {
    if (i < 0 || i >= this.numbers.length) return null;
    var f = lineAt(this._entries, this._estarts, i).split('\t');
    return {
      num: this.numbers[i],
      lemma: f[0] || '', translit: f[1] || '', pron: f[2] || '',
      derivation: f[3] || '', definition: f[4] || '', kjv: f[5] || '',
      see: f[6] ? f[6].split(',') : []
    };
  };

  Lexicon.prototype.lookup = function (num) {
    var i = this.slotOf(num);
    return i < 0 ? null : this.at(i);
  };

  // One indexOf over every definition in the dictionary. The needle is folded
  // the way the index was — lowercase, no diacritics — so a reader who types
  // `agape` and a reader who pastes ἀγάπη arrive at the same line.
  Lexicon.prototype.search = function (query, limit) {
    var q = String(query || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/ς/g, 'σ').trim();
    var out = [];
    if (!q) return out;
    var max = limit || 50;
    var seen = -1;
    for (var at = this._search.indexOf(q); at >= 0 && out.length < max;
         at = this._search.indexOf(q, at + q.length)) {
      var line = lineOf(this._sstarts, at);
      if (line === seen) continue;
      seen = line;
      out.push(this.at(line));
    }
    return out;
  };

  // Which line an offset fell in, by bisection over the line starts.
  function lineOf(starts, at) {
    var lo = 0, hi = starts.length - 2;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= at) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // ---------------------------------------------------------- interlinear

  function Interlinear(header, sections) {
    this.header = header;
    this.id = header.id;
    this.name = header.name;
    this.scheme = header.scheme;
    this.lang = header.lang;
    this.script = header.script;
    this.dir = header.dir || 'ltr';
    this.pairs = header.pairs;
    this.attribution = header.attribution || '';
    this.table = JSON.parse(sections.parse);
    this._words = sections.words;
    this._bare = sections.bare;
    this._wstarts = indexLines(sections.words);
    this._bstarts = indexLines(sections.bare);
    this._morphs = sections.morphs.split('\n');
    this._lemmas = sections.lemmas.split('\n');
    this._decoded = Object.create(null);

    // The same book math pack.js runs, on the table copied from the pack this
    // pairs with — so an index here is that pack's index, not a parallel one.
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

  Interlinear.prototype.hasBook = function (code) { return !!this.byCode[code]; };

  Interlinear.prototype.chapterNumbers = function (code) {
    var b = this.byCode[code];
    if (!b) return [];
    var out = [];
    for (var i = 0; i < b.chapters.length; i++) out.push(b.chapters[i][0]);
    return out;
  };

  Interlinear.prototype.chapterSlot = function (code, chapter) {
    var b = this.byCode[code];
    if (!b) return -1;
    for (var i = 0; i < b.chapters.length; i++) if (b.chapters[i][0] === chapter) return i;
    return -1;
  };

  Interlinear.prototype.indexOfVerse = function (code, chapter, verse) {
    var b = this.byCode[code];
    if (!b) return -1;
    var slot = this.chapterSlot(code, chapter);
    if (slot < 0) return -1;
    if (verse < 1 || verse > b.chapters[slot][1]) return -1;
    return b.first[slot] + verse - 1;
  };

  Interlinear.prototype.refOf = function (index) {
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

  // Every word of one verse, in order. A verse the source does not carry comes
  // back as an EMPTY list — the pack never borrows a neighbour's words to fill
  // a hole, so an empty answer means the text has no words there, not that the
  // lookup failed.
  Interlinear.prototype.wordsAt = function (index) {
    var line = lineAt(this._words, this._wstarts, index);
    if (!line) return [];
    var raw = line.split(' ');
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var f = raw[i].split(FS);
      var morph = this._morphs[+f[2] || 0] || '';
      out.push({
        surface: f[0],
        strong: f[1] ? this.header.lang === 'hbo' ? 'H' + f[1] : 'G' + f[1] : '',
        morph: morph,
        parse: this.decode(morph),
        lemma: this._lemmas[+f[3] || 0] || '',
        ketiv: f[4] || ''
      });
    }
    return out;
  };

  Interlinear.prototype.words = function (code, chapter, verse) {
    return this.wordsAt(this.indexOfVerse(code, chapter, verse));
  };

  // The verse's words with accents, vowel points and cantillation gone — what
  // the search index is built from, and what a reader can actually type.
  Interlinear.prototype.bareAt = function (index) {
    return lineAt(this._bare, this._bstarts, index);
  };

  // One indexOf over the whole text, the same trick GBP2 plays with its body.
  Interlinear.prototype.search = function (query, limit) {
    var q = String(query || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/ς/g, 'σ')
      .replace(/[֑-ׇ]/g, '').trim();
    var out = [];
    if (!q) return out;
    var max = limit || 50;
    var seen = -1;
    for (var at = this._bare.indexOf(q); at >= 0 && out.length < max;
         at = this._bare.indexOf(q, at + q.length)) {
      var line = lineOf(this._bstarts, at);
      if (line === seen) continue;
      seen = line;
      out.push(line);
    }
    return out;
  };

  // ------------------------------------------------------------ morphology

  Interlinear.prototype.decode = function (code) {
    if (!code) return '';
    var hit = this._decoded[code];
    if (hit !== undefined) return hit;
    var out = decodeMorph(this.table, code);
    this._decoded[code] = out;
    return out;
  };

  function decodeMorph(table, code) {
    if (!code) return '';
    if (table.literal && table.literal[code]) return table.literal[code];
    if (table.layout === 'morphemes') {
      // One language letter prefixes the WHOLE string, prefixes included, and
      // it chooses which stem table a verb reads.
      var lang = '', body = code;
      if (table.lang && table.lang[code.charAt(0)]) { lang = code.charAt(0); body = code.slice(1); }
      var parts = body.split(table.sep);
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var t = decodeSlots(table, parts[i].charAt(0), [parts[i].slice(1)], lang);
        if (t === null) return null;
        out.push(t);
      }
      return (lang ? table.lang[lang] + ': ' : '') + out.join(' + ');
    }
    var segs = code.split(table.sep);
    return decodeSlots(table, segs[0], segs.slice(1), '');
  }

  function decodeSlots(table, pos, segs, lang) {
    var name = table.pos[pos];
    if (!name) return null;
    var words = [name];
    var shape = table.shape[pos] || [];
    for (var s = 0; s < segs.length; s++) {
      var seg = segs[s];
      if (!seg) continue;
      var patterns = shape[s] || [];
      var done = false;
      for (var p = 0; p < patterns.length && !done; p++) {
        var pat = patterns[p], width = 0, n;
        for (n = 0; n < pat.length; n++) width += pat[n][1];
        if (width !== seg.length) continue;
        var got = [], at = 0, ok = true;
        for (n = 0; n < pat.length; n++) {
          var key = seg.substr(at, pat[n][1]); at += pat[n][1];
          var mapName = pat[n][0];
          if (table.langMaps && table.langMaps.indexOf(mapName) >= 0) mapName += lang;
          var dict = table.maps[mapName];
          if (!dict || !dict[key]) { ok = false; break; }
          got.push(dict[key]);
        }
        if (!ok) continue;
        words = words.concat(got);
        done = true;
      }
      if (done) continue;
      if (table.suffix && table.suffix[seg]) { words.push(table.suffix[seg]); continue; }
      return null;
    }
    return words.join(', ');
  }

  // ------------------------------------------------------------- container

  function open(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (magic !== 'GBX1') return Promise.reject(new Error('Not a lexicon pack.'));
    return inflateRaw(bytes.subarray(4)).then(function (buf) {
      var all = new Uint8Array(buf);
      var hlen = all[0] | (all[1] << 8) | (all[2] << 16) | (all[3] << 24);
      var dec = new TextDecoder();
      var header = JSON.parse(dec.decode(all.subarray(4, 4 + hlen)));
      var at = 4 + hlen, sections = {};
      for (var i = 0; i < header.sec.length; i++) {
        var name = header.sec[i][0], len = header.sec[i][1];
        sections[name] = dec.decode(all.subarray(at, at + len));
        at += len;
      }
      if (header.kind === 'lexicon') return new Lexicon(header, sections);
      if (header.kind === 'interlinear') return new Interlinear(header, sections);
      throw new Error('Unknown pack kind: ' + header.kind);
    });
  }

  root.GifosBibleLexicon = {
    open: open, normalize: normalize, strongOf: strongOf,
    decodeMorph: decodeMorph, Lexicon: Lexicon, Interlinear: Interlinear, FS: FS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
