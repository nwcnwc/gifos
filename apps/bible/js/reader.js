/* The reader: one object that owns the screen.
 *
 * Layout model: COLUMNS. One column is ordinary reading; adding a second (or
 * third) puts translations side by side, scrolled together, each column one
 * translation. The columns all show the SAME reference, mapped between
 * versification traditions when the translations count differently — that
 * mapping is the whole reason parallel reading works across a Greek psalter
 * and an English one.
 *
 * Everything the person does funnels through go()/setColumns()/openSheet(),
 * so there is one place state changes and one place it is saved.
 */
(function (root) {
  'use strict';

  var Render = root.GifosBibleRender;
  var Refs = root.GifosRefs;
  var Versify = root.GifosVersify;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function Reader(opts) {
    this.lib = opts.library;
    this.store = opts.store;
    this.prefs = opts.prefs;
    this.at = this.prefs.at || { code: 'JHN', chapter: 1, verse: 1 };
    this.columns = (this.prefs.columns || ['engwebp']).slice(0, 3);
    this.marks = Object.create(null);       // "CODE.c.v" -> mark record
    this.following = false;                  // a leader is driving and we accept it
    this.leaderSeen = null;
    this.speaking = null;                    // read-aloud state
    this._sheets = [];
    this._bind();
  }

  /* ---------------- state ---------------- */

  Reader.prototype.pack = function (i) {
    return this.lib.opened(this.columns[i || 0]);
  };

  // Move everyone-visible state: the place being read. Saves prefs, repaints,
  // and — when this person is allowed to steer — moves the shared cursor too.
  Reader.prototype.go = function (ref, opts) {
    opts = opts || {};
    this.at = { code: ref.code, chapter: ref.chapter, verse: ref.verse || 0 };
    this.stopSpeaking();
    this.paint();
    if (!opts.silent) {
      this.store.savePrefs({ at: this.at });
      this.store.setCursor(this.at, this.columns[0]);
    }
    if (opts.flash && ref.verse) this.flash(ref);
  };

  Reader.prototype.setColumns = function (ids) {
    this.columns = ids.slice(0, 3);
    this.store.savePrefs({ columns: this.columns });
    this.paint();
  };

  /* ---------------- painting ---------------- */

  Reader.prototype.paint = function () {
    var cols = document.getElementById('cols');
    var self = this;
    clear(cols);
    cols.className = this.columns.length === 1 ? 'one' : '';

    var placeRef = document.getElementById('place-ref');
    var transName = document.getElementById('trans-name');
    var first = this.pack(0);
    if (first) {
      var names = this.namesOf(first);
      placeRef.textContent = Refs.format(
        { code: this.at.code, chapter: this.at.chapter }, { names: names, style: 'short' });
      transName.textContent = first.name || first.id;
      document.title = placeRef.textContent + ' — Bible';
    }

    for (var i = 0; i < this.columns.length; i++) {
      cols.appendChild(this.paintColumn(i));
    }

    // Arrival from a chapter change lands at the top, or at the verse asked for.
    var page = document.getElementById('page');
    if (this.at.verse > 1) {
      var target = cols.querySelector('.v[data-v="' + this.at.verse + '"]');
      if (target) {
        target.scrollIntoView({ block: 'center' });
      } else page.scrollTop = 0;
    } else page.scrollTop = 0;

    this.paintPlanFoot();
    void self;
  };

  Reader.prototype.namesOf = function (pack) {
    var names = {};
    for (var i = 0; i < pack.books.length; i++) {
      var b = pack.books[i];
      if (b.name) names[b.code] = { name: b.name, abbr: b.abbr || b.name };
    }
    return names;
  };

  // The reference each column shows: the first column's tradition is the
  // reference tradition; the rest map into their own counting.
  Reader.prototype.refForColumn = function (i) {
    var base = this.pack(0), here = this.pack(i);
    if (!base || !here || i === 0) return { ref: this.at, exact: true };
    var from = base.header.versification || 'kjv';
    var to = here.header.versification || 'kjv';
    if (from === to || !Versify || !Versify.differs(this.at.code, from, to)) {
      return { ref: this.at, exact: true };
    }
    var m = Versify.map({ code: this.at.code, chapter: this.at.chapter, verse: this.at.verse || 1 }, from, to);
    if (!m) return { ref: null, exact: false };
    return { ref: m, exact: m.exact !== false };
  };

  Reader.prototype.paintColumn = function (i) {
    var self = this;
    var col = el('div', 'col');
    var pack = this.pack(i);
    if (!pack) {
      col.appendChild(el('div', 'empty', 'This translation is still loading.'));
      return col;
    }
    col.setAttribute('dir', pack.dir === 'rtl' ? 'rtl' : 'ltr');
    col.setAttribute('lang', pack.lang || '');

    if (this.columns.length > 1) {
      var head = el('div', 'col-head');
      var label = el('span', '', pack.name || pack.id);
      var drop = el('button', 'drop');
      drop.type = 'button';
      drop.textContent = '✕';
      drop.title = 'Close this column';
      drop.addEventListener('click', function () {
        var ids = self.columns.slice();
        ids.splice(i, 1);
        self.setColumns(ids);
      });
      head.appendChild(label);
      head.appendChild(drop);
      col.appendChild(head);
    }

    var m = this.refForColumn(i);
    if (!m.ref) {
      col.appendChild(el('div', 'empty',
        'This passage does not exist in ' + (pack.name || pack.id) + ' — the two texts divide it differently.'));
      return col;
    }
    var ch = pack.chapter(m.ref.code, m.ref.chapter);
    if (!ch) {
      var b = pack.byCode[m.ref.code];
      var msg = b
        ? 'Chapter ' + m.ref.chapter + ' is not in this copy of ' + (b.name || m.ref.code) + '.'
        : (pack.name || pack.id) + ' does not carry this book.';
      var empt = el('div', 'empty');
      empt.appendChild(el('strong', '', pack.name || pack.id));
      empt.appendChild(document.createTextNode(msg));
      col.appendChild(empt);
      return col;
    }

    var title = el('h1', 'book-title', ch.name);
    var sub = el('p', 'book-sub', (pack.name || pack.id) +
      (m.exact ? '' : ' — numbered its own way here'));
    col.appendChild(title);
    col.appendChild(sub);

    var body = el('div', 'chapter');
    var cnum = el('span', 'cnum', String(m.ref.chapter));
    body.appendChild(cnum);

    var markMap = {};
    for (var k in this.marks) {
      var rec = this.marks[k];
      if (rec.code !== m.ref.code || rec.chapter !== m.ref.chapter || !rec.colour) continue;
      var idx = pack.indexOfVerse(rec.code, rec.chapter, rec.verse);
      if (idx >= 0) markMap[idx] = rec.colour;
    }

    body.appendChild(Render.chapter(ch, {
      mode: this.prefs.mode,
      redLetter: this.prefs.redLetter,
      showNotes: this.prefs.notes,
      showHeadings: this.prefs.headings,
      marks: markMap
    }));

    // Note dots: a verse with the reader's own note gets a dotted underline.
    for (var k2 in this.marks) {
      var r2 = this.marks[k2];
      if (r2.code !== m.ref.code || r2.chapter !== m.ref.chapter || (!r2.note && !r2.voice)) continue;
      var i2 = pack.indexOfVerse(r2.code, r2.chapter, r2.verse);
      var spans = body.querySelectorAll('.v[data-i="' + i2 + '"]');
      for (var s2 = 0; s2 < spans.length; s2++) spans[s2].classList.add('hasnote');
    }

    self.applySpanHighlights(body, pack, m.ref.code, m.ref.chapter);

    body.addEventListener('click', function (ev) {
      if (ev.target.closest('#hl-bar')) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed && String(sel).replace(/\s/g, '')) return;
      var mark = ev.target.closest('mark.hl-span');
      if (mark) {
        self.showHighlightBarForMark(mark, pack);
        return;
      }
      var a = ev.target.closest('.anchor');
      if (a) {
        self.openNoteSheet(pack, +a.getAttribute('data-i'),
          a.hasAttribute('data-note') ? 'note' : 'xref',
          +(a.getAttribute('data-note') || a.getAttribute('data-xref')));
        return;
      }
      var v = ev.target.closest('.v');
      if (v) self.openVerseSheet(pack, +v.getAttribute('data-i'));
    });

    col.appendChild(body);

    var cr = el('p', 'book-sub', pack.copyright === 'public domain'
      ? 'Public domain · ' + (pack.title || pack.name)
      : (pack.copyright || ''));
    cr.style.marginTop = '2.5rem';
    col.appendChild(cr);
    return col;
  };

  Reader.prototype.flash = function (ref) {
    var pack = this.pack(0);
    if (!pack) return;
    var idx = pack.indexOfVerse(ref.code, ref.chapter, ref.verse);
    var spans = document.querySelectorAll('#cols .v[data-i="' + idx + '"]');
    for (var i = 0; i < spans.length; i++) spans[i].classList.add('sel');
    setTimeout(function () {
      for (var i = 0; i < spans.length; i++) spans[i].classList.remove('sel');
    }, 2400);
  };

  /* ---------------- navigation ---------------- */

  Reader.prototype.step = function (dir) {
    var pack = this.pack(0);
    if (!pack) return;
    var nums = pack.chapterNumbers(this.at.code);
    var slot = nums.indexOf(this.at.chapter);
    if (slot < 0) slot = 0;
    if (dir > 0 && slot + 1 < nums.length) {
      this.go({ code: this.at.code, chapter: nums[slot + 1] });
      return;
    }
    if (dir < 0 && slot > 0) {
      this.go({ code: this.at.code, chapter: nums[slot - 1] });
      return;
    }
    // Off the end of the book: the next or previous book THIS text carries.
    var order = pack.books.map(function (b) { return b.code; });
    var bi = order.indexOf(this.at.code);
    var nb = order[bi + dir];
    if (!nb) return;
    var nnums = pack.chapterNumbers(nb);
    this.go({ code: nb, chapter: dir > 0 ? nnums[0] : nnums[nnums.length - 1] });
  };

  /* ---------------- sheets ---------------- */

  Reader.prototype.openSheet = function (id) {
    this.closeSheets();
    document.getElementById('scrim').hidden = false;
    var s = document.getElementById(id);
    s.hidden = false;
    this._sheets.push(id);
    var input = s.querySelector('input[type="search"]');
    if (input && window.matchMedia('(min-width: 720px)').matches) input.focus();
  };

  Reader.prototype.closeSheets = function () {
    this.hideHighlightBar();
    document.getElementById('scrim').hidden = true;
    var sheets = document.querySelectorAll('.sheet');
    for (var i = 0; i < sheets.length; i++) sheets[i].hidden = true;
    this._sheets = [];
  };

  Reader.prototype.sheetOpen = function () { return this._sheets.length > 0; };

  /* -------- books & chapters -------- */

  Reader.prototype.openPlaceSheet = function () {
    var self = this;
    var pack = this.pack(0);
    if (!pack) return;
    var tabs = document.getElementById('place-tabs');
    var bookGrid = document.getElementById('book-grid');
    var chapGrid = document.getElementById('chap-grid');
    clear(tabs); clear(bookGrid); clear(chapGrid);
    chapGrid.hidden = true; bookGrid.hidden = false;

    var sections = [['ot', 'Old'], ['dc', 'Apocrypha'], ['nt', 'New']];
    var table = Refs.books();
    var sectOf = {};
    for (var t = 0; t < table.length; t++) sectOf[table[t].code] = table[t].sect;
    var have = { ot: [], dc: [], nt: [] };
    for (var i = 0; i < pack.books.length; i++) {
      var b = pack.books[i];
      (have[sectOf[b.code]] || have.ot).push(b);
    }

    var current = have.nt.length && sectOf[this.at.code] === 'nt' ? 'nt'
                : sectOf[this.at.code] || 'ot';
    var drawBooks = function (sect) {
      clear(bookGrid);
      chapGrid.hidden = true; bookGrid.hidden = false;
      var list = have[sect];
      for (var i = 0; i < list.length; i++) {
        (function (b) {
          var btn = el('button', '', b.name || b.code);
          btn.type = 'button';
          btn.addEventListener('click', function () { drawChaps(b); });
          bookGrid.appendChild(btn);
        })(list[i]);
      }
    };
    var drawChaps = function (b) {
      clear(chapGrid);
      bookGrid.hidden = true; chapGrid.hidden = false;
      var back = el('div', 'back-row');
      var bb = el('button', 'link', '‹ Books');
      bb.type = 'button';
      bb.addEventListener('click', function () { drawBooks(currentSect()); });
      back.appendChild(bb);
      back.appendChild(el('strong', '', b.name || b.code));
      chapGrid.appendChild(back);
      var nums = pack.chapterNumbers(b.code);
      // A single-chapter book needs no second tap.
      if (nums.length === 1) {
        self.closeSheets();
        self.go({ code: b.code, chapter: nums[0] });
        return;
      }
      for (var i = 0; i < nums.length; i++) {
        (function (n) {
          var btn = el('button', '', String(n));
          btn.type = 'button';
          if (b.code === self.at.code && n === self.at.chapter) btn.setAttribute('aria-current', 'true');
          btn.addEventListener('click', function () {
            self.closeSheets();
            self.go({ code: b.code, chapter: n });
          });
          chapGrid.appendChild(btn);
        })(nums[i]);
      }
    };
    var currentSect = function () {
      var sel = tabs.querySelector('[aria-selected="true"]');
      return sel ? sel.getAttribute('data-sect') : 'ot';
    };

    for (var s = 0; s < sections.length; s++) {
      (function (sect, label) {
        if (!have[sect].length) return;
        var b = el('button', '', label);
        b.type = 'button';
        b.setAttribute('data-sect', sect);
        b.setAttribute('aria-selected', sect === current ? 'true' : 'false');
        b.addEventListener('click', function () {
          var all = tabs.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-selected', 'false');
          b.setAttribute('aria-selected', 'true');
          drawBooks(sect);
        });
        tabs.appendChild(b);
      })(sections[s][0], sections[s][1]);
    }
    drawBooks(current);
    this.openSheet('sheet-place');
  };

  /* -------- translations -------- */

  Reader.prototype.openTransSheet = function (slot) {
    var self = this;
    this._transSlot = slot === undefined ? 0 : slot;
    var seg = document.getElementById('trans-slot');
    clear(seg);
    var labels = ['Reading', 'Beside it', 'Third'];
    for (var i = 0; i < 3; i++) {
      (function (i) {
        var b = el('button', '', i < self.columns.length
          ? labels[i] + ' · ' + (self.lib.byId[self.columns[i]] || {}).name
          : '+ ' + labels[i]);
        b.type = 'button';
        b.setAttribute('aria-selected', i === self._transSlot ? 'true' : 'false');
        b.addEventListener('click', function () {
          self._transSlot = i;
          var all = seg.querySelectorAll('button');
          for (var j = 0; j < all.length; j++) all[j].setAttribute('aria-selected', 'false');
          b.setAttribute('aria-selected', 'true');
        });
        seg.appendChild(b);
      })(i);
      if (i === this.columns.length) break;   // offer one empty slot, not two
    }
    this.paintTransList('');
    var filter = document.getElementById('trans-filter');
    filter.value = '';
    filter.oninput = function () { self.paintTransList(filter.value); };
    document.getElementById('trans-foot').textContent =
      'Every translation here is in the public domain. Each downloads once and then works offline.';
    this.openSheet('sheet-trans');
  };

  Reader.prototype.paintTransList = function (q) {
    var self = this;
    var list = document.getElementById('trans-list');
    clear(list);
    q = (q || '').toLowerCase();
    var groups = this.lib.byLanguage();
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var rows = [];
      for (var i = 0; i < grp.texts.length; i++) {
        var t = grp.texts[i];
        var hay = (t.language + ' ' + (t.languageNative || '') + ' ' + t.name + ' ' + (t.title || '') + ' ' + t.id).toLowerCase();
        if (q && hay.indexOf(q) < 0) continue;
        rows.push(t);
      }
      if (!rows.length) continue;
      var div = el('div', 'lang-group');
      div.appendChild(el('h3', 'lang-name', grp.language +
        (grp.native && grp.native !== grp.language ? ' · ' + grp.native : '')));
      for (var r = 0; r < rows.length; r++) {
        (function (t) {
          var row = el('button', 'trans-row');
          row.type = 'button';
          if (self.columns[self._transSlot] === t.id) row.setAttribute('aria-current', 'true');
          var tn = el('span', 'tn');
          tn.appendChild(el('span', 't1', t.name));
          var scope = t.books >= 66 ? 'Whole Bible' : t.books >= 39 ? 'Old Testament'
                    : t.books >= 27 ? 'New Testament' : t.books + (t.books === 1 ? ' book' : ' books');
          tn.appendChild(el('span', 't2', scope + ' · ' + t.verses.toLocaleString() + ' verses'));
          row.appendChild(tn);
          var badge = el('span', 'badge' + (self.lib.isHere(t.id) ? ' here' : ''),
            self.lib.isHere(t.id) ? 'On this device' : Math.max(1, Math.round(t.bytes / 1048576)) + ' MB');
          row.appendChild(badge);
          row.addEventListener('click', function () { self.chooseTranslation(t.id); });
          div.appendChild(row);
        })(rows[r]);
      }
      list.appendChild(div);
    }
    if (!list.firstChild) list.appendChild(el('div', 'empty', 'Nothing matches that.'));
  };

  Reader.prototype.chooseTranslation = function (id) {
    var self = this;
    var toast = this.toast('Opening…', true);
    this.lib.load(id, function (note, frac) {
      if (note) toast.textContent = note + (frac ? ' · ' + Math.round(frac * 100) + '%' : '');
    }).then(function () {
      self.hideToast();
      var ids = self.columns.slice();
      ids[self._transSlot] = id;
      // The same translation twice is a mistake worth absorbing quietly.
      for (var i = 0; i < ids.length; i++) {
        if (i !== self._transSlot && ids[i] === id) ids.splice(i, 1);
      }
      self.closeSheets();
      self.setColumns(ids);
      var installed = self.prefs.installed || [];
      if (installed.indexOf(id) < 0) {
        installed = installed.concat([id]);
        self.store.savePrefs({ installed: installed });
      }
    }).catch(function (e) {
      self.hideToast();
      self.toast(e && e.message ? e.message : 'That translation could not be opened.');
    });
  };

  /* -------- toasts -------- */

  Reader.prototype.toast = function (text, sticky) {
    var t = document.getElementById('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this._toastT);
    if (!sticky) {
      var self = this;
      this._toastT = setTimeout(function () { self.hideToast(); }, 3200);
    }
    return t;
  };
  Reader.prototype.hideToast = function () { document.getElementById('toast').hidden = true; };

  /* ---------------- Kindle-style highlight bar ----------------
   * Select any words in the chapter or a footnote and a small colour menu
   * appears on top of the selection. A tap without a selection still opens
   * the verse sheet. */

  Reader.prototype.applySpanHighlights = function (body, pack, code, chapter) {
    var groups = Object.create(null);
    for (var k in this.marks) {
      var rec = this.marks[k];
      if ((rec.kind !== 'span' && rec.kind !== 'fn') || !rec.colour) continue;
      if (rec.code !== code || rec.chapter !== chapter) continue;
      if (rec.pack && rec.pack !== pack.id) continue;
      if (rec.fn != null) continue;
      var key = String(rec.verse);
      (groups[key] || (groups[key] = [])).push(rec);
    }
    for (var verse in groups) {
      var els = body.querySelectorAll('.v[data-v="' + verse + '"]');
      if (!els.length) continue;
      var recs = groups[verse];
      recs.sort(function (a, b) { return b.start - a.start; });
      for (var i = 0; i < recs.length; i++) {
        Render.wrapOffsetsMany(els, recs[i].start, recs[i].end, recs[i].colour, recs[i].id);
      }
    }
  };

  Reader.prototype.applyFootnoteHighlights = function (el, spec) {
    var recs = [];
    for (var k in this.marks) {
      var rec = this.marks[k];
      if (rec.kind !== 'fn' || rec.fn !== spec.fn) continue;
      if (rec.code !== spec.code || rec.chapter !== spec.chapter || rec.verse !== spec.verse) continue;
      if (rec.pack && spec.pack && rec.pack !== spec.pack) continue;
      recs.push(rec);
    }
    recs.sort(function (a, b) { return b.start - a.start; });
    for (var i = 0; i < recs.length; i++) {
      Render.wrapOffsets(el, recs[i].start, recs[i].end, recs[i].colour, recs[i].id);
    }
  };

  Reader.prototype.selectionSpecs = function () {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var quote = String(sel).replace(/\s+/g, ' ').trim();
    if (!quote) return null;
    var range = sel.getRangeAt(0);
    var a = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentNode;
    if (!a || !a.closest) return null;
    if (a.closest('input, textarea, #bar, #foot, #hl-bar')) return null;

    var fn = a.closest('.note-item');
    if (fn && fn.contains(range.endContainer)) {
      var s = Render.offsetOf(fn, range.startContainer, range.startOffset);
      var e = Render.offsetOf(fn, range.endContainer, range.endOffset);
      if (s < 0 || e < 0) return null;
      if (e < s) { var t = s; s = e; e = t; }
      if (!(e > s)) return null;
      return {
        quote: quote, rect: range.getBoundingClientRect(),
        specs: [{
          kind: 'fn', pack: fn.getAttribute('data-pack'),
          code: fn.getAttribute('data-code'), chapter: +fn.getAttribute('data-ch'),
          verse: +fn.getAttribute('data-v'), fn: +fn.getAttribute('data-n'),
          start: s, end: e, quote: quote
        }]
      };
    }

    var chapter = a.closest('.chapter');
    if (!chapter) return null;
    var pack = this.pack(0);
    var col = a.closest('.col');
    if (col) {
      var cols = document.querySelectorAll('#cols .col');
      for (var ci = 0; ci < cols.length; ci++) if (cols[ci] === col) pack = this.pack(ci);
    }
    if (!pack) return null;

    var vs = chapter.querySelectorAll('.v');
    var byI = Object.create(null), order = [];
    for (var i = 0; i < vs.length; i++) {
      if (!this._rangeTouches(range, vs[i])) continue;
      var id = vs[i].getAttribute('data-i');
      if (!byI[id]) { byI[id] = []; order.push(id); }
      byI[id].push(vs[i]);
    }
    if (!order.length) return null;
    var specs = [];
    for (var o = 0; o < order.length; o++) {
      var els = byI[order[o]];
      var clip = this._clipToEls(range, els);
      if (!clip) continue;
      var ref = pack.refOf(+els[0].getAttribute('data-i'));
      if (!ref) continue;
      specs.push({
        kind: 'span', pack: pack.id, code: ref.code, chapter: ref.chapter, verse: ref.verse,
        start: clip.start, end: clip.end, quote: quote
      });
    }
    if (!specs.length) return null;
    return { quote: quote, rect: range.getBoundingClientRect(), specs: specs };
  };

  Reader.prototype._rangeTouches = function (range, el) {
    if (range.intersectsNode) {
      try { return range.intersectsNode(el); } catch (e) { /* fall through */ }
    }
    var r = document.createRange();
    r.selectNodeContents(el);
    return range.compareBoundaryPoints(Range.END_TO_START, r) < 0 &&
           range.compareBoundaryPoints(Range.START_TO_END, r) > 0;
  };

  Reader.prototype._clipToEls = function (range, els) {
    var pos = 0, start = -1, end = -1, total = 0;
    for (var i = 0; i < els.length; i++) {
      var t = Render.collectText(els[i]);
      for (var j = 0; j < t.pieces.length; j++) {
        var p = t.pieces[j];
        if (p.node === range.startContainer) start = pos + p.start + range.startOffset;
        if (p.node === range.endContainer) end = pos + p.start + range.endOffset;
      }
      pos += t.length;
      total = pos;
    }
    if (start < 0) start = 0;
    if (end < 0) end = total;
    if (end < start) { var x = start; start = end; end = x; }
    if (end > total) end = total;
    if (!(end > start)) return null;
    return { start: start, end: end };
  };

  Reader.prototype.showHighlightBar = function (got) {
    var bar = document.getElementById('hl-bar');
    if (!bar || !got || !got.specs || !got.specs.length) return;
    this._hlPending = got;
    bar.hidden = false;
    var rect = got.rect || { left: 0, top: 0, width: 0, height: 0, bottom: 0 };
    var w = bar.offsetWidth || 240, h = bar.offsetHeight || 44;
    var x = rect.left + rect.width / 2;
    var y = rect.top - h - 10;
    if (y < 8) y = (rect.bottom || 0) + 10;
    x = Math.max(w / 2 + 8, Math.min((window.innerWidth || 320) - w / 2 - 8, x));
    y = Math.max(8, Math.min((window.innerHeight || 480) - h - 8, y));
    bar.style.left = x + 'px';
    bar.style.top = y + 'px';
    var cn = this.prefs.colourNames || {};
    var btns = bar.querySelectorAll('button[data-hl]');
    for (var i = 0; i < btns.length; i++) {
      var c = btns[i].getAttribute('data-hl');
      if (c) btns[i].title = cn[c] || c;
    }
  };

  Reader.prototype.hideHighlightBar = function () {
    var bar = document.getElementById('hl-bar');
    if (bar) bar.hidden = true;
    this._hlPending = null;
  };

  Reader.prototype.showHighlightBarForMark = function (mark, pack) {
    var id = mark.getAttribute('data-hid');
    var rec = id && this.marks[id];
    var rect = mark.getBoundingClientRect();
    var spec;
    if (rec) {
      spec = {
        kind: rec.kind, pack: rec.pack || (pack && pack.id), code: rec.code,
        chapter: rec.chapter, verse: rec.verse, fn: rec.fn,
        start: rec.start, end: rec.end, quote: rec.quote || mark.textContent, id: rec.id
      };
    } else {
      spec = { quote: mark.textContent, id: id };
    }
    this.showHighlightBar({ quote: spec.quote, rect: rect, specs: [spec], existing: id });
  };

  Reader.prototype._bindHighlight = function () {
    var self = this;
    var bar = document.getElementById('hl-bar');
    if (!bar) return;
    var wait = null;
    document.addEventListener('selectionchange', function () {
      clearTimeout(wait);
      wait = setTimeout(function () {
        var got = self.selectionSpecs();
        if (got) self.showHighlightBar(got);
      }, 50);
    });
    bar.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
    bar.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b || !self._hlPending) return;
      var pending = self._hlPending;
      var act = b.getAttribute('data-act');
      var colour = b.getAttribute('data-hl');
      if (act === 'copy') {
        self.copy(pending.quote || '');
        self.hideHighlightBar();
        if (window.getSelection) window.getSelection().removeAllRanges();
        return;
      }
      var specs = pending.specs || [];
      var chain = Promise.resolve();
      for (var i = 0; i < specs.length; i++) {
        (function (spec) {
          chain = chain.then(function () { return self.store.setSpan(spec, colour || ''); });
        })(specs[i]);
      }
      chain.then(function () {
        self.hideHighlightBar();
        if (window.getSelection) window.getSelection().removeAllRanges();
        if (colour) self.toast('Highlighted — it stays in this app on this device.');
      });
    });
    document.addEventListener('pointerdown', function (ev) {
      if (bar.hidden) return;
      if (bar.contains(ev.target)) return;
      if (window.getSelection && !window.getSelection().isCollapsed) return;
      self.hideHighlightBar();
    });
  };

  /* ---------------- wiring ---------------- */

  Reader.prototype._bind = function () {
    var self = this;
    document.getElementById('b-place').addEventListener('click', function () { self.openPlaceSheet(); });
    document.getElementById('b-trans').addEventListener('click', function () { self.openTransSheet(0); });
    document.getElementById('b-search').addEventListener('click', function () { self.openSearchSheet(); });
    document.getElementById('b-more').addEventListener('click', function () { self.openMoreSheet(); });
    document.getElementById('b-prev').addEventListener('click', function () { self.step(-1); });
    document.getElementById('b-next').addEventListener('click', function () { self.step(1); });
    document.getElementById('b-plan').addEventListener('click', function () { self.openPlanSheet(); });
    document.getElementById('scrim').addEventListener('click', function () { self.closeSheets(); });
    var closes = document.querySelectorAll('[data-close]');
    for (var i = 0; i < closes.length; i++) {
      closes[i].addEventListener('click', function () { self.closeSheets(); });
    }
    document.getElementById('follow-off').addEventListener('click', function () {
      self.following = false;
      document.getElementById('follow').hidden = true;
    });
    this._bindHighlight();
    document.addEventListener('keydown', function (ev) {
      if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
      if (ev.key === 'ArrowRight') self.step(1);
      else if (ev.key === 'ArrowLeft') self.step(-1);
      else if (ev.key === 'Escape') { self.hideHighlightBar(); self.closeSheets(); }
      else if (ev.key === '/') { ev.preventDefault(); self.openSearchSheet(); }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (self.sheetOpen()) self.closeSheets();
        else self.step(-1);
      });
    }
  };

  root.GifosBibleReader = { Reader: Reader, el: el, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
