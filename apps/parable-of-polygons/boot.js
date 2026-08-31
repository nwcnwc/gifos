/*
 * Parable of the Polygons — GifOS shell.
 *
 * Mounts every board the original essay embedded as an iframe, keeps the
 * last sandbox sliders in gifos.db, and shares that town over Invite.
 */
(function (root) {
  'use strict';

  var prefs = { bias: 0.2, nonconform: 0.8, emptiness: 0.2, ratioT: 0.5 };
  var sandbox = null;
  var biasA = null, biasB = null, mixS = null, sandS = null, sandMix = null;
  var saveTimer = 0;
  var chapters = [];

  function $(id) { return document.getElementById(id); }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (!row) return;
      if (row.bias != null) prefs.bias = +row.bias;
      if (row.nonconform != null) prefs.nonconform = +row.nonconform;
      if (row.emptiness != null) prefs.emptiness = +row.emptiness;
      if (row.ratioT != null) prefs.ratioT = +row.ratioT;
    }).catch(function () {});
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs',
      bias: prefs.bias,
      nonconform: prefs.nonconform,
      emptiness: prefs.emptiness,
      ratioT: prefs.ratioT
    }).catch(function () {});
  }

  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrefs, 250);
  }

  function pct(v) { return Math.round(v * 100) + '%'; }

  function mountMini(id, spec) {
    var canvas = $(id);
    if (!canvas) return null;
    var t = new root.Town({
      canvas: canvas,
      tile: spec.tile, peep: spec.peep,
      grid: spec.grid,
      bias: spec.bias, nonconform: spec.nonconform,
      pickAnyone: !!spec.pickAnyone,
      frozen: !!spec.frozen,
      box: spec.box || null,
      confetti: !!spec.confetti,
      offsetY: spec.offsetY || 0,
      pad: spec.pad == null ? 5 : spec.pad
    });
    var reset = document.querySelector('[data-reset="' + id + '"]');
    if (reset) reset.addEventListener('click', function () { t.reset(); });
    return t;
  }

  function mountSim(prefix, spec) {
    var canvas = $(prefix + '-board');
    var stats = $(prefix + '-stats');
    var label = $(prefix + '-pct');
    var go = $(prefix + '-go');
    var neu = $(prefix + '-new');
    var t = new root.Town({
      canvas: canvas,
      statsCanvas: stats,
      statsText: label,
      tile: 30, peep: 30,
      gw: 20, gh: 20,
      pad: 0,
      bias: spec.bias, nonconform: spec.nonconform,
      start: spec.start || 'random',
      pickAnyone: !!spec.pickAnyone,
      auto: true,
      emptiness: spec.emptiness, ratioT: spec.ratioT,
      onTickStats: function (seg, running) {
        if (go) {
          go.textContent = running ? 'stop' : 'start';
          go.classList.toggle('hot', !!running);
        }
      }
    });
    if (go) go.addEventListener('click', function () {
      t.running = !t.running;
      t.doneBuf = 60;
      t.writeStats();
      if (prefix === 'sand' && root.Net) root.Net.publish(t, { force: true });
    });
    if (neu) neu.addEventListener('click', function () {
      t.reset();
      if (prefix === 'sand' && root.Net) root.Net.publish(t, { force: true });
    });
    return t;
  }

  function paintBias(el, v) { if (el) el.textContent = pct(v); }

  function bootEssay() {
    new root.Splash($('intro-canvas'), { happy: false });
    new root.Splash($('outro-canvas'), { happy: true });

    mountMini('mini-intro', {
      tile: 52, peep: 52,
      grid: [
        [1,1,1,0,0,0,0,0,0,2,1,2],
        [1,1,1,0,0,0,0,0,0,1,2,1],
        [1,1,2,0,0,0,0,0,0,0,1,2],
        [1,1,1,0,0,0,0,0,0,1,2,1],
        [1,1,1,0,0,0,0,0,0,2,1,2]
      ]
    });
    mountMini('mini-unhappy', {
      tile: 72, peep: 72,
      grid: [[1,0,1],[1,2,1],[1,0,2]]
    });
    mountMini('mini-happy', {
      tile: 72, peep: 72,
      grid: [[1,0,1],[1,2,1],[2,0,2]]
    });
    mountMini('mini-bored', {
      tile: 72, peep: 72,
      grid: [[2,0,2],[2,2,2],[2,0,2]]
    });
    mountMini('mini-hood', {
      tile: 48, peep: 48,
      grid: [
        [2,2,2,2,2,2,1,1,1,1,1,1],
        [2,2,0,1,2,2,1,1,2,0,1,1],
        [2,2,2,2,2,2,1,1,1,1,1,1]
      ]
    });
    mountMini('mini-check', {
      tile: 48, peep: 48,
      grid: [
        [1,1,2,1,2,1,2,1,2,1,2,0],
        [1,2,1,2,1,2,1,2,1,2,1,2],
        [1,1,2,1,2,1,2,1,2,1,2,0]
      ]
    });
    mountMini('mini-b33', {
      tile: 80, peep: 80,
      bias: 0.33, nonconform: 1,
      grid: [[1,2,1],[2,0,2],[1,2,1]]
    });
    mountMini('mini-b50', {
      tile: 80, peep: 80,
      bias: 0.5, nonconform: 1,
      grid: [[1,2,1],[2,0,2],[1,2,1]]
    });
    mountMini('mini-non', {
      tile: 64, peep: 64,
      bias: 0, nonconform: 0.9,
      grid: [
        [1,1,0,2,2],
        [1,1,0,2,2],
        [1,1,0,2,2],
        [1,1,0,2,2]
      ]
    });
    mountMini('mini-end', {
      tile: 56, peep: 56,
      bias: 0, nonconform: 0.9,
      frozen: true,
      grid: [[2,1,2,1,2,1,2,1]]
    });
    mountMini('mini-friend', {
      tile: 72, peep: 72,
      bias: 0.33, nonconform: 1,
      confetti: true,
      offsetY: 28,
      box: [290, 430],
      grid: [
        [2,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,0,0,0,0,2]
      ]
    });

    var manTown = new root.Town({
      canvas: $('man-board'),
      tile: 48, peep: 44,
      gw: 10, gh: 10, pad: 0,
      bias: 0.33, nonconform: 1,
      start: 'random', emptiness: 0.2, ratioT: 0.5
    });
    var manNew = $('man-new');
    if (manNew) manNew.addEventListener('click', function () { manTown.reset(); });

    var auto1 = mountSim('auto1', { bias: 0.33, nonconform: 1, start: 'random' });
    var auto2 = mountSim('auto2', { bias: 0.33, nonconform: 1, start: 'random' });
    var auto3 = mountSim('auto3', { bias: 0.33, nonconform: 1, start: 'segregated' });
    var auto4 = mountSim('auto4', { bias: 0.1, nonconform: 0.8, start: 'segregated' });
    sandbox = mountSim('sand', {
      bias: prefs.bias, nonconform: prefs.nonconform,
      emptiness: prefs.emptiness, ratioT: prefs.ratioT,
      start: 'random', pickAnyone: true
    });

    biasA = new root.DualSlider($('auto2-slider'), {
      values: [0.33, 1], lockRight: true, colors: ['#555', '#aaa', '#2095dc'],
      onChange: function (a) {
        auto2.setBias(a, 1);
        paintBias($('auto2-bias'), a);
      }
    });
    biasB = new root.DualSlider($('auto3-slider'), {
      values: [0.33, 1], lockRight: true, colors: ['#555', '#aaa', '#2095dc'],
      onChange: function (a) {
        auto3.setBias(a, 1);
        paintBias($('auto3-bias'), a);
      }
    });
    mixS = new root.DualSlider($('auto4-slider'), {
      values: [0.1, 0.8], colors: ['#555', '#aaa', '#555'],
      onChange: function (a, b) {
        auto4.setBias(a, b);
        paintBias($('auto4-bias'), a);
        paintBias($('auto4-nc'), b);
      }
    });
    sandS = new root.DualSlider($('sand-slider'), {
      values: [prefs.bias, prefs.nonconform], colors: ['#555', '#aaa', '#555'],
      onChange: function (a, b) {
        sandbox.setBias(a, b);
        prefs.bias = a; prefs.nonconform = b;
        paintBias($('sand-bias'), a);
        paintBias($('sand-nc'), b);
        debounceSave();
      },
      onLetGo: function () {
        savePrefs();
        if (root.Net) root.Net.publish(sandbox, { force: true });
      }
    });
    var emptyEnd = 1 - prefs.emptiness;
    var triEnd = prefs.ratioT * emptyEnd;
    sandMix = new root.DualSlider($('sand-mix'), {
      values: [triEnd, emptyEnd], colors: ['#FFDD56', '#567DFF', '#111'],
      onChange: function (a, b) {
        if (b < 0.02) b = 0.02;
        var emp = 1 - b;
        var rt = a / b;
        sandbox.setMix(rt, emp);
        prefs.ratioT = rt; prefs.emptiness = emp;
        $('sand-tri').textContent = Math.round(rt * 100);
        $('sand-sq').textContent = Math.round((1 - rt) * 100);
        $('sand-empty').textContent = Math.round(emp * 100) + '% empty';
        debounceSave();
      },
      onLetGo: function () {
        sandbox.reset();
        savePrefs();
        if (root.Net) root.Net.publish(sandbox, { force: true });
      }
    });

    sandbox.onMoved = function () {
      if (root.Net) root.Net.publish(sandbox, { force: true });
    };
  }

  function wireNet() {
    if (!root.Net) return Promise.resolve();
    root.Net.onTown(function (rec) {
      if (!sandbox || !rec) return;
      if (rec.bias != null) {
        sandbox.bias = +rec.bias;
        prefs.bias = sandbox.bias;
        if (sandS) sandS.set(sandbox.bias, rec.nonconform);
        paintBias($('sand-bias'), sandbox.bias);
      }
      if (rec.nonconform != null) {
        sandbox.nonconform = +rec.nonconform;
        prefs.nonconform = sandbox.nonconform;
        paintBias($('sand-nc'), sandbox.nonconform);
      }
      if (rec.emptiness != null) sandbox.emptiness = +rec.emptiness;
      if (rec.ratioT != null) sandbox.ratioT = +rec.ratioT;
      if (rec.cells) {
        sandbox.importCells(rec.cells);
        for (var i = 0; i < sandbox.peeps.length; i++) sandbox.peeps[i].mood();
      }
      if (rec.running != null) sandbox.running = !!rec.running;
    });
    root.Net.onRoom(function (room) {
      var pill = $('room-pill');
      if (!pill) return;
      var n = (room.others | 0) + 1;
      if (!room.live || n < 2) { pill.hidden = true; return; }
      pill.hidden = false;
      pill.textContent = n + ' in this town';
    });
    return root.Net.init().then(function (room) {
      if (root.Net.here) root.Net.here();
      if (room && (room.others > 0 || !room.owner) && sandbox) {
        /* guest waits for the host snapshot; host already has a board */
      }
      return room;
    });
  }

  function wireBack() {
    chapters = [].slice.call(document.querySelectorAll('[data-chapter]'));
    if (!root.gifos || !root.gifos.onBack) return;
    root.gifos.onBack(function () {
      var y = root.scrollY || document.documentElement.scrollTop || 0;
      var prev = null;
      for (var i = 0; i < chapters.length; i++) {
        var top = chapters[i].getBoundingClientRect().top + y;
        if (top < y - 40) prev = chapters[i];
      }
      if (prev) prev.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function wireLaunch() {
    if (!root.gifos || !root.gifos.launch) return;
    root.gifos.launch().then(function (a) {
      if (!a || !a.at) return;
      var id = String(a.at).toLowerCase().replace(/[^a-z0-9-]/g, '');
      var aliases = {
        intro: 'ch-intro', rule: 'ch-rule', bias: 'ch-bias',
        past: 'ch-past', diversity: 'ch-diversity', sandbox: 'ch-sandbox',
        wrap: 'ch-wrap'
      };
      var el = $(aliases[id] || id);
      if (el) el.scrollIntoView();
    }).catch(function () {});
  }

  function boot() {
    bootEssay();
    wireBack();
    wireLaunch();
    wireNet().then(function () {
      if (sandbox && root.Net && root.Net.owner && root.Net.owner()) {
        root.Net.publish(sandbox, { force: true });
      }
    }).catch(function () {});
    setInterval(function () {
      if (!sandbox || !root.Net) return;
      if (sandbox.running && root.Net.owner && root.Net.owner()) {
        root.Net.publish(sandbox);
      }
      if (root.Net.here) root.Net.here();
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadPrefs().then(boot); });
  } else {
    loadPrefs().then(boot);
  }
})(window);
