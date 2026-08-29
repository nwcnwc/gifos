/* The reader, part three: settings and reading plans. */
(function (root) {
  'use strict';

  var Reader = root.GifosBibleReader.Reader;
  var el = root.GifosBibleReader.el;
  var clear = root.GifosBibleReader.clear;
  var Refs = root.GifosRefs;

  /* ---------------- settings ---------------- */

  Reader.prototype.openMoreSheet = function () {
    var self = this;
    var body = document.getElementById('more-body');
    clear(body);

    var row = function (label, hint) {
      var r = el('div', 'set-row');
      var l = el('div');
      l.appendChild(el('span', 'lbl', label));
      if (hint) l.appendChild(el('span', 'hint', hint));
      r.appendChild(l);
      body.appendChild(r);
      return r;
    };
    var seg = function (r, options, current, onPick) {
      var s = el('div', 'seg');
      options.forEach(function (o) {
        var b = el('button', '', o.label);
        b.type = 'button';
        b.setAttribute('aria-selected', o.value === current ? 'true' : 'false');
        b.addEventListener('click', function () {
          var all = s.querySelectorAll('button');
          for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-selected', 'false');
          b.setAttribute('aria-selected', 'true');
          onPick(o.value);
        });
        s.appendChild(b);
      });
      r.appendChild(s);
      return s;
    };
    var save = function (patch) {
      for (var k in patch) self.prefs[k] = patch[k];
      self.store.savePrefs(patch);
      root.GifosBibleChrome(self.prefs);
      self.paint();
    };

    // Theme.
    var themes = el('div', 'themes');
    [['night', '#14141c'], ['black', '#000'], ['paper', '#faf7f0'], ['sepia', '#f3e7d3']].forEach(function (t) {
      var b = el('button');
      b.type = 'button';
      b.style.background = t[1];
      b.title = t[0];
      b.setAttribute('aria-label', 'Theme: ' + t[0]);
      b.setAttribute('aria-pressed', self.prefs.theme === t[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        var all = themes.querySelectorAll('button');
        for (var i = 0; i < all.length; i++) all[i].setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-pressed', 'true');
        save({ theme: t[0] });
      });
      themes.appendChild(b);
    });
    row('Theme').appendChild(themes);

    seg(row('Type size'), [
      { value: Math.max(1, (self.prefs.size || 3) - 1), label: 'A−' },
      { value: Math.min(6, (self.prefs.size || 3) + 1), label: 'A+' }
    ], null, function (v) { save({ size: v }); self.openMoreSheet(); });

    seg(row('Typeface'), [
      { value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }
    ], self.prefs.face, function (v) { save({ face: v }); });

    seg(row('Layout', 'Paragraphs read like a book; verses stack one per line for study.'), [
      { value: 'paragraph', label: 'Paragraphs' }, { value: 'verse', label: 'Verses' }
    ], self.prefs.mode, function (v) { save({ mode: v }); });

    seg(row('Words of Christ', 'Shown in red where the translation marks them.'), [
      { value: true, label: 'Red' }, { value: false, label: 'Plain' }
    ], self.prefs.redLetter !== false, function (v) { save({ redLetter: v }); });

    seg(row('Footnotes', 'The translators’ own notes and cross references.'), [
      { value: true, label: 'Show' }, { value: false, label: 'Hide' }
    ], self.prefs.notes !== false, function (v) { save({ notes: v }); });

    seg(row('Section headings'), [
      { value: true, label: 'Show' }, { value: false, label: 'Hide' }
    ], self.prefs.headings !== false, function (v) { save({ headings: v }); });

    // The reader's own names for the highlight colours.
    var hlRow = row('Highlight names', 'Name the colours after what they mean to you — promises, commands, questions.');
    var edit = el('button', 'link', 'Rename');
    edit.type = 'button';
    edit.addEventListener('click', function () { self.renameColours(); });
    hlRow.appendChild(edit);

    if (this.canSpeak()) {
      seg(row('Follow along', 'Highlight each verse as it is read aloud.'), [
        { value: true, label: 'On' }, { value: false, label: 'Off' }
      ], self.prefs.readAlong !== false, function (v) { save({ readAlong: v }); });
    }

    // My notes and highlights, in one place.
    var marksRow = row('My highlights & notes');
    var marksBtn = el('button', 'link', 'Open');
    marksBtn.type = 'button';
    marksBtn.addEventListener('click', function () { self.openMarksList(); });
    marksRow.appendChild(marksBtn);

    // What this app is made of.
    var aboutRow = row('Translations & sources', 'Every text here is in the public domain; the sources say so themselves.');
    var aboutBtn = el('button', 'link', 'About');
    aboutBtn.type = 'button';
    aboutBtn.addEventListener('click', function () { self.openAbout(); });
    aboutRow.appendChild(aboutBtn);

    this.openSheet('sheet-more');
  };

  // A sandboxed app cannot raise window.prompt — the OS iframe has no
  // allow-modals — so the names are a sheet of fields, not six dialogs.
  var COLOUR_KEYS = ['amber', 'rose', 'sky', 'leaf', 'violet', 'under'];

  Reader.prototype.renameColours = function () {
    var cur = this.prefs.colourNames || {};
    for (var i = 0; i < COLOUR_KEYS.length; i++) {
      var key = COLOUR_KEYS[i];
      var inp = document.getElementById('cn-' + key);
      if (inp) inp.value = cur[key] || key;
    }
    this.openSheet('sheet-colours');
    var first = document.getElementById('cn-amber');
    if (first) setTimeout(function () { try { first.focus(); first.select(); } catch (e) {} }, 40);
  };

  Reader.prototype.saveColours = function () {
    var names = {};
    for (var i = 0; i < COLOUR_KEYS.length; i++) {
      var key = COLOUR_KEYS[i];
      var inp = document.getElementById('cn-' + key);
      var v = inp ? String(inp.value || '').trim() : '';
      names[key] = (v || key).slice(0, 24);
    }
    this.prefs.colourNames = names;
    this.store.savePrefs({ colourNames: names });
    this.openMoreSheet();
    this.toast('Your colour names are saved.');
  };

  Reader.prototype.openMarksList = function () {
    var self = this;
    var body = document.getElementById('more-body');
    clear(body);
    var back = el('div', 'back-row');
    var bb = el('button', 'link', '‹ Reading');
    bb.type = 'button';
    bb.addEventListener('click', function () { self.openMoreSheet(); });
    back.appendChild(bb);
    body.appendChild(back);

    var rows = [];
    for (var k in this.marks) rows.push(this.marks[k]);
    rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    if (!rows.length) {
      body.appendChild(el('div', 'empty', 'Nothing yet. Select any words to highlight them, or tap a verse to write a note.'));
      return;
    }
    var cn = this.prefs.colourNames || {};
    rows.forEach(function (m) {
      var btn = el('button', 'res');
      btn.type = 'button';
      var tag = m.colour ? (cn[m.colour] || m.colour) : '';
      btn.appendChild(el('span', 'r-ref',
        Refs.format({ code: m.code, chapter: m.chapter, verse: m.verse }, { style: 'short' }) +
        (tag ? ' · ' + tag : '') + (m.voice ? ' · voice note' : '') +
        (m.kind === 'fn' ? ' · footnote' : '')));
      if (m.quote) btn.appendChild(document.createTextNode('“' + m.quote.slice(0, 140) + '”'));
      else {
        var packId = self.pack(0) && self.pack(0).id;
        var shown = (root.GifosBibleStore && root.GifosBibleStore.noteText)
          ? root.GifosBibleStore.noteText(m, packId) : m.note;
        if (!shown && m.notes) {
          for (var pk in m.notes) { if (m.notes[pk]) { shown = m.notes[pk]; break; } }
        }
        if (shown) btn.appendChild(document.createTextNode(shown.slice(0, 140)));
      }
      btn.addEventListener('click', function () {
        if (!self.docked()) self.closeSheets();
        self.go({ code: m.code, chapter: m.chapter, verse: m.verse }, { flash: true, jump: true });
      });
      body.appendChild(btn);
    });
  };

  Reader.prototype.openAbout = function () {
    var self = this;
    var body = document.getElementById('more-body');
    clear(body);
    var back = el('div', 'back-row');
    var bb = el('button', 'link', '‹ Reading');
    bb.type = 'button';
    bb.addEventListener('click', function () { self.openMoreSheet(); });
    back.appendChild(bb);
    body.appendChild(back);

    body.appendChild(el('h3', 'lang-name', 'The texts'));
    body.appendChild(el('div', 'note-item',
      'Every translation in this app is in the public domain — the words belong to everyone. ' +
      'Texts come from eBible.org, whose catalog states the rights of each, and from ' +
      'individually researched historical editions. Each translation names its own ' +
      'status at the foot of the page.'));

    var credits = root.GIFOS_BIBLE_CREDITS || [];
    if (credits.length) {
      body.appendChild(el('h3', 'lang-name', 'Study apparatus'));
      credits.forEach(function (c) {
        body.appendChild(el('div', 'note-item',
          c.name + ' — ' + (c.license || '') + (c.attribution ? '. ' + c.attribution : '')));
      });
    }
    body.appendChild(el('h3', 'lang-name', 'Your data'));
    body.appendChild(el('div', 'note-item',
      'Highlights, notes, voice notes and reading plans stay on this device, inside ' +
      'this app. There is no account and no cloud. Press Save in the app bar to keep ' +
      'them with your copy; send that copy to someone and they open your Bible as you left it.'));
  };

  /* ---------------- reading plans ---------------- */

  Reader.prototype.paintPlanFoot = function () {
    var self = this;
    var label = document.getElementById('plan-label');
    this.store.plans().then(function (plans) {
      var active = plans.filter(function (p) { return !p.done_all; });
      if (!active.length) { label.textContent = 'Reading plan'; return; }
      var p = active[0];
      var today = self.planDayFor(p);
      var done = p.done && p.done[today];
      label.textContent = p.title + ' · day ' + today + (done ? ' ✓' : '');
    });
  };

  // Which day of the plan is "today": days since it started, starting at 1,
  // clamped to the plan's length. A reader behind schedule sees the next
  // UNREAD day rather than a guilt trip.
  Reader.prototype.planDayFor = function (p) {
    var start = new Date(p.startedOn + 'T00:00:00');
    var days = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
    var today = Math.max(1, Math.min(p.days, days));
    for (var d = 1; d <= today; d++) if (!p.done || !p.done[d]) return d;
    return today;
  };

  Reader.prototype.openPlanSheet = function () {
    var self = this;
    var body = document.getElementById('more-body');
    clear(body);
    this.openSheet('sheet-more');
    document.querySelector('#sheet-more h2').textContent = 'Reading plans';

    this.store.plans().then(function (mine) {
      if (mine.length) {
        mine.forEach(function (p) { self.planCard(body, p); });
      }
      body.appendChild(el('h3', 'lang-name', mine.length ? 'Start another' : 'Start a plan'));
      var offers = self.planOffers();
      offers.forEach(function (o) {
        var btn = el('button', 'res');
        btn.type = 'button';
        btn.appendChild(el('span', 'r-ref', o.title));
        btn.appendChild(document.createTextNode(o.blurb));
        btn.addEventListener('click', function () { self.startPlan(o); });
        body.appendChild(btn);
      });
    });
  };

  Reader.prototype.planOffers = function () {
    var offers = [];
    var App = root.GifosBibleApparatus;
    if (App) {
      App.start();
      var plans = App.plans();
      for (var i = 0; i < plans.length; i++) {
        var p = plans[i];
        offers.push({
          kind: p.id, title: p.name,
          blurb: p.note || (p.dayCount + ' days'),
          days: p.dayCount
        });
      }
    }
    // These two need no dataset: they are computed from the canon itself.
    offers.push({
      kind: 'gospels30', title: 'The Gospels in 30 days',
      blurb: 'Matthew, Mark, Luke and John — three chapters a day for a month.',
      days: 30
    });
    offers.push({
      kind: 'psalms31', title: 'A month of Psalms',
      blurb: 'Five psalms a day; the whole Psalter in a month.',
      days: 31
    });
    return offers;
  };

  Reader.prototype.startPlan = function (offer) {
    var self = this;
    var today = new Date();
    var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') +
              '-' + String(today.getDate()).padStart(2, '0');
    this.store.savePlan({
      id: 'plan_' + offer.kind,
      kind: offer.kind, title: offer.title,
      startedOn: iso, days: offer.days, done: {}
    }).then(function () {
      self.openPlanSheet();
      self.paintPlanFoot();
    });
  };

  Reader.prototype.planCard = function (body, p) {
    var self = this;
    var today = this.planDayFor(p);
    var readings = this.planReadings(p, today);
    var doneCount = 0;
    if (p.done) for (var k in p.done) if (p.done[k]) doneCount++;

    body.appendChild(el('h3', 'lang-name', p.title + ' — day ' + today + ' of ' + p.days +
      ' · ' + doneCount + ' done'));
    readings.forEach(function (r) {
      var btn = el('button', 'res');
      btn.type = 'button';
      btn.appendChild(el('span', 'r-ref', r.label));
      btn.addEventListener('click', function () {
        if (!self.docked()) self.closeSheets();
        self.go(r.ref, { jump: true });
      });
      body.appendChild(btn);
    });
    var rowEl = el('div', 'row-acts');
    var mark = el('button', '', p.done && p.done[today] ? 'Day ' + today + ' is done ✓' : 'Mark day ' + today + ' done');
    mark.type = 'button';
    mark.addEventListener('click', function () {
      p.done = p.done || {};
      p.done[today] = !p.done[today];
      self.store.savePlan(p).then(function () { self.openPlanSheet(); self.paintPlanFoot(); });
    });
    rowEl.appendChild(mark);
    var stop = el('button', '', 'Stop this plan');
    stop.type = 'button';
    stop.addEventListener('click', function () {
      if (!confirm('Stop ' + p.title + '? Your progress is forgotten.')) return;
      self.store.dropPlan(p.id).then(function () { self.openPlanSheet(); self.paintPlanFoot(); });
    });
    rowEl.appendChild(stop);
    body.appendChild(rowEl);
  };

  // The day's readings. Dataset plans come from the helps pack; the two
  // computed plans are arithmetic over the canon.
  Reader.prototype.planReadings = function (p, day) {
    var App = root.GifosBibleApparatus;
    if (App) {
      var r = App.planDay(p.kind, day);
      if (r && r.readings && r.readings.length) {
        return r.readings.map(function (s) {
          var parsed = Refs.parse(s);
          return { label: s, ref: parsed[0] || { code: 'GEN', chapter: 1 } };
        });
      }
    }
    var pack = this.pack(0);
    if (p.kind === 'gospels30') {
      var chapters = [];
      ['MAT', 'MRK', 'LUK', 'JHN'].forEach(function (code) {
        var nums = pack ? pack.chapterNumbers(code) : [];
        nums.forEach(function (n) { chapters.push({ code: code, chapter: n }); });
      });
      var per = Math.ceil(chapters.length / p.days);
      var out = [];
      for (var i = (day - 1) * per; i < Math.min(day * per, chapters.length); i++) {
        out.push({ label: Refs.format(chapters[i], { style: 'short' }),
                   ref: chapters[i] });
      }
      return out;
    }
    if (p.kind === 'psalms31') {
      var out2 = [];
      for (var d = day; d <= 150; d += 31) {
        out2.push({ label: 'Psalm ' + d, ref: { code: 'PSA', chapter: d } });
      }
      return out2;
    }
    return [];
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
