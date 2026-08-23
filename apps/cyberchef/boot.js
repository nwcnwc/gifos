// GifOS shell around the vendored CyberChef production build.
// Classic script (the runtime inlines <script src> and drops type=module).
//
// 1. localStorage is a SecurityError in the opaque-origin sandbox. CyberChef
//    saves favourites, options and recipes there. We present a Storage-shaped
//    object backed by memory, flushed into gifos.db('prefs').
// 2. The production JS is too big to inline into the srcdoc (the GIF archive
//    inflates to a 64 MB ceiling, and a 50 MB+ srcdoc kills the tab). boot.js
//    is the only inlined script: it pulls gzipped main.js + modules through
//    gifos.assets(), inflates them, and injects main.js as an inline script.
// 3. ChefWorker loads extra operation modules with importScripts(docURL+…).
//    docURL is about:srcdoc here, and importScripts of a blob: URL is blocked
//    by script-src. So we intercept Blob construction: when webpack's
//    worker-loader mints the ChefWorker source, we append every module bundle
//    so OpModules is populated before the first bake and importScripts is never
//    reached.
// 4. history.replaceState on about:srcdoc throws; CyberChef's deep-link updater
//    is silenced (updateUrl defaults off).
(function () {
  var mem = Object.create(null);
  var persistTimer = 0;
  function persist() {
    if (!window.gifos || !gifos.db) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      var data = {};
      for (var k in mem) if (Object.prototype.hasOwnProperty.call(mem, k)) data[k] = mem[k];
      gifos.db('prefs').put({ id: 'ls', data: data }).catch(function () {});
    }, 120);
  }
  var storage = new Proxy(mem, {
    get: function (t, p) {
      if (p === 'getItem') return function (k) { return Object.prototype.hasOwnProperty.call(t, k) ? t[k] : null; };
      if (p === 'setItem') return function (k, v) { t[k] = String(v); persist(); };
      if (p === 'removeItem') return function (k) { delete t[k]; persist(); };
      if (p === 'clear') return function () { for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) delete t[k]; persist(); };
      if (p === 'key') return function (i) { return Object.keys(t)[i] || null; };
      if (p === 'length') return Object.keys(t).length;
      if (p === 'toString') return function () { return '[object Storage]'; };
      return t[p];
    },
    set: function (t, p, v) { t[p] = String(v); persist(); return true; },
    has: function (t, p) {
      return Object.prototype.hasOwnProperty.call(t, p) ||
        p === 'getItem' || p === 'setItem' || p === 'removeItem' || p === 'clear' || p === 'key' || p === 'length';
    }
  });
  try { Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }); }
  catch (e) { window.localStorage = storage; }
  try { Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true }); }
  catch (e2) {}

  // Dark is the GifOS default and CyberChef's own dark theme. Applied before
  // the first paint so the classic-theme flash never shows.
  try { document.documentElement.className = 'dark'; } catch (e3) {}
  if (!mem.options) {
    mem.options = JSON.stringify({
      updateUrl: false,
      showHighlighter: true,
      wordWrap: true,
      showErrors: true,
      errorTimeout: 4000,
      attemptHighlight: true,
      theme: 'dark',
      useMetaKey: false,
      logLevel: 'info',
      autoMagic: true,
      imagePreview: true,
      syncTabs: true,
      showCatCount: false
    });
  }

  var origAdd = document.addEventListener.bind(document);
  try {
    var origReplace = history.replaceState.bind(history);
    history.replaceState = function () {
      try { return origReplace.apply(history, arguments); } catch (e) {}
    };
    var origPush = history.pushState.bind(history);
    history.pushState = function () {
      try { return origPush.apply(history, arguments); } catch (e) {}
    };
  } catch (e4) {}

  var chefBlob = null;
  function installBlobWrap(mods) {
    var OrigBlob = window.Blob;
    function WrappedBlob(parts, opts) {
      var p = parts;
      try {
        if (parts && parts.length && mods) {
          var text = '';
          for (var i = 0; i < parts.length; i++) if (typeof parts[i] === 'string') text += parts[i];
          if (text.indexOf('loadRequiredModules') !== -1) {
            if (chefBlob) return chefBlob;
            p = Array.prototype.slice.call(parts);
            var names = Object.keys(mods);
            for (var j = 0; j < names.length; j++) p.push('\n;', mods[names[j]]);
            p.push('\n;self.importScripts=function(){throw new Error("This GifOS port cannot load extra CyberChef modules from the network.");};\n');
            chefBlob = new OrigBlob(p, opts);
            return chefBlob;
          }
        }
      } catch (e) {}
      return new OrigBlob(p, opts);
    }
    WrappedBlob.prototype = OrigBlob.prototype;
    try { WrappedBlob.name = 'Blob'; } catch (e5) {}
    window.Blob = WrappedBlob;
  }

  function setMsg(m) {
    try {
      var n = document.getElementById('preloader-msg');
      if (n) {
        n.classList.add('loading');
        n.textContent = m;
      }
    } catch (e) {}
  }

  function banner() {
    if (document.getElementById('gifos-unofficial')) return;
    if (!document.body) return;
    var el = document.createElement('div');
    el.id = 'gifos-unofficial';
    el.setAttribute('role', 'note');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#1a1a1a;color:#c8c8c8;font:12px/1.4 system-ui,sans-serif;padding:6px 12px;border-top:1px solid #f44336;';
    el.innerHTML = 'Unofficial GifOS port of CyberChef · © Crown Copyright · not affiliated with or endorsed by GCHQ · recipes save on this device';
    document.body.appendChild(el);
    try { document.body.style.paddingBottom = '28px'; } catch (e) {}
  }

  function gunzipText(buf) {
    var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function asset(path) {
    if (!window.gifos || !gifos.assets) {
      return Promise.reject(new Error('This app needs to run inside GifOS to reach its engine.'));
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    });
  }

  function injectMain(src) {
    function go() {
      var s = document.createElement('script');
      s.textContent = src;
      document.body.appendChild(s);
      if (document.readyState !== 'loading') {
        document.dispatchEvent(new Event('DOMContentLoaded'));
      }
      banner();
    }
    if (document.body) go();
    else origAdd('DOMContentLoaded', go);
  }

  function fail(err) {
    var msg = (err && err.message) ? err.message : String(err);
    setMsg('CyberChef failed to load: ' + msg);
    try {
      var pre = document.getElementById('preloader-error');
      if (pre) pre.textContent = msg;
    } catch (e) {}
  }

  var prefsReady = Promise.resolve().then(function () {
    if (!window.gifos || !gifos.db) return;
    return gifos.db('prefs').get('ls').then(function (rec) {
      if (!rec || !rec.data) return;
      var d = rec.data;
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) mem[k] = d[k];
      try {
        var opts = JSON.parse(mem.options || '{}');
        if (opts.theme) document.documentElement.className = opts.theme;
      } catch (e) {}
    }).catch(function () {});
  });

  var names = window.GIFOS_CC_NAMES;
  if (!names || !names.length) {
    fail(new Error('module list missing — this GIF was packed incorrectly.'));
    return;
  }

  setMsg('Unpacking CyberChef…');
  var mods = {};
  var loaded = 0;
  var total = names.length + 1;
  function tick(label) {
    loaded++;
    setMsg('Unpacking ' + label + ' (' + loaded + '/' + total + ')…');
  }

  var modulesReady = Promise.all(names.map(function (name) {
    return asset('modules/' + name + '.js.gz').then(gunzipText).then(function (src) {
      mods[name] = src;
      tick(name);
    });
  }));
  var mainReady = asset('main.js.gz').then(gunzipText).then(function (src) {
    tick('main');
    return src;
  });

  Promise.all([prefsReady, modulesReady, mainReady]).then(function (results) {
    installBlobWrap(mods);
    window.GIFOS_CC_MODULES = mods;
    setMsg('Starting CyberChef…');
    injectMain(results[2]);
  }).catch(fail);
})();
