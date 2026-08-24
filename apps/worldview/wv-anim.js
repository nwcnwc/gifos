/*
 * wv-anim.js — time, moving.
 *
 * Playing a date range is the feature that turns a map into an argument: a
 * hurricane spinning up, a lake disappearing over twenty summers, smoke
 * crossing an ocean. Two rules make it feel right rather than stuttery:
 *
 *   1. NEVER SHOW A HALF-DRAWN DAY. Each frame waits until its tiles are in
 *      memory (or known absent) before it is shown, and the next frames are
 *      already being fetched while the current one is on screen.
 *   2. THE ARCHIVE IS NOT ALWAYS THERE. A day with no imagery is a real
 *      answer; the player says so and keeps going instead of hanging.
 *
 * Export writes the GIF here, on the device, from the frames the map just drew
 * — see wv-gif.js.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var T = window.WVTiles;
  var M = window.WVMap;

  var A = {};
  var state = null, onChange = null, onStatus = null;
  var playing = false, timer = 0, seq = [], at = 0, stopping = false;

  A.MAX_FRAMES = 200;

  A.attach = function (s, opts) {
    state = s;
    onChange = opts.onChange || function () {};
    onStatus = opts.onStatus || function () {};
  };

  A.playing = function () { return playing; };

  // The days an animation will actually visit. Bounded, because "every day
  // from 2000" is 9,000 frames and a phone that never comes back.
  A.dates = function (from, to, step) {
    var out = [];
    var a = U.dayMs(from), b = U.dayMs(to);
    if (b < a) { var t = a; a = b; b = t; }
    var d = a;
    while (d <= b && out.length < A.MAX_FRAMES) {
      out.push(U.msDay(d));
      if (step === 'month') {
        var dt = new Date(d);
        d = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      } else if (step === 'year') {
        var dy = new Date(d);
        d = Date.UTC(dy.getUTCFullYear() + 1, dy.getUTCMonth(), dy.getUTCDate());
      } else {
        d += (step === 'week' ? 7 : 1) * U.MS_DAY;
      }
    }
    return out;
  };

  // Everything the current view needs for one day, as tile keys — the same walk
  // the renderer does, without drawing. Used to wait for a frame and to warm
  // the next ones.
  function keysFor(day, want, bump) {
    var b = M.bounds();
    var v = M.view;
    var keys = [];
    for (var i = 0; i < state.layers.length; i++) {
      var row = state.layers[i];
      if (!row.on) continue;
      var L = D.layer(row.id);
      if (!L || L.builtin) continue;
      if (!D.coverage(L, day).ok) continue;
      var level = Math.min(T.levelFor(M.effRes(), L) + (bump || 0), L.z == null ? 8 : L.z);
      var time = T.timeOf(L, day, state.minutes);
      var span = T.span(level);
      var m = T.matrixSize(level);
      var rowMin = U.clamp(Math.floor((90 - b.latMax) / span), 0, m.h - 1);
      var rowMax = U.clamp(Math.floor((90 - b.latMin) / span), 0, m.h - 1);
      for (var k = Math.floor((b.lonMin + 180) / 360); k <= Math.floor((b.lonMax + 180) / 360); k++) {
        var off = k * 360;
        var colMin = U.clamp(Math.floor((b.lonMin - off + 180) / span), 0, m.w - 1);
        var colMax = U.clamp(Math.floor((b.lonMax - off + 180) / span), 0, m.w - 1);
        for (var r = rowMin; r <= rowMax; r++) {
          if (90 - r * span <= -90) continue;
          for (var c = colMin; c <= colMax; c++) {
            if (-180 + c * span >= 180) continue;
            keys.push(want ? T.want(L, time, level, r, c, 1000, false) : T.key(L.id, time, level, r, c));
          }
        }
      }
    }
    return keys;
  }
  A.keysFor = keysFor;

  A.warm = function (days) {
    for (var i = 0; i < days.length; i++) keysFor(days[i], true);
  };

  A.play = function (opts) {
    if (playing) return A.stop();
    var a = state.anim;
    seq = A.dates(a.from, a.to, a.step);
    if (seq.length < 2) { onStatus('Pick a range of more than one day.'); return; }
    at = Math.max(0, seq.indexOf(state.date));
    if (at < 0) at = 0;
    playing = true;
    stopping = false;
    onChange();
    step();
  };

  A.stop = function () {
    playing = false;
    stopping = true;
    clearTimeout(timer);
    onChange();
  };

  function step() {
    if (!playing) return;
    var day = seq[at];
    state.date = day;
    onChange();
    // Fetch this day, and warm the next two while it is on screen.
    var keys = keysFor(day, true);
    A.warm(seq.slice(at + 1, at + 3));
    var hold = Math.max(60, 1000 / (state.anim.fps || 4));
    T.settle(keys, 9000).then(function () {
      if (stopping) return;
      M.invalidate();
      timer = setTimeout(function () {
        if (!playing) return;
        at++;
        if (at >= seq.length) {
          if (state.anim.loop) at = 0;
          else { A.stop(); return; }
        }
        step();
      }, hold);
    });
  }

  // ---- export --------------------------------------------------------------
  /*
   * Renders the range at a fixed size and encodes a GIF. The map's own canvas
   * paints every frame — what you exported is what you were looking at,
   * including the layer stack and the offline base filling the gaps.
   */
  A.exportGif = function (opts) {
    var days = A.dates(opts.from, opts.to, opts.step);
    var size = opts.size || 640;
    var stamp = opts.stamp !== false;
    var report = opts.onProgress || function () {};
    var wasDate = state.date;
    var frames = [];
    var sz = M.size();
    var h = Math.round(size * sz.h / sz.w);

    return days.reduce(function (chain, day, i) {
      return chain.then(function () {
        if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
        report(0.05 + 0.55 * (i / days.length), 'Fetching ' + U.prettyDate(day));
        state.date = day;
        onChange();
        var keys = keysFor(day, true);
        return T.settle(keys, 12000);
      }).then(function () {
        M.renderNow();
        frames.push(M.grabFrame(size, h, stamp ? U.prettyDate(day) : null));
      });
    }, Promise.resolve()).then(function () {
      report(0.62, 'Packing the GIF');
      return new Promise(function (resolve) {
        // Yield first: encoding is a long synchronous burn and the progress
        // line must be on the screen before it starts.
        setTimeout(function () {
          var bytes = window.WVGif.encode(frames, {
            delayCs: Math.max(2, Math.round(100 / (opts.fps || 4))),
            dither: 12,
            onProgress: function (p, note) { report(0.62 + 0.36 * p, note); },
          });
          resolve(bytes);
        }, 60);
      });
    }).then(function (bytes) {
      state.date = wasDate;
      onChange();
      M.invalidate();
      return bytes;
    }).catch(function (e) {
      state.date = wasDate;
      onChange();
      M.invalidate();
      throw e;
    });
  };

  window.WVAnim = A;
})();
