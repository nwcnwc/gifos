/*
 * Sandbox shims that must exist BEFORE the vendored editor runs.
 *
 * localStorage / sessionStorage throw in the opaque-origin iframe.
 * BeepBox keeps prefs, undo (when the URL is hidden) and song recovery
 * there. A Storage-shaped object in memory is enough for the constructor;
 * boot.js later flushes prefs into gifos.db('prefs').
 *
 * displayBrowserUrl defaults to true upstream, which makes undo call
 * history.back() — that can walk this srcdoc frame off the app. Force it
 * off so undo stays in sessionStorage.
 *
 * The editor's MP3 path injects lamejs from jsdelivr; URL shorteners
 * window.open is.gd / tinyurl. Neither is reachable here. Block them.
 */
(function (root) {
  'use strict';

  var memL = Object.create(null);
  var memS = Object.create(null);

  function makeStorage(mem) {
    var api = {
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) {
        mem[String(k)] = String(v);
      },
      removeItem: function (k) {
        delete mem[String(k)];
      },
      clear: function () {
        var keys = Object.keys(mem), i;
        for (i = 0; i < keys.length; i++) delete mem[keys[i]];
      },
      key: function (i) {
        return Object.keys(mem)[i] || null;
      }
    };
    try {
      Object.defineProperty(api, 'length', {
        get: function () { return Object.keys(mem).length; }
      });
    } catch (e) {
      api.length = 0;
    }
    return api;
  }

  var local = makeStorage(memL);
  var session = makeStorage(memS);
  try { Object.defineProperty(root, 'localStorage', { configurable: true, value: local }); } catch (e1) { root.localStorage = local; }
  try { Object.defineProperty(root, 'sessionStorage', { configurable: true, value: session }); } catch (e2) { root.sessionStorage = session; }

  local.setItem('displayBrowserUrl', 'false');
  local.setItem('autoPlay', 'false');
  session.setItem('currentUndoIndex', '0');
  session.setItem('oldestUndoIndex', '0');
  session.setItem('newestUndoIndex', '0');

  var hist = root.history;
  if (hist && hist.replaceState) {
    var origReplace = hist.replaceState.bind(hist);
    var origPush = hist.pushState ? hist.pushState.bind(hist) : origReplace;
    function keepHash(orig, state, title, url) {
      if (url == null || url === '') return orig(state, title);
      var s = String(url);
      if (s.charAt(0) === '#' || s.indexOf('#') >= 0 && s.indexOf('://') < 0 && s.indexOf('player/') < 0) {
        try { return orig(state, title, s.charAt(0) === '#' ? s : undefined); } catch (e3) { return orig(state, title); }
      }
      try { return orig(state, title); } catch (e4) {}
    }
    hist.replaceState = function (state, title, url) { return keepHash(origReplace, state, title, url); };
    hist.pushState = function (state, title, url) { return keepHash(origPush, state, title, url); };
  }

  var proto = root.HTMLScriptElement && root.HTMLScriptElement.prototype;
  if (proto) {
    var desc = Object.getOwnPropertyDescriptor(proto, 'src') ||
      Object.getOwnPropertyDescriptor(root.HTMLElement && root.HTMLElement.prototype, 'src');
    if (desc && desc.set) {
      var setSrc = desc.set;
      Object.defineProperty(proto, 'src', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function (v) {
          var u = String(v || '');
          if (/jsdelivr|lamejs|googleapis|fonts\.gstatic/i.test(u)) {
            try {
              root.alert('MP3 export needs a library this copy does not ship. Export WAV, MIDI or JSON instead.');
            } catch (e5) {}
            return;
          }
          setSrc.call(this, v);
        }
      });
    }
  }

  var origOpen = root.open;
  root.open = function (url) {
    var u = String(url || '');
    if (/is\.gd|tinyurl|jsdelivr|paypal/i.test(u)) return null;
    if (typeof origOpen === 'function') {
      try { return origOpen.apply(root, arguments); } catch (e6) { return null; }
    }
    return null;
  };

  root.GifOSBeepboxShim = { local: local, session: session, memL: memL, memS: memS };
})(window);
