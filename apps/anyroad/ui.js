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
    ['view','hud','landing','settings','race','note','fatal','place','speed','speedo','status',
     'racehud','rh-time','rh-dist','rh-arrow','q','results','presets','attribution',
     'attribution2','board','mp-status','race-badge','race-hint','cache-size',
     'src-terrain','src-roads','src-imagery','src-quality','note-terrain','note-imagery',
     'searchform','fatal-msg','steerpad','steer-knob','coach','controls',
     'ctl-steering','ctl-throttle','note-steering','coach-gas','pedal-gas',
     'health','health-fill','damage-flash','wrecked','gear','stuck','cracks',
     'ctl-wildlife','ctl-traffic','ctl-sound','ctl-blaster','minimap','mapcanvas','map-scale',
     'street','passing','recent',
     'wheel','stick','stick-base','stick-knob','stick-axis','schemes'].forEach(function (id) { el[id] = $(id); });

    buildPresets();
    buildSourceMenus();

    el.searchform.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });

    $('btn-menu').addEventListener('click', function () { openSettings(); });
    $('btn-race').addEventListener('click', function () { openRace(); });
    $('btn-map').addEventListener('click', toggleMap);
    $('btn-hop').addEventListener('click', function () { show(el.landing); });
    $('close-settings').addEventListener('click', function () { hide(el.settings); });
    $('close-race').addEventListener('click', function () { hide(el.race); });
    // The same close at the BOTTOM of each sheet. On a laptop these panels are
    // taller than the window, and a header ✕ you have to scroll UP to reach is
    // a header ✕ you cannot reach at all.
    $('close-settings-bottom').addEventListener('click', function () { hide(el.settings); });
    $('close-race-bottom').addEventListener('click', function () { hide(el.race); });

    // Escape closes the topmost panel. Every desktop dialog in the world does
    // this and its absence is only ever noticed when something else has gone
    // wrong — which is exactly when it is needed.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (!el.settings.hidden) { hide(el.settings); e.preventDefault(); return; }
      if (!el.race.hidden) { hide(el.race); e.preventDefault(); return; }
      if (!el.landing.hidden && hooks.frame() && root.App.hasHopped()) { hide(el.landing); e.preventDefault(); return; }
      if (mapOn) { toggleMap(); e.preventDefault(); }
    });

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
      if (mapOn) { toggleMap(); return; }
    });

    $('btn-repair').addEventListener('click', function () {
      hooks.onRepair();
      el.wrecked.hidden = true;
      clearCracks();
      note('Repaired. Mind the buildings.');
    });

    // The rescue. Deliberately a button and not an automatic teleport: being
    // moved by the game while you are still working out how to reverse out is
    // worse than being stuck, and there is no way for the app to tell the two
    // apart from the outside.
    el.stuck.addEventListener('click', function () {
      hooks.onUnstick();
      el.stuck.hidden = true; last.stuck = false;
    });

    Array.prototype.forEach.call(el.schemes.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        var name = b.dataset.scheme;
        root.Sources.set({ scheme: name });
        setScheme(name);
        dismissCoach();
        note(name === 'stick' ? 'Drag anywhere: up faster, down slower, sideways steers.'
           : name === 'tilt' ? 'Hold the phone as you like — that is now straight ahead.'
           : 'Turn the wheel to steer; the car keeps its own speed.');
      });
    });

    // R for rescue, on the keyboard, whether or not the button is showing —
    // a desktop player wedged in a courtyard should not have to wait 2.5 s for
    // a button to appear before they can do anything about it.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'r' && e.key !== 'R') return;
      var t = e.target, tag = (t && t.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (panelOpen()) return;
      hooks.onUnstick();
      el.stuck.hidden = true; last.stuck = false;
    });

    root.MP.onChange(updateRacePanel);
    renderAttribution();
  }

  function ready() {
    loadRecent();
    syncSourceMenus();
    refreshCacheSize();
    renderAttribution();
  }

  function show(node) { node.hidden = false; }
  function hide(node) { node.hidden = true; }

  // ---- places you have been ------------------------------------------------
  // A search costs a Nominatim request, which their policy rate-limits to one a
  // second, and typing an address again to go back to it is the most obvious
  // thing in the app to get wrong. Kept in the same private prefs collection as
  // everything else, newest first, capped — this is a shortcut, not a history.
  var RECENT_MAX = 8;
  var recent = [];

  function loadRecent() {
    return root.Host.db('prefs').get('recent').then(function (rec) {
      recent = (rec && rec.list) || [];
      renderRecent();
    }).catch(function () {});
  }

  function rememberPlace(lat, lon, name) {
    if (!name) return;
    // Same place twice is one entry, moved to the front — the list is "where
    // can I go back to", not a log.
    recent = recent.filter(function (r) {
      return !(r.name === name || (Math.abs(r.lat - lat) < 1e-4 && Math.abs(r.lon - lon) < 1e-4));
    });
    recent.unshift({ lat: lat, lon: lon, name: name, at: Date.now() });
    if (recent.length > RECENT_MAX) recent.length = RECENT_MAX;
    renderRecent();
    root.Host.db('prefs').put({ id: 'recent', list: recent }).catch(function () {});
  }

  function renderRecent() {
    if (!el.recent) return;
    el.recent.innerHTML = '';
    el.recent.hidden = !recent.length;
    var label = $('recent-label');
    if (label) label.hidden = !recent.length;
    recent.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = r.name;
      b.addEventListener('click', function () { hooks.onHop(r.lat, r.lon, r.name); });
      el.recent.appendChild(b);
    });
  }

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
    el['ctl-traffic'].addEventListener('change', function () {
      root.Sources.set({ traffic: this.value });
      root.Traffic.setLevel(this.value);
      note(this.value === 'none' ? 'The roads are yours.' : 'Traffic: ' + this.value + '.');
    });
    el['ctl-sound'].addEventListener('change', function () {
      root.Sources.set({ sound: this.value });
      // unlock() rather than setMode(): this IS a gesture, so if the graph has
      // not started yet — the player turned sound on from the landing sheet —
      // this is the moment it legitimately can.
      root.Sound.unlock(this.value);
      note(this.value === 'off' ? 'Silent.' : 'Engine on.');
    });
    el['ctl-blaster'].addEventListener('change', function () {
      root.Sources.set({ blaster: this.value });
      root.Blaster.setEnabled(this.value !== 'off');
      note(this.value === 'off' ? 'Blaster removed.' : 'Blaster fitted — space, or tap the screen.');
    });
    el['ctl-wildlife'].addEventListener('change', function () {
      root.Sources.set({ wildlife: this.value });
      note(this.value === 'on' ? 'Watch for animals on the road.' : 'The roads are empty again.');
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
      brakeCoach.innerHTML = manual ? 'Hold to brake —<br>keep holding to reverse'
                                    : 'Drives itself — hold to<br>slow, then to reverse';
    }
  }

  function syncSourceMenus() {
    el['src-terrain'].value = root.Sources.current.terrain;
    el['src-roads'].value = root.Sources.current.roads;
    el['src-imagery'].value = root.Sources.current.imagery;
    el['src-quality'].value = root.Sources.current.quality;
    el['ctl-throttle'].value = root.Sources.current.throttle;
    el['ctl-steering'].value = root.Sources.current.steering;
    el['ctl-wildlife'].value = root.Sources.current.wildlife;
    el['ctl-traffic'].value = root.Sources.current.traffic;
    el['ctl-sound'].value = root.Sources.current.sound;
    el['ctl-blaster'].value = root.Sources.current.blaster;
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

    // Direction, because a number with no sign told the player nothing. The
    // whole read-out turns amber in reverse rather than only the little R: at a
    // glance, "the speedo looks different" has to arrive before you read it.
    if (!!s.reverse !== !!last.reverse) {
      last.reverse = !!s.reverse;
      el.gear.hidden = !s.reverse;
      el.speedo.classList.toggle('reversing', !!s.reverse);
    }

    // The rescue button, and only while it is true.
    if (!!s.stuck !== !!last.stuck) {
      last.stuck = !!s.stuck;
      el.stuck.hidden = !s.stuck;
    }

    // GO appears the moment you are stopped, in EVERY throttle mode. The car
    // used to pull away the instant the brake came off, which made stopping
    // feel impossible; now a stop stays a stop, and this is the button that
    // says otherwise. Hiding it in auto mode would leave a stopped player with
    // nothing to press.
    if (!!s.halted !== !!last.halted) {
      last.halted = !!s.halted;
      if (el['pedal-gas'] && root.Sources.current.throttle !== 'manual') {
        el['pedal-gas'].hidden = !s.halted;
      }
      el.speedo.classList.toggle('halted', !!s.halted);
    }

    // The steering knob is the read-out that makes the control legible: it has
    // to track the wheel whether the input came from the pad, a drag on the
    // canvas, or the keyboard.
    // The wheel turns the way a wheel turns: full lock is ±120°, which reads as
    // a real steering input rather than a dial.
    var st = Math.max(-1, Math.min(1, s.steer || 0));
    if (Math.abs(st - (last.steer == null ? 99 : last.steer)) > 0.005) {
      last.steer = st;
      el.wheel.style.transform = 'rotate(' + (st * 120) + 'deg)';
    }

    // The road under the wheels. Written only when it CHANGES — this is a
    // string comparison sixty times a second otherwise.
    if (s.street !== last.street) {
      last.street = s.street;
      el.street.textContent = s.street || '';
      el.street.hidden = !s.street;
    }

    // …and the ones going past. app.js owns which junctions have been called
    // out; this owns the fact that a label appears on the side it went by and
    // then removes itself.
    if (s.passing && s.passing.length) {
      for (var pi = 0; pi < s.passing.length; pi++) {
        var pass = s.passing[pi];
        if (pass.shown) continue;
        pass.shown = true;
        var node = document.createElement('div');
        node.className = 'pass ' + (pass.side > 0 ? 'right' : 'left');
        node.textContent = (pass.side > 0 ? '' : '↖ ') + pass.name + (pass.side > 0 ? ' ↗' : '');
        el.passing.appendChild(node);
        (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 3600); })(node);
      }
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
    else if (s.beast) msg = 'Animal on the road';
    else if (s.airborne) msg = 'Airborne';
    else if (s.offRoad) msg = 'Off road — less grip';
    if (msg !== last.msg) {
      el.status.textContent = msg;
      el.status.hidden = !msg;
      last.msg = msg;
    }

    // Condition bar: colour carries the state, so it is legible without reading.
    var h = Math.max(0, Math.min(100, s.health == null ? 100 : s.health));
    if (Math.abs(h - (last.health == null ? -1 : last.health)) > 0.5) {
      last.health = h;
      el['health-fill'].style.width = h + '%';
      el['health-fill'].style.background = h > 60 ? '#48d17a' : (h > 25 ? '#e8b34a' : '#e0544a');
      // Condition is not only a bar in the corner any more: the same number
      // spreads the cracks across the glass you are looking through.
      setDamage(h);
    }
    if (!!s.wrecked !== !!last.wrecked) {
      last.wrecked = !!s.wrecked;
      el.wrecked.hidden = !s.wrecked;
    }

    // The inset redraws at 8 Hz on its own clock — see drawMap.
    if (mapOn) {
      var mnow = Date.now();
      if (mnow - mapAt > 125) { mapAt = mnow; drawMap(hooks.car()); }
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

  // ---- the bird's-eye inset ------------------------------------------------
  // Drawn from the ROAD INDEX — the same bucketed segments the car asks "am I
  // on tarmac" with — so the map cannot disagree with the world it is a map of.
  // Nothing here is a second copy of anything.
  //
  // HEADING-UP, not north-up: this is a windscreen instrument, and the useful
  // question is "what is the shape of the road in front of me", which north-up
  // makes you rotate in your head at exactly the moment you have no attention
  // to spare.
  //
  // Redrawn at 8 Hz. It is a canvas full of strokes and it is an inset the size
  // of a stamp; sixty of those a second would cost more than the world behind
  // it.
  var mapOn = false, mapAt = 0, mapCtx = null;
  var MAP_RANGE = 200;          // metres from the centre to the edge

  function toggleMap() {
    mapOn = !mapOn;
    el.minimap.hidden = !mapOn;
    $('btn-map').setAttribute('aria-pressed', String(mapOn));
    if (mapOn) mapAt = 0;
  }

  function drawMap(car) {
    var cv = el.mapcanvas;
    if (!cv) return;
    if (!mapCtx) mapCtx = cv.getContext('2d');
    var g = mapCtx, W = cv.width, H = cv.height;
    var R = Math.min(W, H) / 2;
    var scale = R / MAP_RANGE;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    // Round window.
    g.beginPath(); g.arc(W / 2, H / 2, R - 1, 0, 6.2832); g.clip();
    g.fillStyle = '#16200f';
    g.fillRect(0, 0, W, H);

    // World -> map: translate to the car, rotate so its heading points up.
    g.translate(W / 2, H / 2);
    g.rotate(car.yaw);
    // The world is x=east, z=north and the screen is y-down, so north maps to
    // -y. Scale z by -1 rather than negating every coordinate by hand.
    g.scale(scale, -scale);
    g.translate(-car.x, -car.z);

    var world = hooks.world ? hooks.world() : null;
    var k, r, i, segs;
    if (world) {
      // Buildings first, as a wash under the roads.
      g.strokeStyle = 'rgba(150, 160, 175, 0.5)';
      g.lineWidth = 1.6 / scale;
      g.beginPath();
      for (k in world.roads) {
        r = world.roads[k];
        if (!r || !r.built || !r.built.walls) continue;
        segs = r.built.walls.segs;
        for (i = 0; i < segs.length; i += 4) {
          if (Math.abs(segs[i] - car.x) > MAP_RANGE || Math.abs(segs[i + 1] - car.z) > MAP_RANGE) continue;
          g.moveTo(segs[i], segs[i + 1]);
          g.lineTo(segs[i + 2], segs[i + 3]);
        }
      }
      g.stroke();

      // Roads, at their real width, coloured by what they are made of.
      for (k in world.roads) {
        r = world.roads[k];
        if (!r || !r.built || !r.built.index) continue;
        segs = r.built.index.segs;
        for (i = 0; i < segs.length; i += 7) {
          if (Math.abs(segs[i] - car.x) > MAP_RANGE || Math.abs(segs[i + 1] - car.z) > MAP_RANGE) continue;
          g.strokeStyle = segs[i + 6] >= 2 ? '#6b5638' : segs[i + 6] >= 1 ? '#7d7566' : '#4a4f57';
          g.lineWidth = Math.max(2 / scale, segs[i + 4] * 2);
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(segs[i], segs[i + 1]);
          g.lineTo(segs[i + 2], segs[i + 3]);
          g.stroke();
        }
      }
    }

    // Everything that moves.
    if (root.Traffic) {
      g.fillStyle = '#d8dde6';
      root.Traffic.drawList().forEach(function (t) {
        g.beginPath(); g.arc(t.x, t.z, 3.4 / scale * 1.6, 0, 6.2832); g.fill();
      });
    }
    if (root.Animals) {
      g.fillStyle = '#c9a24a';
      root.Animals.drawList().forEach(function (a) {
        g.beginPath(); g.arc(a.x, a.z, 2.6 / scale * 1.6, 0, 6.2832); g.fill();
      });
    }
    if (root.MP) {
      root.MP.ghosts().forEach(function (o) {
        g.fillStyle = 'rgb(' + o.tint.map(function (c) { return Math.round(c * 255); }).join(',') + ')';
        g.beginPath(); g.arc(o.x, o.z, 4 / scale * 1.6, 0, 6.2832); g.fill();
      });
    }
    g.restore();

    // The car, drawn last and in SCREEN space: it is always at the centre
    // pointing up, so it needs none of the world transform.
    g.save();
    g.translate(W / 2, H / 2);
    g.fillStyle = '#e8443c';
    g.beginPath();
    g.moveTo(0, -11); g.lineTo(7, 9); g.lineTo(0, 5); g.lineTo(-7, 9);
    g.closePath(); g.fill();
    g.restore();

    // North, so heading-up does not cost you your bearings entirely.
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-car.yaw);
    g.fillStyle = 'rgba(226,233,245,0.85)';
    g.font = 'bold 20px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('N', 0, -R + 24);
    g.restore();
  }

  // ---- the windscreen ------------------------------------------------------
  // Condition used to be a 128-pixel bar in a corner, which is a number about
  // the car rather than something happening to YOU. Damage now lands on the
  // glass you are looking through: every impact chips it where it hit, and as
  // the condition falls those chips grow legs and spread. It is drawn on a 2D
  // canvas over the GL one — cheap, redrawn only when the damage actually
  // changes, and never once per frame.
  //
  // Two rules keep it from becoming an obstacle:
  //  - the cracks stay OUT of the middle of the screen, where the road is;
  //  - they are thin and mostly transparent, so they read as glass rather than
  //    as a texture pasted over the picture.
  var impacts = [];            // { u, v, r, seed } in 0..1 screen space
  var damageLevel = 100;
  var crackCtx = null;

  function crackCanvas() {
    if (!crackCtx && el.cracks) {
      crackCtx = el.cracks.getContext('2d');
      root.addEventListener('resize', drawCracks);
    }
    return crackCtx;
  }

  // A tiny deterministic PRNG per impact, so a redraw (a resize, a rotation)
  // reproduces the SAME crack rather than shattering the glass again.
  function prng(seed) {
    var s = seed;
    return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  }

  function branch(ctx, x, y, ang, len, depth, rand) {
    if (len < 5 || depth > 2) return;
    var segs = 2 + Math.floor(rand() * 3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    var cx = x, cy = y, a = ang;
    for (var i = 0; i < segs; i++) {
      a += (rand() - 0.5) * 0.7;
      var step = len / segs;
      cx += Math.cos(a) * step; cy += Math.sin(a) * step;
      ctx.lineTo(cx, cy);
      // Forks, which is what makes it a crack and not a scratch.
      if (rand() < 0.45) branch(ctx, cx, cy, a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.6),
                                len * (0.35 + rand() * 0.3), depth + 1, rand);
    }
    ctx.lineWidth = Math.max(0.6, 2.2 - depth * 0.55);
    ctx.stroke();
  }

  function drawCracks() {
    var ctx = crackCanvas();
    if (!ctx) return;
    var cv = el.cracks;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.floor(cv.clientWidth * dpr), h = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!impacts.length) return;

    // Everything grows as the condition falls, so the glass keeps deteriorating
    // between hits instead of only at the moment of impact.
    var spread = 1 + (100 - damageLevel) / 100 * 0.85;
    var scale = Math.min(w, h);

    for (var i = 0; i < impacts.length; i++) {
      var im = impacts[i];
      var x = im.u * w, y = im.v * h;
      var rand = prng(im.seed);
      // Short. A crack is a star a hand's width across, not a line across the
      // windscreen — at 0.16 of the screen per arm the first version drew
      // something that read as scratches on the lens, and worse, as scenery.
      var len = im.r * scale * 0.042 * spread;

      // The arms are decided ONCE and drawn twice. Deriving them inside each
      // pass advanced the shared PRNG differently, so the dark pass drew a
      // completely different star from the light one — two cracks, not one
      // crack with a shadow, which is exactly what it looked like.
      var arms = [];
      var n = 5 + Math.floor(rand() * 4);
      var a0 = rand() * 6.28;
      for (var k = 0; k < n; k++) {
        arms.push({ ang: a0 + k * 6.28 / n + (rand() - 0.5) * 0.5,
                    len: len * (0.55 + rand() * 0.75), seed: im.seed + k * 7919 });
      }

      function pass(dx, dy, style) {
        ctx.save();
        ctx.translate(dx, dy);
        ctx.strokeStyle = style;
        for (var j = 0; j < arms.length; j++) {
          branch(ctx, x, y, arms[j].ang, arms[j].len, 0, prng(arms[j].seed));
        }
        ctx.restore();
      }
      // Glass fractures read as a bright line with a shadow under it; one
      // stroke on its own is a pen mark.
      pass(1.1, 1.1, 'rgba(8, 13, 22, 0.34)');
      pass(0, 0, 'rgba(228, 240, 253, 0.58)');

      // The chip itself: a small pit of pulverised glass at the point of
      // contact, which is the bit that actually says "something hit this".
      var pit = Math.max(2.5, im.r * scale * 0.006 * spread);
      var g = ctx.createRadialGradient(x, y, 0, x, y, pit * 3);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
      g.addColorStop(0.45, 'rgba(206, 226, 245, 0.22)');
      g.addColorStop(1, 'rgba(206, 226, 245, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, pit * 3, 0, 6.2832);
      ctx.fill();
    }
  }

  // A new chip, placed where it will not sit on top of the road: the middle
  // third of the screen is where you are looking, so impacts land around it.
  function addImpact(severity) {
    if (impacts.length >= 14) impacts.shift();
    var side = Math.random() < 0.5 ? -1 : 1;
    impacts.push({
      u: 0.5 + side * (0.16 + Math.random() * 0.28),
      v: 0.10 + Math.random() * 0.42,
      r: Math.max(0.45, Math.min(2.2, 0.5 + severity / 14)),
      seed: Math.floor(Math.random() * 2000000) + 1,
    });
    drawCracks();
  }

  function setDamage(health) {
    var was = damageLevel;
    damageLevel = health;
    // Only redraw on a real change of state — this is a full canvas repaint and
    // it must not happen because a number wobbled by a tenth.
    if (impacts.length && Math.abs(was - health) > 2) drawCracks();
  }

  function clearCracks() {
    impacts.length = 0;
    damageLevel = 100;
    drawCracks();
  }

  // Called on impact only — the bar itself is refreshed from hud() every frame,
  // so this exists for the parts that are events rather than state.
  function damage(health, crash, amount) {
    // Anything that actually cost condition marks the glass; a scrape along a
    // wall does not, or driving down a narrow street would frost the windscreen.
    if (amount > 0.8) { addImpact(amount); root.Sound.glass(); }
    if (!crash) return;                       // scrapes do not flash the screen
    el['damage-flash'].classList.remove('hit');
    void el['damage-flash'].offsetWidth;      // restart the animation
    el['damage-flash'].classList.add('hit');
  }

  // Draw the rubber-band stick wherever the thumb put it.
  function showStick(st) {
    if (!st || !st.active) { el.stick.hidden = true; return; }
    el.stick.hidden = false;
    el['stick-base'].style.left = st.ox + 'px';
    el['stick-base'].style.top = st.oy + 'px';
    el['stick-axis'].style.left = st.ox + 'px';
    el['stick-axis'].style.top = st.oy + 'px';
    el['stick-knob'].style.left = (st.ox + st.x * 78) + 'px';
    el['stick-knob'].style.top = (st.oy - st.y * 78) + 'px';
  }

  function setScheme(name) {
    Array.prototype.forEach.call(el.schemes.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.dataset.scheme === name));
    });
    // The wheel is only meaningful when a wheel is what you are using.
    el.steerpad.hidden = (name !== 'wheel');
    if (name !== 'stick') el.stick.hidden = true;
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

  // Is anything full-screen in front of the player? The loop asks every frame
  // and parks the car if so — see app.js. `fatal` is deliberately in the list:
  // the app is dead, and a dead app must not still be driving.
  function panelOpen() {
    return !!(el.landing && !el.landing.hidden) || !!(el.settings && !el.settings.hidden)
        || !!(el.race && !el.race.hidden) || !!(el.fatal && !el.fatal.hidden)
        || !!(el.wrecked && !el.wrecked.hidden);
  }

  root.UI = {
    init: init, ready: ready, hud: hud, note: note, fatal: fatal,
    setPlace: setPlace, showDrive: showDrive, dismissCoach: dismissCoach,
    setThrottleMode: setThrottleMode, damage: damage, panelOpen: panelOpen,
    rememberPlace: rememberPlace, recent: function () { return recent.slice(); },
    showStick: showStick, setScheme: setScheme, clearCracks: clearCracks,
    crackCount: function () { return impacts.length; },
    steerPad: function () { return el.steerpad; },
  };
})(window);
