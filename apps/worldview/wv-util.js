/*
 * wv-util.js — the small things everything else uses.
 *
 * Dates are the load-bearing part. GIBS is a time machine keyed by an ISO day
 * string, so the app's own clock has to be UTC everywhere: a browser in Sydney
 * asking for "today" in local time asks for a day that does not exist yet in
 * the archive and gets a blank Earth. Every date in this app is a UTC day
 * string, and every conversion goes through here.
 */
(function () {
  'use strict';

  var U = {};

  U.$ = function (id) { return document.getElementById(id); };
  U.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---- dates, all UTC ------------------------------------------------------
  var MS_DAY = 86400000;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                  'August', 'September', 'October', 'November', 'December'];

  U.MS_DAY = MS_DAY;
  U.MON = MON;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  U.pad = pad;

  // 'YYYY-MM-DD' -> epoch ms at 00:00 UTC
  U.dayMs = function (d) {
    var p = String(d).slice(0, 10).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  };
  U.msDay = function (ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };
  U.addDays = function (day, n) { return U.msDay(U.dayMs(day) + n * MS_DAY); };
  U.diffDays = function (a, b) { return Math.round((U.dayMs(b) - U.dayMs(a)) / MS_DAY); };
  U.today = function () { return U.msDay(Date.now()); };

  // The archive's newest usable day. Near-real-time imagery lands within about
  // three hours of the overpass, but a day is only WHOLE once it is over
  // everywhere — before ~03:00 UTC "today" is mostly empty ocean, which reads
  // as a broken app rather than as a day that has not happened yet.
  U.latestDay = function () {
    var now = Date.now();
    var d = new Date(now);
    if (d.getUTCHours() < 3) now -= MS_DAY;
    return U.msDay(now);
  };

  U.prettyDate = function (day, opts) {
    var p = String(day).slice(0, 10).split('-');
    var mon = (opts && opts.full) ? MON_FULL[+p[1] - 1] : MON[+p[1] - 1];
    return +p[2] + ' ' + mon + ' ' + p[0];
  };

  // "today", "yesterday", "3 days ago", "12 March 2019" — the line under the date.
  U.relDate = function (day) {
    var n = U.diffDays(day, U.today());
    if (n === 0) return 'today';
    if (n === 1) return 'yesterday';
    if (n < 0) return 'in the future';
    if (n < 14) return n + ' days ago';
    if (n < 60) return Math.round(n / 7) + ' weeks ago';
    if (n < 730) return Math.round(n / 30.44) + ' months ago';
    return Math.round(n / 365.25) + ' years ago';
  };

  // Snap a day to what a layer actually publishes. An 8-day MODIS composite
  // exists on days 1, 9, 17… of each year and NOWHERE else; asking for the
  // 4th returns nothing, which looks exactly like a broken layer.
  U.snapDay = function (day, layer) {
    var p = layer.period;
    if (p === 'monthly') return day.slice(0, 8) + '01';
    if (p === 'yearly') return day.slice(0, 4) + '-01-01';
    if (p === '8day' || p === '16day') {
      var step = p === '8day' ? 8 : 16;
      var y = day.slice(0, 4);
      var jan1 = U.dayMs(y + '-01-01');
      var n = Math.floor((U.dayMs(day) - jan1) / MS_DAY / step) * step;
      return U.msDay(jan1 + n * MS_DAY);
    }
    return day;
  };

  U.fmtBytes = function (n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  };

  U.fmtLatLon = function (lat, lon) {
    var la = Math.abs(lat).toFixed(2) + '°' + (lat >= 0 ? 'N' : 'S');
    var lo = Math.abs(U.wrapLon(lon)).toFixed(2) + '°' + (U.wrapLon(lon) >= 0 ? 'E' : 'W');
    return la + ', ' + lo;
  };

  U.wrapLon = function (lon) {
    var x = ((lon + 180) % 360 + 360) % 360 - 180;
    return x;
  };

  // Great-circle distance in metres — the measure tool and the scale bar.
  U.haversine = function (lat1, lon1, lat2, lon2) {
    var R = 6371008.8;
    var p = Math.PI / 180;
    var dLat = (lat2 - lat1) * p, dLon = (lon2 - lon1) * p;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  U.fmtDist = function (m) {
    if (m < 1000) return Math.round(m) + ' m';
    if (m < 100000) return (m / 1000).toFixed(1) + ' km';
    return Math.round(m / 1000).toLocaleString() + ' km';
  };

  // ---- base64 (the assets ride inside the GIF as text) ---------------------
  // connect-src is 'none' in the sandbox, so a data: URL cannot even be
  // fetch()ed — decoding is ours to do.
  U.b64bytes = function (b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  U.debounce = function (fn, ms) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  // Fold accents so "reykjavik" finds "Reykjavík" — the search box has to work
  // for someone typing on a phone keyboard in a hurry.
  U.fold = function (s) {
    s = String(s).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s;
  };

  U.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  window.WVUtil = U;
})();
