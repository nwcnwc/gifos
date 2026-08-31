/* Soft reload, no outbound windows, guest timers idle when the fire is shared. */
(function (root) {
  'use strict';

  var timers = [];

  function trackTimeout(fn) {
    return function (cb, ms, skip) {
      var wrapped = function () {
        if (root.Net && root.Net.live() && !root.Net.owner()) return;
        cb();
      };
      var id = fn.call(this, wrapped, ms, skip);
      timers.push({ id: id, kind: 't' });
      return id;
    };
  }
  function trackInterval(fn) {
    return function (cb, ms, skip) {
      var wrapped = function () {
        if (root.Net && root.Net.live() && !root.Net.owner()) return;
        cb();
      };
      var id = fn.call(this, wrapped, ms, skip);
      timers.push({ id: id, kind: 'i' });
      return id;
    };
  }

  function clearTimers() {
    var i, t;
    for (i = 0; i < timers.length; i++) {
      t = timers[i];
      if (t.kind === 'i') clearInterval(t.id);
      else clearTimeout(t.id);
    }
    timers = [];
  }

  function wipeShell() {
    $('.menu').remove();
    $('#notifications').remove();
    $('.eventPanel').remove();
    $('#header').empty();
    $('#locationSlider').remove();
    $('#storesContainer').remove();
    $('#map').remove();
    $('#worldOuter').empty();
    $('#outerSlider').css({ left: '0px', opacity: '1' });
    if (!$('#main').length) {
      $('#content').html('<div id="outerSlider"><div id="main"><div id="header"></div></div></div>');
    } else if (!$('#header').length) {
      $('#main').prepend('<div id="header"></div>');
    }
  }

  function resetModules() {
    var names = ['Room', 'Outside', 'World', 'Path', 'Ship', 'Space', 'Fabricator', 'Events', 'Notifications'];
    var i, m;
    for (i = 0; i < names.length; i++) {
      m = root[names[i]];
      if (!m) continue;
      m.tab = null;
      m.panel = null;
    }
    if (root.Engine) {
      root.Engine.activeModule = null;
      root.Engine.topics = {};
      root.Engine.keyLock = false;
      root.Engine.GAME_OVER = false;
    }
  }

  function patchEngine() {
    var E = root.Engine;
    if (!E) return;
    E.setTimeout = trackTimeout(E.setTimeout.bind(E));
    E.setInterval = trackInterval(E.setInterval.bind(E));
    E._softReload = function () {
      clearTimers();
      wipeShell();
      resetModules();
      E.init();
      if (root.Touch && root.Touch.sync) root.Touch.sync();
    };
  }

  function swallowOpen() {
    try {
      root.open = function () { return null; };
    } catch (e) {}
  }

  function onBack() {
    if (!root.gifos || !root.gifos.onBack) return;
    root.gifos.onBack(function () {
      if (root.Events && typeof Events.activeEvent !== 'undefined' && Events.activeEvent) {
        if (typeof Events.endEvent === 'function') Events.endEvent();
        return;
      }
      var E = root.Engine;
      if (E && E.activeModule && E.activeModule !== root.Room && root.Room && root.Room.tab) {
        E.travelTo(root.Room);
        return;
      }
    });
  }

  root.__adrPatch = function () {
    patchEngine();
    swallowOpen();
    onBack();
  };
})(window);
