/*
 * wv-ui.js — every surface that is not the map.
 *
 * The panels are all the same shape at three sizes: on a desktop the layer
 * list docks at the left, on a tablet it floats over the map, on a phone it is
 * a bottom sheet you drag up with your thumb. Nothing here re-lays-out the
 * canvas — the map is fixed to the viewport and everything else is on top of
 * it, so opening a panel never re-projects the world or drops a tile.
 *
 * The timeline deserves its own note. It is a real ruler, not a slider: it
 * knows what a year looks like next to a month, it shades the days a layer
 * does not have, and dragging it scrubs the date under your finger. It is the
 * control people actually use in Worldview, so it had to be the best thing
 * here.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var T = window.WVTiles;
  var M = window.WVMap;

  var UI = {};
  var app = null, state = null;
  var el = {};

  UI.init = function (a) {
    app = a;
    state = a.state;
    cache();
    bindTop();
    bindPanel();
    bindTools();
    bindTime();
    bindCompare();
    bindKeys();
    applyMode();
    window.addEventListener('resize', applyMode);
    UI.renderAll();
    return UI;
  };

  function cache() {
    ['map', 'top', 'panel', 'stack', 'layerCount', 'tools', 'readout', 'coords', 'scalebar',
     'time', 'timeline', 'tlCanvas', 'tlCursor', 'tlRange', 'dateText', 'dateSub', 'playBtn',
     'prevDay', 'nextDay', 'animBtn', 'dateBtn', 'browse', 'browseBody', 'browseTabs',
     'browseSearch', 'modal', 'modalTitle', 'modalBody', 'scrim', 'toast', 'busy', 'busyText',
     'searchInput', 'searchResults', 'searchClear', 'menuBtn', 'panelClose', 'addLayerBtn',
     'compare', 'cmpTagA', 'cmpTagB', 'welcome', 'wStart', 'wTour', 'netChip', 'storageBtn',
     'aboutBtn', 'subtime', 'subtimeInput', 'subtimeText', 'app', 'sheetGrip', 'tlScale',
     'todayBtn', 'tlCursorDate', 'inspect', 'insBody', 'phonebar', 'browseCount', 'browseDone'].forEach(function (id) {
      el[id] = U.$(id);
    });
  }

  // ------------------------------------------------------------------ mode --
  var mode = '';
  function applyMode() {
    var w = window.innerWidth;
    var m = w < 701 ? 'phone' : (w < 1024 ? 'tablet' : 'desktop');
    if (m === mode) return;
    mode = m;
    document.body.dataset.mode = m;
    el.searchInput.placeholder = m === 'phone'
      ? 'Search places' : 'Search 1,240 places — works offline';
    // The layer panel is open by default where there is room for it and
    // closed where it would cover the map.
    if (m === 'desktop') UI.setPanel(state.ui.panel !== false);
    else UI.setPanel(false);
    M.resize();
  }
  UI.mode = function () { return mode; };

  UI.setPanel = function (open) {
    el.panel.classList.toggle('closed', !open);
    el.app.classList.toggle('panel-open', !!open);
    if (mode === 'desktop') state.ui.panel = !!open;
  };
  UI.panelOpen = function () { return !el.panel.classList.contains('closed'); };

  // ------------------------------------------------------------------- top --
  function bindTop() {
    el.menuBtn.addEventListener('click', function () { UI.setPanel(!UI.panelOpen()); });
    el.panelClose.addEventListener('click', function () { UI.setPanel(false); });

    var search = el.searchInput;
    search.addEventListener('input', function () {
      el.searchClear.hidden = !search.value;
      renderSearch(search.value);
    });
    search.addEventListener('focus', function () { if (search.value) renderSearch(search.value); });
    search.addEventListener('keydown', function (e) {
      var items = el.searchResults.querySelectorAll('button');
      var cur = el.searchResults.querySelector('button.on');
      var i = Array.prototype.indexOf.call(items, cur);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        var n = U.clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
        if (cur) cur.classList.remove('on');
        items[n].classList.add('on');
        items[n].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        (cur || items[0] || {}).click && (cur || items[0]).click();
      } else if (e.key === 'Escape') {
        search.blur();
        hideSearch();
      }
    });
    el.searchClear.addEventListener('click', function () {
      search.value = '';
      el.searchClear.hidden = true;
      hideSearch();
      search.focus();
    });
    document.addEventListener('pointerdown', function (e) {
      if (!el.searchResults.hidden && !el.searchResults.contains(e.target) && e.target !== search) hideSearch();
    });
    el.netChip.addEventListener('click', function () { UI.openStorage(); });

    // On a phone the sheet covers the map, so touching the map is how you put
    // it away — the gesture people try first.
    el.map.addEventListener('pointerdown', function () {
      if (mode !== 'desktop' && UI.panelOpen()) UI.setPanel(false);
    });
  }

  function hideSearch() { el.searchResults.hidden = true; el.searchResults.innerHTML = ''; }

  function renderSearch(q) {
    var box = el.searchResults;
    box.innerHTML = '';
    q = String(q || '').trim();
    if (!q) { box.hidden = true; return; }

    var coords = D.parseCoords(q);
    var rows = [];
    if (coords) {
      rows.push({ name: U.fmtLatLon(coords.lat, coords.lon), country: 'go to these coordinates',
                  lat: coords.lat, lon: coords.lon, res: 0.004 });
    }
    D.searchPlaces(q, 8).forEach(function (p) { rows.push(p); });

    if (!rows.length) {
      var none = U.el('button', '', 'Nothing here by that name');
      none.disabled = true;
      box.appendChild(none);
      box.hidden = false;
      return;
    }
    rows.forEach(function (p, i) {
      var b = U.el('button');
      if (i === 0) b.className = 'on';
      var nm = U.el('span', 'nm', p.name);
      var cn = U.el('span', 'cn', p.country || '');
      b.appendChild(nm);
      b.appendChild(cn);
      b.addEventListener('click', function () {
        app.goTo(p.lat, p.lon, p.res || (p.pop > 3000000 ? 0.0045 : 0.0022), p.name);
        hideSearch();
        el.searchInput.blur();
      });
      box.appendChild(b);
    });
    box.hidden = false;
  }

  // ---------------------------------------------------------- layer stack ---
  var EYE_ON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.8" fill="currentColor"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M2.5 12S6 5.8 12 5.8c1.6 0 3 .4 4.2 1M21.5 12s-3.5 6.2-9.5 6.2c-1.7 0-3.2-.5-4.4-1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m4 4 16 16" stroke="currentColor" stroke-width="1.6"/></svg>';
  var GRIP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg>';
  // ✕ is close, never delete (repo convention): the shared trash glyph.
  var TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function bindPanel() {
    el.addLayerBtn.addEventListener('click', function () { UI.openBrowse(); });
    el.storageBtn.addEventListener('click', function () { UI.openStorage(); });
    el.aboutBtn.addEventListener('click', function () { UI.openAbout(); });
    el.sheetGrip && el.sheetGrip.addEventListener('click', function () { UI.setPanel(true); });
  }

  UI.renderStack = function () {
    var box = el.stack;
    box.innerHTML = '';
    state.layers.forEach(function (row, i) {
      var L = D.layer(row.id);
      if (!L) return;
      var node = U.el('div', 'lyr' + (row.on ? '' : ' off') + (row.open ? ' open' : ''));
      node.setAttribute('role', 'listitem');
      node.dataset.id = row.id;

      var main = U.el('div', 'lyr-main');

      var grip = U.el('button', 'lyr-grip');
      grip.innerHTML = GRIP;
      grip.setAttribute('aria-label', 'Reorder ' + L.title);
      main.appendChild(grip);

      var eye = U.el('button', 'lyr-eye');
      eye.innerHTML = row.on ? EYE_ON : EYE_OFF;
      eye.setAttribute('aria-label', (row.on ? 'Hide ' : 'Show ') + L.title);
      eye.addEventListener('click', function (e) { e.stopPropagation(); app.toggleLayer(row.id); });
      main.appendChild(eye);

      var text = U.el('button', 'lyr-text');
      var title = U.el('span', 'lyr-title', L.title);
      var sub = U.el('span', 'lyr-sub');
      sub.dataset.id = row.id;
      sub.textContent = subLine(L, row);
      text.appendChild(title);
      text.appendChild(sub);
      text.addEventListener('click', function () {
        row.open = !row.open;
        UI.renderStack();
      });
      main.appendChild(text);

      var actions = U.el('div', 'lyr-actions');
      var del = U.el('button', 'row-del');
      del.innerHTML = TRASH;
      del.setAttribute('aria-label', 'Remove ' + L.title);
      del.addEventListener('click', function (e) { e.stopPropagation(); app.removeLayer(row.id); });
      actions.appendChild(del);
      main.appendChild(actions);
      node.appendChild(main);

      var more = U.el('div', 'lyr-more');
      if (!row.on) {
        var offNote = U.el('p', 'lyr-note off-note', 'Hidden — tap the eye to show it.');
        more.appendChild(offNote);
      }
      var op = U.el('div', 'lyr-opacity');
      var slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0'; slider.max = '100'; slider.step = '1';
      slider.value = String(Math.round((row.opacity == null ? 1 : row.opacity) * 100));
      slider.style.setProperty('--fill', slider.value + '%');
      slider.setAttribute('aria-label', 'Opacity of ' + L.title);
      slider.addEventListener('input', function () {
        slider.style.setProperty('--fill', slider.value + '%');
        pct.textContent = slider.value + '%';
        app.setOpacity(row.id, +slider.value / 100);
      });
      var pct = U.el('span', '', slider.value + '%');
      op.appendChild(slider);
      op.appendChild(pct);
      more.appendChild(op);

      if (L.about) {
        var note = U.el('p', 'lyr-note');
        note.textContent = L.about;
        more.appendChild(note);
      }
      var meta = U.el('p', 'lyr-note');
      meta.innerHTML = '<b>' + U.esc(L.id) + '</b>' +
        (L.builtin ? ' · inside this app' :
          ' · ' + U.esc(L.set) + ' · ' + U.esc(periodWord(L.period)) +
          (L.start ? ' · from ' + U.esc(U.prettyDate(L.start)) : ''));
      more.appendChild(meta);

      if (!L.builtin && L.group !== 'base') {
        var legend = U.el('div', 'lyr-legend');
        more.appendChild(legend);
        if (row.open) loadLegend(L, legend);
      }
      node.appendChild(more);

      makeDraggable(node, grip, i);
      box.appendChild(node);
    });
    el.layerCount.textContent = String(state.layers.filter(function (r) { return r.on; }).length);
  };

  /*
   * The line under a layer's name. It is the layer's source until there is
   * something more useful to say, and then it says THAT: this day is outside
   * the record, or the satellite simply did not see this patch of the world
   * today. "Nothing here" is an answer; a blank map is not.
   */
  function subLine(L, row) {
    if (!row.on) return L.sub || '';
    var cov = D.coverage(L, state.date);
    if (!cov.ok) return 'Nothing on this day — ' + cov.why;
    var st = M.layerStatus && M.layerStatus(L.id);
    if (st && !st.drawn && st.missing && !st.pending) {
      return 'Nothing here on this day — try another date or move the map';
    }
    return L.sub || '';
  }

  // Cheap: only the sub-lines, only when they changed. Called from the map's
  // frame callback, so a tile landing updates the words without rebuilding the
  // list under the user's finger.
  UI.refreshStatus = function () {
    var subs = el.stack.querySelectorAll('.lyr-sub');
    for (var i = 0; i < subs.length; i++) {
      var id = subs[i].dataset.id;
      var row = null;
      for (var j = 0; j < state.layers.length; j++) if (state.layers[j].id === id) row = state.layers[j];
      var L = row && D.layer(id);
      if (!L) continue;
      var text = subLine(L, row);
      if (subs[i].textContent !== text) {
        subs[i].textContent = text;
        subs[i].classList.toggle('warn', text.indexOf('Nothing') === 0);
      }
    }
    UI.renderInspector();
  };

  function periodWord(p) {
    return { daily: 'daily', monthly: 'monthly', yearly: 'yearly', static: 'no date',
             '8day': 'every 8 days', '16day': 'every 16 days',
             '30min': 'every 30 minutes', '10min': 'every 10 minutes' }[p] || p;
  }

  // Drag to reorder, with the pointer events a phone understands. The grip is
  // the handle on purpose: a list row you can accidentally throw across the
  // screen while scrolling is worse than no reordering at all.
  function makeDraggable(node, grip, index) {
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      node.classList.add('dragging');
      var rows = Array.prototype.slice.call(el.stack.children);
      var target = index;

      function move(ev) {
        var y = ev.clientY;
        rows.forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i].getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            rows[i].classList.add('drop-before');
            target = i > index ? i - 1 : i;
            return;
          }
        }
        rows[rows.length - 1].classList.add('drop-after');
        target = rows.length - 1;
      }
      function up() {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        node.classList.remove('dragging');
        rows.forEach(function (r) { r.classList.remove('drop-before', 'drop-after'); });
        if (target !== index) app.reorder(index, target);
        else UI.renderStack();
      }
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  /*
   * Legends come from GIBS itself (the colormap the imagery was actually
   * painted with), never from a guess in this app: a legend that does not match
   * the pixels is a lie about data. It is fetched once, cached in the file, and
   * simply absent when there is no connection and no cached copy.
   */
  var legendCache = {};
  function loadLegend(L, box) {
    if (L.builtin) return;
    var id = L.id;
    if (legendCache[id] === 'none') return;
    if (legendCache[id]) return paintLegend(legendCache[id], box);
    box.innerHTML = '<p class="lyr-note">Legend…</p>';
    app.legend(id).then(function (lg) {
      if (!lg) {
        legendCache[id] = 'none';
        box.innerHTML = T.net === 'offline'
          ? '<p class="lyr-note">Legend needs a connection once — it is kept in the file after that.</p>'
          : '';
        return;
      }
      legendCache[id] = lg;
      paintLegend(lg, box);
    }).catch(function () { box.innerHTML = ''; });
  }

  function paintLegend(lg, box) {
    box.innerHTML = '';
    if (lg.type === 'classification' || lg.entries.length <= 12) {
      var wrap = U.el('div', 'legend-class');
      lg.entries.slice(0, 14).forEach(function (e) {
        var i = U.el('i', '', e.label || '');
        i.style.setProperty('--c', e.rgb);
        wrap.appendChild(i);
      });
      box.appendChild(wrap);
    } else {
      var bar = U.el('div', 'legend-bar');
      var stops = lg.entries.map(function (e, i) {
        return e.rgb + ' ' + ((i / (lg.entries.length - 1)) * 100).toFixed(1) + '%';
      });
      bar.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
      box.appendChild(bar);
      var ticks = U.el('div', 'legend-ticks');
      ticks.appendChild(U.el('span', '', lg.min || ''));
      if (lg.units) ticks.appendChild(U.el('span', '', lg.units));
      ticks.appendChild(U.el('span', '', lg.max || ''));
      box.appendChild(ticks);
    }
  }

  // ---------------------------------------------------------- add layers ----
  var browseTab = 'featured';
  UI.openBrowse = function () {
    show(el.browse);
    el.browseSearch.value = '';
    renderTabs();
    renderBrowse();
    if (mode === 'desktop') setTimeout(function () { el.browseSearch.focus(); }, 60);
  };

  function renderTabs() {
    el.browseTabs.innerHTML = '';
    D.catalog.categories.forEach(function (c) {
      var b = U.el('button', c.id === browseTab ? 'on' : '', c.title);
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { browseTab = c.id; renderTabs(); renderBrowse(); });
      el.browseTabs.appendChild(b);
    });
  }

  function renderBrowse() {
    var body = el.browseBody;
    body.innerHTML = '';
    var n = state.layers.filter(function (r) { return r.on; }).length;
    el.browseCount.textContent = n + (n === 1 ? ' layer on the map' : ' layers on the map');
    var q = el.browseSearch.value.trim();

    if (q) {
      var hits = D.searchLayers(q) || [];
      var head = U.el('div', 'meas');
      head.appendChild(U.el('h3', '', hits.length + (hits.length === 1 ? ' layer' : ' layers') + ' matching “' + q + '”'));
      var grid = U.el('div', 'meas-grid');
      hits.slice(0, 60).forEach(function (l) { grid.appendChild(layerCard(l)); });
      head.appendChild(grid);
      body.appendChild(head);
      if (!hits.length) {
        body.appendChild(U.el('p', '', 'Nothing matches that. Try “fire”, “ice”, “aerosol”, “night”, “temperature”.'));
      }
      return;
    }

    var cat = D.catalog.categories.filter(function (c) { return c.id === browseTab; })[0];
    if (!cat) return;

    // The built-in layers get their own group at the top of Reference — they
    // are the ones that work with no connection, and that is worth saying.
    if (browseTab === 'reference') {
      var bi = U.el('div', 'meas');
      bi.appendChild(U.el('h3', '', 'Inside this app'));
      bi.appendChild(U.el('p', '', 'Packed into the GIF — these draw with no connection at all.'));
      var bgrid = U.el('div', 'meas-grid');
      D.BUILTIN.forEach(function (l) { bgrid.appendChild(layerCard(l)); });
      bi.appendChild(bgrid);
      body.appendChild(bi);
    }

    cat.measurements.forEach(function (mid) {
      var layers = D.catalog.layers.filter(function (l) { return l.m === mid; });
      if (!layers.length) return;
      var sec = U.el('div', 'meas');
      sec.appendChild(U.el('h3', '', D.measTitle[mid] || mid));
      if (D.measBlurb[mid]) sec.appendChild(U.el('p', '', D.measBlurb[mid]));
      var g = U.el('div', 'meas-grid');
      layers.forEach(function (l) { g.appendChild(layerCard(l, D.measTitle[mid])); });
      sec.appendChild(g);
      body.appendChild(sec);
    });
  }

  // "Corrected Reflectance (True Color)" under a heading that already says
  // Corrected Reflectance is six identical-looking rows whose only difference
  // is in the dimmest text on the card. Under its own heading, the layer is
  // called what actually distinguishes it.
  function cardTitle(L, groupTitle) {
    var t = L.title;
    if (groupTitle && t.indexOf(groupTitle) === 0) {
      var rest = t.slice(groupTitle.length).replace(/^[\s,(–—-]+/, '').replace(/\)$/, '').trim();
      if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    return t;
  }

  function layerCard(L, groupTitle) {
    var on = state.layers.some(function (r) { return r.id === L.id; });
    var card = U.el('button', 'lcard' + (on ? ' on' : ''));
    var tick = U.el('span', 'tick');
    tick.innerHTML = on ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    card.appendChild(tick);
    var txt = U.el('span');
    txt.appendChild(U.el('span', 't', cardTitle(L, groupTitle)));
    txt.appendChild(U.el('span', 's', L.sub || ''));
    var bits = [];
    if (L.builtin) bits.push('offline');
    else {
      bits.push(L.set);
      bits.push(periodWord(L.period));
      if (L.start) bits.push(L.start.slice(0, 4) + '→' + (L.end ? L.end.slice(0, 4) : 'now'));
    }
    txt.appendChild(U.el('span', 'meta', bits.join(' · ')));
    card.appendChild(txt);
    card.addEventListener('click', function () {
      if (state.layers.some(function (r) { return r.id === L.id; })) app.removeLayer(L.id);
      else app.addLayer(L.id);
      renderBrowse();
    });
    return card;
  }

  // ---------------------------------------------------------------- tools ---
  function runTool(t) {
    if (t === 'zoomin') M.zoomBy(0.5);
    else if (t === 'zoomout') M.zoomBy(2);
    else if (t === 'home') M.flyHome();
    else if (t === 'compare') app.toggleCompare();
    else if (t === 'measure') app.toggleMeasure();
    else if (t === 'shot') UI.openSnapshot();
    else if (t === 'views') UI.openViews();
    else if (t === 'tours') UI.openTours();
    else if (t === 'phonetools') UI.openTools();
  }
  UI.runTool = runTool;

  function bindTools() {
    el.tools.addEventListener('click', function (e) {
      var b = e.target.closest('.tool');
      if (b) runTool(b.dataset.tool);
    });
    el.phonebar.addEventListener('click', function (e) {
      var b = e.target.closest('.pb');
      if (b) runTool(b.dataset.tool);
    });
    el.browseSearch.addEventListener('input', renderBrowse);
    el.browseDone.addEventListener('click', UI.closeSheets);
    document.addEventListener('click', function (e) {
      if (e.target.closest('.sheet-head .close')) UI.closeSheets();
    });
    el.scrim.addEventListener('click', UI.closeSheets);
    el.wStart && el.wStart.addEventListener('click', function () { app.dismissWelcome(); });
    el.wTour && el.wTour.addEventListener('click', function () { app.dismissWelcome(); UI.openTours(); });
  }

  UI.setToolState = function (name, on) {
    var b = el.tools.querySelector('.tool[data-tool="' + name + '"]');
    if (b) b.classList.toggle('on', !!on);
  };

  // ----------------------------------------------------------------- time ---
  // The ruler window: what span of time the timeline shows, in ms per pixel.
  var tl = { center: 0, mpp: 0, drag: null };
  var tlCtx = null;

  // How much time the ruler shows across its whole width. It opens on DAYS
  // because the app is a day picker: a five-year ruler makes one day a fifth of
  // a pixel, which is a decoration, not a control.
  var SCALES = { days: 120, months: 4 * 365, years: 30 * 365 };

  function bindTime() {
    tlCtx = el.tlCanvas.getContext('2d');
    UI.setScale(state.ui.scale || 'days', true);
    // Today sits about two thirds across, not in the middle: the archive is
    // behind you, and half a ruler of empty future is half a ruler wasted.
    tl.center = U.dayMs(state.date) - tlWidth() * 0.18 * tl.mpp;

    el.tlScale.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) UI.setScale(b.dataset.scale);
    });
    el.todayBtn.addEventListener('click', function () { app.setDate(U.latestDay()); });

    el.prevDay.addEventListener('click', function () { app.stepDate(-1); });
    el.nextDay.addEventListener('click', function () { app.stepDate(1); });
    el.playBtn.addEventListener('click', function () { app.togglePlay(); });
    el.animBtn.addEventListener('click', function () { UI.openAnimate(); });
    el.dateBtn.addEventListener('click', function () { UI.openDatePick(); });

    var tlEl = el.timeline;
    tlEl.addEventListener('pointerdown', function (e) {
      tlEl.setPointerCapture(e.pointerId);
      tl.drag = { x: e.clientX, moved: 0, shift: e.shiftKey };
      if (!e.shiftKey) scrubTo(e);
    });
    tlEl.addEventListener('pointermove', function (e) {
      if (!tl.drag) return;
      tl.drag.moved += Math.abs(e.clientX - tl.drag.x);
      if (tl.drag.shift) {
        tl.center -= (e.clientX - tl.drag.x) * tl.mpp;
        tl.drag.x = e.clientX;
        UI.renderTimeline();
      } else {
        scrubTo(e);
      }
    });
    function endDrag(e) { if (tl.drag) { tl.drag = null; app.commitDate(); } }
    tlEl.addEventListener('pointerup', endDrag);
    tlEl.addEventListener('pointercancel', endDrag);
    tlEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = tlEl.getBoundingClientRect();
      var at = tl.center + (e.clientX - r.left - r.width / 2) * tl.mpp;
      var f = Math.exp(U.clamp(e.deltaY, -100, 100) * 0.0022);
      var min = U.MS_DAY / 40, max = 40 * 365.25 * U.MS_DAY / Math.max(300, r.width);
      tl.mpp = U.clamp(tl.mpp * f, min, max);
      // The segmented control has to agree with the ruler after a wheel zoom.
      var days = tl.mpp * tlWidth() / U.MS_DAY;
      var name = days < 400 ? 'days' : (days < 4000 ? 'months' : 'years');
      state.ui.scale = name;
      var bs = el.tlScale.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.scale === name);
      // Keep the instant under the pointer where it was.
      tl.center = at - (e.clientX - r.left - r.width / 2) * tl.mpp;
      UI.renderTimeline();
    }, { passive: false });

    el.subtimeInput.addEventListener('input', function () {
      app.setMinutes(+el.subtimeInput.value * 10);
    });
  }

  function scrubTo(e) {
    var r = el.timeline.getBoundingClientRect();
    var ms = tl.center + (e.clientX - r.left - r.width / 2) * tl.mpp;
    app.setDate(U.msDay(U.clamp(ms, U.dayMs('1970-01-01'), Date.now())), { quiet: true });
  }

  UI.setScale = function (name, quiet) {
    if (!SCALES[name]) name = 'days';
    state.ui.scale = name;
    var at = U.dayMs(state.date);
    tl.mpp = SCALES[name] * U.MS_DAY / tlWidth();
    tl.center = at - tlWidth() * 0.18 * tl.mpp;
    var bs = el.tlScale.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.scale === name);
    if (!quiet) UI.renderTimeline();
  };

  function tlWidth() {
    var r = el.timeline.getBoundingClientRect();
    return Math.max(280, r.width || 900);
  }

  // The window can slide anywhere in the archive, but not into a future that
  // has no imagery in it.
  function clampTl() {
    var span = tlWidth() * tl.mpp;
    tl.center = U.clamp(tl.center, U.dayMs('1979-01-01') + span * 0.4, Date.now() + span * 0.2);
  }

  UI.centerTimeline = function (day) {
    tl.center = U.dayMs(day || state.date) - tlWidth() * 0.18 * tl.mpp;
    clampTl();
    UI.renderTimeline();
  };

  var TL_UNITS = [
    { ms: U.MS_DAY, label: 'day' },
    { ms: 7 * U.MS_DAY, label: 'week' },
    { ms: 30.44 * U.MS_DAY, label: 'month' },
    { ms: 91 * U.MS_DAY, label: 'quarter' },
    { ms: 365.25 * U.MS_DAY, label: 'year' },
    { ms: 5 * 365.25 * U.MS_DAY, label: '5 years' },
    { ms: 10 * 365.25 * U.MS_DAY, label: 'decade' },
  ];

  UI.renderTimeline = function () {
    var cvs = el.tlCanvas;
    var r = el.timeline.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cvs.width !== w * dpr || cvs.height !== h * dpr) {
      cvs.width = w * dpr; cvs.height = h * dpr;
    }
    var c = tlCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    clampTl();
    var left = tl.center - w / 2 * tl.mpp;
    var right = tl.center + w / 2 * tl.mpp;
    function x(ms) { return (ms - left) / tl.mpp; }

    // The band a layer actually has. The topmost visible dated layer decides,
    // because that is the one you are looking at — and "why is the map empty"
    // should be answerable from the timeline without reading anything.
    var lead = null;
    for (var i = 0; i < state.layers.length; i++) {
      var L = D.layer(state.layers[i].id);
      if (L && state.layers[i].on && !L.builtin && L.period !== 'static' && !L.ref) { lead = L; break; }
    }
    if (lead) {
      var s = lead.start ? U.dayMs(lead.start) : left;
      var e2 = lead.end ? U.dayMs(lead.end) : Date.now();
      c.fillStyle = 'rgba(76,194,255,0.10)';
      c.fillRect(x(s), 0, Math.max(1, x(e2) - x(s)), h);
      c.fillStyle = 'rgba(255,255,255,0.03)';
      if (s > left) c.fillRect(0, 0, x(s), h);
      if (e2 < right) c.fillRect(x(e2), 0, w - x(e2), h);
    }

    // Ticks: pick the coarsest unit that still gives room to write a label.
    var unit = TL_UNITS[TL_UNITS.length - 1];
    for (var u = 0; u < TL_UNITS.length; u++) {
      if (TL_UNITS[u].ms / tl.mpp >= 62) { unit = TL_UNITS[u]; break; }
    }
    c.font = '10px ui-monospace, monospace';
    c.textBaseline = 'top';
    var d0 = new Date(left);
    var ticks = [];
    if (unit.ms >= 300 * U.MS_DAY) {
      var stepY = Math.max(1, Math.round(unit.ms / (365.25 * U.MS_DAY)));
      var y0 = Math.floor(d0.getUTCFullYear() / stepY) * stepY;
      for (var yy = y0; Date.UTC(yy, 0, 1) < right; yy += stepY) {
        ticks.push({ ms: Date.UTC(yy, 0, 1), label: String(yy), big: true });
      }
    } else if (unit.ms >= 20 * U.MS_DAY) {
      var stepM = unit.ms >= 80 * U.MS_DAY ? 3 : 1;
      var mm = new Date(Date.UTC(d0.getUTCFullYear(), Math.floor(d0.getUTCMonth() / stepM) * stepM, 1));
      while (mm.getTime() < right) {
        ticks.push({ ms: mm.getTime(),
                     label: U.MON[mm.getUTCMonth()] + (mm.getUTCMonth() === 0 ? ' ' + mm.getUTCFullYear() : ''),
                     big: mm.getUTCMonth() === 0 });
        mm = new Date(Date.UTC(mm.getUTCFullYear(), mm.getUTCMonth() + stepM, 1));
      }
    } else {
      var stepD = Math.max(1, Math.round(unit.ms / U.MS_DAY));
      var day0 = Math.floor(left / U.MS_DAY) * U.MS_DAY;
      for (var dd = day0; dd < right; dd += stepD * U.MS_DAY) {
        var dt = new Date(dd);
        ticks.push({ ms: dd, label: dt.getUTCDate() + ' ' + U.MON[dt.getUTCMonth()],
                     big: dt.getUTCDate() === 1 });
      }
    }
    ticks.forEach(function (t) {
      var px2 = x(t.ms);
      c.strokeStyle = t.big ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.round(px2) + 0.5, t.big ? 0 : h * 0.55);
      c.lineTo(Math.round(px2) + 0.5, h);
      c.stroke();
      if (t.big || unit.ms / tl.mpp > 56) {
        c.fillStyle = t.big ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.34)';
        c.fillText(t.label, Math.round(px2) + 4, 3);
      }
    });

    // Today, and the future, which is not a place you can go.
    var nowX = x(Date.now());
    if (nowX < w) {
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fillRect(nowX, 0, w - nowX, h);
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.moveTo(Math.round(nowX) + 0.5, 0);
      c.lineTo(Math.round(nowX) + 0.5, h);
      c.stroke();
    }

    var cx = x(U.dayMs(state.date));
    el.tlCursor.style.left = cx + 'px';
    el.tlCursor.style.display = (cx < -4 || cx > w + 4) ? 'none' : '';
    el.tlCursorDate.textContent = U.prettyDate(state.date);
    el.tlCursor.classList.toggle('flip', cx > w - 120);

    var a = state.anim;
    if (a && a.from && a.to && (state.ui.showRange || window.WVAnim.playing())) {
      var rx = x(U.dayMs(a.from)), rw = x(U.dayMs(a.to)) - rx;
      el.tlRange.hidden = false;
      el.tlRange.style.left = rx + 'px';
      el.tlRange.style.width = Math.max(2, rw) + 'px';
    } else {
      el.tlRange.hidden = true;
    }
  };

  UI.renderDate = function () {
    el.dateText.textContent = U.prettyDate(state.date);
    el.dateSub.textContent = U.relDate(state.date);
    var latest = U.latestDay();
    el.nextDay.disabled = U.diffDays(state.date, latest) <= 0;
    var sub = state.layers.some(function (r) {
      var L = D.layer(r.id);
      return r.on && L && (L.period === '30min' || L.period === '10min');
    });
    el.subtime.hidden = !sub;
    if (sub) {
      el.subtimeInput.value = String(Math.round(state.minutes / 10));
      el.subtimeText.textContent = U.pad(Math.floor(state.minutes / 60)) + ':' + U.pad(state.minutes % 60);
    }
    var playing = window.WVAnim.playing();
    el.playBtn.querySelector('.ic-play').hidden = playing;
    el.playBtn.querySelector('.ic-pause').hidden = !playing;
    el.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play animation');
  };

  // -------------------------------------------------------------- compare ---
  function bindCompare() {
    var grip = el.compare.querySelector('.cmp-grip');
    grip.addEventListener('pointerdown', function (e) {
      grip.setPointerCapture(e.pointerId);
      function move(ev) {
        var x = U.clamp(ev.clientX / window.innerWidth, 0.05, 0.95);
        state.compare.x = x;
        UI.renderCompare();
        M.invalidate();
      }
      function up() {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        app.save();
      }
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    el.cmpTagA.addEventListener('click', function () { UI.openDatePick(); });
    el.cmpTagB.addEventListener('click', function () { UI.openDatePick(true); });
  }

  UI.renderCompare = function () {
    var c = state.compare;
    if (!c || !c.on) { el.compare.hidden = true; UI.setToolState('compare', false); return; }
    el.compare.hidden = false;
    UI.setToolState('compare', true);
    el.compare.style.setProperty('--x', (c.x * 100) + '%');
    el.cmpTagA.textContent = U.prettyDate(state.date);
    el.cmpTagB.textContent = U.prettyDate(c.date);
  };

  // ---------------------------------------------------------------- sheets --
  function show(node) {
    UI.closeSheets(true);
    el.scrim.hidden = false;
    node.hidden = false;
    node.dataset.open = '1';
    document.body.classList.add('sheet-open');
  }
  UI.closeSheets = function (keepScrim) {
    [el.browse, el.modal].forEach(function (n) { n.hidden = true; delete n.dataset.open; });
    if (!keepScrim) {
      el.scrim.hidden = true;
      document.body.classList.remove('sheet-open');
    }
  };
  UI.sheetOpen = function () { return !el.browse.hidden || !el.modal.hidden; };

  UI.openModal = function (title, build) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = '';
    show(el.modal);
    build(el.modalBody);
  };

  /*
   * msg, then optionally { bad: true } or { action: 'Undo', fn: … }.
   * A destructive control with no way back is a trap; a trash icon on every
   * layer row needed one, and a toast is where it goes.
   */
  UI.toast = function (msg, opts) {
    opts = (opts === true) ? { bad: true } : (opts || {});
    el.toast.innerHTML = '';
    el.toast.appendChild(U.el('span', '', msg));
    if (opts.action) {
      var b = U.el('button', 'toast-do', opts.action);
      b.type = 'button';
      b.addEventListener('click', function () {
        el.toast.hidden = true;
        opts.fn();
      });
      el.toast.appendChild(b);
    }
    el.toast.hidden = false;
    el.toast.classList.toggle('bad', !!opts.bad);
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(function () { el.toast.hidden = true; }, opts.action ? 6000 : 3600);
  };

  UI.busy = function (text) {
    if (!text) { el.busy.hidden = true; return; }
    el.busyText.textContent = text;
    el.busy.hidden = false;
  };

  UI.renderNet = function () {
    var off = T.net === 'offline';
    el.netChip.classList.toggle('off', off);
    el.netChip.querySelector('.lbl').textContent = off ? 'Offline' : 'Live';
    el.netChip.title = off
      ? 'No connection — showing imagery saved in this file'
      : 'Connected to NASA GIBS';
  };

  UI.renderReadout = function (world) {
    var at = world || M.toWorld(M.size().w / 2, M.size().h / 2);
    // With no pointer (a phone, or a mouse that has not moved) the readout says
    // where the MIDDLE of the map is, which is the question it is there to
    // answer. A row of zeroes is not an answer — and neither is a coordinate
    // with no place attached to it, so once you are close enough for a place
    // name to mean something, it says that too.
    var name = '';
    if (M.zoomLevel() > 2.4) {
      var near = D.nearestPlace(at.lat, at.lon);
      if (near) name = (M.zoomLevel() > 5 ? '' : 'near ') + near.name + '  ';
    }
    el.coords.textContent = name + U.fmtLatLon(at.lat, at.lon);
    // A scale bar that is a round number of kilometres, not 137.4.
    var mid = M.toWorld(0, M.size().h / 2);
    var mPerPx = U.haversine(mid.lat, 0, mid.lat, M.view.res) ;
    var target = 90;
    var m = mPerPx * target;
    var nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    var km = m / 1000, pick = nice[0];
    for (var i = 0; i < nice.length; i++) if (nice[i] <= km) pick = nice[i];
    var wpx = (pick * 1000) / mPerPx;
    var bar = el.scalebar.querySelector('i');
    bar.style.width = U.clamp(wpx, 24, 140) + 'px';
    el.scalebar.querySelector('b').textContent = pick >= 1 ? pick.toLocaleString() + ' km' : (pick * 1000) + ' m';
  };

  // ------------------------------------------------------------- keyboard ---
  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      var k = e.key;
      if (k === 'Escape') {
        if (UI.sheetOpen()) UI.closeSheets();
        else if (state.measure) app.toggleMeasure();
        else if (state.compare && state.compare.on) app.toggleCompare();
        else if (mode !== 'desktop' && UI.panelOpen()) UI.setPanel(false);
        return;
      }
      if (k === ' ') { e.preventDefault(); app.togglePlay(); return; }
      if (k === ',' || k === '[') { app.stepDate(-1); return; }
      if (k === '.' || k === ']') { app.stepDate(1); return; }
      if (k === '+' || k === '=') { M.zoomBy(0.5); return; }
      if (k === '-' || k === '_') { M.zoomBy(2); return; }
      if (k === 'l' || k === 'L') { UI.setPanel(!UI.panelOpen()); return; }
      if (k === 'a' || k === 'A') { UI.openBrowse(); return; }
      if (k === 'c' || k === 'C') { app.toggleCompare(); return; }
      if (k === '/') { e.preventDefault(); el.searchInput.focus(); return; }
      var pan = e.shiftKey ? 320 : 90;
      if (k === 'ArrowLeft') { M.pan(pan, 0); e.preventDefault(); }
      else if (k === 'ArrowRight') { M.pan(-pan, 0); e.preventDefault(); }
      else if (k === 'ArrowUp') { M.pan(0, pan); e.preventDefault(); }
      else if (k === 'ArrowDown') { M.pan(0, -pan); e.preventDefault(); }
    });
  }

  /*
   * The inspector — the right-hand column on a wide screen. It answers the four
   * questions a map cannot: where am I, what is the top layer, does it have
   * anything for this day, and what do its colours mean. Below 1400px it is not
   * rendered at all.
   */
  var INS_TOOLS = [['compare', 'Compare A/B'], ['measure', 'Measure'], ['shot', 'Save a picture'],
                   ['views', 'Saved views'], ['tours', 'Explore']];

  UI.renderInspector = function () {
    if (!el.inspect || window.innerWidth < 1400) return;
    var v = M.view;
    var body = el.insBody;
    var near = D.nearestPlace(v.lat, v.lon);
    body.innerHTML = '';

    // Zoomed out to the planet, "near Accra" is not where you are — it is the
    // nearest name to the middle of an ocean-sized view.
    var z = M.zoomLevel();
    var placeName = z < 2.4 || !near ? 'The whole Earth'
      : (z > 5 ? near.name : 'near ' + near.name);
    var place = U.el('div', 'ins-place', placeName);
    body.appendChild(place);
    var co = U.el('div', 'ins-coords', U.fmtLatLon(v.lat, v.lon) + '  ·  z' + M.zoomLevel().toFixed(1));
    body.appendChild(co);
    body.appendChild(U.el('div', 'ins-sep'));

    var top = null;
    for (var i = 0; i < state.layers.length; i++) {
      var L = D.layer(state.layers[i].id);
      if (L && state.layers[i].on && !L.ref && !L.builtin) { top = L; break; }
    }
    if (!top) {
      // Nothing from GIBS on: describe the base you ARE looking at, not the
      // topmost reference layer. "Place labels" is not what is on the screen.
      for (var j = state.layers.length - 1; j >= 0; j--) {
        var Lb = D.layer(state.layers[j].id);
        if (Lb && state.layers[j].on && !Lb.ref) { top = Lb; break; }
      }
    }
    if (!top) {
      for (var k = 0; k < state.layers.length; k++) {
        var Lc = D.layer(state.layers[k].id);
        if (Lc && state.layers[k].on) { top = Lc; break; }
      }
    }
    if (top) {
      var box = U.el('div', 'ins-layer');
      box.appendChild(U.el('b', '', top.title));
      box.appendChild(U.el('span', 'who', top.sub || ''));
      var dl = U.el('dl', 'ins-facts');
      function fact(k, val, cls) {
        dl.appendChild(U.el('dt', '', k));
        dl.appendChild(U.el('dd', cls || '', val));
      }
      if (top.builtin) {
        fact('source', 'inside this app');
        fact('needs', 'no connection', 'ins-ok');
      } else {
        fact('resolution', top.set);
        fact('cadence', periodWord(top.period));
        fact('record', (top.start ? top.start.slice(0, 4) : '—') + '–' + (top.end ? top.end.slice(0, 4) : 'now'));
        fact('id', top.id);
        var cov = D.coverage(top, state.date);
        var st = M.layerStatus && M.layerStatus(top.id);
        var word = !cov.ok ? 'none on this day'
          : (st && !st.drawn && st.missing && !st.pending) ? 'nothing over this view'
          : (T.net === 'offline' ? 'from this file' : 'live');
        fact('this day', word, cov.ok && word !== 'nothing over this view' ? 'ins-ok' : 'ins-warn');
      }
      box.appendChild(dl);
      if (!top.builtin) {
        var lg = U.el('div', 'lyr-legend');
        box.appendChild(lg);
        loadLegend(top, lg);
      }
      if (top.about) box.appendChild(U.el('p', 'ins-about', top.about));
      body.appendChild(box);
    }

    body.appendChild(U.el('div', 'ins-sep'));
    var acts = U.el('div', 'ins-actions');
    INS_TOOLS.forEach(function (t) {
      var b = U.el('button', '', t[1]);
      b.type = 'button';
      if (t[0] === 'compare' && state.compare.on) b.classList.add('on');
      b.addEventListener('click', function () { runTool(t[0]); });
      acts.appendChild(b);
    });
    body.appendChild(acts);
  };

  // The phone's "Tools" button. Labelled, one thumb-height row each — the six
  // unlabelled glyphs at the screen edge were a quiz nobody passed.
  UI.openTools = function () {
    UI.openModal('Tools', function (body) {
      var list = U.el('div', 'tool-list');
      [['compare', 'Compare two days', 'Split the screen and drag between them'],
       ['measure', 'Measure', 'Tap points for a running distance'],
       ['shot', 'Save a picture', 'This view as an image, with the date on it'],
       ['views', 'Saved views', 'Places and days you kept in this file'],
       ['home', 'Whole Earth', 'Back out to the whole planet']].forEach(function (t) {
        var b = U.el('button', 'tool-row');
        b.type = 'button';
        b.appendChild(U.el('b', '', t[1]));
        b.appendChild(U.el('span', '', t[2]));
        b.addEventListener('click', function () { UI.closeSheets(); runTool(t[0]); });
        list.appendChild(b);
      });
      body.appendChild(list);
    });
  };

  UI.renderAll = function () {
    UI.renderStack();
    UI.renderDate();
    UI.renderTimeline();
    UI.renderCompare();
    UI.renderNet();
    UI.renderReadout();
    UI.renderInspector();
  };

  UI.el = el;
  window.WVUI = UI;
})();
