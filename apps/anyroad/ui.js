// Anyroad — the chrome.
//
// Everything the player touches that is not the car. Kept in one place so the
// game loop never reaches into the DOM: app.js hands this module a state object
// once a frame and it decides what, if anything, needs writing. Writing only on
// change matters — a HUD that rewrites six nodes at 60 Hz is a measurable chunk
// of a phone's frame budget.
(function (root) {
  'use strict';

  var el = {}, hooks = {}, last = {}, noteTimer = null;

  // A handful of places that show the app off: dense city grid, mountain
  // switchbacks, an island road, a desert straight.
  var PRESETS = [
    { name: 'Paris', lat: 48.8698, lon: 2.3078 },
    { name: 'Manhattan', lat: 40.7614, lon: -73.9776 },
    { name: 'Stelvio Pass', lat: 46.5285, lon: 10.4541 },
    { name: 'Amalfi Coast', lat: 40.6340, lon: 14.6027 },
    { name: 'Tokyo', lat: 35.6595, lon: 139.7005 },
    { name: 'Iceland Ring Rd', lat: 64.2540, lon: -21.8270 },
    { name: 'Death Valley', lat: 36.4614, lon: -116.8674 },
    { name: 'Edinburgh', lat: 55.9486, lon: -3.1999 },
  ];

  function $(id) { return document.getElementById(id); }

  function init(h) {
    hooks = h;
    ['view','hud','landing','settings','race','note','fatal','place','speed','status',
     'racehud','rh-time','rh-dist','rh-arrow','q','results','presets','attribution',
     'attribution2','board','mp-status','race-badge','race-hint','cache-size',
     'src-terrain','src-roads','src-imagery','src-quality','note-terrain','note-imagery',
     'searchform','fatal-msg'].forEach(function (id) { el[id] = $(id); });

    buildPresets();
    buildSourceMenus();

    el.searchform.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });

    $('btn-menu').addEventListener('click', function () { openSettings(); });
    $('btn-race').addEventListener('click', function () { openRace(); });
    $('btn-hop').addEventListener('click', function () { show(el.landing); });
    $('close-settings').addEventListener('click', function () { hide(el.settings); });
    $('close-race').addEventListener('click', function () { hide(el.race); });

    // Pedals: pointer events so a held finger keeps the throttle open and
    // leaving the button releases it (a plain click would be useless here).
    ['gas', 'brake'].forEach(function (which) {
      var b = $('pedal-' + which);
      var name = which === 'gas' ? 'throttle' : 'brake';
      ['pointerdown'].forEach(function (ev) {
        b.addEventListener(ev, function (e) { e.preventDefault(); hooks.onPedal(name, true); });
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
        b.addEventListener(ev, function () { hooks.onPedal(name, false); });
      });
    });

    $('clear-cache').addEventListener('click', function () {
      root.Roads.clearCache().then(function () { refreshCacheSize(); note('Cached map data cleared.'); });
    });

    $('set-start').addEventListener('click', function () { markRace('start'); });
    $('set-finish').addEventListener('click', function () { markRace('finish'); });
    $('start-race').addEventListener('click', startRace);
    $('clear-race').addEventListener('click', function () {
      pending.start = null; pending.finish = null;
      root.MP.clearRace(); updateRacePanel(); note('Race cleared.');
    });

    // Back closes the topmost panel instead of doing nothing.
    root.Host.onBack(function () {
      if (!el.fatal.hidden) return;
      if (!el.settings.hidden) { hide(el.settings); return; }
      if (!el.race.hidden) { hide(el.race); return; }
      if (!el.landing.hidden && hooks.frame() && root.App.hasHopped()) { hide(el.landing); return; }
    });

    root.MP.onChange(updateRacePanel);
    renderAttribution();
  }

  function ready() {
    syncSourceMenus();
    refreshCacheSize();
    renderAttribution();
  }

  function show(node) { node.hidden = false; }
  function hide(node) { node.hidden = true; }

  function buildPresets() {
    el.presets.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.name;
      b.addEventListener('click', function () { hooks.onHop(p.lat, p.lon, p.name); });
      el.presets.appendChild(b);
    });
  }

  function doSearch() {
    var q = el.q.value.trim();
    if (!q) return;
    el.results.innerHTML = '<li class="muted">Searching…</li>';
    hooks.onSearch(q).then(function (list) {
      el.results.innerHTML = '';
      if (!list.length) { el.results.innerHTML = '<li class="muted">Nothing found there.</li>'; return; }
      list.forEach(function (r) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.name;
        b.addEventListener('click', function () {
          hooks.onHop(r.lat, r.lon, r.name.split(',')[0]);
        });
        li.appendChild(b);
        el.results.appendChild(li);
      });
    }).catch(function (err) {
      el.results.innerHTML = '<li class="muted">Search failed: ' + escapeHtml(err.message) + '</li>';
    });
  }

  // ---- sources -------------------------------------------------------------
  function buildSourceMenus() {
    fill(el['src-terrain'], root.Sources.TERRAIN);
    fill(el['src-roads'], root.Sources.ROADS);
    fill(el['src-imagery'], root.Sources.IMAGERY);
    el['src-terrain'].addEventListener('change', function () { pick('terrain', this.value); });
    el['src-roads'].addEventListener('change', function () { pick('roads', this.value); });
    el['src-imagery'].addEventListener('change', function () { pick('imagery', this.value); });
    el['src-quality'].addEventListener('change', function () {
      root.Sources.set({ quality: this.value });
      note('Applies to map tiles loaded from here on.');
    });
  }

  function fill(select, list) {
    select.innerHTML = '';
    list.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.id; o.textContent = s.name;
      select.appendChild(o);
    });
  }

  function pick(layer, id) {
    var patch = {}; patch[layer] = id;
    root.Sources.set(patch);
    syncSourceMenus();
    renderAttribution();
    if (layer === 'imagery') {
      var src = root.Sources.imagery;
      if (src.api) {
        // Ask GifOS whether the player has actually configured this API, and if
        // not let GifOS show its own setup prompt — it knows the provider and
        // the Settings screen, and the key never enters this sandbox.
        root.Host.apiReady(src.api).then(function (ok) {
          if (!ok) root.Host.apiSetup(src.api, src.hint);
        });
      }
    }
    note('Source changed — new tiles will use it.');
  }

  function syncSourceMenus() {
    el['src-terrain'].value = root.Sources.current.terrain;
    el['src-roads'].value = root.Sources.current.roads;
    el['src-imagery'].value = root.Sources.current.imagery;
    el['src-quality'].value = root.Sources.current.quality;
    el['note-terrain'].textContent = root.Sources.terrain.note || '';
    el['note-imagery'].textContent = root.Sources.imagery.note || '';
  }

  function renderAttribution() {
    var lines = root.Sources.attribution();
    lines.push('Search: Nominatim / OpenStreetMap');
    var txt = lines.join(' · ');
    if (el.attribution) el.attribution.textContent = txt;
    if (el.attribution2) el.attribution2.textContent = txt;
  }

  function refreshCacheSize() {
    var n = root.Roads.cacheSize();
    el['cache-size'].textContent = n ? (n + ' map tile' + (n === 1 ? '' : 's')) : 'nothing cached yet';
  }

  function openSettings() { syncSourceMenus(); refreshCacheSize(); renderAttribution(); show(el.settings); }

  // ---- race ----------------------------------------------------------------
  var pending = { start: null, finish: null };

  function markRace(which) {
    var car = hooks.car(), frame = hooks.frame();
    if (!car || !frame) return;
    pending[which] = frame.toGeo(car.x, car.z);
    note(which === 'start' ? 'Start line set here.' : 'Finish line set here.');
    updateRacePanel();
  }

  function startRace() {
    if (!pending.start || !pending.finish) { note('Set a start and a finish first.'); return; }
    root.MP.setRace(pending.start, pending.finish).then(function () {
      hide(el.race);
      note('Race starting…');
    });
  }

  function updateRacePanel() {
    var n = root.MP.count();
    el['mp-status'].textContent = n > 1
      ? (n + ' drivers in this world.')
      : 'Driving alone — invite someone and they land right here.';
    var ok = !!(pending.start && pending.finish);
    $('start-race').disabled = !ok;
    el['race-hint'].textContent = ok
      ? 'Start and finish are set. Press Start race — everyone gets a three-second countdown.'
      : 'Drive to where you want the start, set it, drive to the finish, set that, then start.';
    el['race-badge'].hidden = !root.MP.hasRace();
  }

  // ---- per-frame -----------------------------------------------------------
  function hud(s) {
    var kph = Math.round(s.speed);
    if (kph !== last.kph) { el.speed.textContent = kph; last.kph = kph; }

    // One status line, and only when there is something honest to say.
    var msg = '';
    if (s.loading > 0) msg = 'Loading the world… ' + s.loading + ' tile' + (s.loading === 1 ? '' : 's');
    // Past a few seconds of backoff this is not a blip, and the player can
    // actually do something about it — so say what, rather than spin forever.
    else if (s.net.backoffMs > 8000) msg = 'Map server busy — try another Roads source in ☰ Settings';
    else if (s.net.backoffMs > 800) msg = 'Map server busy — waiting ' + Math.ceil(s.net.backoffMs / 1000) + 's';
    else if (s.airborne) msg = 'Airborne';
    if (msg !== last.msg) {
      el.status.textContent = msg;
      el.status.hidden = !msg;
      last.msg = msg;
    }

    if (s.players !== last.players) {
      last.players = s.players;
      updateRacePanel();
    }

    // Race read-out.
    var r = s.race;
    if (!r) {
      if (!el.racehud.hidden) el.racehud.hidden = true;
    } else {
      el.racehud.hidden = false;
      var t = r.countdown > 0 ? Math.ceil(r.countdown / 1000)
            : r.done ? (r.myTime / 1000).toFixed(1)
            : (r.elapsed / 1000).toFixed(1);
      if (t !== last.rt) { el['rh-time'].textContent = t; last.rt = t; }
      var d = r.done ? 'finished' : Math.round(r.toFinish) + ' m to go';
      if (d !== last.rd) { el['rh-dist'].textContent = d; last.rd = d; }
      // Point the arrow at the finish, relative to where the car is facing.
      var car = hooks.car();
      var bearing = Math.atan2(r.finish.x - car.x, r.finish.z - car.z) - car.yaw;
      el['rh-arrow'].style.transform = 'rotate(' + (bearing * 180 / Math.PI) + 'deg)';
      el['rh-arrow'].style.visibility = r.done ? 'hidden' : 'visible';
      if (r.done && r.results && r.results.length !== last.results) {
        last.results = r.results.length;
        renderBoard(r.results);
      }
    }
  }

  function renderBoard(results) {
    el.board.innerHTML = '';
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.innerHTML = escapeHtml(r.name) + ' <span class="t">' + (r.ms / 1000).toFixed(1) + 's</span>';
      el.board.appendChild(li);
    });
  }

  function setPlace(p) { el.place.textContent = p || '—'; }

  function showDrive() {
    hide(el.landing);
    show(el.hud);
  }

  function note(msg) {
    el.note.textContent = msg;
    el.note.hidden = false;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.note.hidden = true; }, 2600);
  }

  function fatal(msg) {
    el['fatal-msg'].textContent = msg;
    show(el.fatal);
    hide(el.landing);
  }

  function openRace() { updateRacePanel(); show(el.race); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  root.UI = {
    init: init, ready: ready, hud: hud, note: note, fatal: fatal,
    setPlace: setPlace, showDrive: showDrive,
  };
})(window);
