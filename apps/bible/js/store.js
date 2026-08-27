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

  root.GifosBibleStore = { Store: Store, DEFAULTS: DEFAULTS, markId: markId };
})(typeof globalThis !== 'undefined' ? globalThis : this);
