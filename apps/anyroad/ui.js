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

  // Cached so the HUD does not measure layout every frame; invalidated on
  // resize and on orientation change, which is the only time it can move.
  var travel = 0;
  function knobTravel() {
    if (!travel) {
      var track = document.querySelector('.steer-track');
      var knob = el['steer-knob'];
      if (track && knob) travel = Math.max(0, (track.clientWidth - knob.offsetWidth) / 2);
    }
    return travel;
  }
  window.addEventListener('resize', function () { travel = 0; last.steer = null; });
  window.addEventListener('orientationchange', function () { travel = 0; last.steer = null; });

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
     'searchform','fatal-msg','steerpad','steer-knob','coach','controls',
     'ctl-steering','ctl-throttle','note-steering','coach-gas','pedal-gas'].forEach(function (id) { el[id] = $(id); });

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
    // Pointer CAPTURE matters — without it, sliding a thumb slightly off the
    // pedal fires pointerleave and the throttle drops mid-corner.
    ['gas', 'brake'].forEach(function (which) {
      var b = $('pedal-' + which);
      var name = which === 'gas' ? 'throttle' : 'brake';
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) {}
        b.classList.add('on');
        hooks.onPedal(name, true);
      });
      ['pointerup', 'pointercancel'].forEach(function (ev) {
        b.addEventListener(ev, function () { b.classList.remove('on'); hooks.onPedal(name, false); });
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
    el['ctl-throttle'].addEventListener('change', function () {
      root.Sources.set({ throttle: this.value });
      note(this.value === 'auto' ? 'The car drives itself — steer and brake.' : 'Hold GO to accelerate.');
    });
    el['ctl-steering'].addEventListener('change', function () {
      root.Sources.set({ steering: this.value });
      note(this.value === 'tilt' ? 'Hold the phone as you like — that is now straight ahead.'
                                 : 'Slide on the pad or the left of the screen.');
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

  // Show or hide the throttle pedal and its coach mark to match the mode. A GO
  // button that does nothing is worse than no button at all.
  function setThrottleMode(mode) {
    var manual = mode === 'manual';
    if (el['pedal-gas']) el['pedal-gas'].hidden = !manual;
    if (el['coach-gas']) el['coach-gas'].hidden = !manual;
    var brakeCoach = document.querySelector('.coach-brake');
    if (brakeCoach) {
      brakeCoach.innerHTML = manual ? 'Hold to brake<br>and reverse'
                                    : 'Drives itself —<br>hold to slow down';
    }
  }

  function syncSourceMenus() {
    el['src-terrain'].value = root.Sources.current.terrain;
    el['src-roads'].value = root.Sources.current.roads;
    el['src-imagery'].value = root.Sources.current.imagery;
    el['src-quality'].value = root.Sources.current.quality;
    el['ctl-throttle'].value = root.Sources.current.throttle;
    el['ctl-steering'].value = root.Sources.current.steering;
    el['note-steering'].textContent = root.Sources.current.steering === 'tilt'
      ? 'Whatever angle you are holding the phone at when you start becomes straight ahead. Your phone will ask permission the first time.'
      : 'Slide on the pad, or anywhere on the left half of the screen.';
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

    // The steering knob is the read-out that makes the control legible: it has
    // to track the wheel whether the input came from the pad, a drag on the
    // canvas, or the keyboard.
    var st = Math.max(-1, Math.min(1, s.steer || 0));
    if (Math.abs(st - (last.steer == null ? 99 : last.steer)) > 0.005) {
      last.steer = st;
      // Travel in PIXELS: half the track, less half the knob, so full lock puts
      // the knob flush against the end instead of half outside it. A percentage
      // here would be a percentage of the KNOB's width, which is not the
      // distance it needs to move.
      el['steer-knob'].style.transform = 'translateX(' + (st * knobTravel()) + 'px)';
    }

    // One status line, and only when there is something honest to say.
    var msg = '';
    // Only while there is genuinely nothing to drive on. Once the ground and a
    // road are down, the rest streams in behind the fog and saying so just puts
    // a permanent pill over the horizon.
    if (!s.ready) msg = 'Building the world…';
    // Past a few seconds of backoff this is not a blip, and the player can
    // actually do something about it — so say what, rather than spin forever.
    else if (s.net.backoffMs > 8000) msg = 'Map server busy — try another Roads source in ☰ Settings';
    else if (s.net.backoffMs > 800) msg = 'Map server busy — waiting ' + Math.ceil(s.net.backoffMs / 1000) + 's';
    else if (s.airborne) msg = 'Airborne';
    else if (s.offRoad) msg = 'Off road — less grip';
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

  // Coach marks appear on the first drive only, and any touch of any control
  // retires them for good. They exist because the controls were unreadable
  // without them, not as decoration — so they must never nag a second time.
  var coachSeen = false;
  function maybeCoach() {
    if (coachSeen) return;
    root.Host.db('prefs').get('coached').then(function (rec) {
      if (rec && rec.done) { coachSeen = true; return; }
      el.coach.hidden = false;
      // A safety net for anyone who reads it and does nothing.
      setTimeout(dismissCoach, 9000);
    }).catch(function () {});
  }
  function dismissCoach() {
    if (coachSeen) return;
    coachSeen = true;
    if (el.coach) el.coach.hidden = true;
    root.Host.db('prefs').put({ id: 'coached', done: true }).catch(function () {});
  }

  function showDrive() {
    hide(el.landing);
    show(el.hud);
    maybeCoach();
  }

  var lastNote = '', lastNoteAt = 0;
  function note(msg) {
    // A busy map server retries continuously, and the old code raised a fresh
    // toast every time — a permanent banner across the middle of the screen
    // saying the same thing. Same message inside 12 s is not news.
    var now = Date.now();
    if (msg === lastNote && now - lastNoteAt < 12000) return;
    lastNote = msg; lastNoteAt = now;
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
    setPlace: setPlace, showDrive: showDrive, dismissCoach: dismissCoach,
    setThrottleMode: setThrottleMode,
    steerPad: function () { return el.steerpad; },
  };
})(window);
