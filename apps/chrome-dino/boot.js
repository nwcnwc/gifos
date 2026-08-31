/*
 * Chrome Dino — GifOS shell.
 *
 * Starts the vendored runner, keeps the high score in gifos.db, and wires
 * the side-by-side net. Invite is OS chrome — this file never draws it.
 */
(function (root) {
  'use strict';

  var prefs = { high: 0 };
  var applied = false;

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('high').then(function (row) {
      if (row && row.n) prefs.high = row.n | 0;
    }).catch(function () {});
  }

  function saveHigh(n) {
    n = n | 0;
    if (n <= prefs.high) return;
    prefs.high = n;
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({ id: 'high', n: prefs.high }).catch(function () {});
  }

  function applyHigh(r) {
    if (!r || applied) return;
    if (!prefs.high) return;
    r.highestScore = prefs.high;
    if (r.distanceMeter && r.distanceMeter.setHighScore) {
      r.distanceMeter.setHighScore(prefs.high);
    }
    applied = true;
  }

  function scoreOf(r) {
    if (!r || !r.distanceMeter) return 0;
    return r.distanceMeter.getActualDistance(Math.ceil(r.distanceRan || 0));
  }

  function fake(type, code) {
    return {
      type: type,
      keyCode: code,
      target: document.body,
      currentTarget: document.body,
      preventDefault: function () {},
      button: 0
    };
  }

  function boot() {
    var R = root.Runner;
    if (!R) return;

    R.hooks = R.hooks || {};
    R.hooks.onInit = function (r) {
      applyHigh(r);
      if (root.Net) root.Net.attach(r);
      document.body.classList.add('ready');
    };
    R.hooks.afterFrame = function (r) {
      applyHigh(r);
      var playing = !!(r && r.playing);
      document.body.classList.toggle('playing', playing && !r.crashed);
      if (r && r.highestScore > prefs.high) saveHigh(r.highestScore);
      if (root.Net) root.Net.tick(r);
    };
    R.hooks.onStart = function (r) {
      if (root.Net) root.Net.beginRun(r);
    };
    R.hooks.onRestart = function (r) {
      if (root.Net) root.Net.beginRun(r);
    };
    R.hooks.onCrash = function (r) {
      if (r && r.highestScore > prefs.high) saveHigh(r.highestScore);
      if (root.Net) root.Net.crashed(r);
    };
    R.hooks.keepAlive = function () {
      return !!(root.Net && root.Net.live() && root.Net.count() > 1);
    };

    root.Dino = {
      jumpDown: function () {
        var r = R.instance_;
        if (!r || !r.tRex || !r.onKeyDown) return;
        r.onKeyDown(fake(R.events.KEYDOWN, 32));
      },
      jumpUp: function () {
        var r = R.instance_;
        if (!r || !r.tRex || !r.onKeyUp) return;
        r.onKeyUp(fake(R.events.KEYUP, 32));
      },
      duckDown: function () {
        var r = R.instance_;
        if (!r || !r.tRex || !r.onKeyDown) return;
        r.onKeyDown(fake(R.events.KEYDOWN, 40));
      },
      duckUp: function () {
        var r = R.instance_;
        if (!r || !r.tRex || !r.onKeyUp) return;
        r.onKeyUp(fake(R.events.KEYUP, 40));
      },
      scoreOf: scoreOf
    };

    if (root.Touch) root.Touch.init();
    new R('.interstitial-wrapper');
    if (root.Net) root.Net.init();
  }

  function start() {
    loadPrefs().then(boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
