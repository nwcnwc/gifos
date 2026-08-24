/*
 * app.js — the state, the file, and the wiring.
 *
 * ONE state object holds the whole app: where you are looking, which day,
 * which layers in which order at which opacity, and whether you are comparing.
 * It is written into gifos.db, which means it is written into this app's icon:
 * close the tab and it is exactly where you left it; hand someone the GIF and
 * THEY open exactly where you left it. That is the whole difference between
 * this and a URL you have to remember to copy.
 *
 * Nothing here talks to the network except through gifos.fetch, and the only
 * host it can reach is the one the manifest declares — the user sees that list
 * at launch and can revoke it.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var T = window.WVTiles;
  var M = window.WVMap;
  var A = window.WVAnim;
  var UI = window.WVUI;

  var App = {};
  var db = { prefs: null, views: null, pins: null };
  var me = { id: 'local', name: '' };
  var owner = true;
  var saveTimer = 0;

  // The day the app opens on, the layers it opens with. This is NASA's own
  // default view — true colour from Terra with coastlines — plus the two
  // things only this version has: the Blue Marble underneath so the map is
  // never empty, and labels you can search offline.
  function defaultState() {
    var day = U.latestDay();
    return {
      date: day,
      minutes: 720,
      layers: [
        { id: 'wv:places', on: false, opacity: 1 },
        { id: 'wv:grid', on: false, opacity: 1 },
        // Off, but PRESENT. It was shipped, drawn and offline-capable, and the
        // only way to find it was the Reference tab of the layer browser — so
        // a reader counting the offline layers in the Layers panel found four
        // where the help promises five, and concluded the help was lying.
        { id: 'wv:borders', on: false, opacity: 1 },
        { id: 'wv:coast', on: true, opacity: 1 },
        { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', on: true, opacity: 1 },
        { id: 'wv:base', on: true, opacity: 1 },
      ],
      compare: { on: false, x: 0.5, date: U.addDays(day, -365), layers: null },
      anim: { from: U.addDays(day, -10), to: day, step: 'day', fps: 4, loop: true },
      view: null,
      measure: null,
      ui: { panel: true, showRange: false, welcomed: false },
    };
  }

  var state = defaultState();
  App.state = state;

  // ---------------------------------------------------------------- saving --
  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(App.save, 700);
  }

  App.save = function () {
    if (!db.prefs) return Promise.resolve();
    var v = M.view;
    return db.prefs.put({
      id: 'state',
      date: state.date,
      minutes: state.minutes,
      layers: state.layers.map(function (r) { return { id: r.id, on: r.on, opacity: r.opacity }; }),
      compare: state.compare,
      anim: state.anim,
      view: { lon: v.lon, lat: v.lat, res: v.res },
      ui: { panel: state.ui.panel, welcomed: state.ui.welcomed },
    }).catch(function () {});
  };

  // ---------------------------------------------------------------- layers --
  App.toggleLayer = function (id) {
    var row = state.layers.filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    row.on = !row.on;
    UI.renderStack();
    UI.renderTimeline();
    M.invalidate();
    queueSave();
    App.mpPush();
  };

  App.removeLayer = function (id) {
    var at = -1, gone = null;
    for (var i = 0; i < state.layers.length; i++) {
      if (state.layers[i].id === id) { at = i; gone = state.layers[i]; }
    }
    if (at < 0) return;
    state.layers.splice(at, 1);
    UI.renderStack();
    UI.renderDate();
    UI.renderTimeline();
    M.invalidate();
    queueSave();
    var L = D.layer(id);
    UI.toast('Removed ' + (L ? L.title : id), {
      action: 'Undo',
      fn: function () {
        state.layers.splice(Math.min(at, state.layers.length), 0, gone);
        UI.renderStack();
        M.invalidate();
        queueSave();
      },
    });
  };

  /*
   * Where a new layer lands is not a detail — it decides whether adding it
   * does anything visible. Reference layers (coastlines, labels, orbit tracks)
   * go on top where they can still be read; an overlay goes above the other
   * overlays but under the reference; a base layer goes above the other base
   * layers and under everything else. Adding fires and watching them appear
   * UNDER the true colour they are burning through is how a layer browser
   * teaches people the app is broken.
   */
  function insertAt(L) {
    if (L.ref) return 0;
    var i = 0;
    while (i < state.layers.length) {
      var Li = D.layer(state.layers[i].id);
      if (!Li || !Li.ref) break;
      i++;
    }
    if (L.group !== 'base') return i;
    while (i < state.layers.length) {
      var Lb = D.layer(state.layers[i].id);
      if (Lb && Lb.group === 'base') break;
      i++;
    }
    return i;
  }

  App.addLayer = function (id) {
    var L = D.layer(id);
    if (!L || state.layers.some(function (r) { return r.id === id; })) return;
    var row = { id: id, on: true, opacity: L.opacity == null ? 1 : L.opacity, open: false };
    state.layers.splice(insertAt(L), 0, row);
    UI.renderStack();
    UI.renderTimeline();
    M.invalidate();
    queueSave();
    App.mpPush();
    var cov = D.coverage(L, state.date);
    if (!cov.ok) UI.toast(L.title + ' has no data on ' + U.prettyDate(state.date) + ' — ' + cov.why);
  };

  App.setOpacity = function (id, v) {
    var row = state.layers.filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    row.opacity = v;
    M.invalidate();
    queueSave();
    App.mpPush();
  };

  App.reorder = function (from, to) {
    var row = state.layers.splice(from, 1)[0];
    state.layers.splice(to, 0, row);
    UI.renderStack();
    M.invalidate();
    queueSave();
    App.mpPush();
  };

  // ------------------------------------------------------------------ time --
  App.setDate = function (day, opts) {
    var latest = U.latestDay();
    if (U.dayMs(day) > U.dayMs(latest)) day = latest;
    if (day === state.date) return;
    state.date = day;
    UI.renderDate();
    UI.renderStack();
    UI.renderTimeline();
    M.invalidate();
    if (!(opts && opts.quiet)) {
      UI.centerTimeline(day);
      queueSave();
    }
    App.mpPush();
  };

  App.commitDate = function () { queueSave(); App.mpPush(); };

  App.stepDate = function (n) {
    App.setDate(U.addDays(state.date, n));
  };

  App.setMinutes = function (m) {
    state.minutes = U.clamp(m, 0, 1430);
    UI.renderDate();
    M.invalidate();
    queueSave();
  };

  App.togglePlay = function () {
    if (A.playing()) A.stop();
    else App.play();
  };

  App.play = function () {
    // Playing from a date the range does not contain is the most common way to
    // press play and see nothing happen — start the range where you are.
    var a = state.anim;
    if (U.dayMs(state.date) < U.dayMs(a.from) || U.dayMs(state.date) > U.dayMs(a.to)) {
      a.from = U.addDays(state.date, 0);
      a.to = U.addDays(state.date, 10);
      if (U.dayMs(a.to) > U.dayMs(U.latestDay())) {
        a.to = U.latestDay();
        a.from = U.addDays(a.to, -10);
      }
    }
    A.play();
  };

  // ------------------------------------------------------------- navigation -
  App.goTo = function (lat, lon, res, name) {
    M.flyTo({ lat: lat, lon: lon, res: res || 0.004 });
    M.furniture.spot = { lat: lat, lon: lon };
    setTimeout(function () { M.furniture.spot = null; M.invalidate(); }, 2600);
    if (name) UI.toast(name);
    queueSave();
    App.mpPush();
  };

  App.toggleCompare = function () {
    var c = state.compare;
    c.on = !c.on;
    if (c.on && !c.date) c.date = U.addDays(state.date, -365);
    // The layer panel covers a third of the "before" side; comparing is a mode
    // where the map is the whole point, so it gets out of the way.
    if (c.on && UI.panelOpen()) UI.setPanel(false);
    UI.renderCompare();
    // The ruler carries the B playhead, so turning compare ON or OFF changes
    // what it has to draw. Without this it kept the old picture until some
    // unrelated event repainted it — you switched to comparing two days and
    // the timeline went on showing one, which is the control you would reach
    // for next.
    UI.renderTimeline();
    UI.renderInspector();
    M.invalidate();
    queueSave();
  };

  App.toggleMeasure = function () {
    if (state.measure) {
      state.measure = null;
      M.furniture.measure = null;
      UI.busy(null);
    } else {
      state.measure = [];
      M.furniture.measure = state.measure;
      UI.busy('Tap two points to measure · Escape to finish');
    }
    UI.setToolState('measure', !!state.measure);
    UI.el.map.classList.toggle('measuring', !!state.measure);
    M.invalidate();
  };

  // ---------------------------------------------------------- saved views ---
  App.saveView = function () {
    if (!db.views) return Promise.resolve();
    var v = M.view;
    var near = D.nearestPlace(v.lat, v.lon);
    var sz = M.size();
    var thumb = '';
    try {
      M.renderNow();
      var f = M.grabFrame(220, Math.round(220 * sz.h / sz.w), null);
      var c = document.createElement('canvas');
      c.width = f.width; c.height = f.height;
      c.getContext('2d').putImageData(new ImageData(f.data, f.width, f.height), 0, 0);
      thumb = c.toDataURL('image/jpeg', 0.6);
    } catch (e) { thumb = ''; }
    return db.views.put({
      name: (near ? near.name : U.fmtLatLon(v.lat, v.lon)) + ' · ' + U.prettyDate(state.date),
      date: state.date,
      minutes: state.minutes,
      view: { lon: v.lon, lat: v.lat, res: v.res },
      layers: state.layers.map(function (r) { return { id: r.id, on: r.on, opacity: r.opacity }; }),
      by: me.name || '',
      at: Date.now(),
      thumb: thumb,
    }).then(function () { UI.toast('Saved into this file'); });
  };

  App.listViews = function () {
    if (!db.views) return Promise.resolve([]);
    return db.views.getAll().catch(function () { return []; });
  };

  App.restoreView = function (v) {
    state.layers = v.layers.map(function (r) { return { id: r.id, on: r.on, opacity: r.opacity }; });
    state.date = v.date;
    if (v.minutes != null) state.minutes = v.minutes;
    M.setView(v.view, { animate: true });
    UI.renderAll();
    queueSave();
    App.mpPush();
  };

  App.deleteView = function (id) {
    if (!db.views) return Promise.resolve();
    return db.views.delete(id).catch(function () {});
  };

  // ----------------------------------------------------------------- tours --
  App.openTour = function (t) {
    var date = t.date === 'latest' ? U.latestDay() : t.date;
    state.layers = t.layers.map(function (id) {
      var L = D.layer(id);
      return { id: id, on: true, opacity: (L && L.opacity) || 1 };
    }).filter(function (r) { return D.layer(r.id); });
    if (!state.layers.some(function (r) { return r.id === 'wv:base'; })) {
      state.layers.push({ id: 'wv:base', on: true, opacity: 1 });
    }
    state.date = date;
    if (t.anim) {
      state.anim = { from: t.anim[0], to: t.anim[1], step: t.anim[2] || 'day', fps: 4, loop: true };
      state.date = t.anim[0];
    }
    // A tour says how many DEGREES to fit, not a zoom level: the same scene has
    // to frame itself on a phone and on a 32-inch monitor.
    var res = t.span ? t.span / Math.max(320, M.size().w) : (t.res || 0.05);
    M.flyTo({ lat: t.lat, lon: t.lon, res: res }, 900);
    UI.renderAll();
    UI.centerTimeline(state.date);
    queueSave();
    UI.toast(t.title + (t.anim ? ' — press play to run it' : ''));
    App.mpPush();
  };

  // --------------------------------------------------------------- offline --
  /*
   * Pinning: fetch every tile the current view needs, at this zoom AND one
   * level closer, and mark them so eviction never takes them. One level closer
   * is the difference between "it works offline" and "it works offline until I
   * zoom in", which is the same thing as not working.
   */
  App.pinView = function (onProgress, days) {
    var span = days || 1;
    var wanted = [];
    // This zoom AND one closer, over the SAME ground: keysFor takes a level
    // bump rather than a fake zoom, because zooming would have shrunk the area
    // and pinned a quarter of what is on screen.
    for (var bump = 0; bump < 2; bump++) {
      for (var i = 0; i < span; i++) {
        wanted = wanted.concat(A.keysFor(U.addDays(state.date, -i), true, bump));
      }
    }
    wanted.forEach(function (k) { T.pin(k); });
    var total = wanted.length;
    var timer = setInterval(function () {
      if (onProgress) onProgress(Math.max(0, total - T.busy()), total);
    }, 250);
    return T.settle(wanted, 90000).then(function () {
      clearInterval(timer);
      wanted.forEach(function (k) { T.pin(k); });
      return total;
    });
  };

  // --------------------------------------------------------------- legends --
  var legendDb = null;
  /*
   * A legend that is not there has THREE different reasons, and the panel used
   * to show the same blank space for all of them:
   *
   *   'none'   NASA publishes no colour map for this layer. True colour is a
   *            photograph, not a measurement — there is nothing to key, and
   *            saying so is an answer.
   *   'wire'   we could not reach NASA. It will be there next time; the file
   *            keeps it once it has arrived.
   *   'bad'    a colour map came back and could not be read. That is our bug,
   *            not the user's, and it must not look like "no legend exists".
   *
   * Resolves to a legend object, or a string naming which of the three it is.
   * Never to a silent null.
   */
  App.legend = function (id) {
    var get = legendDb ? legendDb.get('lg_' + id) : Promise.resolve(null);
    return get.catch(function () { return null; }).then(function (rec) {
      if (rec && rec.lg) return rec.lg;
      if (rec && rec.none) return 'none';
      if (!window.gifos || !gifos.fetch) return 'wire';
      return gifos.fetch('https://gibs.earthdata.nasa.gov/colormaps/v1.3/' + id + '.xml')
        .then(function (r) {
          // A 404 is NASA's answer: this layer has no colour map. Remember it,
          // so the app never asks again and can say so with the wire down.
          if (r.status === 404 || r.status === 400) {
            if (legendDb) legendDb.put({ id: 'lg_' + id, none: 1 }).catch(function () {});
            return 'none';
          }
          if (!r.ok) return 'wire';
          return r.text().then(function (xml) {
            var lg = xml && parseColorMap(xml);
            if (!lg) return 'bad';
            if (legendDb) legendDb.put({ id: 'lg_' + id, lg: lg }).catch(function () {});
            return lg;
          });
        })
        .catch(function () { return 'wire'; });
    });
  };

  // GIBS colormaps carry a <Legend> written for humans: the entries a legend
  // should show, in order, with their tooltips. Using it (rather than a
  // hand-drawn gradient in this app) is what keeps the legend true to the
  // pixels it describes.
  function parseColorMap(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var legends = doc.getElementsByTagName('Legend');
    if (!legends.length) return null;
    var best = legends[legends.length - 1];
    for (var i = 0; i < legends.length; i++) {
      if (legends[i].getElementsByTagName('LegendEntry').length > 2) { best = legends[i]; break; }
    }
    var type = best.getAttribute('type') || 'continuous';
    var entries = [];
    var nodes = best.getElementsByTagName('LegendEntry');
    for (var j = 0; j < nodes.length; j++) {
      var rgb = nodes[j].getAttribute('rgb');
      if (!rgb) continue;
      entries.push({ rgb: 'rgb(' + rgb + ')', label: nodes[j].getAttribute('label') || nodes[j].getAttribute('tooltip') || '' });
    }
    if (!entries.length) return null;
    var cm = best.parentNode;
    var units = (cm && cm.getAttribute('units')) || '';
    var labelled = entries.filter(function (e) { return e.label; });
    return {
      type: type,
      units: units,
      min: labelled.length ? labelled[0].label : '',
      max: labelled.length ? labelled[labelled.length - 1].label : '',
      entries: entries.length > 64 ? entries.filter(function (_, i) { return i % Math.ceil(entries.length / 64) === 0; }) : entries,
    };
  }

  // ------------------------------------------------------------- multiplayer
  App.mpPush = function () { if (window.WVMP) window.WVMP.push(); };

  App.dismissWelcome = function () {
    state.ui.welcomed = true;
    U.$('welcome').hidden = true;
    queueSave();
  };

  // ------------------------------------------------------------------ boot --
  function applyLaunch(args) {
    if (!args) return;
    if (args.layers) {
      var ids = String(args.layers).split(',').map(function (s) { return s.trim(); })
        .filter(function (id) { return D.layer(id); });
      if (ids.length) {
        state.layers = ids.map(function (id) {
          var L = D.layer(id);
          return { id: id, on: true, opacity: (L && L.opacity) || 1 };
        });
        if (!state.layers.some(function (r) { return r.id === 'wv:base'; })) {
          state.layers.push({ id: 'wv:base', on: true, opacity: 1 });
        }
      }
    }
    if (args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) state.date = args.date;
    if (args.at) {
      var c = D.parseCoords(args.at);
      if (c) M.setView({ lat: c.lat, lon: c.lon, res: 0.01 });
      else {
        var hit = D.searchPlaces(args.at, 1)[0];
        if (hit) M.setView({ lat: hit.lat, lon: hit.lon, res: 0.006 });
      }
    }
    if (args.tour) {
      var t = D.tours.filter(function (x) { return x.id === args.tour; })[0];
      if (t) App.openTour(t);
    }
    UI.renderAll();
    M.invalidate();
  }

  function bindMap() {
    M.setState(state);
    M.onMove(function () {
      UI.renderReadout();
      queueSave();
      if (window.WVMP) window.WVMP.moved();
    });
    M.onHover(function (world) {
      UI.renderReadout(world);
      if (window.WVMP) window.WVMP.cursor(world);
    });
    M.onTap(function (world) {
      if (state.measure) {
        state.measure.push({ lat: world.lat, lon: world.lon });
        M.furniture.measure = state.measure;
        UI.renderMeasure(state.measure);
        M.invalidate();
      }
    });
    var lastStatus = 0;
    M.onFrame(function () {
      UI.renderNet();
      UI.renderBusy();
      var now = Date.now();
      if (now - lastStatus > 400) { lastStatus = now; UI.refreshStatus(); }
    });
  }

  function boot() {
    D.init(window.WV_ASSETS);
    M.init(U.$('map'));
    bindMap();
    UI.init(App);
    UI.attachSheets(App);
    if (window.WVMP) window.WVMP.init(App);
    A.attach(state, {
      onChange: function () {
        UI.renderDate();
        UI.renderStack();
        UI.renderTimeline();
        M.invalidate();
        App.mpPush();
      },
      onStatus: function (msg) { UI.toast(msg); },
    });

    if (!window.gifos) {
      // Opened outside GifOS: the offline half still works, and saying so is
      // better than a map that silently never loads a tile.
      U.$('app').classList.remove('boot');
      UI.toast('Open this inside GifOS for live NASA imagery — the offline map still works here.', { bad: true });
      return;
    }

    db.prefs = gifos.db('prefs');
    db.views = gifos.db('views');
    legendDb = gifos.db('legends');

    Promise.all([
      gifos.me().catch(function () { return me; }),
      gifos.info().catch(function () { return { owner: true }; }),
      T.attach(gifos, {}),
      db.prefs.get('state').catch(function () { return null; }),
    ]).then(function (res) {
      me = res[0] || me;
      owner = !!(res[1] && res[1].owner);
      var saved = res[3];
      if (saved && saved.layers && saved.layers.length) {
        // A file saved by an older build must still open: only ids this build
        // knows survive, and anything missing falls back to the default stack.
        var layers = saved.layers.filter(function (r) { return D.layer(r.id); });
        if (layers.length) state.layers = layers;
        if (saved.date) state.date = saved.date;
        if (saved.minutes != null) state.minutes = saved.minutes;
        if (saved.compare) state.compare = saved.compare;
        if (saved.anim) state.anim = saved.anim;
        if (saved.ui) { state.ui.panel = saved.ui.panel !== false; state.ui.welcomed = !!saved.ui.welcomed; }
        if (saved.view) M.setView(saved.view);
      }
      if (!state.ui.welcomed) U.$('welcome').hidden = false;
      UI.renderAll();
      M.invalidate();
      U.$('app').classList.remove('boot');

      return gifos.launch().catch(function () { return null; });
    }).then(function (args) {
      applyLaunch(args);
    }).catch(function (e) {
      U.$('app').classList.remove('boot');
      UI.toast('Something went wrong starting up: ' + (e && e.message), { bad: true });
    });

    if (gifos.onBack) {
      gifos.onBack(function () {
        if (UI.sheetOpen()) UI.closeSheets();
        else if (state.measure) App.toggleMeasure();
        else if (state.compare.on) App.toggleCompare();
        else if (UI.mode() !== 'desktop' && UI.panelOpen()) UI.setPanel(false);
        else if (!U.$('welcome').hidden) App.dismissWelcome();
      });
    }
  }

  window.WVApp = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
