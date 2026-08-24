/*
 * wv-data.js — everything the app knows before it has a connection.
 *
 * The GIF carries four things: NASA's Blue Marble as one equirectangular
 * image, the world's coastlines and borders as vector polylines, 1,240 places
 * to search, and the layer catalog. This file turns the packed bytes into the
 * shapes the map and the UI use, and it does it ONCE at boot — decoding 185 KB
 * of varints costs about a frame.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = { ready: false };

  // ---- world.bin: coastlines + borders ------------------------------------
  // Written by tools/make-assets.py. Zig-zag varint deltas over TopoJSON's own
  // quantised integer grid, so a point costs about two bytes instead of twelve.
  function decodeWorld(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'WVW1') {
      throw new Error('world.bin is not a world');
    }
    var p = 4;
    var sx = dv.getFloat64(p, true); p += 8;
    var sy = dv.getFloat64(p, true); p += 8;
    var tx = dv.getFloat64(p, true); p += 8;
    var ty = dv.getFloat64(p, true); p += 8;
    var nCoast = dv.getUint32(p, true); p += 4;
    var nBorder = dv.getUint32(p, true); p += 4;

    function varint() {
      var shift = 0, result = 0, b;
      do {
        b = bytes[p++];
        result += (b & 0x7f) * Math.pow(2, shift);
        shift += 7;
      } while (b & 0x80);
      return result;
    }
    function zag(v) { return (v & 1) ? -((v + 1) / 2) : v / 2; }

    function readLines(n) {
      var out = [];
      for (var i = 0; i < n; i++) {
        var count = varint();
        var pts = new Float32Array(count * 2);
        var gx = 0, gy = 0;
        var minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
        for (var j = 0; j < count; j++) {
          gx += zag(varint());
          gy += zag(varint());
          var lon = gx * sx + tx, lat = gy * sy + ty;
          pts[j * 2] = lon; pts[j * 2 + 1] = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        out.push({ p: pts, n: count, x0: minLon, x1: maxLon, y0: minLat, y1: maxLat });
      }
      return out;
    }

    return { coast: readLines(nCoast), border: readLines(nBorder) };
  }

  // ---- places -------------------------------------------------------------
  function buildPlaces(raw) {
    var list = [];
    for (var i = 0; i < raw.name.length; i++) {
      list.push({
        name: raw.name[i],
        country: raw.country[i],
        lat: raw.lat[i],
        lon: raw.lon[i],
        pop: raw.pop[i],
        cap: raw.cap[i],
        key: U.fold(raw.name[i]),
        ckey: U.fold(raw.country[i]),
      });
    }
    return list;
  }

  /*
   * Search ranking, in one place because it is the whole feature. A prefix on
   * the name beats a word-start inside it, which beats a country match; ties go
   * to the bigger city, and a capital gets a nudge. That is why "Was" is
   * Washington and "San" is San Antonio before San Marino.
   */
  D.searchPlaces = function (q, limit) {
    var s = U.fold(String(q).trim());
    if (!s) return [];
    var out = [];
    for (var i = 0; i < D.places.length; i++) {
      var p = D.places[i], score = 0;
      if (p.key === s) score = 1000;
      else if (p.key.indexOf(s) === 0) score = 700;
      else if (p.key.indexOf(' ' + s) > 0) score = 500;
      else if (p.key.indexOf(s) > 0) score = 260;
      else if (p.ckey.indexOf(s) === 0) score = 200;
      else continue;
      score += Math.min(120, Math.log10(Math.max(p.pop, 10)) * 16);
      if (p.cap) score += 40;
      out.push({ p: p, s: score });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, limit || 8).map(function (r) { return r.p; });
  };

  // A place someone might mean by a lat/lon they typed, and the reverse: the
  // nearest named place to a point, for the "you are looking at…" line.
  D.nearestPlace = function (lat, lon) {
    var best = null, bd = Infinity;
    for (var i = 0; i < D.places.length; i++) {
      var p = D.places[i];
      var d = (p.lat - lat) * (p.lat - lat) + Math.pow(U.wrapLon(p.lon - lon), 2) * 0.6;
      // Big places win ties from further away — "near Cairo" is more useful
      // than the name of a village 3 km closer.
      d /= 1 + Math.log10(Math.max(p.pop, 10)) * 0.35;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  // "51.5, -0.12" or "51.5N 0.12W" typed into the search box.
  D.parseCoords = function (q) {
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?\s*$/.exec(q);
    if (!m) return null;
    var lat = parseFloat(m[1]), lon = parseFloat(m[3]);
    if (m[2] && m[2].toLowerCase() === 's') lat = -lat;
    if (m[4] && m[4].toLowerCase() === 'w') lon = -lon;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon };
  };

  // ---- the layer catalog --------------------------------------------------
  D.layer = function (id) { return D.byId[id] || null; };

  D.searchLayers = function (q) {
    var s = U.fold(String(q).trim());
    if (!s) return null;
    var out = [];
    for (var i = 0; i < D.catalog.layers.length; i++) {
      var l = D.catalog.layers[i];
      var hay = U.fold(l.title + ' ' + l.sub + ' ' + (D.measTitle[l.m] || '') + ' ' + l.id);
      var at = hay.indexOf(s);
      if (at < 0) continue;
      out.push({ l: l, s: (at === 0 ? 200 : 100 - Math.min(at, 60)) + (l.featured ? 40 : 0) });
    }
    out.sort(function (a, b) { return b.s - a.s; });
    return out.map(function (r) { return r.l; });
  };

  // What the layer row says about coverage: a layer that has no data for the
  // day you are looking at should say so BEFORE you conclude the app is broken.
  D.coverage = function (l, day) {
    if (l.period === 'static' || l.builtin) return { ok: true };
    var d = U.snapDay(day, l);
    if (l.start && U.dayMs(d) < U.dayMs(l.start)) {
      return { ok: false, why: 'starts ' + U.prettyDate(l.start), before: true };
    }
    if (l.end && U.dayMs(d) > U.dayMs(l.end)) {
      return { ok: false, why: 'ends ' + U.prettyDate(l.end), after: true };
    }
    if (l.recent) {
      var cut = U.addDays(U.latestDay(), -l.recent);
      if (U.dayMs(d) < U.dayMs(cut)) {
        return { ok: false, why: 'only the last ' + l.recent + ' days are kept', after: false };
      }
    }
    return { ok: true };
  };

  // ---- built-in layers ----------------------------------------------------
  // These four are not GIBS at all — they are drawn from the bytes inside the
  // GIF, which is why the map is never empty and why it still works on a
  // plane. They are ordinary rows in the layer list on purpose: the user
  // should be able to see, move and switch off the offline base exactly like
  // anything else.
  D.BUILTIN = [
    { id: 'wv:base', title: 'Blue Marble', sub: 'Built in — no connection needed',
      group: 'base', builtin: 'base', period: 'static', z: 12,
      about: 'NASA\'s Blue Marble, packed inside this app. It is what you see where a satellite has not passed today: swath gaps, polar night, and everywhere at all when you are offline.' },
    { id: 'wv:coast', title: 'Coastlines', sub: 'Built in — Natural Earth vectors',
      group: 'overlay', builtin: 'coast', period: 'static', z: 12, ref: 1,
      about: 'Coastlines drawn from vectors inside the app, so they are crisp at every zoom and present with no connection.' },
    { id: 'wv:borders', title: 'Borders', sub: 'Built in — Natural Earth vectors',
      group: 'overlay', builtin: 'borders', period: 'static', z: 12, ref: 1,
      about: 'Country borders drawn from vectors inside the app.' },
    { id: 'wv:places', title: 'Place labels', sub: 'Built in — 1,240 places',
      group: 'overlay', builtin: 'places', period: 'static', z: 12, ref: 1,
      about: 'Names for the places the search box knows, drawn largest-first with the ones that would collide left out.' },
    { id: 'wv:grid', title: 'Graticule', sub: 'Built in — latitude and longitude',
      group: 'overlay', builtin: 'grid', period: 'static', z: 12, ref: 1,
      about: 'Latitude and longitude lines, spaced to whatever the current zoom can read.' },
  ];

  D.init = function (assets) {
    var t0 = Date.now();
    D.catalog = assets.catalog;
    D.places = buildPlaces(assets.places);
    var w = decodeWorld(U.b64bytes(assets.world));
    D.coast = w.coast;
    D.border = w.border;
    D.tours = assets.tours || [];

    D.measTitle = {};
    D.measBlurb = {};
    D.catalog.measurements.forEach(function (m) {
      D.measTitle[m.id] = m.title;
      D.measBlurb[m.id] = m.blurb;
    });

    D.byId = {};
    D.BUILTIN.forEach(function (l) { D.byId[l.id] = l; });
    D.catalog.layers.forEach(function (l) { D.byId[l.id] = l; });

    D.baseJpg = assets.base;
    D.ready = true;
    D.bootMs = Date.now() - t0;
    return D;
  };

  window.WVData = D;
})();
