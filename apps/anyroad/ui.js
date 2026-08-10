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
     'attribution2','board','mp-status','race-badge','race-hint','cache-size','tilemap',
     'src-terrain','src-roads','src-imagery','src-quality','note-terrain','note-imagery',
     'searchform','fatal-msg','steerpad','steer-knob','coach','controls',
     'worldstat','ws-summary','ws-mirrors','ws-tiles',
     'ctl-steering','ctl-throttle','note-steering','coach-gas','pedal-gas',
     'health','health-fill','damage-flash','wrecked','gear','stuck','cracks',
     'ctl-wildlife','ctl-traffic','ctl-sound','ctl-blaster','ctl-keep','ctl-fill','note-offline','race-dist',
     'street','passing','recent','cockpit','cockpit-wheel','pov-eye',
     'dash-speed','dash-cond-fill','speedo','btn-fly','fly-plane','fly-car','dash-unit',
     'dash-alt','dash-alt-m',
     'wheel','stick','stick-base','stick-knob','stick-axis','schemes'].forEach(function (id) { el[id] = $(id); });

    buildPresets();
    buildSourceMenus();
    buildOfflineMenu();

    el.searchform.addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch();
    });

    $('btn-menu').addEventListener('click', function () { openSettings(); });
    $('btn-race').addEventListener('click', function () { openRace(); });
    $('btn-map').addEventListener('click', function () {
      // Bird's eye is a CAMERA MOVE now, not an inset. The old canvas minimap
      // was a second renderer over a second read of the world, and it rotted
      // the way second copies do — it walked the road index at a stale stride,
      // painted garbage strokes hundreds of metres wide, and ate the frame
      // rate doing it. The world already has a renderer; this now just flies
      // its eye up (toggleBirdseye in app.js) and back down.
      var v = hooks.onView ? hooks.onView() : 'chase';
      setView(v);
    });
    $('btn-hop').addEventListener('click', function () { show(el.landing); });
    if (el['btn-fly']) {
      el['btn-fly'].addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (hooks.onFly) hooks.onFly();
      });
    }
    $('close-settings').addEventListener('click', function () { hide(el.settings); });
    $('close-race').addEventListener('click', function () { hide(el.race); });
    // The same close at the BOTTOM of each sheet. On a laptop these panels are
    // taller than the window, and a header ✕ you have to scroll UP to reach is
    // a header ✕ you cannot reach at all.
    $('close-settings-bottom').addEventListener('click', function () { hide(el.settings); });
    // THE TILE MAP IS A BUTTON. It has always shown WHICH tiles are missing and
    // never WHY, which is the only half a waiting player actually wants.
    // THE PLACE NAME IS A WAY BACK. You drive twenty minutes out, get lost,
    // and the only route home is the hop sheet and typing the address again.
    // It is already labelled with where you started; make it do that.
    if (el.place) {
      el.place.style.cursor = 'pointer';
      el.place.setAttribute('title', 'Back to where you arrived');
      el.place.addEventListener('click', function () {
        if (panelOpen()) return;
        root.App.returnToSpawn();
      });
    }
    if (el.tilemap) {
      el.tilemap.style.cursor = 'pointer';
      el.tilemap.addEventListener('click', openWorldStat);
    }
    $('close-worldstat').addEventListener('click', function () { hide(el.worldstat); });
    $('close-worldstat-bottom').addEventListener('click', function () { hide(el.worldstat); });
    $('close-race-bottom').addEventListener('click', function () { hide(el.race); });

    // Escape closes the topmost panel. Every desktop dialog in the world does
    // this and its absence is only ever noticed when something else has gone
    // wrong — which is exactly when it is needed.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (!el.worldstat.hidden) { hide(el.worldstat); e.preventDefault(); return; }
      if (!el.settings.hidden) { hide(el.settings); e.preventDefault(); return; }
      if (!el.race.hidden) { hide(el.race); e.preventDefault(); return; }
      if (!el.landing.hidden && hooks.frame() && root.App.hasHopped()) { hide(el.landing); e.preventDefault(); return; }
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

    $('start-race').addEventListener('click', startRace);
    $('clear-race').addEventListener('click', function () {
      root.MP.clearRace(); updateRacePanel(); note('Race cleared.');
    });

    // Back closes the topmost panel instead of doing nothing.
    root.Host.onBack(function () {
      if (!el.fatal.hidden) return;
      if (!el.worldstat.hidden) { hide(el.worldstat); return; }
      if (!el.settings.hidden) { hide(el.settings); return; }
      if (!el.race.hidden) { hide(el.race); return; }
      if (!el.landing.hidden && hooks.frame() && root.App.hasHopped()) { hide(el.landing); return; }
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
    syncOfflineNote();
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

  // ---- the loading map ------------------------------------------------------
  // A tile is one of five things and each gets a colour a driver can read at a
  // glance without stopping to interpret a legend:
  //   ready     solid    — roads are down, drive here
  //   building  amber    — the data arrived, geometry is being made
  //   loading   blue     — in flight right now
  //   want N    dim + N  — queued, and N is the place in the queue
  //   failed    red      — that mirror gave up; the streamer will retry
  // HEADING-UP, corrected from north-up. I argued for north-up on the grounds
  // that you are comparing directions — but the instrument sits in a windscreen
  // next to a steering wheel, and every other thing in that view is relative to
  // where the car is pointing. A north-up square in that context reads as a
  // grid that has nothing to do with you, which is exactly the confusion it
  // caused. Forward is now up, and the marker in the middle is an arrow rather
  // than a dot so the orientation is stated rather than implied.
  // A tile is not simply "done": several layers come from the map server and a
  // busy tile can arrive with only some of them. Roads-with-no-buildings is the
  // one that matters — through a windscreen it is indistinguishable from a
  // street of empty lots, and it was being painted the same green as a complete
  // tile. Three shades of done, so the map stops lying:
  //   ready      green    roads, buildings, woodland, pools — everything
  //   partial    lime     roads and buildings; scenery data was too expensive
  //   roadsonly  orange   ROADS ONLY — the buildings are missing, not absent
  var TILE_COL = {
    ready:     'rgba(120, 214, 150, .92)',
    partial:   'rgba(196, 214, 110, .92)',
    roadsonly: 'rgba(232, 150,  70, .92)',
    building:  'rgba(232, 180,  92, .92)',
    loading:   'rgba( 92, 178, 255, .92)',
    want:      'rgba(255, 255, 255, .16)',
    failed:    'rgba(226, 106, 106, .85)',
  };
  var tilePulse = 0;
  function renderTileMap(tiles) {
    var cv = el.tilemap;
    if (!cv) return;
    // Only while something is still coming. A permanent minimap is clutter in a
    // game whose whole point is the windscreen.
    // Stay on screen while anything is still coming — and also while any tile
    // is ROADS ONLY, because that is a missing layer the player can act on by
    // driving somewhere else. A merely 'partial' tile (no woodland data) is not
    // worth holding the instrument open for.
    var busy = tiles && tiles.some(function (t) {
      return t.state !== 'ready' && t.state !== 'partial';
    });
    if (!busy) { cv.hidden = true; return; }
    cv.hidden = false;
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    // Fit whatever spread the streamer actually wants, so this never clips.
    var span = 1;
    for (var i = 0; i < tiles.length; i++) {
      span = Math.max(span, Math.abs(tiles[i].dx), Math.abs(tiles[i].dy));
    }
    // Room for the rotation: a square grid turned 45 degrees needs sqrt(2) of
    // its own width, so shrink the cells rather than let the corners clip.
    var n = span * 2 + 1, cell = Math.floor(Math.min(W, H) / (n * 1.45)), pad = 1;
    var ox = (W - cell * n) / 2, oy = (H - cell * n) / 2;
    // Screen y runs down and tile y runs south, so a heading measured east-of-
    // north turns the grid clockwise; rotating the CONTENT by -heading is what
    // leaves the car's forward direction pointing up.
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(-(tiles.heading || 0));
    g.translate(-W / 2, -H / 2);
    tilePulse = (tilePulse + 0.08) % (Math.PI * 2);
    var pulse = 0.55 + 0.45 * Math.sin(tilePulse);
    for (var j = 0; j < tiles.length; j++) {
      var t = tiles[j];
      var x = ox + (t.dx + span) * cell, y = oy + (t.dy + span) * cell;
      g.globalAlpha = (t.state === 'loading') ? pulse : 1;
      g.fillStyle = TILE_COL[t.state] || TILE_COL.want;
      g.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
      g.globalAlpha = 1;
      // The queue position, which is the bit that lets you choose a direction.
      if (t.state === 'want' && t.queue > 0 && cell >= 14) {
        g.fillStyle = 'rgba(255,255,255,.72)';
        g.font = Math.floor(cell * 0.5) + 'px system-ui, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(t.queue), x + cell / 2, y + cell / 2 + 0.5);
      }
    }
    // NORTH, on the rotating layer so it genuinely points north. A heading-up
    // map without one leaves you with no absolute reference at all, which is
    // fine for "which way is loaded" and useless for "which way is home".
    var rad = Math.min(W, H) / 2 - 3;
    g.fillStyle = 'rgba(255, 120, 120, .95)';
    g.beginPath();
    g.moveTo(W / 2, H / 2 - rad);
    g.lineTo(W / 2 - 3.4, H / 2 - rad + 7);
    g.lineTo(W / 2 + 3.4, H / 2 - rad + 7);
    g.closePath(); g.fill();
    g.restore();
    // You are here, pointing up — drawn AFTER the restore so the arrow itself
    // never rotates. It is the fixed thing the map turns around.
    var cx = W / 2, cy = H / 2, r = Math.max(3, cell * 0.30);
    g.fillStyle = 'rgba(255,255,255,.96)';
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.62, cy + r * 0.72);
    g.lineTo(cx, cy + r * 0.30);
    g.lineTo(cx - r * 0.62, cy + r * 0.72);
    g.closePath(); g.fill();
  }

  // Which point of view are we in? Names the button and shows or hides the
  // steering wheel that only exists from the driver's seat.
  var POV_LABEL = { chase: 'Chase', cockpit: 'Driver', bird: 'Bird' };
  function setView(v) {
    var cockpit = (v === 'cockpit');
    if (el.cockpit) el.cockpit.hidden = !cockpit;
    // It lives inside #cockpit now, so it appears and disappears with the
    // dashboard itself — no separate hiding to keep in step.
    // The eye states WHICH view by how much of its frame it fills, so the
    // button needs no word on it — which is the only version that survives a
    // phone-sized top bar.
    var b = $('btn-map');
    if (b) {
      b.classList.remove('pov-chase', 'pov-cockpit', 'pov-bird');
      b.classList.add('pov-' + v);
      b.setAttribute('aria-label', 'Point of view: ' + (POV_LABEL[v] || v) + ' — tap to change');
    }
    // The corner speedo and the dash one are the SAME reading in two places,
    // so only one may ever be on screen. From the driver's seat the number
    // belongs on the dashboard.
    // The corner speedo AND the corner condition bar both move onto the dash
    // from the driver's seat — two readings of the same number in one view is
    // clutter, and the dash is where a driver looks for them anyway.
    if (el.speedo) el.speedo.hidden = cockpit;
    if (el.health) el.health.hidden = cockpit;
    last.view = v;
    updateSteerpad();         // the pad hides from the driver's seat
    last.dashKph = null;      // force a rewrite on the next frame
  }

  function renderAttribution() {
    var lines = root.Sources.attribution();
    lines.push('Search: Nominatim / OpenStreetMap');
    var txt = lines.join(' · ');
    if (el.attribution) el.attribution.textContent = txt;
    if (el.attribution2) el.attribution2.textContent = txt;
    // …and on the drive HUD itself, because attribution that disappears the
    // moment the data appears is not attribution (ODbL; MapTiler ToS).
    var hudEl = $('attribution3');
    if (hudEl) hudEl.textContent = lines.slice(0, 3).join(' · ');
  }

  function refreshCacheSize() {
    var n = root.Roads.cacheSize();
    var mb = root.Roads.cacheBytes() / (1024 * 1024);
    el['cache-size'].textContent = n
      ? (n + ' map tile' + (n === 1 ? '' : 's') + ' · ' + (mb < 1 ? mb.toFixed(2) : mb.toFixed(1)) + ' MB'
         + ' of ' + Math.round(root.Sources.totalBytes() / (1024 * 1024)) + ' MB')
      : 'nothing cached yet';
  }

  // Two dials, two questions: how much of YOUR TRAIL to remember, and how
  // much EXTRA to build out ahead. They were one dropdown, which meant you
  // could not keep a big trail without also signing up for background
  // download — or fill ahead without a bigger trail than you wanted.
  function buildOfflineMenu() {
    var keepSel = el['ctl-keep'], fillSel = el['ctl-fill'];
    if (!keepSel || !fillSel) return;
    keepSel.innerHTML = ''; fillSel.innerHTML = '';
    root.Sources.KEEP_MB.forEach(function (mb) {
      var o = document.createElement('option');
      o.value = mb; o.textContent = root.Sources.KEEP_LABEL[mb];
      keepSel.appendChild(o);
    });
    root.Sources.FILL_MB.forEach(function (mb) {
      var o = document.createElement('option');
      o.value = mb; o.textContent = root.Sources.FILL_LABEL[mb];
      fillSel.appendChild(o);
    });
    keepSel.addEventListener('change', function () {
      root.Sources.set({ keep: this.value });
      root.Roads.setCacheBudget(root.Sources.totalBytes());
      syncOfflineNote(); refreshCacheSize();
      note('Remembering up to ' + this.value + ' MB of the map you drive through.');
    });
    fillSel.addEventListener('change', function () {
      root.Sources.set({ fill: this.value });
      root.Roads.setCacheBudget(root.Sources.totalBytes());
      syncOfflineNote(); refreshCacheSize();
      note(root.Sources.fillsAhead()
        ? 'Filling the map in around you whenever the network is idle.'
        : 'Not fetching ahead - only where you drive.');
    });
  }

  function syncOfflineNote() {
    if (el['ctl-keep']) el['ctl-keep'].value = root.Sources.current.keep;
    if (el['ctl-fill']) el['ctl-fill'].value = root.Sources.current.fill;
    if (!el['note-offline']) return;
    el['note-offline'].textContent = root.Sources.fillsAhead()
      ? 'Keeps loading the area around you in the background, but only while the network is idle - your own driving always goes first. Stored on disk; it does not affect frame rate, because only the tiles right around you are drawn.'
      : 'Only fetches the tiles you actually drive through; the keep dial says how many of them are remembered.';
  }

  // ---- the world status sheet ----------------------------------------------
  // Every refusal the loader already knew about, said out loud. A tile that is
  // "not building" is always one of a small number of things — queued behind a
  // politeness gap, waiting on a mirror, refused with a status, or shed down
  // the detail ladder because the query was too big — and each of those has a
  // different answer for the player ("wait", "drive on", "it is the server").
  var wsTimer = null;
  function fmtMs(ms) { return ms > 950 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms'; }
  function fmtMB(b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }

  function renderWorldStat() {
    var r = root.App.worldReport();
    if (!r) return;
    var ready = 0, poor = 0, waiting = 0, failed = 0;
    r.rows.forEach(function (t) {
      if (t.state === 'ready') ready++;
      else if (t.state === 'no scenery' || t.state === 'roads only') poor++;
      else if (t.state === 'failed') failed++;
      else waiting++;
    });
    var lines = [ready + ' of ' + r.rows.length + ' tiles complete'];
    if (poor) lines.push(poor + ' arrived with less in them');
    if (waiting) lines.push(waiting + ' still coming');
    if (failed) lines.push(failed + ' refused');
    if (r.net.backoffMs > 0) lines.push('backing off for ' + fmtMs(r.net.backoffMs));
    el['ws-summary'].textContent = lines.join(' · ') + '. Cached: '
      + r.cache.tiles + ' tiles, ' + fmtMB(r.cache.bytes) + ' of ' + fmtMB(r.cache.budget) + '.';

    var mh = '<table class="ws-tab"><tr><th>Map server</th><th>Speed</th><th>Queue</th><th>State</th></tr>';
    r.mirrors.forEach(function (m) {
      var state = m.backoffMs > 0 ? '<b class="bad">backing off ' + fmtMs(m.backoffMs) + '</b>'
                : m.fails ? '<b class="warn">' + m.fails + ' recent failure' + (m.fails === 1 ? '' : 's') + '</b>'
                : '<b class="ok">ready</b>';
      mh += '<tr><td>' + escapeHtml(m.name) + '</td><td>' + (m.lat ? fmtMs(m.lat) : '—')
          + '</td><td>' + (m.pending + m.active) + '</td><td>' + state + '</td></tr>';
    });
    el['ws-mirrors'].innerHTML = mh + '</table>';

    var th = '<table class="ws-tab"><tr><th>Tile</th><th>State</th><th>Where it is</th></tr>';
    r.rows.forEach(function (t) {
      var why = '';
      if (t.state === 'fetching' || t.state === 'queued') {
        why = t.mirror ? ('on ' + escapeHtml(t.mirror)
              + (t.queue > 0 ? ', ' + t.queue + ' ahead of it' : ', in flight')
              + (t.waited ? ', ' + t.waited + ' s so far' : ''))
            : 'waiting for a free slot';
      } else if (t.state === 'roads only' || t.state === 'no scenery') {
        why = 'the query was too big for the server, so it came back with less';
      } else if (t.state === 'ready') { why = 'done'; }
      if (t.err) {
        why += (why ? ' — ' : '') + (t.err.busy ? 'server asked us to slow down'
              : t.err.status ? ('server said ' + t.err.status) : escapeHtml(t.err.msg))
             + ' (' + t.err.ago + ' s ago)';
      }
      var cls = t.state === 'ready' ? 'ok' : (t.state === 'failed' ? 'bad' : 'warn');
      th += '<tr><td class="mono">' + escapeHtml(t.key) + '</td><td class="' + cls + '">'
          + escapeHtml(t.state) + '</td><td>' + why + '</td></tr>';
    });
    el['ws-tiles'].innerHTML = th + '</table>';
  }

  function openWorldStat() {
    renderWorldStat();
    show(el.worldstat);
    // Live: the whole point is watching a queue drain (or not).
    clearInterval(wsTimer);
    wsTimer = setInterval(function () {
      if (el.worldstat.hidden) { clearInterval(wsTimer); wsTimer = null; return; }
      renderWorldStat();
    }, 700);
  }

  function openSettings() { syncSourceMenus(); refreshCacheSize(); renderAttribution(); show(el.settings); }

  // ---- race ----------------------------------------------------------------

  // ONE DECISION: how far. The old panel asked you to drive to the start, mark
  // it, drive to the finish, mark that, and only then race — which means
  // driving the entire course before you are allowed to race it. Nobody could
  // work out what it wanted because what it wanted made no sense.
  //
  // Now the computer drops a flag somewhere random at the distance you choose,
  // everybody starts from wherever they already are, and first to the flag
  // wins.
  function startRace() {
    var car = hooks.car(), frame = hooks.frame();
    if (!car || !frame) { note('Land somewhere first.'); return; }
    var metres = parseInt(el['race-dist'].value, 10) || 2500;
    var here = frame.toGeo(car.x, car.z);
    // A random bearing, and the distance you asked for. Straight-line: the
    // ROADS decide how long it really takes, which is the interesting part —
    // two people the same distance away can be very differently placed.
    var bearing = Math.random() * Math.PI * 2;
    var dx = Math.sin(bearing) * metres, dz = Math.cos(bearing) * metres;
    var flag = frame.toGeo(car.x + dx, car.z + dz);
    root.MP.setRace(here, flag).then(function () {
      hide(el.race);
      note('Flag dropped ' + (metres >= 1000 ? (metres / 1000) + ' km' : metres + ' m') +
           ' away. Follow the arrow — first there wins.');
    });
  }

  function updateRacePanel() {
    var n = root.MP.count();
    el['mp-status'].textContent = n > 1
      ? (n + ' drivers in this world.')
      : 'Driving alone — invite someone and they land right here.';
    $('start-race').disabled = false;
    el['race-hint'].textContent = root.MP.hasRace()
      ? 'A race is running. The arrow on the HUD points at the flag; Clear stops it.'
      : 'A flag is dropped somewhere random at that distance. Everyone starts from where they are — first to reach it wins.';
    el['race-badge'].hidden = !root.MP.hasRace();
  }

  // ---- per-frame -----------------------------------------------------------
  function hud(s) {
    renderTileMap(s.tiles);
    if (s.view !== last.view) setView(s.view);
    // The wheel turns with the steering, and only while it is on screen.
    if (s.view === 'cockpit' && el['cockpit-wheel']) {
      var deg = Math.max(-1, Math.min(1, s.steer || 0)) * 135;
      if (deg !== last.povDeg) {
        el['cockpit-wheel'].style.transform = 'translateX(-50%) rotate(' + deg.toFixed(1) + 'deg)';
        last.povDeg = deg;
      }
      // Flying: the button offers the OTHER vehicle, the ALTIMETER lights up
      // as its own instrument, and the whole cockpit takes a warmer tint so
      // there is never a doubt about which one you are in. The speedometer
      // stays a speedometer — it used to swap to metres mid-flight, which
      // blanked your airspeed at exactly the moment you were managing height
      // AND speed at once.
      var fly = !!(s.flying || s.falling);
      if (fly !== last.flying) {
        last.flying = fly;
        if (el.cockpit) el.cockpit.classList.toggle('flying', fly);
        if (el['btn-fly']) el['btn-fly'].classList.toggle('flying', fly);
        if (el['fly-plane']) el['fly-plane'].hidden = fly;
        if (el['fly-car']) el['fly-car'].hidden = !fly;
        if (el['btn-fly']) el['btn-fly'].setAttribute('aria-label', fly ? 'Be a car again' : 'Take off');
        if (el['dash-alt']) el['dash-alt'].hidden = !fly;
      }
      if (fly && el['dash-alt-m']) {
        var da = Math.round(s.agl || 0);
        if (da !== last.dashAlt) { el['dash-alt-m'].textContent = da; last.dashAlt = da; }
      }
      var dk = Math.round(s.speed);
      if (dk !== last.dashKph && el['dash-speed']) {
        el['dash-speed'].textContent = dk;
        last.dashKph = dk;
      }
      var dh = Math.max(0, Math.min(100, s.health == null ? 100 : s.health));
      if (dh !== last.dashHealth && el['dash-cond-fill']) {
        el['dash-cond-fill'].style.width = dh + '%';
        last.dashHealth = dh;
      }
    }
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
      // THE CLOCK KEEPS RUNNING once you are home. It used to freeze on your
      // own time, which is the one moment a race becomes interesting to watch:
      // your friends are still out there and the gap is the whole story.
      var t = r.countdown > 0 ? Math.ceil(r.countdown / 1000)
            : (r.elapsed / 1000).toFixed(1);
      if (t !== last.rt) { el['rh-time'].textContent = t; last.rt = t; }
      // Standings, live, for everyone — not a private "finished". Your own
      // place first if you have one, then whoever else is home.
      var d;
      if (r.done) {
        var mine = 0;
        for (var q = 0; q < (r.results || []).length; q++) {
          if (r.results[q].ms === r.myTime) { mine = q + 1; break;
          }
        }
        var ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][mine] || (mine + 'th');
        d = (mine ? ord + ' · ' : 'home · ') + (r.myTime / 1000).toFixed(1) + 's'
          + (r.results.length > 1 ? ' · ' + r.results.length + ' home' : '');
      } else {
        d = Math.round(r.toFinish) + ' m to go'
          + (r.results && r.results.length ? ' · ' + r.results.length + ' already home' : '');
      }
      if (d !== last.rd) { el['rh-dist'].textContent = d; last.rd = d; }
      // Point the arrow at the finish, relative to where the car is facing.
      var car = hooks.car();
      var bearing = Math.atan2(r.finish.x - car.x, r.finish.z - car.z) - car.yaw;
      el['rh-arrow'].style.transform = 'rotate(' + (bearing * 180 / Math.PI) + 'deg)';
      el['rh-arrow'].style.visibility = r.done ? 'hidden' : 'visible';
      // The board updates for EVERYONE as each driver comes in, not only once
      // you are done yourself.
      if (r.results && r.results.length !== last.results) {
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

  // (The bird's-eye INSET lived here — a 2D canvas renderer over its own read
  // of the road index. Deleted, not fixed: it drifted from the real renderer's
  // data layout once already (a stride-7 walk over a stride-8 index — no
  // roads, and garbage line-widths that cost the whole frame rate), and a map
  // that is a second copy of the world can always do that again. The button
  // now flies the actual camera up: one world, one renderer — see
  // toggleBirdseye in app.js.)

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
    last.scheme = name;
    updateSteerpad();
    if (name !== 'stick') el.stick.hidden = true;
  }

  // The pad is the wheel's stand-in for views where you cannot see one. From
  // the driver's seat the drawn wheel is RIGHT THERE turning with your input,
  // so the pad is a second wheel floating over the picture — and hiding it
  // costs nothing, because in wheel scheme the whole left half of the screen
  // steers (car.js), pad or no pad. Every other scheme never shows the pad.
  function updateSteerpad() {
    if (!el.steerpad) return;
    el.steerpad.hidden = (last.scheme !== 'wheel') || last.view === 'cockpit';
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

  // The ONE function that must work before anything else does. app.js calls it
  // out of boot()'s catch, and boot() runs Render.init() BEFORE UI.init() has
  // populated `el` — so on the single failure that matters most, an unstartable
  // renderer, this threw "cannot set textContent of undefined" and buried the
  // real message. A GLSL compile error became a blank screen and a lie. Look
  // the elements up directly, and say it to the console either way, so the
  // cause survives even if there is no DOM left to say it in.
  function fatal(msg) {
    try { console.error('Anyroad — fatal:', msg); } catch (e) {}
    var box = el.fatal || document.getElementById('fatal');
    var slot = el['fatal-msg'] || document.getElementById('fatal-msg');
    if (slot) slot.textContent = msg;
    if (box) { box.hidden = false; box.style.display = ''; }
    var land = el.landing || document.getElementById('landing');
    if (land) land.hidden = true;
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
        || !!(el.worldstat && !el.worldstat.hidden)
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
    // SOMEBODY SHOT YOU. The whole screen jolts white and you are left looking
    // through a fresh hole — same chip machinery the wildlife uses, so it
    // deteriorates with the glass and clears with a repair like everything
    // else. Severity is deliberately low: this is friends messing about, and a
    // windscreen that shatters on the first shot ends the game rather than
    // decorating it.
    bulletHole: function () {
      addImpact(0.55);
      drawCracks();
      el['damage-flash'].classList.remove('hit');
      void el['damage-flash'].offsetWidth;
      el['damage-flash'].classList.add('hit');
    },
    steerPad: function () { return el.steerpad; },
  };
})(window);
