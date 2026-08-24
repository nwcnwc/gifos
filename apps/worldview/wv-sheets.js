/*
 * wv-sheets.js — the dialogs.
 *
 * Each one is a small, complete job: pick a day, build an animation, keep a
 * view, take a region offline, explain where the pictures come from. They are
 * separated from wv-ui.js because they are CONTENT — the words matter as much
 * as the controls, and this is where most of the app's honesty lives: what is
 * saved, what leaves the device (nothing), what needs a connection, and whose
 * imagery this is.
 *
 * Note on links: an app runs in a sandboxed frame with nowhere to navigate to,
 * so an <a href> would be a dead promise. Addresses are printed as text.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var T = window.WVTiles;
  var M = window.WVMap;
  var A = window.WVAnim;
  var UI = window.WVUI;

  var app = null, state = null;
  UI.attachSheets = function (a) { app = a; state = a.state; };

  function row(parent, cls) { var d = U.el('div', cls); parent.appendChild(d); return d; }
  function label(parent, text) { var l = U.el('label', 'field-label', text); parent.appendChild(l); return l; }

  function dateInput(value, onChange) {
    var i = document.createElement('input');
    i.type = 'date';
    i.className = 'field';
    i.value = value;
    i.max = U.latestDay();
    i.min = '1981-01-01';
    i.addEventListener('change', function () { if (i.value) onChange(i.value); });
    return i;
  }

  function button(text, cls, fn) {
    var b = U.el('button', cls || 'ghost', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }

  // ------------------------------------------------------------ date pick ---
  /*
   * A real calendar, not a native date field.
   *
   * The question a date picker has to answer in this app is not "what day is
   * it" — it is "which days actually have imagery for what I am looking at".
   * A MODIS 8-day composite exists on eight days a year out of every eight; an
   * instrument launched in 2018 has nothing before it; today's pass may not
   * have landed yet. So the grid greys out the days the visible layers do not
   * publish, and says which layer it is deferring to.
   */
  function leadLayer() {
    for (var i = 0; i < state.layers.length; i++) {
      var L = D.layer(state.layers[i].id);
      if (L && state.layers[i].on && !L.builtin && L.period !== 'static' && !L.ref) return L;
    }
    return null;
  }

  UI.openDatePick = function (forB) {
    UI.openModal(forB ? 'Compare with…' : 'Pick a day', function (body) {
      var cur = forB ? state.compare.date : state.date;
      var shownMonth = cur.slice(0, 7);
      var L = leadLayer();

      function set(d) {
        if (forB) { state.compare.date = d; UI.renderCompare(); M.invalidate(); app.save(); }
        else app.setDate(d);
        UI.closeSheets();
      }

      var head = row(body, 'cal-head');
      var prev = button('‹', 'cal-nav', function () { shownMonth = shiftMonth(shownMonth, -1); paint(); });
      prev.setAttribute('aria-label', 'Previous month');
      var title = U.el('b', 'cal-title', '');
      var next = button('›', 'cal-nav', function () { shownMonth = shiftMonth(shownMonth, 1); paint(); });
      next.setAttribute('aria-label', 'Next month');
      head.appendChild(prev);
      head.appendChild(title);
      head.appendChild(next);

      var grid = row(body, 'cal-grid');
      var note = U.el('p', 'field-note', '');
      body.appendChild(note);

      var chips = row(body, 'chips');
      [['Today', 0], ['Yesterday', -1], ['A week ago', -7], ['A month ago', -30],
       ['A year ago', -365], ['Five years ago', -1826]].forEach(function (c) {
        chips.appendChild(button(c[0], 'chip-btn', function () { set(U.addDays(U.latestDay(), c[1])); }));
      });

      function shiftMonth(m, n) {
        var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n;
        var d = new Date(Date.UTC(y, mo, 1));
        return d.getUTCFullYear() + '-' + U.pad(d.getUTCMonth() + 1);
      }

      function paint() {
        var y = +shownMonth.slice(0, 4), mo = +shownMonth.slice(5, 7) - 1;
        title.textContent = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                             'August', 'September', 'October', 'November', 'December'][mo] + ' ' + y;
        grid.innerHTML = '';
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d, i) {
          grid.appendChild(U.el('span', 'cal-dow', d));
        });
        var first = new Date(Date.UTC(y, mo, 1));
        var lead = (first.getUTCDay() + 6) % 7;                 // Monday-first
        for (var i = 0; i < lead; i++) grid.appendChild(U.el('span', 'cal-pad'));
        var days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        var latest = U.latestDay();
        for (var d = 1; d <= days; d++) {
          var iso = y + '-' + U.pad(mo + 1) + '-' + U.pad(d);
          var b = U.el('button', 'cal-day', String(d));
          b.type = 'button';
          var future = U.dayMs(iso) > U.dayMs(latest);
          var has = !future && (!L || D.coverage(L, iso).ok) && (!L || U.snapDay(iso, L) === iso || L.period === 'daily');
          if (future) b.classList.add('out');
          else if (!has) b.classList.add('thin');
          if (iso === cur) b.classList.add('on');
          if (iso === latest) b.classList.add('today');
          if (future) b.disabled = true;
          b.addEventListener('click', function (iso2) {
            return function () { set(iso2); };
          }(iso));
          grid.appendChild(b);
        }
        note.textContent = L
          ? 'Dimmed days are days ' + L.title + ' (' + (L.sub || 'GIBS') + ') does not publish.'
          : 'Every day in the archive is available for the layers you have on.';
      }
      paint();
    });
  };

  // ------------------------------------------------------------- animate ----
  UI.openAnimate = function () {
    UI.openModal('Animate', function (body) {
      var a = state.anim;
      state.ui.showRange = true;
      UI.renderTimeline();

      var f1 = row(body, 'field-row');
      label(f1, 'From');
      f1.appendChild(dateInput(a.from, function (v) { a.from = v; UI.renderTimeline(); est(); }));
      label(f1, 'to');
      f1.appendChild(dateInput(a.to, function (v) { a.to = v; UI.renderTimeline(); est(); }));

      var f2 = row(body, 'field-row');
      label(f2, 'A frame every');
      var sel = document.createElement('select');
      sel.className = 'field';
      [['day', 'day'], ['week', 'week'], ['month', 'month'], ['year', 'year']].forEach(function (o) {
        var op = document.createElement('option');
        op.value = o[0]; op.textContent = o[1];
        if (a.step === o[0]) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { a.step = sel.value; est(); UI.renderTimeline(); });
      f2.appendChild(sel);

      label(f2, 'Speed');
      var fps = document.createElement('input');
      fps.type = 'range'; fps.min = '1'; fps.max = '12'; fps.step = '1';
      fps.value = String(a.fps || 4);
      fps.style.setProperty('--fill', ((a.fps || 4) / 12 * 100) + '%');
      var fpsText = U.el('span', 'field-note', (a.fps || 4) + ' fps');
      fps.addEventListener('input', function () {
        a.fps = +fps.value;
        fps.style.setProperty('--fill', (a.fps / 12 * 100) + '%');
        fpsText.textContent = a.fps + ' fps';
      });
      f2.appendChild(fps);
      f2.appendChild(fpsText);

      var f3 = row(body, 'field-row');
      var loop = document.createElement('input');
      loop.type = 'checkbox';
      loop.checked = a.loop !== false;
      loop.id = 'animLoop';
      loop.addEventListener('change', function () { a.loop = loop.checked; });
      f3.appendChild(loop);
      var ll = U.el('label', 'field-label', 'Loop');
      ll.setAttribute('for', 'animLoop');
      f3.appendChild(ll);

      var note = U.el('p', 'field-note');
      body.appendChild(note);
      function est() {
        var n = A.dates(a.from, a.to, a.step).length;
        note.textContent = n + ' frame' + (n === 1 ? '' : 's') +
          (n >= A.MAX_FRAMES ? ' (the most it will do at once — narrow the range or step by month)' : '') +
          ' · about ' + Math.ceil(n / (a.fps || 4)) + 's long';
      }
      est();

      var acts = row(body, 'actions');
      acts.appendChild(button('Play it', 'primary', function () {
        UI.closeSheets();
        app.play();
      }));
      acts.appendChild(button('Save as a GIF', 'ghost', function () { exportGif(body); }));

      var p = U.el('p', '', 'The GIF is made here, on this device, out of the frames this map draws — nothing is uploaded and nothing is queued. Every frame carries its date.');
      body.appendChild(p);
    });
  };

  function exportGif(body) {
    var a = state.anim;
    var cancelled = false;
    var wrap = U.el('div', 'progress');
    var bar = U.el('div', 'progress-bar');
    var barIn = U.el('i');
    bar.appendChild(barIn);
    var txt = U.el('p', 'field-note', 'Starting…');
    wrap.appendChild(bar);
    wrap.appendChild(txt);
    var cancel = button('Stop', 'mini ghost', function () { cancelled = true; });
    wrap.appendChild(cancel);
    body.appendChild(wrap);

    A.exportGif({
      from: a.from, to: a.to, step: a.step, fps: a.fps || 4,
      size: window.innerWidth < 700 ? 480 : 640,
      cancelled: function () { return cancelled; },
      onProgress: function (p, note) {
        barIn.style.width = Math.round(p * 100) + '%';
        txt.textContent = note;
      },
    }).then(function (bytes) {
      txt.textContent = 'Done — ' + U.fmtBytes(bytes.length);
      barIn.style.width = '100%';
      cancel.remove();
      var name = 'worldview-' + a.from + '-to-' + a.to + '.gif';
      offerFile(wrap, bytes, 'image/gif', name);
    }).catch(function (e) {
      txt.textContent = String(e && e.message) === 'cancelled' ? 'Stopped.' : 'That did not work: ' + (e && e.message);
      cancel.remove();
    });
  }

  /*
   * Handing a finished file to the person. Two doors, because they are
   * different needs: Download puts it in their filesystem to send to someone,
   * and My Media keeps it on the Home Screen with their photos.
   */
  function offerFile(wrap, bytes, mime, name) {
    var acts = U.el('div', 'actions');
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.className = 'primary';
    a.textContent = 'Download';
    a.href = url;
    a.download = name;
    acts.appendChild(a);
    if (window.gifos && gifos.library && gifos.library.put) {
      acts.appendChild(button('Save to My Media', 'ghost', function () {
        gifos.library.put({ bytes: bytes.buffer || bytes, mime: mime, name: name, type: 'image' })
          .then(function (r) {
            UI.toast(r && r.myMedia ? 'Saved to My Media' : (r && r.missing) || 'Saved');
          })
          .catch(function (e) { UI.toast(String(e && e.message || e), { bad: true }); });
      }));
    }
    wrap.appendChild(acts);
  }

  // ------------------------------------------------------------- snapshot ---
  UI.openSnapshot = function () {
    UI.openModal('Save this view', function (body) {
      var opts = { stamp: true, scale: 1 };
      var f = row(body, 'field-row');
      var stamp = document.createElement('input');
      stamp.type = 'checkbox';
      stamp.checked = true;
      stamp.id = 'shotStamp';
      f.appendChild(stamp);
      var sl = U.el('label', 'field-label', 'Print the date and credit on it');
      sl.setAttribute('for', 'shotStamp');
      f.appendChild(sl);

      var preview = U.el('div', 'shot-preview');
      body.appendChild(preview);

      var out = row(body, 'actions');
      out.appendChild(button('Make the picture', 'primary', function () {
        out.innerHTML = '';
        var sz = M.size();
        var w = Math.min(1920, Math.round(sz.w * sz.dpr));
        var h = Math.round(w * sz.h / sz.w);
        M.renderNow();
        var frame = M.grabFrame(w, h, stamp.checked ? U.prettyDate(state.date) : null);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').putImageData(new ImageData(frame.data, w, h), 0, 0);
        c.toBlob(function (blob) {
          blob.arrayBuffer().then(function (buf) {
            var bytes = new Uint8Array(buf);
            preview.innerHTML = '';
            var img = new Image();
            img.src = URL.createObjectURL(blob);
            preview.appendChild(img);
            var wrap = U.el('div');
            body.appendChild(wrap);
            offerFile(wrap, bytes, 'image/jpeg',
              'worldview-' + state.date + '.jpg');
            UI.toast('Picture ready — ' + U.fmtBytes(bytes.length));
          });
        }, 'image/jpeg', 0.92);
      }));
      body.appendChild(U.el('p', '', 'The picture is made from the tiles already on your screen, on this device. Sharing it is up to you.'));
    });
  };

  // ---------------------------------------------------------- saved views ---
  UI.openViews = function () {
    UI.openModal('Saved views', function (body) {
      body.appendChild(button('Save what I am looking at', 'primary', function () {
        app.saveView().then(function () { UI.closeSheets(); UI.openViews(); });
      }));
      var list = U.el('div', 'view-list');
      body.appendChild(list);
      app.listViews().then(function (views) {
        if (!views.length) {
          list.appendChild(U.el('p', '', 'Nothing saved yet. A saved view remembers the place, the day, and every layer with its opacity — and it lives inside this file, so it travels with the GIF.'));
          return;
        }
        views.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        views.forEach(function (v) {
          var card = U.el('div', 'view-card');
          var open = U.el('button', 'view-open');
          if (v.thumb) {
            var im = new Image();
            im.src = v.thumb;
            open.appendChild(im);
          }
          var t = U.el('span');
          t.appendChild(U.el('b', '', v.name || U.prettyDate(v.date)));
          t.appendChild(U.el('span', '', U.prettyDate(v.date) + ' · ' +
            (v.layers || []).filter(function (r) { return r.on; }).length + ' layers'));
          open.appendChild(t);
          open.addEventListener('click', function () { app.restoreView(v); UI.closeSheets(); });
          card.appendChild(open);
          var del = U.el('button', 'row-del');
          del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          del.setAttribute('aria-label', 'Delete ' + (v.name || 'view'));
          del.addEventListener('click', function () {
            app.deleteView(v.id).then(function () { UI.closeSheets(); UI.openViews(); });
          });
          card.appendChild(del);
          list.appendChild(card);
        });
      });
    });
  };

  // ---------------------------------------------------------------- tours ---
  UI.openTours = function () {
    UI.openModal('Explore', function (body) {
      body.appendChild(U.el('p', '', 'Places and days where the imagery says something. Each one sets the layers, the date and the view — then it is yours to move.'));
      var list = U.el('div', 'tour-list');
      D.tours.forEach(function (t) {
        var b = U.el('button', 'tour');
        b.appendChild(U.el('b', '', t.title));
        b.appendChild(U.el('span', '', t.blurb));
        var when = t.date === 'latest' ? 'today' : U.prettyDate(t.date);
        b.appendChild(U.el('span', 'when', when + (t.where ? ' · ' + t.where : '') + (t.anim ? ' · animated' : '')));
        b.addEventListener('click', function () { app.openTour(t); UI.closeSheets(); });
        list.appendChild(b);
      });
      body.appendChild(list);
    });
  };

  // -------------------------------------------------------------- storage ---
  UI.openStorage = function () {
    UI.openModal('Offline & storage', function (body) {
      var s = T.cacheStats();
      var head = U.el('p', '');
      head.innerHTML = T.net === 'offline'
        ? '<b>No connection.</b> The map is drawing from the Blue Marble packed inside this app and from tiles you have already looked at.'
        : '<b>Connected.</b> Tiles arrive from NASA GIBS and are kept here as you look at them.';
      body.appendChild(head);

      var stats = U.el('div', 'stat-grid');
      [['Imagery kept in this file', U.fmtBytes(s.bytes)],
       ['Tiles', String(s.tiles)],
       ['Pinned for offline', U.fmtBytes(s.pinnedBytes)],
       ['Fetched this session', String(T.stats.fetched)]].forEach(function (p) {
        var c = U.el('div', 'stat');
        c.appendChild(U.el('b', '', p[1]));
        c.appendChild(U.el('span', '', p[0]));
        stats.appendChild(c);
      });
      body.appendChild(stats);

      body.appendChild(U.el('h3', '', 'Take this view on a plane'));
      body.appendChild(U.el('p', '', 'Downloads every tile for what is on screen now, at this zoom and one closer, and pins them so they are never evicted. Then the app works with the connection off.'));
      var prog = U.el('p', 'field-note', '');
      var acts = row(body, 'actions');
      acts.appendChild(button('Pin this view', 'primary', function () {
        app.pinView(function (done, total) {
          prog.textContent = 'Fetching ' + done + ' of ' + total + ' tiles…';
        }).then(function (n) {
          prog.textContent = 'Pinned ' + n + ' tiles. This view now works offline.';
          UI.openStorage();
        });
      }));
      acts.appendChild(button('Pin this week', 'ghost', function () {
        app.pinView(function (done, total) {
          prog.textContent = 'Fetching ' + done + ' of ' + total + ' tiles…';
        }, 7).then(function (n) {
          prog.textContent = 'Pinned ' + n + ' tiles across seven days.';
          UI.openStorage();
        });
      }));
      body.appendChild(prog);

      body.appendChild(U.el('h3', '', 'Clearing up'));
      body.appendChild(U.el('p', '', 'Everything above is inside this app\'s own file on this device. It is what makes the GIF you share carry the imagery with it — and it is why it is worth watching the number.'));
      var acts2 = row(body, 'actions');
      acts2.appendChild(button('Clear the browsing cache', 'ghost', function () {
        T.clearCache(true).then(function () { UI.toast('Cleared — pinned tiles kept'); UI.openStorage(); });
      }));
      acts2.appendChild(button('Clear everything, pins too', 'ghost danger', function () {
        T.clearCache(false).then(function () { UI.toast('All saved imagery cleared'); UI.openStorage(); });
      }));

      if (window.gifos && gifos.storage) {
        gifos.storage().then(function (st) {
          if (!st || !st.quota) return;
          var p = U.el('p', 'field-note', 'This browser has given GifOS ' +
            U.fmtBytes(st.usage) + ' of ' + U.fmtBytes(st.quota) + ' — shared by every app on the Home Screen.');
          body.appendChild(p);
        }).catch(function () {});
      }
    });
  };

  // ---------------------------------------------------------------- about ---
  UI.openAbout = function () {
    UI.openModal('About the data', function (body) {
      body.appendChild(U.el('p', '', 'Every picture in this app is NASA\'s. Imagery comes from the Global Imagery Browse Services (GIBS), the same archive that feeds NASA Worldview — most of it available within three hours of the satellite passing overhead, and going back to 2000 for MODIS and 1981 for sea surface temperature.'));
      body.appendChild(U.el('h3', '', 'What is inside this file'));
      var ul = U.el('ul', 'plain');
      [
        'NASA\'s Blue Marble, so the map is never blank and swath gaps are filled.',
        'Coastlines and borders as vectors (Natural Earth, public domain).',
        D.places.length.toLocaleString() + ' searchable places — no geocoder, no connection.',
        D.catalog.layers.length + ' GIBS layers with NASA\'s own descriptions.',
        'Every tile you have looked at, until you clear it.',
      ].forEach(function (t) { ul.appendChild(U.el('li', '', t)); });
      body.appendChild(ul);
      body.appendChild(U.el('h3', '', 'Credit'));
      body.appendChild(U.el('p', '', 'NASA Worldview and GIBS are made by NASA\'s Earth Science Data and Information System (ESDIS) project. This is an independent port to GifOS — the original lives at worldview.earthdata.nasa.gov, and the imagery service at gibs.earthdata.nasa.gov.'));
      body.appendChild(U.el('p', '', 'NASA imagery is generally free to use; the agency asks that it is credited, and that its logos are not used to imply endorsement.'));
      body.appendChild(U.el('h3', '', 'Where your things go'));
      body.appendChild(U.el('p', '', 'Nowhere. Saved views, pinned imagery and pins live inside this app\'s icon on this device. Share the GIF and they travel with it; press Invite and whoever holds the link sees the same map, live, with nothing in between.'));
    });
  };

  // ------------------------------------------------------------ measure ----
  UI.renderMeasure = function (points) {
    if (!points || points.length < 2) { UI.busy(null); return; }
    var total = 0;
    for (var i = 1; i < points.length; i++) {
      total += U.haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    UI.busy(U.fmtDist(total) + '  ·  tap to add, Escape to finish');
  };

})();
