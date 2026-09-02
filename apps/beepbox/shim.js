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

  // window.prompt does NOTHING in an app frame: the sandbox carries no
  // allow-modals, so it returns NULL without asking. prompt() cannot be
  // shimmed the way the runtime shims alert() and confirm() — its contract is
  // a STRING returned synchronously, and there is no honest way to invent
  // one. So ask properly and take the answer late: gifosAsk(label, initial)
  // resolves to the typed string, or null if it was dismissed. (The same
  // dialog piskel and my-mind use; test/unit/app-modals.js guards that no
  // app code path reaches prompt().)
  root.gifosAsk = function (label, initial) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;'
        + 'align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px';
      var card = document.createElement('div');
      card.style.cssText = 'background:#1b1b1f;color:#f4f4f5;border:1px solid #3f3f46;'
        + 'border-radius:12px;padding:16px;max-width:24rem;width:100%;'
        + 'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        + 'box-shadow:0 12px 40px rgba(0,0,0,.5)';
      var p = document.createElement('p');
      p.textContent = label;
      p.style.cssText = 'margin:0 0 10px';
      var input = document.createElement('input');
      input.type = 'text';
      input.value = initial == null ? '' : String(initial);
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:0 0 12px;'
        + 'padding:8px 10px;border-radius:8px;border:1px solid #3f3f46;background:#101014;'
        + 'color:inherit;font:inherit';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'OK';
      var btn = 'padding:7px 14px;border-radius:8px;border:1px solid #3f3f46;'
        + 'background:#26262b;color:inherit;font:inherit;cursor:pointer';
      cancel.style.cssText = btn;
      ok.style.cssText = btn + ';background:#3b82f6;border-color:#3b82f6;color:#fff';
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      cancel.addEventListener('click', function () { done(null); });
      ok.addEventListener('click', function () { done(input.value); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
        else if (e.key === 'Enter') { e.preventDefault(); done(input.value); }
      });
      row.appendChild(cancel); row.appendChild(ok);
      card.appendChild(p); card.appendChild(input); card.appendChild(row);
      wrap.appendChild(card);
      (document.body || document.documentElement).appendChild(wrap);
      input.focus(); input.select();
    });
  };

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

  try {
    var sw = root.navigator && root.navigator.serviceWorker;
    if (sw && typeof sw.register === 'function') {
      sw.register = function () {
        return Promise.resolve({
          installing: null, waiting: null, active: null,
          addEventListener: function () {},
          removeEventListener: function () {}
        });
      };
    }
  } catch (eSw) {}

  try {
    if (root.history) {
      Object.defineProperty(root.history, 'scrollRestoration', {
        configurable: true,
        get: function () { return 'manual'; },
        set: function () {}
      });
    }
  } catch (eSr) {}

  var origOpen = root.open;
  root.open = function (url) {
    var u = String(url || '');
    if (/is\.gd|tinyurl|jsdelivr|paypal/i.test(u)) return null;
    if (typeof origOpen === 'function') {
      try { return origOpen.apply(root, arguments); } catch (e6) { return null; }
    }
    return null;
  };

  /* The sandbox CSP is script-src 'unsafe-inline' with no unsafe-eval.
     BeepBox compiles FM / picked-string / effects synths with the Function
     constructor (Chrome reports that as eval and refuses). An inline
     <script> is legal, so compile the same function by inserting one and
     reading it back. TiddlyWiki uses this hatch for the same wall. */
  function compileFn(names, body) {
    var k = '__bbfn' + Math.random().toString(36).slice(2);
    var s = document.createElement('script');
    s.textContent = 'window.' + k + '=function(' + names.join(',') + '){\n' + body + '\n};';
    (document.documentElement || document.head).appendChild(s);
    s.parentNode.removeChild(s);
    var f = root[k];
    try { delete root[k]; } catch (e7) { root[k] = undefined; }
    if (typeof f !== 'function') throw new Error('BeepBox could not compile a synth function');
    return f;
  }

  function compile(a, b, body) {
    return compileFn([String(a), String(b)], String(body));
  }

  try {
    var NativeFn = root.Function;
    function SafeFn() {
      var args = [], i, body;
      for (i = 0; i < arguments.length; i++) args[i] = arguments[i];
      body = args.length ? String(args.pop()) : '';
      for (i = 0; i < args.length; i++) args[i] = String(args[i]);
      return compileFn(args, body);
    }
    SafeFn.prototype = NativeFn.prototype;
    try {
      Object.defineProperty(root, 'Function', { configurable: true, writable: true, value: SafeFn });
    } catch (e8) {
      root.Function = SafeFn;
    }
  } catch (eFn) {}

  root.GifOSBeepboxShim = {
    local: local, session: session, memL: memL, memS: memS, compile: compile
  };
})(window);
