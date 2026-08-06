// Anyroad — fetching, politely.
//
// Every request the game makes goes through this queue. The point is not speed;
// it is that a driving game generates requests in bursts (cross a tile edge and
// nine tiles want loading at once) against endpoints that are donated, not sold.
// So: a concurrency cap and a minimum gap PER HOST, in-flight de-duplication so
// two subsystems asking for the same tile cost one request, and real backoff on
// 429 rather than a retry storm into a server that just said stop.
//
// Bytes themselves are not cached here. Direct bridge fetches pass through the
// browser's HTTP cache (runtime.js uses cache:'default' when not proxying), and
// terrain tiles carry long max-age — so re-driving an area is already free
// without the app storing a single tile. What the app persists is the PARSED
// road geometry, which is small; see roads.js.
(function (root) {
  'use strict';

  // Per-host manners. `gap` is the minimum millisecond spacing between the
  // STARTS of two requests to that host; `conc` how many may be in flight.
  var POLICY = {
    'nominatim.openstreetmap.org': { gap: 1200, conc: 1 },   // policy: max 1 req/sec
    'overpass-api.de':             { gap: 1000, conc: 2 },
    'overpass.kumi.systems':       { gap: 1000, conc: 2 },
    'overpass.osm.ch':             { gap: 1000, conc: 2 },
    's3.amazonaws.com':            { gap: 0,    conc: 8 },   // open data, built for it
    _default:                      { gap: 0,    conc: 4 },
  };

  function hostOf(url) {
    try { return new URL(url, root.location.href).hostname; } catch (e) { return '_default'; }
  }
  function policyFor(host) { return POLICY[host] || POLICY._default; }

  // One queue per host.
  var queues = {};
  function queueFor(host) {
    if (!queues[host]) queues[host] = { pending: [], active: 0, last: 0, until: 0 };
    return queues[host];
  }

  function pump(host) {
    var q = queueFor(host), p = policyFor(host);
    if (!q.pending.length || q.active >= p.conc) return;
    var now = Date.now();
    // Respect both the steady-state gap and any backoff a 429 imposed.
    var earliest = Math.max(q.last + p.gap, q.until);
    if (now < earliest) { setTimeout(function () { pump(host); }, earliest - now); return; }
    var job = q.pending.shift();
    q.active++; q.last = now;
    job.run().then(job.resolve, job.reject).then(function () {
      q.active--; pump(host);
    });
    pump(host);   // another slot may be free
  }

  function schedule(url, run) {
    var host = hostOf(url);
    return new Promise(function (resolve, reject) {
      queueFor(host).pending.push({ run: run, resolve: resolve, reject: reject });
      pump(host);
    });
  }

  // A 429 (or a 504 from an Overpass that ran out of room) means back off for
  // real. Doubling per consecutive refusal, capped, cleared by any success.
  function penalise(host, status) {
    var q = queueFor(host);
    q.strikes = (q.strikes || 0) + 1;
    var wait = Math.min(30000, 2000 * Math.pow(2, q.strikes - 1));
    q.until = Date.now() + wait;
    return wait;
  }
  function forgive(host) { queueFor(host).strikes = 0; }

  // ---- in-flight de-duplication -------------------------------------------
  // Terrain and roads both ask "what is at this tile?" and the horizon loader
  // may re-ask while the first request is still open. One request, many
  // awaiters. Cleared on settle so a later re-fetch is still possible.
  var inflight = {};
  function once(key, make) {
    if (inflight[key]) return inflight[key];
    var p = make().then(
      function (v) { delete inflight[key]; return v; },
      function (e) { delete inflight[key]; throw e; }
    );
    inflight[key] = p;
    return p;
  }

  function request(url, opts) {
    opts = opts || {};
    var host = hostOf(url);
    return schedule(url, function () {
      return root.Host.fetch(url, opts).then(function (r) {
        if (r.status === 429 || r.status === 504) {
          var wait = penalise(host, r.status);
          var e = new Error('busy: ' + host + ' returned ' + r.status + ', backing off ' + Math.round(wait / 1000) + 's');
          e.busy = true; e.status = r.status;
          throw e;
        }
        if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + host);
        forgive(host);
        return r;
      });
    });
  }

  function json(url, opts) {
    return once('J' + url, function () {
      return request(url, opts).then(function (r) { return r.json(); });
    });
  }

  function text(url, opts) {
    return once('T' + url, function () {
      return request(url, opts).then(function (r) { return r.text(); });
    });
  }

  // ---- images, decoded to pixels ------------------------------------------
  // The terrain path needs actual numbers out of a PNG, which means decoding it
  // and reading the canvas back. That works in the sandbox: the blob URL is
  // same-origin to the app frame, so the canvas is NOT tainted and
  // getImageData succeeds even though the frame has an opaque origin.
  var scratch = null;
  function readPixels(bitmapOrImg, w, h) {
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    var g = scratch.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, w, h);
    g.drawImage(bitmapOrImg, 0, 0, w, h);
    return g.getImageData(0, 0, w, h);
  }

  function decode(blob) {
    // createImageBitmap avoids a DOM round-trip where it exists; the <img>
    // path is the portable fallback and behaves identically for our purposes.
    if (root.createImageBitmap) {
      return root.createImageBitmap(blob).catch(function () { return decodeViaImg(blob); });
    }
    return decodeViaImg(blob);
  }
  function decodeViaImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      im.src = url;
    });
  }

  // Fetch an image and hand back { width, height, data } — RGBA bytes.
  function pixels(url, opts) {
    return once('P' + url, function () {
      return request(url, opts).then(function (r) { return r.blob(); })
        .then(decode)
        .then(function (im) {
          var w = im.width, h = im.height;
          var img = readPixels(im, w, h);
          if (im.close) im.close();        // release an ImageBitmap promptly
          return { width: w, height: h, data: img.data };
        });
    });
  }

  // Fetch an image for use as a GL texture — no pixel readback needed, so the
  // decoded bitmap goes straight to texImage2D.
  function bitmap(url, opts) {
    return once('B' + url, function () {
      return request(url, opts).then(function (r) { return r.blob(); }).then(decode);
    });
  }

  // ---- keyed API (imagery) -------------------------------------------------
  // gifos.api attaches the player's key and pins the request to that API's
  // configured host. Returns raw bytes, which we wrap back into a Blob so the
  // decode path above is shared.
  function apiBitmap(name, path) {
    return once('A' + name + path, function () {
      return root.Host.api(name, { path: path, as: 'bytes' }).then(function (r) {
        if (!r || !r.bytes) throw new Error('no image from ' + name);
        return decode(new Blob([r.bytes], { type: r.mime || 'image/jpeg' }));
      });
    });
  }

  root.Net = {
    json: json, text: text, pixels: pixels, bitmap: bitmap, apiBitmap: apiBitmap,
    // Exposed so the HUD can say "waiting on the map" honestly rather than
    // leaving the player wondering whether the app has hung.
    stats: function () {
      var pending = 0, active = 0, backoff = 0, now = Date.now();
      for (var h in queues) {
        pending += queues[h].pending.length; active += queues[h].active;
        if (queues[h].until > now) backoff = Math.max(backoff, queues[h].until - now);
      }
      return { pending: pending, active: active, backoffMs: backoff };
    },
  };
})(window);
