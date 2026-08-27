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

    body.addEventListener('click', function (ev) {
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
    document.addEventListener('keydown', function (ev) {
      if (ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
      if (ev.key === 'ArrowRight') self.step(1);
      else if (ev.key === 'ArrowLeft') self.step(-1);
      else if (ev.key === 'Escape') self.closeSheets();
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
