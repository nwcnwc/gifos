/* The reader, part two: the sheets and the voice.
 *
 * Split from reader.js only for size; same object, methods added to the same
 * prototype. Everything here is reached from a tap on the page.
 */
(function (root) {
  'use strict';

  var Reader = root.GifosBibleReader.Reader;
  var el = root.GifosBibleReader.el;
  var clear = root.GifosBibleReader.clear;
  var Render = root.GifosBibleRender;
  var Refs = root.GifosRefs;

  /* ---------------- the verse sheet ----------------
   * Tap a verse: highlight it in the reader's own colours, write or speak a
   * note, copy or share it, hear it, or look at everything the apparatus has.
   */
  Reader.prototype.openVerseSheet = function (pack, index) {
    var self = this;
    var ref = pack.refOf(index);
    if (!ref) return;
    this._verse = { pack: pack, index: index, ref: ref };

    var names = this.namesOf(pack);
    document.getElementById('verse-ref').textContent =
      Refs.format(ref, { names: names, style: 'long' });

    var mark = this.marks[ref.code + '.' + ref.chapter + '.' + ref.verse] || {};

    // Swatches, wearing the reader's own names for the colours.
    var sw = document.getElementById('swatches');
    clear(sw);
    var colours = ['amber', 'rose', 'sky', 'leaf', 'violet', 'under'];
    var cn = this.prefs.colourNames || {};
    for (var i = 0; i < colours.length; i++) {
      (function (c) {
        var b = el('button', 's-' + c);
        b.type = 'button';
        b.title = cn[c] || c;
        b.setAttribute('aria-label', 'Highlight: ' + (cn[c] || c));
        b.setAttribute('aria-pressed', mark.colour === c ? 'true' : 'false');
        b.addEventListener('click', function () {
          var next = mark.colour === c ? '' : c;
          self.store.setHighlight(ref, next).then(function () { self.paint(); });
          self.closeSheets();
        });
        sw.appendChild(b);
      })(colours[i]);
    }
    var none = el('button', 's-none', '∅');
    none.type = 'button';
    none.title = 'No highlight';
    none.addEventListener('click', function () {
      self.store.setHighlight(ref, '').then(function () { self.paint(); });
      self.closeSheets();
    });
    sw.appendChild(none);

    // Actions.
    var acts = document.getElementById('verse-acts');
    clear(acts);
    var add = function (label, fn) {
      var b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      acts.appendChild(b);
      return b;
    };
    add(mark.note ? 'Edit note' : 'Note', function () { self.editNote(ref, mark); });
    if (root.gifos && root.gifos.recordAudio) {
      add(mark.voice ? 'Re-record voice note' : 'Voice note', function () { self.recordVoiceNote(ref); });
      if (mark.voice) add('Play voice note', function () { self.playVoiceNote(mark.voice); });
    }
    add('Copy', function () {
      var line = Render.plain(pack.textAt(index)) + '\n— ' +
        Refs.format(ref, { names: names, style: 'long' }) + ' (' + (pack.name || pack.id) + ')';
      self.copy(line);
      self.closeSheets();
    });
    if (this.canSpeak()) add('Read aloud from here', function () {
      self.closeSheets();
      self.speakFrom(index);
    });
    add('Compare', function () { self.compareVerse(ref); });

    // Body: the verse itself, the reader's note, then the apparatus.
    var body = document.getElementById('verse-body');
    clear(body);
    var quote = el('p', 'quote', Render.plain(pack.textAt(index)));
    body.appendChild(quote);

    if (mark.note) {
      var noteP = el('button', 'note-item');
      noteP.type = 'button';
      noteP.textContent = mark.note;
      noteP.title = 'Edit note';
      noteP.addEventListener('click', function () { self.editNote(ref, mark); });
      body.appendChild(noteP);
    }

    var vd = pack.chapter(ref.code, ref.chapter);
    var vv = vd && vd.verses[ref.verse - 1];
    if (vv && vv.notes.length) {
      body.appendChild(el('h3', 'lang-name', 'Translators’ notes'));
      for (var n = 0; n < vv.notes.length; n++) body.appendChild(el('div', 'note-item', vv.notes[n]));
    }
    if (vv && vv.xrefs.length) {
      body.appendChild(el('h3', 'lang-name', 'Cross references'));
      for (var x = 0; x < vv.xrefs.length; x++) this.xrefButtons(body, vv.xrefs[x]);
    }
    this.apparatusInto(body, ref);

    this.openSheet('sheet-verse');
  };

  // Cross-reference strings become buttons where they parse, text where not.
  Reader.prototype.xrefButtons = function (body, s) {
    var self = this;
    var parsed = Refs.parse(s);
    if (!parsed.length) { body.appendChild(el('div', 'xref-item', s)); return; }
    var row = el('div', 'xref-item');
    row.appendChild(document.createTextNode(''));
    for (var i = 0; i < parsed.length; i++) {
      (function (r) {
        var b = el('button', 'link', Refs.format(r, { style: 'short' }));
        b.type = 'button';
        b.style.marginRight = '.6em';
        b.addEventListener('click', function () {
          self.closeSheets();
          self.go({ code: r.code, chapter: r.chapter, verse: r.verse || 0 }, { flash: !!r.verse });
        });
        row.appendChild(b);
      })(parsed[i]);
    }
    body.appendChild(row);
  };

  // Whatever helps/lexicon packs are open contribute here. They load lazily
  // and quietly: a reader who never studies never pays for the apparatus.
  Reader.prototype.apparatusInto = function (body, ref) {
    var self = this;
    if (!root.GifosBibleApparatus) return;
    var gen = (this._appGen = (this._appGen || 0) + 1);
    root.GifosBibleApparatus.forVerse(ref, function (section) {
      if (self._appGen !== gen) return;
      if (!section || !section.items || !section.items.length) return;
      body.appendChild(el('h3', 'lang-name', section.title));
      for (var i = 0; i < section.items.length; i++) {
        var it = section.items[i];
        if (it.ref) {
          self.xrefButtons(body, it.text);
        } else {
          body.appendChild(el('div', 'note-item', it.text));
        }
      }
    });
  };

  Reader.prototype.editNote = function (ref, mark) {
    var self = this;
    var text = prompt('Your note on ' + Refs.format(ref, { style: 'short' }), mark.note || '');
    if (text === null) return;
    this.store.setNote(ref, text).then(function () {
      self.closeSheets();
      self.paint();
      self.toast(text ? 'Note saved — it lives inside this app on this device.' : 'Note removed.');
    });
  };

  Reader.prototype.recordVoiceNote = function (ref) {
    var self = this;
    this.closeSheets();
    root.gifos.recordAudio({ maxSeconds: 120 }).then(function (clip) {
      return self.store.setVoiceNote(ref, clip).then(function () {
        self.paint();
        self.toast('Voice note saved on ' + Refs.format(ref, { style: 'short' }) + '.');
      });
    }).catch(function (e) {
      if (e && /cancel/i.test(e.message || '')) return;
      self.toast(e && e.message ? e.message : 'Recording did not work.');
    });
  };

  Reader.prototype.playVoiceNote = function (id) {
    var self = this;
    this.store.voiceNote(id).then(function (rec) {
      if (!rec || !rec.bytes) { self.toast('That voice note is gone.'); return; }
      var bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      var url = URL.createObjectURL(new Blob([bytes], { type: rec.mime || 'audio/webm' }));
      var a = new Audio(url);
      a.onended = function () { URL.revokeObjectURL(url); };
      a.play();
    });
  };

  Reader.prototype.copy = function (text) {
    var self = this;
    var done = function () { self.toast('Copied.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { self.toast('Copy is not allowed here.'); });
    } else self.toast('Copy is not allowed here.');
  };

  // One verse across every translation on this computer, tallest first-class
  // study view there is and it costs nothing.
  Reader.prototype.compareVerse = function (ref) {
    var self = this;
    var body = document.getElementById('verse-body');
    clear(body);
    document.getElementById('verse-ref').textContent =
      Refs.format(ref, { style: 'long' }) + ' — side by side';
    clear(document.getElementById('swatches'));
    clear(document.getElementById('verse-acts'));

    var ids = [];
    for (var id in this.lib.open) ids.push(id);
    var base = this.pack(0);
    var from = base ? (base.header.versification || 'kjv') : 'kjv';
    for (var i = 0; i < ids.length; i++) {
      var p = this.lib.open[ids[i]];
      var r = ref;
      var to = p.header.versification || 'kjv';
      if (to !== from && root.GifosVersify && root.GifosVersify.differs(ref.code, from, to)) {
        r = root.GifosVersify.map(ref, from, to) || null;
      }
      var idx = r ? p.indexOfVerse(r.code, r.chapter, r.verse) : -1;
      if (idx < 0) continue;
      var item = el('div', 'note-item');
      item.appendChild(el('strong', '', (p.name || p.id) + '  '));
      var q = el('span', '', Render.plain(p.textAt(idx)));
      if (p.dir === 'rtl') { item.setAttribute('dir', 'rtl'); }
      item.appendChild(q);
      body.appendChild(item);
    }
    var hint = el('p', 'sheet-foot',
      'Only translations opened on this device appear here. Add more from the translation list.');
    hint.style.border = '0';
    body.appendChild(hint);
  };

  /* ---------------- notes / xref anchors in the text ---------------- */

  Reader.prototype.openNoteSheet = function (pack, index, kind, n) {
    var ref = pack.refOf(index);
    var ch = pack.chapter(ref.code, ref.chapter);
    var v = ch && ch.verses[ref.verse - 1];
    if (!v) return;
    document.getElementById('verse-ref').textContent =
      Refs.format(ref, { names: this.namesOf(pack), style: 'long' });
    clear(document.getElementById('swatches'));
    clear(document.getElementById('verse-acts'));
    var body = document.getElementById('verse-body');
    clear(body);
    if (kind === 'note') {
      body.appendChild(el('h3', 'lang-name', 'Translators’ note'));
      body.appendChild(el('div', 'note-item', v.notes[n] || v.notes[0] || ''));
    } else {
      body.appendChild(el('h3', 'lang-name', 'Cross references'));
      this.xrefButtons(body, v.xrefs[n] || v.xrefs[0] || '');
    }
    this.openSheet('sheet-verse');
  };

  /* ---------------- search ---------------- */

  Reader.prototype.openSearchSheet = function () {
    var self = this;
    var input = document.getElementById('q');
    var scope = document.getElementById('search-scope');
    clear(scope);
    var scopes = [['all', 'Whole Bible'], ['book', 'This book'], ['nt', 'New Testament'], ['ot', 'Old Testament']];
    this._searchScope = this._searchScope || 'all';
    for (var i = 0; i < scopes.length; i++) {
      (function (key, label) {
        var b = el('button', '', label);
        b.type = 'button';
        b.setAttribute('aria-selected', self._searchScope === key ? 'true' : 'false');
        b.addEventListener('click', function () {
          self._searchScope = key;
          var all = scope.querySelectorAll('button');
          for (var j = 0; j < all.length; j++) all[j].setAttribute('aria-selected', 'false');
          b.setAttribute('aria-selected', 'true');
          self.runSearch(input.value);
        });
        scope.appendChild(b);
      })(scopes[i][0], scopes[i][1]);
    }
    input.oninput = function () { self.runSearchSoon(input.value); };
    input.onkeydown = function (ev) { if (ev.key === 'Enter') self.runSearch(input.value); };
    this.openSheet('sheet-search');
    var results = document.getElementById('search-results');
    if (!input.value) {
      clear(results);
      results.appendChild(el('div', 'empty',
        'A word or phrase searches the whole text. A reference — John 3:16, Ps 23, 1 Cor 13:4-7 — jumps straight there.'));
    }
  };

  Reader.prototype.runSearchSoon = function (q) {
    var self = this;
    clearTimeout(this._searchT);
    this._searchT = setTimeout(function () { self.runSearch(q); }, 220);
  };

  /* Search = one pass over the pack's single body string. Case-insensitive by
   * lower-casing both once; the lower-cased body is cached on the pack because
   * building it costs more than any one search. */
  Reader.prototype.runSearch = function (q) {
    var self = this;
    var results = document.getElementById('search-results');
    clear(results);
    q = (q || '').trim();
    if (q.length < 2) return;
    var pack = this.pack(0);
    if (!pack) return;

    // A reference goes straight to the place.
    var refs = Refs.parse(q);
    if (refs.length) {
      for (var i = 0; i < Math.min(8, refs.length); i++) {
        (function (r) {
          if (!pack.hasBook(r.code)) return;
          var btn = el('button', 'res');
          btn.type = 'button';
          btn.appendChild(el('span', 'r-ref', Refs.format(r, { names: self.namesOf(pack), style: 'long' })));
          var idx = r.verse ? pack.indexOfVerse(r.code, r.chapter, r.verse) : -1;
          if (idx >= 0) btn.appendChild(document.createTextNode(
            Render.plain(pack.textAt(idx)).slice(0, 160)));
          btn.addEventListener('click', function () {
            self.closeSheets();
            self.go({ code: r.code, chapter: r.chapter, verse: r.verse || 0 }, { flash: !!r.verse });
          });
          results.appendChild(btn);
        })(refs[i]);
      }
      if (results.firstChild) return;
    }

    if (!pack._lower) pack._lower = pack.body.toLowerCase();
    var hay = pack._lower;
    var needle = q.toLowerCase();
    var found = [];
    var at = hay.indexOf(needle);
    var scope = this._searchScope || 'all';
    var table = Refs.books();
    var sectOf = {};
    for (var t = 0; t < table.length; t++) sectOf[table[t].code] = table[t].sect;
    while (at >= 0 && found.length < 400) {
      var idx = this.indexAt(pack, at);
      var r = pack.refOf(idx);
      if (r) {
        var okScope = scope === 'all' ||
          (scope === 'book' && r.code === this.at.code) ||
          (scope === 'nt' && sectOf[r.code] === 'nt') ||
          (scope === 'ot' && sectOf[r.code] === 'ot');
        if (okScope && (!found.length || found[found.length - 1].idx !== idx)) {
          found.push({ idx: idx, ref: r });
        }
      }
      at = hay.indexOf(needle, at + 1);
    }

    var shown = Math.min(found.length, 100);
    for (var f = 0; f < shown; f++) {
      (function (hit) {
        var btn = el('button', 'res');
        btn.type = 'button';
        btn.appendChild(el('span', 'r-ref', Refs.format(hit.ref, { names: self.namesOf(pack), style: 'short' })));
        var text = Render.plain(pack.textAt(hit.idx));
        var low = text.toLowerCase();
        var p = low.indexOf(needle);
        var start = Math.max(0, p - 40);
        var frag = document.createDocumentFragment();
        if (start > 0) frag.appendChild(document.createTextNode('…'));
        frag.appendChild(document.createTextNode(text.slice(start, p)));
        var m = el('mark', '', text.slice(p, p + needle.length));
        frag.appendChild(m);
        frag.appendChild(document.createTextNode(text.slice(p + needle.length, p + needle.length + 120)));
        btn.appendChild(frag);
        btn.addEventListener('click', function () {
          self.closeSheets();
          self.go({ code: hit.ref.code, chapter: hit.ref.chapter, verse: hit.ref.verse }, { flash: true });
        });
        results.appendChild(btn);
      })(found[f]);
    }
    var head = el('p', 'sheet-foot',
      found.length === 0 ? 'Nothing found in ' + (pack.name || pack.id) + '.'
      : found.length + (found.length === 400 ? '+' : '') + ' verses' +
        (shown < found.length ? ' — showing the first ' + shown : '') +
        ' in ' + (pack.name || pack.id));
    head.style.border = '0';
    results.insertBefore(head, results.firstChild);

    this.searchApparatus(q, results);
  };

  // Dictionary, topics, places, and a typed Strong's number. These packs load
  // lazily; a search that races the first download simply finds the text.
  Reader.prototype.searchApparatus = function (q, results) {
    var self = this;
    var App = root.GifosBibleApparatus;
    if (!App) return;
    App.start();
    var strong = App.lookupStrong(q);
    if (strong) {
      results.appendChild(el('h3', 'lang-name', "Strong’s " + strong.num));
      results.appendChild(el('div', 'note-item',
        strong.lemma + (strong.translit ? ' · ' + strong.translit : '') +
        (strong.definition ? ' — ' + strong.definition : '')));
    }
    var dict = App.searchHeadwords(q, 8);
    if (dict.length) {
      results.appendChild(el('h3', 'lang-name', 'Dictionary'));
      dict.forEach(function (h) {
        var entries = App.lookup(h.headword);
        var btn = el('button', 'res');
        btn.type = 'button';
        btn.appendChild(el('span', 'r-ref', h.headword));
        btn.appendChild(document.createTextNode(
          (h.sourceName || '') + (entries[0] && entries[0].paragraphs
            ? ' — ' + entries[0].paragraphs[0].slice(0, 140) : '')));
        btn.addEventListener('click', function () {
          var body = document.getElementById('verse-body');
          clear(body);
          document.getElementById('verse-ref').textContent = h.headword;
          clear(document.getElementById('swatches'));
          clear(document.getElementById('verse-acts'));
          entries.forEach(function (e) {
            body.appendChild(el('h3', 'lang-name', e.sourceName || e.source));
            (e.paragraphs || [e.text]).forEach(function (p) {
              body.appendChild(el('div', 'note-item', p));
            });
            e.refs.forEach(function (r) { self.xrefButtons(body, r); });
          });
          self.closeSheets();
          self.openSheet('sheet-verse');
        });
        results.appendChild(btn);
      });
    }
    var topics = App.searchTopics(q, 8);
    if (topics.length) {
      results.appendChild(el('h3', 'lang-name', 'Topics'));
      topics.forEach(function (t) {
        var btn = el('button', 'res');
        btn.type = 'button';
        btn.appendChild(el('span', 'r-ref', t.topic));
        btn.appendChild(document.createTextNode(t.sourceName || ''));
        btn.addEventListener('click', function () {
          var hit = App.topic(t.topic)[0];
          if (!hit) return;
          var body = document.getElementById('verse-body');
          clear(body);
          document.getElementById('verse-ref').textContent = hit.topic;
          clear(document.getElementById('swatches'));
          clear(document.getElementById('verse-acts'));
          body.appendChild(el('h3', 'lang-name', hit.sourceName || ''));
          hit.refs.forEach(function (r) { self.xrefButtons(body, r); });
          (hit.subs || []).forEach(function (s) {
            if (s.label) body.appendChild(el('div', 'note-item', s.label));
            (s.refs || []).forEach(function (r) { self.xrefButtons(body, r); });
          });
          self.closeSheets();
          self.openSheet('sheet-verse');
        });
        results.appendChild(btn);
      });
    }
    var places = App.searchPlaces(q, 6);
    if (places.length) {
      results.appendChild(el('h3', 'lang-name', 'Places'));
      places.forEach(function (p) {
        var btn = el('button', 'res');
        btn.type = 'button';
        btn.appendChild(el('span', 'r-ref', p.name));
        btn.appendChild(document.createTextNode(
          (isFinite(p.lat) ? p.lat.toFixed(2) + ', ' + p.lon.toFixed(2) : '') +
          ' — Bible place data © OpenBible.info, licensed CC BY 4.0.'));
        btn.addEventListener('click', function () {
          if (p.refs && p.refs[0]) {
            var parsed = Refs.parse(p.refs[0]);
            if (parsed[0]) {
              self.closeSheets();
              self.go({ code: parsed[0].code, chapter: parsed[0].chapter,
                        verse: parsed[0].verse || 0 }, { flash: !!parsed[0].verse });
            }
          }
        });
        results.appendChild(btn);
      });
    }
  };

  // Binary search: which verse does byte offset `at` in the body fall in?
  Reader.prototype.indexAt = function (pack, at) {
    var s = pack._starts, lo = 0, hi = s.length - 2;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (s[mid] <= at) lo = mid; else hi = mid - 1;
    }
    return lo;
  };

  /* ---------------- read aloud ---------------- */

  Reader.prototype.canSpeak = function () {
    return !!(root.gifos && root.gifos.ai && root.gifos.ai.tts);
  };

  /* Reads verse by verse — each verse is one tts() call, so the highlight can
   * follow the voice and Stop lands between verses. The next verse's audio is
   * fetched while the current one plays, so the seams do not gape. */
  Reader.prototype.speakFrom = function (index) {
    var self = this;
    var pack = this.pack(0);
    if (!pack || !this.canSpeak()) return;
    this.stopSpeaking();
    var state = { on: true, index: index, audio: null };
    this.speaking = state;

    var fetchVerse = function (i) {
      var text = Render.plain(pack.textAt(i));
      if (!text) return Promise.resolve(null);
      return root.gifos.ai.tts({ text: text }).then(function (r) {
        return URL.createObjectURL(new Blob([r.bytes], { type: r.mime || 'audio/mpeg' }));
      });
    };

    var ref0 = pack.refOf(index);
    var chEnd = pack.indexOfVerse(ref0.code, ref0.chapter,
      pack.chapter(ref0.code, ref0.chapter).verses.length);

    var next = fetchVerse(index);
    var step = function () {
      if (!state.on) return;
      var i = state.index;
      if (i > chEnd) { self.stopSpeaking(); return; }
      var upcoming = i + 1 <= chEnd ? null : undefined;
      next.then(function (url) {
        if (!state.on) { if (url) URL.revokeObjectURL(url); return; }
        if (!url) { state.index++; next = fetchVerse(state.index); step(); return; }
        if (upcoming !== undefined) next = fetchVerse(i + 1);
        var r = pack.refOf(i);
        if (self.prefs.readAlong && r) self.flash(r);
        var a = new Audio(url);
        state.audio = a;
        a.onended = function () {
          URL.revokeObjectURL(url);
          state.index++;
          step();
        };
        a.onerror = function () { URL.revokeObjectURL(url); self.stopSpeaking(); };
        a.play().catch(function () { self.stopSpeaking(); });
      }).catch(function (e) {
        self.stopSpeaking();
        var msg = e && e.message ? e.message : '';
        if (msg.indexOf('NOT_CONFIGURED') === 0) {
          if (root.gifos.aiSetup) root.gifos.aiSetup('tts', 'Any text-to-speech model can read the Bible aloud — an offline voice from the App Store works too.');
        } else self.toast(msg || 'Reading aloud did not work.');
      });
    };
    step();
    this.toast('Reading aloud — tap ▮ to stop.', true);
    var t = document.getElementById('toast');
    t.style.cursor = 'pointer';
    t.onclick = function () { self.stopSpeaking(); };
  };

  Reader.prototype.stopSpeaking = function () {
    var s = this.speaking;
    if (!s) return;
    s.on = false;
    if (s.audio) { try { s.audio.pause(); } catch (e) { void e; } }
    this.speaking = null;
    var t = document.getElementById('toast');
    t.onclick = null;
    t.style.cursor = '';
    this.hideToast();
  };

  /* ---------------- reading together ---------------- */

  Reader.prototype.startFollowing = function () {
    var self = this;
    this.store.onCursor(function (cur) {
      if (!cur || cur.by === self.store.me.id) return;
      self.leaderSeen = cur;
      // Another reader moved. If we are following, go with them; if not, the
      // banner offers to. Never yank the page out from under someone silently.
      if (self.following) {
        if (cur.code !== self.at.code || cur.chapter !== self.at.chapter) {
          self.go({ code: cur.code, chapter: cur.chapter, verse: cur.verse }, { silent: true, flash: true });
        }
        return;
      }
      var f = document.getElementById('follow');
      document.getElementById('follow-who').textContent =
        (cur.name ? cur.name : 'Someone') + ' is at ' +
        Refs.format({ code: cur.code, chapter: cur.chapter }, { style: 'short' }) + ' — read together?';
      f.hidden = false;
      var who = document.getElementById('follow-who');
      who.style.cursor = 'pointer';
      who.onclick = function () {
        self.following = true;
        f.hidden = true;
        self.go({ code: cur.code, chapter: cur.chapter, verse: cur.verse }, { silent: true, flash: true });
        document.getElementById('follow-who').textContent = 'Reading together';
      };
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
