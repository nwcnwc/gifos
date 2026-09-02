// GifOS sandbox seams for the vendored SVG-Edit IIFE.
//
// A sandboxed frame is an opaque origin: localStorage throws, relative
// image URLs have no directory, window.open cannot pop an export tab, and
// fetch(data:) is blocked by connect-src 'none'. boot.js runs first.
//
// about:srcdoc is a valid URL but not a valid BASE — `new URL('./x', it)`
// throws. SVG-Edit's Editor constructor does exactly that for extPath.
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

  (function () {
    var Orig = root.URL;
    if (!Orig) return;
    function isAboutBase(b) {
      if (b == null) return false;
      var s = '';
      try { s = typeof b === 'string' ? b : String(b.href != null ? b.href : b); }
      catch (e) { try { s = String(b); } catch (e2) { return false; } }
      return /^about:(srcdoc|blank)$/i.test(s);
    }
    function GifosURL(url, base) {
      if (arguments.length >= 2 && isAboutBase(base)) {
        return Reflect.construct(Orig, [url, 'gifos://app/']);
      }
      return arguments.length >= 2
        ? Reflect.construct(Orig, [url, base])
        : Reflect.construct(Orig, [url]);
    }
    GifosURL.prototype = Orig.prototype;
    Object.setPrototypeOf(GifosURL, Orig);
    try { Object.defineProperty(root, 'URL', { configurable: true, writable: true, value: GifosURL }); }
    catch (e) { root.URL = GifosURL; }
  })();

  var hydrating = true;
  function memoryStore() {
    var data = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) {
        data[k] = String(v);
        if (!hydrating) persistKey(k, String(v));
      },
      removeItem: function (k) {
        delete data[k];
        if (!hydrating) persistKey(k, '');
      },
      clear: function () {
        if (!hydrating) Object.keys(data).forEach(function (k) { persistKey(k, ''); });
        data = Object.create(null);
      },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }

  var prefsDb = null;
  var pending = Object.create(null);
  var timer = null;
  try { if (root.gifos && root.gifos.db) prefsDb = root.gifos.db('prefs'); } catch (e) {}

  function persistKey(key, value) {
    if (!prefsDb) return;
    pending[key] = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushPrefs, 400);
  }
  function flushPrefs() {
    timer = null;
    if (!prefsDb) return;
    Object.keys(pending).forEach(function (key) {
      var value = pending[key];
      delete pending[key];
      if (value === '') prefsDb.delete(key).catch(function () {});
      else prefsDb.put({ id: key, value: value }).catch(function () {});
    });
  }
  root.addEventListener('pagehide', flushPrefs);
  root.addEventListener('visibilitychange', function () {
    if (root.document && root.document.visibilityState === 'hidden') flushPrefs();
  });

  function installStorage(name, store) {
    try { Object.defineProperty(root, name, { value: store, configurable: true }); }
    catch (e) { try { root[name] = store; } catch (e2) {} }
  }
  var ls = memoryStore();
  installStorage('localStorage', ls);
  installStorage('sessionStorage', memoryStore());

  root.__gifosPrefsReady = prefsDb
    ? prefsDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id && r.value != null && r.value !== '') {
          try { ls.setItem(r.id, r.value); } catch (e) {}
        }
      });
      hydrating = false;
    }).catch(function () { hydrating = false; })
    : Promise.resolve().then(function () { hydrating = false; });

  function filename(u) {
    var s = String(u || '');
    var q = s.split('?')[0].split('#')[0];
    var parts = q.split('/');
    return parts[parts.length - 1] || '';
  }
  function resolveUrl(u) {
    if (u == null) return u;
    var s = String(u);
    var dataIdx = s.indexOf('data:');
    if (dataIdx > 0 && /(?:^|\/)images\/data:/i.test(s)) s = s.slice(dataIdx);
    if (!s || /^(data:|blob:|#|https?:|javascript:)/i.test(s)) return s;
    var map = root.__SVGEDIT_IMAGES;
    if (!map) return s;
    var name = filename(s);
    if (name && map[name]) return map[name];
    return s;
  }
  root.__gifosImg = function (name) { return resolveUrl(name) || ''; };
  root.__gifosResolveUrl = resolveUrl;

  function rewriteCssUrls(css) {
    return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, url) {
      var r = resolveUrl(url.trim());
      return 'url(' + JSON.stringify(r) + ')';
    });
  }

  var origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if ((name === 'src' || name === 'href') && this.tagName === 'IMG' && typeof value === 'string') {
      value = resolveUrl(value);
    }
    if (name === 'style' && typeof value === 'string' && value.indexOf('url(') >= 0) {
      value = rewriteCssUrls(value);
    }
    return origSet.call(this, name, value);
  };
  try {
    var srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (srcDesc && srcDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        enumerable: true,
        get: srcDesc.get,
        set: function (v) { srcDesc.set.call(this, resolveUrl(v)); }
      });
    }
  } catch (e) {}

  try {
    var htmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (htmlDesc && htmlDesc.set) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: true,
        get: htmlDesc.get,
        set: function (v) {
          if (typeof v === 'string' && v.indexOf('url(') >= 0) v = rewriteCssUrls(v);
          return htmlDesc.set.call(this, v);
        }
      });
    }
  } catch (e) {}

  try {
    var proto = CSSStyleDeclaration.prototype;
    var origProp = proto.setProperty;
    proto.setProperty = function (name, value, prio) {
      if (typeof value === 'string' && value.indexOf('url(') >= 0) value = rewriteCssUrls(value);
      return origProp.call(this, name, value, prio);
    };
  } catch (e) {}

  function downloadUrl(url, name) {
    try {
      var a = document.createElement('a');
      a.href = url;
      a.download = name || 'drawing';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {}
  }
  root.__gifosDownload = downloadUrl;

  root.open = function (url, target, feats) {
    var href = typeof url === 'string' ? url : '';
    if (href && /^(blob:|data:)/i.test(href)) {
      downloadUrl(href, 'drawing');
      return { closed: false, location: { href: href } };
    }
    if (!href || href === 'about:blank') {
      var loc = { href: '' };
      var fake = {
        closed: false,
        document: { write: function () {}, close: function () {} },
        focus: function () {},
        close: function () { fake.closed = true; }
      };
      Object.defineProperty(fake, 'location', {
        get: function () { return loc; },
        set: function (v) {
          var h = typeof v === 'string' ? v : (v && v.href) || '';
          loc.href = h;
          if (h && /^(blob:|data:)/i.test(h)) downloadUrl(h, 'drawing');
        }
      });
      return fake;
    }
    return null;
  };

  (function () {
    var origFetch = typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    root.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var resolved = resolveUrl(url);
      if (/^data:/i.test(resolved)) {
        try {
          var comma = resolved.indexOf(',');
          if (comma < 0) throw new Error('malformed data: URI');
          var header = resolved.slice(5, comma);
          var body = resolved.slice(comma + 1);
          var mime = header.split(';')[0] || 'application/octet-stream';
          var bytes = /(^|;)base64$/i.test(header)
            ? Uint8Array.from(atob(body), function (c) { return c.charCodeAt(0); })
            : new TextEncoder().encode(decodeURIComponent(body));
          return Promise.resolve(new Response(new Blob([bytes], { type: mime }), { status: 200 }));
        } catch (e) {
          return Promise.reject(new TypeError('Failed to fetch (bad data: URI)'));
        }
      }
      if (/^blob:/i.test(resolved) && origFetch) return origFetch(resolved, init);
      if (!origFetch) return Promise.reject(new TypeError('Failed to fetch'));
      return origFetch(input, init);
    };
  })();
})(typeof window !== 'undefined' ? window : globalThis);
