/*
 * Serve the explorable's pictures and sounds from bytes already in the GIF.
 * PIXI / Howler / pegasus all fetch(); a srcdoc has nothing to fetch.
 */
(function (root) {
  'use strict';

  var TRUST = root.TRUST = root.TRUST || {};
  TRUST.blobs = TRUST.blobs || {};
  TRUST.bytes = TRUST.bytes || {};
  TRUST.mime = TRUST.mime || {};

  function mimeOf(path) {
    if (/\.png$/i.test(path)) return 'image/png';
    if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
    if (/\.gif$/i.test(path)) return 'image/gif';
    if (/\.mp3$/i.test(path)) return 'audio/mpeg';
    if (/\.wav$/i.test(path)) return 'audio/wav';
    if (/\.ogg$/i.test(path)) return 'audio/ogg';
    if (/\.json$/i.test(path)) return 'application/json';
    if (/\.html?$/i.test(path)) return 'text/html';
    if (/\.ttf$/i.test(path)) return 'font/ttf';
    return 'application/octet-stream';
  }

  function norm(u) {
    u = String(u || '').split('#')[0].split('?')[0];
    try { u = decodeURIComponent(u); } catch (e) {}
    u = u.replace(/\\/g, '/');
    if (u.indexOf('blob:') === 0 || u.indexOf('data:') === 0) return u;
    u = u.replace(/^https?:\/\/[^/]+/i, '');
    u = u.replace(/^\.\//, '');
    while (u.indexOf('../') === 0) u = u.slice(3);
    if (u.charAt(0) === '/') u = u.slice(1);
    return u;
  }

  function basename(u) {
    u = norm(u);
    var i = u.lastIndexOf('/');
    return i >= 0 ? u.slice(i + 1) : u;
  }

  TRUST.lookup = function (url) {
    var raw = String(url || '');
    if (raw.indexOf('blob:') === 0 && TRUST.blobToPath[raw]) {
      return TRUST.lookup(TRUST.blobToPath[raw]);
    }
    var u = norm(url);
    if (!u) return null;
    if (u.indexOf('blob:') === 0 || u.indexOf('data:') === 0) {
      if (TRUST.blobToPath[u]) return TRUST.lookup(TRUST.blobToPath[u]);
      return null;
    }
    if (TRUST.blobs[u]) return { path: u, blob: TRUST.blobs[u], bytes: TRUST.bytes[u], mime: TRUST.mime[u] };
    if (TRUST.bytes[u]) return { path: u, blob: TRUST.blobs[u], bytes: TRUST.bytes[u], mime: TRUST.mime[u] };
    var b = basename(u);
    if (b && TRUST.blobs[b]) return { path: b, blob: TRUST.blobs[b], bytes: TRUST.bytes[b], mime: TRUST.mime[b] };
    var m = u.match(/(assets\/[^?#]+)$/);
    if (m && TRUST.blobs[m[1]]) {
      return { path: m[1], blob: TRUST.blobs[m[1]], bytes: TRUST.bytes[m[1]], mime: TRUST.mime[m[1]] };
    }
    if (u.indexOf('words.html') !== -1 && root.TRUST_WORDS_HTML != null) {
      return { path: 'words.html', html: root.TRUST_WORDS_HTML, mime: 'text/html' };
    }
    return null;
  };

  TRUST.blobToPath = TRUST.blobToPath || {};

  TRUST.land = function (path, buf) {
    var p = norm(path);
    var mime = mimeOf(p);
    var bytes = buf instanceof ArrayBuffer ? buf : (buf && buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf);
    TRUST.bytes[p] = bytes;
    TRUST.mime[p] = mime;
    if (typeof URL !== 'undefined' && URL.createObjectURL) {
      TRUST.blobs[p] = URL.createObjectURL(new Blob([bytes], { type: mime }));
      TRUST.blobToPath[TRUST.blobs[p]] = p;
    }
    var b = basename(p);
    if (b && b !== p) {
      TRUST.bytes[b] = bytes;
      TRUST.mime[b] = mime;
      TRUST.blobs[b] = TRUST.blobs[p];
    }
    return TRUST.blobs[p];
  };

  TRUST.remapSrc = function (src) {
    if (!src || /^data:|^blob:/i.test(src)) return src;
    var hit = TRUST.lookup(src);
    if (hit && hit.blob) return hit.blob;
    return src;
  };

  TRUST.remapCss = function (s) {
    return String(s).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (all, q, path) {
      var r = TRUST.remapSrc(path);
      return r !== path ? 'url(' + r + ')' : all;
    });
  };

  function textOf(hit) {
    if (hit.html != null) return String(hit.html);
    var buf = hit.bytes;
    if (!buf) return '';
    var u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
      u8 = u8.subarray(3);
    }
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    var s = '', i;
    for (i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }

  function resp(hit, want) {
    if (hit.html != null) {
      return Promise.resolve(new Response(hit.html, { headers: { 'Content-Type': 'text/html' } }));
    }
    var body = hit.bytes;
    var mime = hit.mime || 'application/octet-stream';
    if (want === 'text' || mime.indexOf('json') !== -1 || mime.indexOf('html') !== -1) {
      return Promise.resolve(new Response(textOf(hit), { headers: { 'Content-Type': mime } }));
    }
    return Promise.resolve(new Response(body, { headers: { 'Content-Type': mime } }));
  }

  var origFetch = root.fetch;
  root.fetch = function (resource, init) {
    var url = typeof resource === 'string' ? resource : (resource && resource.url);
    var hit = TRUST.lookup(url);
    if (hit) return resp(hit);
    if (typeof origFetch === 'function') return origFetch.call(root, resource, init);
    return Promise.reject(new Error('blocked'));
  };

  var OrigXHR = root.XMLHttpRequest;
  if (OrigXHR) {
    root.XMLHttpRequest = function () {
      var xhr = new OrigXHR();
      var open = xhr.open;
      var send = xhr.send;
      var url = '';
      xhr.open = function (method, u) {
        url = u;
        var hit = TRUST.lookup(u);
        if (hit) {
          xhr.__trust = hit;
          return;
        }
        // about:srcdoc has no base URL — a relative open throws Invalid URL.
        // Never let PIXI/Howler/pegasus hit the network stack with one.
        var s = String(u || '');
        if (!/^(blob:|data:|https?:)/i.test(s)) {
          xhr.__trust = { miss: true, html: '', bytes: new ArrayBuffer(0), mime: 'text/plain' };
          return;
        }
        return open.apply(this, arguments);
      };
      xhr.send = function () {
        var hit = xhr.__trust;
        if (!hit) return send.apply(this, arguments);
        var type = xhr.responseType || '';
        var finish = function () {
          try {
            if (hit.miss) {
              Object.defineProperty(xhr, 'status', { configurable: true, get: function () { return 404; } });
              Object.defineProperty(xhr, 'statusText', { configurable: true, get: function () { return 'Not Found'; } });
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return ''; } });
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return xhr.responseType === 'arraybuffer' ? new ArrayBuffer(0) : ''; } });
              Object.defineProperty(xhr, 'readyState', { configurable: true, get: function () { return 4; } });
            } else if (hit.html != null) {
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return hit.html; } });
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return hit.html; } });
            } else if (type === 'arraybuffer') {
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return hit.bytes; } });
            } else if (type === 'blob') {
              var blob = new Blob([hit.bytes], { type: hit.mime });
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return blob; } });
            } else if (type === 'json') {
              var parsed = JSON.parse(textOf(hit));
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return parsed; } });
            } else {
              var txt = textOf(hit);
              Object.defineProperty(xhr, 'responseText', { configurable: true, get: function () { return txt; } });
              Object.defineProperty(xhr, 'response', { configurable: true, get: function () { return txt; } });
            }
            if (!hit.miss) {
              Object.defineProperty(xhr, 'status', { configurable: true, get: function () { return 200; } });
              Object.defineProperty(xhr, 'statusText', { configurable: true, get: function () { return 'OK'; } });
              Object.defineProperty(xhr, 'readyState', { configurable: true, get: function () { return 4; } });
            }
          } catch (e) {}
          if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
          if (typeof xhr.onload === 'function') xhr.onload();
          try { xhr.dispatchEvent(new Event('load')); } catch (e2) {}
        };
        setTimeout(finish, 0);
      };
      return xhr;
    };
  }

  function hookSrc(Cons) {
    var proto = Cons && Cons.prototype;
    if (!proto) return;
    var desc = Object.getOwnPropertyDescriptor(proto, 'src');
    if (!desc || !desc.set) return;
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (v) { desc.set.call(this, TRUST.remapSrc(v)); }
    });
  }
  hookSrc(root.HTMLImageElement);
  hookSrc(root.HTMLAudioElement);
  hookSrc(root.HTMLSourceElement);
  if (root.Element && Element.prototype && Element.prototype.setAttribute) {
    var origSA = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (n, v) {
      var name = String(n).toLowerCase();
      if (name === 'src') v = TRUST.remapSrc(v);
      else if (name === 'style' && v && String(v).indexOf('url(') !== -1) v = TRUST.remapCss(String(v));
      return origSA.call(this, n, v);
    };
  }

  TRUST.bakeCss = function () {
    var styles = document.querySelectorAll('style');
    var i, t, n;
    for (i = 0; i < styles.length; i++) {
      t = styles[i].textContent;
      n = TRUST.remapCss(t);
      if (n !== t) styles[i].textContent = n;
    }
  };

  TRUST.mimeOf = mimeOf;
})(window);
