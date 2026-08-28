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
    this._back = [];
    this._fwd = [];
    this._bind();
  }

  function copyAt(at) {
    return { code: at.code, chapter: at.chapter, verse: at.verse || 0 };
  }
  function sameAt(a, b) {
    return !!(a && b && a.code === b.code && a.chapter === b.chapter &&
      (a.verse || 0) === (b.verse || 0));
  }

  /* ---------------- state ---------------- */

  Reader.prototype.pack = function (i) {
    return this.lib.opened(this.columns[i || 0]);
  };

  // Move everyone-visible state: the place being read. Saves prefs, repaints,
  // and — when this person is allowed to steer — moves the shared cursor too.
  Reader.prototype.go = function (ref, opts) {
    opts = opts || {};
    var next = { code: ref.code, chapter: ref.chapter, verse: ref.verse || 0 };
    if (opts.jump && !opts.hist) this.recordJump(next);
    this.at = next;
    this.stopSpeaking();
    this.paint();
    this.paintHist();
    if (!opts.silent) {
      this.store.savePrefs({ at: this.at });
      this.store.setCursor(this.at, this.columns[0]);
    }
    if (opts.flash && ref.verse) this.flash(ref);
  };

  // A jump is a tap on a Treasury link, a search hit, a book, a plan — not
  // ‹ › turning the page. Back and Forward retrace those jumps only.
  Reader.prototype.recordJump = function (next) {
    if (sameAt(this.at, next)) return;
    this._back.push(copyAt(this.at));
    if (this._back.length > 80) this._back.shift();
    this._fwd = [];
  };

  Reader.prototype.histLabel = function (ref) {
    var pack = this.pack(0);
    var names = pack ? this.namesOf(pack) : {};
    var r = { code: ref.code, chapter: ref.chapter };
    if (ref.verse) r.verse = ref.verse;
    return Refs.format(r, { names: names, style: 'short' });
  };

  Reader.prototype.paintHist = function () {
    var back = document.getElementById('b-back');
    var fwd = document.getElementById('b-fwd');
    if (!back || !fwd) return;
    var b = this._back.length ? this._back[this._back.length - 1] : null;
    var f = this._fwd.length ? this._fwd[this._fwd.length - 1] : null;
    back.disabled = !b;
    fwd.disabled = !f;
    back.title = b ? 'Back to ' + this.histLabel(b) : 'Back';
    fwd.title = f ? 'Forward to ' + this.histLabel(f) : 'Forward';
    back.setAttribute('aria-label', back.title);
    fwd.setAttribute('aria-label', fwd.title);
  };

  Reader.prototype.histBack = function () {
    if (!this._back.length) return;
    this._fwd.push(copyAt(this.at));
    var dest = this._back.pop();
    this.go(dest, { flash: !!dest.verse, hist: true });
  };

  Reader.prototype.histFwd = function () {
    if (!this._fwd.length) return;
    this._back.push(copyAt(this.at));
    var dest = this._fwd.pop();
    this.go(dest, { flash: !!dest.verse, hist: true });
  };

  Reader.prototype.setColumns = function (ids) {
    this.columns = ids.slice(0, 3);
    this.store.savePrefs({ columns: this.columns });
    this.paint();
  };

  /* ---------------- painting ---------------- */

  Reader.prototype.paint = function (opts) {
    opts = opts || {};
    var cols = document.getElementById('cols');
    var page = document.getElementById('page');
    var hold = opts.keepScroll && page ? page.scrollTop : null;
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

    // A highlight rewrite must not yank the chapter back to the top (or to
    // `at.verse`). Navigation still lands at the verse asked for.
    if (hold != null) {
      page.scrollTop = hold;
    } else if (this.at.verse > 1) {
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

    var title = el('button', 'book-title', ch.name);
    title.type = 'button';
    title.title = 'Commentary on this book';
    title.addEventListener('click', function () {
      self.openScopeSheet(pack, { code: m.ref.code, chapter: m.ref.chapter, verse: 1 }, 'book');
    });
    var sub = el('p', 'book-sub', (pack.name || pack.id) +
      (m.exact ? '' : ' — numbered its own way here'));
    col.appendChild(title);
    col.appendChild(sub);

    var body = el('div', 'chapter');
    var cnum = el('button', 'cnum', String(m.ref.chapter));
    cnum.type = 'button';
    cnum.title = 'Commentary on this chapter';
    cnum.addEventListener('click', function (ev) {
      ev.stopPropagation();
      self.openScopeSheet(pack, { code: m.ref.code, chapter: m.ref.chapter, verse: 1 }, 'chapter');
    });
    body.appendChild(cnum);

    var markMap = {};
    for (var k in this.marks) {
      var rec = this.marks[k];
      if (rec.kind === 'span' || rec.kind === 'fn') continue;
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
    var noteText = root.GifosBibleStore && root.GifosBibleStore.noteText;
    for (var k2 in this.marks) {
      var r2 = this.marks[k2];
      if (r2.code !== m.ref.code || r2.chapter !== m.ref.chapter) continue;
      var shown = noteText ? noteText(r2, pack.id) : r2.note;
      if (!shown && !r2.voice) continue;
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
      if (ev.target.closest('.cnum')) return;
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
    var ta = s.querySelector('textarea');
    if (ta) {
      setTimeout(function () { try { ta.focus(); } catch (e) {} }, 40);
    } else {
      var input = s.querySelector('input[type="search"]');
      if (input && window.matchMedia('(min-width: 720px)').matches) input.focus();
    }
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
        self.go({ code: b.code, chapter: nums[0] }, { jump: true });
        return;
      }
      for (var i = 0; i < nums.length; i++) {
        (function (n) {
          var btn = el('button', '', String(n));
          btn.type = 'button';
          if (b.code === self.at.code && n === self.at.chapter) btn.setAttribute('aria-current', 'true');
          btn.addEventListener('click', function () {
            self.closeSheets();
            self.go({ code: b.code, chapter: n }, { jump: true });
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

  function mergeTouching(recs) {
    var list = recs.slice().sort(function (a, b) {
      if (a.colour !== b.colour) return a.colour < b.colour ? -1 : 1;
      return a.start - b.start;
    });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var last = out[out.length - 1];
      if (last && last.colour === r.colour && last.end >= r.start) {
        last.end = Math.max(last.end, r.end);
        if ((r.quote || '').length > (last.quote || '').length) last.quote = r.quote;
      } else {
        out.push({ id: r.id, colour: r.colour, start: r.start, end: r.end, quote: r.quote });
      }
    }
    return out;
  }

  Reader.prototype.applySpanHighlights = function (body, pack, code, chapter) {
    var recs = [];
    for (var k in this.marks) {
      var rec = this.marks[k];
      if ((rec.kind !== 'span' && rec.kind !== 'fn') || !rec.colour) continue;
      if (rec.code !== code || rec.chapter !== chapter) continue;
      if (rec.pack && rec.pack !== pack.id) continue;
      if (rec.fn != null) continue;
      recs.push(rec);
    }
    if (root.GifosBibleStore && root.GifosBibleStore.mergeSpanRecords) {
      recs = root.GifosBibleStore.mergeSpanRecords(recs);
    }
    recs.sort(function (a, b) {
      var aE = a.verseEnd != null ? a.verseEnd : a.verse;
      var bE = b.verseEnd != null ? b.verseEnd : b.verse;
      if (aE !== bE) return bE - aE;
      if (a.end !== b.end) return b.end - a.end;
      return b.verse - a.verse;
    });
    for (var i = 0; i < recs.length; i++) this._paintSpan(body, recs[i]);
  };

  Reader.prototype._paintSpan = function (body, rec) {
    var v0 = rec.verse;
    var v1 = rec.verseEnd != null ? rec.verseEnd : rec.verse;
    var vs = body.querySelectorAll('.v');
    var verseOff = Object.create(null);
    var chunks = [];
    var i, v, t;
    for (i = 0; i < vs.length; i++) {
      v = +vs[i].getAttribute('data-v');
      if (v < v0 || v > v1) continue;
      t = Render.collectText(vs[i]);
      if (verseOff[v] == null) verseOff[v] = 0;
      chunks.push({ el: vs[i], verse: v, vOffset: verseOff[v], length: t.length });
      verseOff[v] += t.length;
    }
    var ranges = [];
    for (i = 0; i < chunks.length; i++) {
      var c = chunks[i];
      var from = c.verse === v0 ? rec.start : 0;
      var to = c.verse === v1 ? rec.end : Infinity;
      var a = Math.max(from, c.vOffset);
      var b = Math.min(to, c.vOffset + c.length);
      if (b > a) ranges.push({ el: c.el, localStart: a - c.vOffset, localEnd: b - c.vOffset });
    }
    var runs = [], run = null;
    for (i = 0; i < ranges.length; i++) {
      var el = ranges[i].el;
      if (!run || run.parent !== el.parentNode) {
        run = { parent: el.parentNode, els: [], local: [] };
        runs.push(run);
      }
      run.els.push(el);
      run.local.push({ start: ranges[i].localStart, end: ranges[i].localEnd });
    }
    for (i = runs.length - 1; i >= 0; i--) {
      var r = runs[i];
      var pos = 0, catStart = -1, catEnd = -1;
      for (var j = 0; j < r.els.length; j++) {
        var len = Render.collectText(r.els[j]).length;
        var loc = r.local[j];
        if (catStart < 0) catStart = pos + loc.start;
        catEnd = pos + loc.end;
        pos += len;
      }
      if (catEnd > catStart) {
        Render.wrapOffsetsAcross(r.els, catStart, catEnd, rec.colour, rec.id);
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
    recs = mergeTouching(recs);
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
    var firstEl = null, lastEl = null, i;
    for (i = 0; i < vs.length; i++) {
      if (!this._rangeTouches(range, vs[i])) continue;
      if (!firstEl) firstEl = vs[i];
      lastEl = vs[i];
    }
    if (!firstEl) return null;
    var firstI = +firstEl.getAttribute('data-i');
    var lastI = +lastEl.getAttribute('data-i');
    var firstEls = [], lastEls = [];
    for (i = 0; i < vs.length; i++) {
      var id = +vs[i].getAttribute('data-i');
      if (id === firstI) firstEls.push(vs[i]);
      if (id === lastI) lastEls.push(vs[i]);
    }
    var startClip = this._clipToEls(range, firstEls);
    var endClip = firstI === lastI ? startClip : this._clipToEls(range, lastEls);
    if (!startClip || !endClip) return null;
    var ref0 = pack.refOf(firstI);
    var ref1 = pack.refOf(lastI);
    if (!ref0 || !ref1) return null;
    var spec = {
      kind: 'span', pack: pack.id, code: ref0.code, chapter: ref0.chapter,
      verse: ref0.verse, start: startClip.start, end: endClip.end, quote: quote
    };
    if (ref1.verse !== ref0.verse) spec.verseEnd = ref1.verse;
    return { quote: quote, rect: range.getBoundingClientRect(), specs: [spec] };
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
        chapter: rec.chapter, verse: rec.verse, verseEnd: rec.verseEnd, fn: rec.fn,
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
    document.getElementById('b-back').addEventListener('click', function () { self.histBack(); });
    document.getElementById('b-fwd').addEventListener('click', function () { self.histFwd(); });
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
    var noteSave = document.getElementById('note-save');
    if (noteSave) noteSave.addEventListener('click', function () { self.saveNote(); });
    var noteRm = document.getElementById('note-remove');
    if (noteRm) noteRm.addEventListener('click', function () { self.saveNote({ remove: true }); });
    var colourSave = document.getElementById('colour-save');
    if (colourSave) colourSave.addEventListener('click', function () { self.saveColours(); });
    document.addEventListener('keydown', function (ev) {
      if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
      if (ev.altKey && ev.key === 'ArrowLeft') { ev.preventDefault(); self.histBack(); }
      else if (ev.altKey && ev.key === 'ArrowRight') { ev.preventDefault(); self.histFwd(); }
      else if (ev.key === 'ArrowRight') self.step(1);
      else if (ev.key === 'ArrowLeft') self.step(-1);
      else if (ev.key === 'Escape') { self.hideHighlightBar(); self.closeSheets(); }
      else if (ev.key === '/') { ev.preventDefault(); self.openSearchSheet(); }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (self.sheetOpen()) self.closeSheets();
        else if (self._back.length) self.histBack();
        else self.step(-1);
      });
    }
    this.paintHist();
  };

  root.GifosBibleReader = { Reader: Reader, el: el, clear: clear };
})(typeof globalThis !== 'undefined' ? globalThis : this);
