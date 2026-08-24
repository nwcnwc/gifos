/*
 * Serve sprites.json / sprites.png from inlined bytes. PIXI Assets.load
 * calls fetch(); a GIF srcdoc has nothing to fetch. Never talks to the wire.
 */
(function (root) {
  'use strict';
  function b64buf(b64) {
    var bin = atob(b64), arr = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function resp(body, type) {
    return Promise.resolve(new Response(body, { headers: { 'Content-Type': type } }));
  }
  function pick(url) {
    url = String(url || '');
    var D = root.__DH;
    if (!D) return null;
    if (url.indexOf('sprites.json') !== -1) {
      return resp(JSON.stringify(D.spritesJson), 'application/json');
    }
    if (url.indexOf('sprites.png') !== -1) {
      return resp(b64buf(D.spritesPngB64), 'image/png');
    }
    return null;
  }
  var origFetch = root.fetch;
  root.fetch = function (resource, init) {
    var url = typeof resource === 'string' ? resource : (resource && resource.url);
    var hit = pick(url);
    if (hit) return hit;
    if (typeof origFetch === 'function') return origFetch.call(root, resource, init);
    return Promise.reject(new Error('blocked'));
  };
  var OrigXHR = root.XMLHttpRequest;
  if (OrigXHR) {
    root.XMLHttpRequest = function () {
      var xhr = new OrigXHR();
      var open = xhr.open;
      xhr.open = function (method, url) {
        var hit = pick(url);
        if (hit) {
          this.__dh = hit;
          return;
        }
        return open.apply(this, arguments);
      };
      var send = xhr.send;
      xhr.send = function () {
        var self = this;
        if (this.__dh) {
          this.__dh.then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
            Object.defineProperty(self, 'response', { get: function () { return buf; } });
            Object.defineProperty(self, 'status', { get: function () { return 200; } });
            if (self.onload) self.onload();
          });
          return;
        }
        return send.apply(this, arguments);
      };
      return xhr;
    };
  }
})(window);
