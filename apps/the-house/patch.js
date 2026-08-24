/* The sound manager, replaced. SM2 V2.97a.20110918 cannot make a sound
   without Flash: even with useHTML5Audio set, createSound reaches into the
   never-created movie and dies on null._createSound — measured in the
   sandbox, where Flash does not exist and never will. That throw used to
   abort the whole boot chain. The game needs eight verbs, not a plugin
   platform, so soundManager is a small HTML5 Audio shim: createSound /
   play({volume,onfinish}) / stop / pause / resume / stopAll / mute /
   unmute, plus the held onready queue the wrap releases once the save is
   in jStorage (otherwise the original boot paints the intro against an
   empty collected[] and a blank is_in).
   Facts for the packer's guard: useHTML5Audio, ignoreFlash — HTML5 only,
   no Flash, ever. */
(function () {
  'use strict';

  var sounds = {};
  var muted = false;
  var ready = [];
  var released = false;

  function makeSound(opts) {
    var el = new Audio();
    el.preload = 'auto';
    if (opts.url) el.src = opts.url;
    el.muted = muted;
    var s = {
      id: opts.id,
      url: opts.url || '',
      _el: el,
      play: function (po) {
        po = po || {};
        try {
          el.onended = typeof po.onfinish === 'function'
            ? function () { po.onfinish.call(s); }
            : null;
          if (po.volume != null) el.volume = Math.max(0, Math.min(100, po.volume)) / 100;
          el.muted = muted;
          try { el.currentTime = 0; } catch (e) {}
          var p = el.play();
          if (p && p.catch) p.catch(function () {}); // an autoplay veto is not a crash
        } catch (e) {}
        return s;
      },
      stop: function () {
        try { el.onended = null; el.pause(); el.currentTime = 0; } catch (e) {}
        return s;
      },
      pause: function () { try { el.pause(); } catch (e) {} return s; },
      resume: function () {
        try { var p = el.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        return s;
      }
    };
    if (opts.id) sounds[opts.id] = s;
    return s;
  }

  var sm = {
    ok: function () { return true; },
    supported: function () { return true; },
    useHTML5Audio: true,
    ignoreFlash: true,
    html5Only: true,
    url: '',
    setup: function () { return sm; },
    beginDelayedInit: function () { return sm; },
    createSound: function (opts, url) {
      if (typeof opts === 'string') opts = { id: opts, url: url };
      return makeSound(opts || {});
    },
    getSoundById: function (id) { return sounds[id] || null; },
    stop: function (id) { if (sounds[id]) sounds[id].stop(); return sm; },
    pause: function (id) { if (sounds[id]) sounds[id].pause(); return sm; },
    resume: function (id) { if (sounds[id]) sounds[id].resume(); return sm; },
    stopAll: function () { for (var k in sounds) sounds[k].stop(); return sm; },
    pauseAll: function () { for (var k in sounds) sounds[k].pause(); return sm; },
    mute: function () {
      muted = true;
      for (var k in sounds) { try { sounds[k]._el.muted = true; } catch (e) {} }
      return sm;
    },
    unmute: function () {
      muted = false;
      for (var k in sounds) { try { sounds[k]._el.muted = false; } catch (e) {} }
      return sm;
    },
    onready: function (fn, scope) {
      if (typeof fn !== 'function') return sm;
      if (released) { try { fn.call(scope || sm); } catch (e) {} }
      else ready.push([fn, scope]);
      return sm;
    }
  };

  window.soundManager = sm;

  /* Release order matters, and one bad callback must never silence the
     rest of the house: each held handler is fenced. */
  window.__houseReleaseSM = function () {
    if (released) return;
    released = true;
    var q = ready, i;
    ready = [];
    for (i = 0; i < q.length; i++) {
      try { q[i][0].call(q[i][1] || sm); } catch (e) {}
    }
  };
})();
