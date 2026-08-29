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
  var snip = root.GifosBibleReader.snip;
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
          self.store.setHighlight(ref, next).then(function () { self.paint({ keepScroll: true }); });
          self.closeSheets();
        });
        sw.appendChild(b);
      })(colours[i]);
    }
    var none = el('button', 's-none', '∅');
    none.type = 'button';
    none.title = 'No highlight';
    none.addEventListener('click', function () {
      self.store.setHighlight(ref, '').then(function () { self.paint({ keepScroll: true }); });
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
    var shownNote = (root.GifosBibleStore && root.GifosBibleStore.noteText)
      ? root.GifosBibleStore.noteText(mark, pack.id) : (mark.note || '');
    add(shownNote ? 'Edit note' : 'Note', function () { self.editNote(ref, mark); });
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

    if (shownNote) {
      var noteP = el('button', 'note-item');
      noteP.type = 'button';
      noteP.textContent = shownNote;
      noteP.title = 'Edit note';
      noteP.addEventListener('click', function () { self.editNote(ref, mark); });
      body.appendChild(noteP);
    }

    var vd = pack.chapter(ref.code, ref.chapter);
    var vv = vd && vd.verses[ref.verse - 1];
    if (vv && vv.notes.length) {
      body.appendChild(el('h3', 'lang-name', 'Translators’ notes'));
      for (var n = 0; n < vv.notes.length; n++) {
        var item = el('div', 'note-item', vv.notes[n]);
        item.setAttribute('data-pack', pack.id);
        item.setAttribute('data-code', ref.code);
        item.setAttribute('data-ch', String(ref.chapter));
        item.setAttribute('data-v', String(ref.verse));
        item.setAttribute('data-n', String(n));
        body.appendChild(item);
        this.applyFootnoteHighlights(item, {
          pack: pack.id, code: ref.code, chapter: ref.chapter, verse: ref.verse, fn: n
        });
      }
    }
    if (vv && vv.xrefs.length) {
      body.appendChild(el('h3', 'lang-name', 'Cross references'));
      for (var x = 0; x < vv.xrefs.length; x++) this.xrefButtons(body, vv.xrefs[x]);
    }
    this.apparatusInto(body, ref);
    this.openSheet('sheet-verse');
  };

  Reader.prototype.openScopeSheet = function (pack, ref, scope) {
    scope = scope || 'verse';
    if (scope === 'verse') {
      var i = pack.indexOfVerse(ref.code, ref.chapter, ref.verse || 1);
      if (i >= 0) this.openVerseSheet(pack, i);
      return;
    }
    var names = this.namesOf(pack);
    document.getElementById('verse-ref').textContent = scope === 'book'
      ? (names[ref.code] && names[ref.code].name) || ref.code
      : Refs.format({ code: ref.code, chapter: ref.chapter }, { names: names, style: 'short' });
    var sw = document.getElementById('swatches');
    if (sw) clear(sw);
    var acts = document.getElementById('verse-acts');
    if (acts) clear(acts);
    var body = document.getElementById('verse-body');
    clear(body);
    this.fillCommentaryBody(body, ref, scope);
    this.openSheet('sheet-verse');
  };

  Reader.prototype.fillCommentaryBody = function (body, ref, scope) {
    var self = this;
    if (!root.GifosBibleApparatus) return;
    root.GifosBibleApparatus.start();
    var waiting = el('div', 'note-item', 'Opening the study packs…');
    body.appendChild(waiting);
    function paint() {
      var mh = root.GifosBibleApparatus.shelf && root.GifosBibleApparatus.shelf.get('mhcc');
      if (!mh) return false;
      if (waiting.parentNode) waiting.parentNode.removeChild(waiting);
      var cover = scope === 'verse' ? mh.commentary(ref.code, ref.chapter, ref.verse) : null;
      var outline = mh.commentaryOutline && mh.commentaryOutline(ref.code, ref.chapter);
      var ranges = mh.commentaryChapter ? mh.commentaryChapter(ref.code, ref.chapter) : [];
      var book = mh.commentaryBook && mh.commentaryBook(ref.code);
      if (scope !== 'book' && cover) {
        body.appendChild(el('h3', 'lang-name', 'This passage · ' + cover.reference));
        body.appendChild(el('div', 'note-item', cover.paragraphs ? cover.paragraphs.join('\n\n') : cover.text));
      }
      if (scope !== 'book' && (outline || (ranges && ranges.length))) {
        body.appendChild(el('h3', 'lang-name', 'This chapter'));
        if (outline) body.appendChild(el('div', 'note-item', outline.paragraphs ? outline.paragraphs.join('\n\n') : outline.text));
        (ranges || []).forEach(function (row) {
          var label = ref.chapter + ':' + row.from + (row.to !== row.from ? '–' + row.to : '');
          var b = el('button', 'note-item');
          b.type = 'button';
          b.appendChild(el('strong', '', label));
          b.appendChild(document.createTextNode('  ' + snip(row.text, 160)));
          b.addEventListener('click', function () {
            if (!self.docked()) self.closeSheets();
            self.go({ code: ref.code, chapter: ref.chapter, verse: row.from }, { flash: true, jump: true });
          });
          body.appendChild(b);
        });
      }
      if (book) {
        body.appendChild(el('h3', 'lang-name', 'This book · ' + (book.bookName || book.book)));
        body.appendChild(el('div', 'note-item', book.paragraphs ? book.paragraphs.join('\n\n') : book.text));
      }
      return true;
    }
    if (!paint()) {
      if (root.GifosBibleApparatus.whenReady) {
        root.GifosBibleApparatus.whenReady(function () { paint(); });
      }
    }
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
          self.go({ code: r.code, chapter: r.chapter, verse: r.verse || 0 }, { flash: !!r.verse, jump: true });
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

  // A sandboxed app cannot raise window.prompt — the OS iframe has no
  // allow-modals — so the note is a sheet with a textarea, not a browser dialog.
  Reader.prototype.editNote = function (ref, mark) {
    this._noteRef = ref;
    var pack = this.pack(0);
    var names = pack ? this.namesOf(pack) : {};
    document.getElementById('note-ref').textContent =
      'Note · ' + Refs.format(ref, { names: names, style: 'short' });
    var quote = document.getElementById('note-quote');
    var idx = pack ? pack.indexOfVerse(ref.code, ref.chapter, ref.verse) : -1;
    if (quote) {
      if (idx >= 0) {
        quote.textContent = Render.plain(pack.textAt(idx));
        quote.hidden = false;
      } else {
        quote.textContent = '';
        quote.hidden = true;
      }
    }
    var packId = pack && pack.id;
    var shown = (root.GifosBibleStore && root.GifosBibleStore.noteText)
      ? root.GifosBibleStore.noteText(mark, packId) : ((mark && mark.note) || '');
    var packOnly = !!(mark && mark.notes && packId && mark.notes[packId]);
    var ta = document.getElementById('note-text');
    ta.value = shown;
    var all = document.getElementById('note-all-trans');
    if (all) all.checked = !packOnly;
    var rm = document.getElementById('note-remove');
    if (rm) rm.hidden = !ta.value;
    this._notePack = packId;
    this._notePackName = pack ? (pack.name || pack.id) : '';
    this.openSheet('sheet-note');
  };

  Reader.prototype.saveNote = function (opts) {
    var ref = this._noteRef;
    if (!ref) return;
    var self = this;
    var all = document.getElementById('note-all-trans');
    var every = !all || all.checked;
    var text = (opts && opts.remove)
      ? ''
      : String((document.getElementById('note-text') || {}).value || '');
    var args = every
      ? { fromPack: this._notePack }
      : { pack: this._notePack };
    this.store.setNote(ref, text, args).then(function () {
      self.closeSheets();
      self.paint({ keepScroll: true });
      var msg;
      if (!text) msg = 'Note removed.';
      else if (every) msg = 'Note saved on every translation of this verse.';
      else msg = 'Note saved on ' + (self._notePackName || 'this translation') + ' only.';
      self.toast(msg);
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
      var item = el('div', 'note-item', v.notes[n] || v.notes[0] || '');
      item.setAttribute('data-pack', pack.id);
      item.setAttribute('data-code', ref.code);
      item.setAttribute('data-ch', String(ref.chapter));
      item.setAttribute('data-v', String(ref.verse));
      item.setAttribute('data-n', String(n));
      body.appendChild(item);
      this.applyFootnoteHighlights(item, {
        pack: pack.id, code: ref.code, chapter: ref.chapter, verse: ref.verse, fn: n
      });
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
            snip(Render.plain(pack.textAt(idx)), 160)));
          btn.addEventListener('click', function () {
            if (!self.docked()) self.closeSheets();
            self.go({ code: r.code, chapter: r.chapter, verse: r.verse || 0 }, { flash: !!r.verse, jump: true });
          });
          results.appendChild(btn);
        })(refs[i]);
      }
      if (results.firstChild) return;
    }

    var sb = this.searchBody(pack);
    var hay = sb.text;
    var needle = Render.searchable(q);
    var found = [];
    var at = hay.indexOf(needle);
    var scope = this._searchScope || 'all';
    var table = Refs.books();
    var sectOf = {};
    for (var t = 0; t < table.length; t++) sectOf[table[t].code] = table[t].sect;
    while (at >= 0 && found.length < 400) {
      var idx = this.indexAt(sb.starts, at);
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
        // The snippet is the verse as it reads, and the hit was found in a
        // body normalised the same way, so the offset lands. A verse whose
        // marks made the two disagree shows its opening rather than slicing
        // at -1.
        var text = Render.plain(pack.textAt(hit.idx));
        var p = Render.searchable(text).indexOf(needle);
        var frag = document.createDocumentFragment();
        if (p < 0) {
          frag.appendChild(document.createTextNode(snip(text, 160)));
        } else {
          var start = Math.max(0, p - 40);
          if (start > 0) frag.appendChild(document.createTextNode('…'));
          frag.appendChild(document.createTextNode(text.slice(start, p)));
          frag.appendChild(el('mark', '', text.slice(p, p + needle.length)));
          frag.appendChild(document.createTextNode(snip(text.slice(p + needle.length), 120)));
        }
        btn.appendChild(frag);
        btn.addEventListener('click', function () {
          if (!self.docked()) self.closeSheets();
          self.go({ code: hit.ref.code, chapter: hit.ref.chapter, verse: hit.ref.verse }, { flash: true, jump: true });
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

  /* One article, opened.
   *
   * A dictionary entry, a topic and a Strong's number all want the same sheet:
   * a title, the source, the text, the references. Each viewer was built inline
   * at its own call site, so the three had drifted — different heading markup,
   * and the topic one printed its sub-headings where the dictionary one printed
   * nothing. This is that sheet, once, and every caller fills it. */
  Reader.prototype.openEntry = function (title, paint) {
    var body = document.getElementById('verse-body');
    if (!body) return;
    clear(body);
    document.getElementById('verse-ref').textContent = title;
    clear(document.getElementById('swatches'));
    clear(document.getElementById('verse-acts'));
    paint(body);
    this.closeSheets();
    this.openSheet('sheet-verse');
  };

  Reader.prototype.openWord = function (headword) {
    var self = this;
    var App = root.GifosBibleApparatus;
    if (!App) return;
    var entries = App.lookup(headword);
    if (!entries.length) return;
    this.openEntry(headword, function (body) {
      entries.forEach(function (e) {
        body.appendChild(el('h3', 'lang-name', e.sourceName || e.source));
        (e.paragraphs || [e.text]).forEach(function (p) {
          body.appendChild(el('div', 'note-item', p));
        });
        (e.refs || []).forEach(function (r) { self.xrefButtons(body, r); });
      });
    });
  };

  Reader.prototype.openTopic = function (name) {
    var self = this;
    var App = root.GifosBibleApparatus;
    if (!App) return;
    var hit = App.topic(name)[0];
    if (!hit) return;
    this.openEntry(hit.topic, function (body) {
      body.appendChild(el('h3', 'lang-name', hit.sourceName || ''));
      (hit.subs || []).forEach(function (sub) {
        if (sub.label) body.appendChild(el('div', 'note-item', sub.label));
        (sub.refs || []).forEach(function (r) { self.xrefButtons(body, r); });
      });
      (hit.refs || []).forEach(function (r) { self.xrefButtons(body, r); });
    });
  };

  Reader.prototype.openStrong = function (num) {
    var App = root.GifosBibleApparatus;
    if (!App) return;
    var e = App.lookupStrong(num);
    if (!e) return;
    this.openEntry('Strong’s ' + e.num, function (body) {
      body.appendChild(el('h3', 'lang-name', e.lemma +
        (e.translit ? ' · ' + e.translit : '') + (e.pron ? ' · ' + e.pron : '')));
      if (e.derivation) body.appendChild(el('div', 'note-item', e.derivation));
      if (e.definition) body.appendChild(el('div', 'note-item', e.definition));
      if (e.kjv) body.appendChild(el('div', 'note-item', 'Rendered: ' + e.kjv));
    });
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
        btn.addEventListener('click', function () { self.openWord(h.headword); });
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
        btn.addEventListener('click', function () { self.openTopic(t.topic); });
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
                        verse: parsed[0].verse || 0 }, { flash: !!parsed[0].verse, jump: true });
            }
          }
        });
        results.appendChild(btn);
      });
    }
  };

  // Binary search: which line does offset `at` fall in? `starts` is a line
  // index — the pack's own, or the search body's, which has the same lines.
  Reader.prototype.indexAt = function (starts, at) {
    var lo = 0, hi = starts.length - 2;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= at) lo = mid; else hi = mid - 1;
    }
    return lo;
  };

  /* The pack's body as it READS, plus a line index into it.
   *
   * Searching pack.body directly misses every phrase that crosses an inline
   * mark — a note anchor, a red-letter boundary, a poetry break — and a third
   * of WEB's verses and two thirds of KJV's carry at least one. Render.searchable
   * removes them without touching \n, so this string has the body's line count
   * and line N is still verse N; only the offsets within a line move, which is
   * why it needs its own starts array rather than reusing pack._starts.
   *
   * Built once per pack and kept, like the lower-cased body it replaces: it is
   * the same size as the body (smaller, in fact) and costs one pass. */
  Reader.prototype.searchBody = function (pack) {
    if (pack._search) return pack._search;
    var text = Render.searchable(pack.body);
    var n = 1;
    for (var i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) n++;
    var starts = new Int32Array(n + 1);
    var k = 1;
    for (var j = text.indexOf('\n'); j >= 0; j = text.indexOf('\n', j + 1)) starts[k++] = j + 1;
    starts[n] = text.length + 1;
    pack._search = { text: text, starts: starts };
    return pack._search;
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
