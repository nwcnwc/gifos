/* Where everything a reader makes is kept.
 *
 * All of it lives in gifos.db, which means it lives inside the app's own icon
 * on this computer. The file IS the save: hand the GIF to someone and your
 * highlights, notes, bookmarks and place in the plan go with it. There is no
 * account and no server, so the app must never say "synced" — it is saved on
 * this device, inside this app.
 *
 * Four collections, split by who may see them:
 *
 *   prefs   private     theme, type size, the place you are reading, which
 *                       translations you have, which column shows what
 *   marks   private     highlights and notes — one person's margin
 *   plans   private     reading plans and how far along you are
 *   nav     read-write  the shared cursor when people read together, and the
 *                       one record the manifest names as leadable, so a host
 *                       can drive everyone's screen or let go of it
 *
 * Opened outside GifOS there is no gifos.db at all — and the sandbox has no
 * localStorage either. Rather than pretend, the fallback keeps everything in
 * memory for the session and says so once.
 */
(function (root) {
  'use strict';

  function memoryCollection() {
    var rows = Object.create(null), subs = [], n = 0;
    var all = function () {
      var out = [];
      for (var k in rows) out.push(rows[k]);
      return out;
    };
    var fire = function () { for (var i = 0; i < subs.length; i++) subs[i](all()); };
    return {
      put: function (rec) {
        if (!rec.id) rec.id = 'm' + (++n);
        rows[rec.id] = rec; fire();
        return Promise.resolve(rec);
      },
      get: function (id) { return Promise.resolve(rows[id] || null); },
      getAll: function () { return Promise.resolve(all()); },
      delete: function (id) { delete rows[id]; fire(); return Promise.resolve(true); },
      subscribe: function (cb) { subs.push(cb); cb(all()); return function () {}; },
      setVisibility: function () { return Promise.resolve(true); }
    };
  }

  function Store() {
    this.live = !!(root.gifos && root.gifos.db);
    this._c = Object.create(null);
    this.owner = true;
    this.me = { id: 'me', name: '' };
  }

  Store.prototype.collection = function (name) {
    if (this._c[name]) return this._c[name];
    this._c[name] = this.live ? root.gifos.db(name) : memoryCollection();
    return this._c[name];
  };

  Store.prototype.start = function () {
    var self = this;
    if (!this.live) return Promise.resolve(this);
    return Promise.all([
      root.gifos.info().then(function (i) { self.owner = i.owner !== false; }, function () {}),
      root.gifos.me().then(function (m) { self.me = m || self.me; }, function () {})
    ]).then(function () { return self; });
  };

  /* ---------------- preferences ----------------
   * One record, so a change is one write and a subscriber sees the whole
   * shape rather than reassembling it from rows. */
  var PREF_ID = 'prefs';
  var DEFAULTS = {
    id: PREF_ID,
    theme: 'night', size: 3, face: 'serif',
    mode: 'paragraph', redLetter: true, notes: true, headings: true,
    columns: ['engwebp'],
    // The palette is the reader's own system: the keys are fixed, the names
    // are theirs to change ("amber" -> "Promises").
    colourNames: { amber: 'Amber', rose: 'Rose', sky: 'Sky', leaf: 'Leaf', violet: 'Violet', under: 'Underline' },
    voice: '', readAlong: true,
    at: { code: 'JHN', chapter: 1, verse: 1 },
    installed: [],
    seenWelcome: false
  };

  Store.prototype.prefs = function () {
    var self = this;
    return this.collection('prefs').get(PREF_ID).then(function (rec) {
      var out = {};
      for (var k in DEFAULTS) out[k] = DEFAULTS[k];
      if (rec) for (var j in rec) if (rec[j] !== undefined) out[j] = rec[j];
      out.id = PREF_ID;
      self._prefs = out;
      return out;
    });
  };

  Store.prototype.savePrefs = function (patch) {
    var self = this;
    var cur = this._prefs || DEFAULTS;
    var next = {};
    for (var k in cur) next[k] = cur[k];
    for (var j in patch) next[j] = patch[j];
    next.id = PREF_ID;
    this._prefs = next;
    // A write that fails must not take the reading surface down with it; the
    // reader already shows what the person asked for.
    return this.collection('prefs').put(next).catch(function (e) {
      self.onError && self.onError(e);
      return next;
    });
  };

  /* ---------------- marks: highlights and notes ----------------
   * Keyed by translation-independent reference, NOT by the verse index inside
   * one pack. A highlight put on John 3:16 in one translation is the same
   * verse in every other, and the index differs between them. */
  function markId(ref) { return ref.code + '.' + ref.chapter + '.' + ref.verse; }

  Store.prototype.marks = function () { return this.collection('marks').getAll(); };
  Store.prototype.onMarks = function (cb) { return this.collection('marks').subscribe(cb); };

  Store.prototype.setHighlight = function (ref, colour) {
    var id = markId(ref);
    var c = this.collection('marks');
    var self = this;
    return c.get(id).then(function (rec) {
      rec = rec || { id: id, code: ref.code, chapter: ref.chapter, verse: ref.verse };
      rec.colour = colour || '';
      rec.at = Date.now();
      if (!rec.colour && !rec.note) return c.delete(id).then(function () { return null; });
      return c.put(rec);
    }).catch(function (e) { self.onError && self.onError(e); return null; });
  };

  // A Kindle-style highlight is a RANGE, not a verse. It may run across
  // consecutive verses in the same chapter (`verse`..`verseEnd`). `fn` is the
  // translators' footnote index when the selection was in a note.
  function spanEndVerse(spec) {
    return spec.verseEnd != null ? spec.verseEnd : spec.verse;
  }
  function spanId(spec) {
    var v1 = spanEndVerse(spec);
    var head = (spec.fn != null ? 'fn.' : 's.') + spec.pack + '.' + spec.code + '.' +
      spec.chapter + '.' + spec.verse + (spec.fn != null ? '.' + spec.fn : '');
    if (v1 !== spec.verse) head += '-' + v1;
    return head + '.' + spec.start + '.' + spec.end;
  }
  function sameSpanLocus(a, b) {
    if (a.code !== b.code || a.chapter !== b.chapter) return false;
    if (a.pack && b.pack && a.pack !== b.pack) return false;
    if ((a.fn != null) !== (b.fn != null)) return false;
    if (a.fn != null && (a.fn !== b.fn || a.verse !== b.verse)) return false;
    return true;
  }
  function coverageOnVerse(span, v) {
    var v0 = span.verse, v1 = spanEndVerse(span);
    if (v < v0 || v > v1) return null;
    return { from: v === v0 ? span.start : 0, to: v === v1 ? span.end : Infinity };
  }
  function spansOverlap(a, b) {
    if (!sameSpanLocus(a, b)) return false;
    var lo = Math.max(a.verse, b.verse);
    var hi = Math.min(spanEndVerse(a), spanEndVerse(b));
    for (var v = lo; v <= hi; v++) {
      var ca = coverageOnVerse(a, v), cb = coverageOnVerse(b, v);
      if (ca && cb && ca.from < cb.to && cb.from < ca.to) return true;
    }
    return false;
  }
  function spansTouch(a, b) {
    if (!sameSpanLocus(a, b)) return false;
    var lo = Math.max(a.verse, b.verse);
    var hi = Math.min(spanEndVerse(a), spanEndVerse(b));
    var v;
    for (v = lo; v <= hi; v++) {
      var ca = coverageOnVerse(a, v), cb = coverageOnVerse(b, v);
      if (ca && cb && ca.from <= cb.to && cb.from <= ca.to) return true;
    }
    // Same colour on neighbouring verses is one run — the gap at the verse
    // number is not a reason to split.
    if (spanEndVerse(a) + 1 === b.verse || spanEndVerse(b) + 1 === a.verse) return true;
    return false;
  }
  function mergeSpanBounds(want, r) {
    var w1 = spanEndVerse(want), r1 = spanEndVerse(r);
    var verse = want.verse, start = want.start;
    if (r.verse < want.verse || (r.verse === want.verse && r.start < want.start)) {
      verse = r.verse;
      start = r.start;
    }
    var verseEnd = w1, end = want.end;
    if (r1 > w1 || (r1 === w1 && r.end > want.end)) {
      verseEnd = r1;
      end = r.end;
    }
    want.verse = verse;
    want.start = start;
    want.end = end;
    if (verseEnd !== verse) want.verseEnd = verseEnd;
    else delete want.verseEnd;
  }
  function copySpan(r) {
    return {
      id: r.id, kind: r.kind, pack: r.pack, code: r.code, chapter: r.chapter,
      verse: r.verse, start: r.start, end: r.end, verseEnd: r.verseEnd,
      fn: r.fn, quote: r.quote, colour: r.colour
    };
  }
  function mergeSpanRecords(recs) {
    var list = recs.slice().sort(function (a, b) {
      if (a.colour !== b.colour) return a.colour < b.colour ? -1 : 1;
      if (a.verse !== b.verse) return a.verse - b.verse;
      return a.start - b.start;
    });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var last = out[out.length - 1];
      if (last && last.colour === r.colour && spansTouch(last, r)) {
        mergeSpanBounds(last, r);
        if ((r.quote || '').length > (last.quote || '').length) last.quote = r.quote;
      } else {
        out.push(copySpan(r));
      }
    }
    return out;
  }

  Store.prototype.setSpan = function (spec, colour) {
    var c = this.collection('marks');
    var self = this;
    var want = {
      kind: spec.fn != null ? 'fn' : 'span',
      pack: spec.pack, code: spec.code, chapter: spec.chapter, verse: spec.verse,
      start: spec.start, end: spec.end, fn: spec.fn, quote: spec.quote || ''
    };
    if (spec.verseEnd != null && spec.verseEnd !== spec.verse) want.verseEnd = spec.verseEnd;
    return c.getAll().then(function (rows) {
      var ops = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.kind !== 'span' && r.kind !== 'fn') continue;
        if (colour && r.colour === colour && spansTouch(r, want)) {
          mergeSpanBounds(want, r);
          if ((r.quote || '').length > (want.quote || '').length) want.quote = r.quote;
          ops.push(c.delete(r.id));
        } else if (spansOverlap(r, want)) {
          ops.push(c.delete(r.id));
        }
      }
      return Promise.all(ops);
    }).then(function () {
      if (!colour) return null;
      want.id = spanId(want);
      want.colour = colour;
      want.at = Date.now();
      return c.put(want);
    }).catch(function (e) { self.onError && self.onError(e); return null; });
  };

  Store.prototype.setNote = function (ref, text) {
    var id = markId(ref);
    var c = this.collection('marks');
    var self = this;
    return c.get(id).then(function (rec) {
      rec = rec || { id: id, code: ref.code, chapter: ref.chapter, verse: ref.verse };
      rec.note = String(text || '').slice(0, 8000);
      rec.at = Date.now();
      if (!rec.colour && !rec.note) return c.delete(id).then(function () { return null; });
      return c.put(rec);
    }).catch(function (e) { self.onError && self.onError(e); return null; });
  };

  Store.prototype.markFor = function (ref) {
    return this.collection('marks').get(markId(ref));
  };

  /* An audio note is the reader's own voice in the margin. The bytes come from
   * brokered capture (GifOS records, the app never touches the mic) and land
   * in their OWN collection: subscribers re-download a whole collection on
   * every change, so a minute of audio must never sit beside the text marks. */
  Store.prototype.setVoiceNote = function (ref, clip) {
    var id = 'v.' + markId(ref);
    var self = this;
    var c = this.collection('voicenotes');
    if (!clip) {
      return c.delete(id).then(function () {
        return self.collection('marks').get(markId(ref));
      }).then(function (rec) {
        if (rec) { delete rec.voice; rec.at = Date.now();
          if (!rec.colour && !rec.note) return self.collection('marks').delete(rec.id);
          return self.collection('marks').put(rec); }
      });
    }
    return c.put({ id: id, bytes: new Uint8Array(clip.bytes), mime: clip.mime,
                   ms: clip.durationMs || 0, at: Date.now() })
      .then(function () {
        var mc = self.collection('marks');
        return mc.get(markId(ref)).then(function (rec) {
          rec = rec || { id: markId(ref), code: ref.code, chapter: ref.chapter, verse: ref.verse };
          rec.voice = id; rec.at = Date.now();
          return mc.put(rec);
        });
      });
  };

  Store.prototype.voiceNote = function (id) { return this.collection('voicenotes').get(id); };

  /* ---------------- reading together ----------------
   * One record, 'cursor', which the manifest names under "lead". The host can
   * flip it between communal and leading in the OS chrome; this code only ever
   * writes it and listens. A guest whose write is refused is not an error to
   * report — it means the leader is driving, which the reader shows. */
  Store.prototype.setCursor = function (ref, transId) {
    return this.collection('nav').put({
      id: 'cursor', code: ref.code, chapter: ref.chapter, verse: ref.verse || 1,
      trans: transId || '', by: this.me.id, name: this.me.name || '', at: Date.now()
    }).catch(function () { return null; });
  };

  Store.prototype.onCursor = function (cb) {
    return this.collection('nav').subscribe(function (rows) {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === 'cursor') return cb(rows[i]);
      cb(null);
    });
  };

  /* ---------------- plans ---------------- */
  /* A plan record:
   *   { id, kind: 'mcheyne'|'custom'|…, title, startedOn: 'YYYY-MM-DD',
   *     days: <total>, done: { <dayNumber>: true }, readings?: [...custom] }
   * Progress is a set of finished day numbers rather than a cursor, so a
   * reader who skips Tuesday and does it Thursday is telling the truth. */
  Store.prototype.plans = function () { return this.collection('plans').getAll(); };
  Store.prototype.onPlans = function (cb) { return this.collection('plans').subscribe(cb); };
  Store.prototype.savePlan = function (rec) { return this.collection('plans').put(rec); };
  Store.prototype.dropPlan = function (id) { return this.collection('plans').delete(id); };

  root.GifosBibleStore = {
    Store: Store, DEFAULTS: DEFAULTS, markId: markId,
    spanEndVerse: spanEndVerse, spansTouch: spansTouch, spansOverlap: spansOverlap,
    mergeSpanBounds: mergeSpanBounds, mergeSpanRecords: mergeSpanRecords
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
