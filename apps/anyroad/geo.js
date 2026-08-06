// Anyroad — geodesy and tiling.
//
// Three coordinate systems, and the maps between them:
//
//   geographic   lat/lon degrees        what every data source speaks
//   world        x east, z north, metres from the hop origin; y is up
//   tile         {z, x, y} Web Mercator  what tile URLs speak
//
// The world frame is a local tangent plane pinned at the hop point. That is an
// approximation, but the error is well under a metre across the few kilometres
// you can drive before the game re-pins, and it keeps the physics in honest
// metres instead of degrees (where a step north and a step east are different
// sizes and every velocity is a lie).
(function (root) {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // Metres per degree at a given latitude. Latitude is very nearly constant;
  // longitude shrinks by cos(lat) and vanishes at the poles.
  function metresPerDegLat(lat) {
    var r = lat * D2R;
    return 111132.92 - 559.82 * Math.cos(2 * r) + 1.175 * Math.cos(4 * r);
  }
  function metresPerDegLon(lat) {
    var r = lat * D2R;
    return 111412.84 * Math.cos(r) - 93.5 * Math.cos(3 * r);
  }

  // A local frame pinned at (lat0, lon0). Scale factors are computed once at
  // the origin, so this is a plane, not a sphere — see the note above.
  function frame(lat0, lon0) {
    var mLat = metresPerDegLat(lat0), mLon = metresPerDegLon(lat0);
    return {
      lat0: lat0, lon0: lon0,
      // geographic -> world metres
      toWorld: function (lat, lon) {
        return { x: (lon - lon0) * mLon, z: (lat - lat0) * mLat };
      },
      // world metres -> geographic
      toGeo: function (x, z) {
        return { lat: lat0 + z / mLat, lon: lon0 + x / mLon };
      },
      metresPerDegLat: mLat,
      metresPerDegLon: mLon,
    };
  }

  // ---- Web Mercator slippy tiles -------------------------------------------
  // Fractional tile coordinates; floor() them for a tile index, keep the
  // fraction to find where inside a tile a point falls.
  function lonToTileX(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function latToTileY(lat, z) {
    var r = lat * D2R;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function tileXToLon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function tileYToLat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return R2D * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  // The geographic box a tile covers. north/west is the tile's top-left because
  // tile y counts DOWN from the north pole while latitude counts up — the sign
  // flip that silently mirrors a terrain mesh if you miss it.
  function tileBounds(z, x, y) {
    return {
      west: tileXToLon(x, z), east: tileXToLon(x + 1, z),
      north: tileYToLat(y, z), south: tileYToLat(y + 1, z),
    };
  }

  // Ground size of one tile, in metres, at the tile's own centre latitude.
  function tileSpanMetres(z, x, y) {
    var b = tileBounds(z, x, y);
    var midLat = (b.north + b.south) / 2;
    return {
      w: (b.east - b.west) * metresPerDegLon(midLat),
      h: (b.north - b.south) * metresPerDegLat(midLat),
    };
  }

  // Every tile touching a world-space square of half-size `radius` metres about
  // (x, z), nearest-first so the ground under the car loads before the horizon.
  function tilesAround(fr, x, z, radius, zoom) {
    var c = fr.toGeo(x, z);
    var n = Math.pow(2, zoom);
    var cx = lonToTileX(c.lon, zoom), cy = latToTileY(c.lat, zoom);
    // Convert the metre radius into a tile radius via the tile's own span.
    var span = tileSpanMetres(zoom, Math.floor(cx), Math.floor(cy));
    var rx = Math.ceil(radius / Math.max(1, span.w)), ry = Math.ceil(radius / Math.max(1, span.h));
    var tx = Math.floor(cx), ty = Math.floor(cy), out = [];
    for (var dy = -ry; dy <= ry; dy++) for (var dx = -rx; dx <= rx; dx++) {
      var X = tx + dx, Y = ty + dy;
      if (Y < 0 || Y >= n) continue;              // past a pole: no tile exists
      out.push({ z: zoom, x: ((X % n) + n) % n, y: Y, d: dx * dx + dy * dy });  // wrap at the date line
    }
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }

  function tileKey(t) { return t.z + '/' + t.x + '/' + t.y; }

  root.Geo = {
    frame: frame,
    metresPerDegLat: metresPerDegLat, metresPerDegLon: metresPerDegLon,
    lonToTileX: lonToTileX, latToTileY: latToTileY,
    tileXToLon: tileXToLon, tileYToLat: tileYToLat,
    tileBounds: tileBounds, tileSpanMetres: tileSpanMetres,
    tilesAround: tilesAround, tileKey: tileKey,
  };
})(window);
