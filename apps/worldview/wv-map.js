/*
 * wv-map.js — the map: projection, painting, and the hands that move it.
 *
 * PROJECTION. Plate carrée (EPSG:4326), the projection GIBS serves and the one
 * the packed Blue Marble is already in, so a satellite tile, a coastline
 * vector and the baked base image all land on the same pixel with no
 * reprojection anywhere. Longitude is x, latitude is y, and `res` — degrees
 * per CSS pixel — is the only zoom number in the app.
 *
 * PAINTING. One canvas, painted bottom-up: the offline base, then every GIBS
 * layer in stack order, then the vector reference layers, then the things the
 * user put there (a measurement, a pin, another person's cursor). A tile that
 * has not arrived is drawn from its parent, scaled — that is the difference
 * between a map that resolves and a map that flashes grey.
 *
 * HANDS. Drag with inertia, wheel and pinch zoom about the pointer, double-tap,
 * keyboard. Touch gestures are the app's own (`touch-action: none`), which is
 * exactly what a map needs and exactly what a page must not do.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var T = window.WVTiles;

  var M = {};

  var cv, ctx, dpr = 1;
  var W = 0, H = 0;                        // CSS pixels
  var view = { lon: 0, lat: 0, res: 0 };   // res: degrees per CSS pixel
  var state = null;                        // the app's state object
  var dirty = true, raf = 0;
  var baseImg = null;
  var onFrame = null, onMove = null;

  M.view = view;
  M.MIN_RES = T.RES0 / Math.pow(2, 12);    // deepest zoom the archive has
  M.setState = function (s) { state = s; };
  M.onFrame = function (fn) { onFrame = fn; };
  M.onMove = function (fn) { onMove = fn; };

  // ---------------------------------------------------------------- setup ---
  M.init = function (canvas, opts) {
    cv = canvas;
    ctx = cv.getContext('2d', { alpha: false });
    resize();
    window.addEventListener('resize', resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    bindInput();
    T.onTile(function () { M.invalidate(); });
    if (D.baseJpg) {
      var img = new Image();
      img.onload = function () { baseImg = img; M.invalidate(); };
      img.src = 'data:image/jpeg;base64,' + D.baseJpg;
    }
    M.home(opts && opts.animate === false);
    loop();
    return M;
  };

  function resize() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    // A phone at dpr 3 asking for 512 px tiles will spend its whole budget on
    // texture upload for pixels nobody can see. Two is the honest ceiling.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    clampView();
    M.invalidate();
  }
  M.resize = resize;
  M.size = function () { return { w: W, h: H, dpr: dpr }; };

  M.invalidate = function () { dirty = true; };

  function loop() {
    raf = requestAnimationFrame(loop);
    stepInertia();
    if (dirty) { dirty = false; draw(); if (onFrame) onFrame(); }
  }

  // ------------------------------------------------------------ projection --
  M.toScreen = function (lon, lat) {
    return { x: (lon - view.lon) / view.res + W / 2, y: (view.lat - lat) / view.res + H / 2 };
  };
  M.toWorld = function (x, y) {
    return { lon: view.lon + (x - W / 2) * view.res, lat: view.lat - (y - H / 2) * view.res };
  };
  M.bounds = function () {
    return {
      lonMin: view.lon - W / 2 * view.res, lonMax: view.lon + W / 2 * view.res,
      latMin: view.lat - H / 2 * view.res, latMax: view.lat + H / 2 * view.res,
    };
  };

  // How much of the world one DEVICE pixel covers — the number that decides
  // which tile level to ask for. On a phone at dpr 2 or 3 this is what makes
  // the imagery sharp instead of soft.
  M.effRes = function () { return view.res / dpr; };

  // Zoomed all the way out: the whole Earth across the width. Further than
  // that is a planet floating in a black field.
  function maxRes() {
    return 360 / Math.max(W, 320) * 1.06;
  }

  /*
   * The zoom the app opens at, and what the Whole Earth button returns to.
   *
   * On a wide screen that is the whole planet — the picture the app is for. On
   * a tall phone the same zoom is a 180 px ribbon of Earth in a field of black,
   * which is not a map, it is a screensaver. So when fitting the width would
   * leave most of the screen empty, it fills the screen instead and you arrive
   * over Europe and Africa at a zoom where the coastlines mean something.
   */
  function homeRes() {
    var fit = maxRes();
    if (180 / fit < H * 0.62) return Math.min(360 / W, 180 / H);
    return fit;
  }
  M.homeRes = homeRes;

  function clampView() {
    view.res = U.clamp(view.res, M.MIN_RES, maxRes());
    var halfH = H / 2 * view.res;
    if (halfH >= 90) view.lat = 0;
    else view.lat = U.clamp(view.lat, -90 + halfH, 90 - halfH);
    view.lon = U.wrapLon(view.lon);
  }

  M.home = function () {
    var r = homeRes();
    view.lon = r < maxRes() * 0.9 ? 12 : 0;      // filling the screen: land, not mid-Pacific
    view.lat = r < maxRes() * 0.9 ? 22 : 0;
    view.res = r;
    clampView();
    M.invalidate();
    if (onMove) onMove();
  };

  // The Whole Earth button, as a flight rather than a jump.
  M.flyHome = function () {
    var r = homeRes();
    var wide = r >= maxRes() * 0.9;
    M.flyTo({ lon: wide ? 0 : 12, lat: wide ? 0 : 22, res: r }, 700);
  };

  M.setView = function (v, opts) {
    if (opts && opts.animate) return M.flyTo(v);
    if (v.lon != null) view.lon = v.lon;
    if (v.lat != null) view.lat = v.lat;
    if (v.res != null) view.res = v.res;
    clampView();
    M.invalidate();
    if (onMove) onMove();
  };

  // A flight, not a jump: the eye keeps its place on the planet when the app
  // moves you somewhere, which is what makes a tour feel like a tour.
  var flight = null;
  M.flyTo = function (v, ms) {
    var from = { lon: view.lon, lat: view.lat, res: view.res };
    var dLon = U.wrapLon((v.lon != null ? v.lon : view.lon) - from.lon);
    flight = {
      from: from,
      to: { lon: from.lon + dLon, lat: v.lat != null ? v.lat : view.lat, res: v.res != null ? v.res : view.res },
      t0: Date.now(),
      ms: ms || 620,
    };
    inertia.vx = inertia.vy = 0;
    M.invalidate();
  };

  function stepFlight() {
    if (!flight) return false;
    var t = (Date.now() - flight.t0) / flight.ms;
    if (t >= 1) {
      view.lon = flight.to.lon; view.lat = flight.to.lat; view.res = flight.to.res;
      flight = null;
      clampView();
      if (onMove) onMove();
      return true;
    }
    var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
    view.lon = U.lerp(flight.from.lon, flight.to.lon, e);
    view.lat = U.lerp(flight.from.lat, flight.to.lat, e);
    // Zoom interpolates in log space or the middle of the flight is a lurch.
    view.res = Math.exp(U.lerp(Math.log(flight.from.res), Math.log(flight.to.res), e));
    clampView();
    if (onMove) onMove();
    return true;
  }

  M.fitBounds = function (b, pad) {
    var p = pad == null ? 0.12 : pad;
    var res = Math.max((b.lonMax - b.lonMin) / (W * (1 - p)), (b.latMax - b.latMin) / (H * (1 - p)));
    M.flyTo({ lon: (b.lonMin + b.lonMax) / 2, lat: (b.latMin + b.latMax) / 2, res: res });
  };

  M.zoomBy = function (f, cx, cy) {
    var px = cx == null ? W / 2 : cx, py = cy == null ? H / 2 : cy;
    var before = M.toWorld(px, py);
    view.res = U.clamp(view.res * f, M.MIN_RES, maxRes());
    var after = M.toWorld(px, py);
    view.lon += before.lon - after.lon;
    view.lat += before.lat - after.lat;
    clampView();
    M.invalidate();
    if (onMove) onMove();
  };

  // Zoom as a friendly number: "z 3" is the whole Earth, "z 12" is a street.
  M.zoomLevel = function () { return Math.log(T.RES0 / view.res) / Math.LN2; };

  // ---------------------------------------------------------------- paint ---
  function px(v) { return Math.round(v * dpr); }

  /*
   * Space, not "empty black".
   *
   * Plate carrée is 2:1 and a screen is not, so at whole-Earth zoom there is a
   * band above and below the world. Left flat black it reads as a layout that
   * ran out of map. A faint field of stars — deterministic, so it never
   * shimmers between frames — says the planet is in space, which is where it
   * is, and makes the zoomed-out view look deliberate.
   */
  var stars = null;
  function starField() {
    if (stars) return stars;
    stars = [];
    var seed = 1337;
    for (var i = 0; i < 260; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var a = (seed % 10000) / 10000;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var b = (seed % 10000) / 10000;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var m = (seed % 10000) / 10000;
      stars.push({ x: a, y: b, m: 0.25 + m * 0.75 });
    }
    return stars;
  }

  function paintSpace() {
    var g = ctx.createLinearGradient(0, 0, 0, cv.height);
    g.addColorStop(0, '#05070d');
    g.addColorStop(0.5, '#030408');
    g.addColorStop(1, '#05070d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    var f = starField();
    for (var i = 0; i < f.length; i++) {
      var s = f[i];
      ctx.globalAlpha = 0.16 + s.m * 0.5;
      ctx.fillStyle = '#cfe4ff';
      var r = Math.max(1, s.m * 1.5 * dpr);
      ctx.fillRect(s.x * cv.width, s.y * cv.height, r, r);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    paintSpace();
    if (!state) return;

    var cmp = state.compare;
    if (cmp && cmp.on) {
      var splitX = Math.round(cmp.x * W);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, px(splitX), cv.height);
      ctx.clip();
      paintStack(state.layers, state.date, state.minutes);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(px(splitX), 0, cv.width - px(splitX), cv.height);
      ctx.clip();
      paintStack(cmp.layers || state.layers, cmp.date, state.minutes);
      ctx.restore();
    } else {
      paintStack(state.layers, state.date, state.minutes);
    }

    paintFurniture();
  }

  /*
   * What each layer managed to paint this frame. NASA's Worldview leaves you
   * to work out for yourself why a layer you just switched on shows nothing —
   * a swath that missed, an instrument that had not launched, a night pass over
   * an ocean. This counts, so the layer row can say it.
   */
  var status = {};
  M.layerStatus = function (id) { return status[id] || null; };

  function paintStack(layers, day, minutes) {
    for (var i = layers.length - 1; i >= 0; i--) {
      var row = layers[i];
      if (!row.on) continue;
      var L = D.layer(row.id);
      if (!L) continue;
      var alpha = row.opacity == null ? 1 : row.opacity;
      if (alpha <= 0.01) continue;
      ctx.globalAlpha = alpha;
      if (L.builtin) paintBuiltin(L, row);
      else {
        status[L.id] = { drawn: 0, missing: 0, pending: 0, failed: 0 };
        paintTiles(L, day, minutes, status[L.id]);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- built-in (offline) layers ------------------------------------------
  function paintBuiltin(L, row) {
    if (L.builtin === 'base') return paintBase();
    if (L.builtin === 'coast') return paintVectors(D.coast, 'rgba(190,224,255,0.62)', 1.05);
    if (L.builtin === 'borders') return paintVectors(D.border, 'rgba(255,214,160,0.40)', 0.9);
    if (L.builtin === 'grid') return paintGraticule();
    if (L.builtin === 'places') return paintPlaces();
  }

  function paintBase() {
    if (!baseImg) return;
    var b = M.bounds();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (var k = Math.floor((b.lonMin + 180) / 360); k <= Math.floor((b.lonMax + 180) / 360); k++) {
      var tl = M.toScreen(-180 + k * 360, 90);
      var brs = M.toScreen(180 + k * 360, -90);
      ctx.drawImage(baseImg, px(tl.x), px(tl.y), px(brs.x) - px(tl.x), px(brs.y) - px(tl.y));
    }
  }

  function paintVectors(lines, colour, width) {
    if (!lines) return;
    var b = M.bounds();
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1, width * dpr);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // One path for every visible arc: thousands of separate strokes is what
    // makes a vector layer feel heavy, and the browser does not need them.
    ctx.beginPath();
    var copies = [];
    for (var k = Math.floor((b.lonMin + 180) / 360); k <= Math.floor((b.lonMax + 180) / 360); k++) copies.push(k * 360);
    // Drop points closer together than a pixel — at whole-Earth zoom that is
    // nine out of ten of them.
    var minStep = view.res * 0.9;
    for (var c = 0; c < copies.length; c++) {
      var off = copies[c];
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i];
        if (ln.x1 + off < b.lonMin || ln.x0 + off > b.lonMax || ln.y1 < b.latMin || ln.y0 > b.latMax) continue;
        var p = ln.p, n = ln.n;
        var lastLon = 0, lastLat = 0, started = false;
        for (var j = 0; j < n; j++) {
          var lon = p[j * 2] + off, lat = p[j * 2 + 1];
          // A ring that crosses the antimeridian steps from +179 to -179, and
          // joining those two points draws a white line straight across the
          // Earth. Siberia, Fiji and Antarctica all do it. Break the path.
          if (started && Math.abs(lon - lastLon) > 180) {
            started = false;
            lastLon = lon; lastLat = lat;
            continue;
          }
          if (started && j !== n - 1 &&
              Math.abs(lon - lastLon) < minStep && Math.abs(lat - lastLat) < minStep) continue;
          var s = M.toScreen(lon, lat);
          if (!started) { ctx.moveTo(s.x * dpr, s.y * dpr); started = true; }
          else ctx.lineTo(s.x * dpr, s.y * dpr);
          lastLon = lon; lastLat = lat;
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  var GRID_STEPS = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];
  function paintGraticule() {
    var b = M.bounds();
    var step = GRID_STEPS[0];
    for (var i = 0; i < GRID_STEPS.length; i++) {
      if (GRID_STEPS[i] / view.res > 90) step = GRID_STEPS[i];
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, dpr * 0.7);
    ctx.font = (10 * dpr) + 'px ' + 'ui-monospace, monospace';
    ctx.beginPath();
    var lat0 = Math.ceil(b.latMin / step) * step;
    for (var lat = lat0; lat <= b.latMax; lat += step) {
      var y = M.toScreen(0, lat).y * dpr;
      ctx.moveTo(0, y); ctx.lineTo(cv.width, y);
    }
    var lon0 = Math.ceil(b.lonMin / step) * step;
    for (var lon = lon0; lon <= b.lonMax; lon += step) {
      var x = M.toScreen(lon, 0).x * dpr;
      ctx.moveTo(x, 0); ctx.lineTo(x, cv.height);
    }
    ctx.stroke();
    for (var la = lat0; la <= b.latMax; la += step) {
      var yy = M.toScreen(0, la).y * dpr;
      ctx.fillText(fmtDeg(la, 'NS', step), 6 * dpr, yy - 4 * dpr);
    }
    for (var lo = lon0; lo <= b.lonMax; lo += step) {
      var xx = M.toScreen(lo, 0).x * dpr;
      ctx.fillText(fmtDeg(U.wrapLon(lo), 'EW', step), xx + 4 * dpr, cv.height - 8 * dpr);
    }
    ctx.restore();
  }

  function fmtDeg(v, axis, step) {
    var d = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
    var s = Math.abs(v).toFixed(d) + '°';
    if (Math.abs(v) < 1e-9) return s;
    return s + (v > 0 ? axis[0] : axis[1]);
  }

  function paintPlaces() {
    var b = M.bounds();
    // Show fewer names the further out you are, or the map is a word cloud.
    var minPop = view.res > 0.25 ? 3000000 : view.res > 0.08 ? 800000 : view.res > 0.02 ? 150000 : 0;
    var cell = 74 * dpr, taken = {};
    ctx.save();
    ctx.font = '600 ' + Math.round(11.5 * dpr) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    var shown = 0;
    for (var i = 0; i < D.places.length && shown < 90; i++) {
      var p = D.places[i];
      if (p.pop < minPop && !(p.cap && view.res < 0.5)) continue;
      var lonWrapped = p.lon;
      while (lonWrapped < b.lonMin) lonWrapped += 360;
      if (lonWrapped > b.lonMax) continue;
      if (p.lat < b.latMin || p.lat > b.latMax) continue;
      var s = M.toScreen(lonWrapped, p.lat);
      var gx = Math.floor(s.x * dpr / cell), gy = Math.floor(s.y * dpr / cell);
      var kk = gx + ':' + gy;
      if (taken[kk]) continue;
      taken[kk] = 1;
      shown++;
      var x = s.x * dpr, y = s.y * dpr;
      ctx.beginPath();
      ctx.arc(x, y, (p.cap ? 2.6 : 2) * dpr, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeText(p.name, x + 6 * dpr, y);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fillText(p.name, x + 6 * dpr, y);
    }
    ctx.restore();
  }

  // ---- GIBS tile layers ----------------------------------------------------
  function paintTiles(L, day, minutes, st) {
    var cov = D.coverage(L, day);
    if (!cov.ok) { if (st) st.nocover = true; return; }
    var level = T.levelFor(view.res / dpr, L);
    var time = T.timeOf(L, day, minutes);
    var span = T.span(level);
    var m = T.matrixSize(level);
    var b = M.bounds();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = view.res < T.res(level) ? 'high' : 'medium';

    var rowMin = U.clamp(Math.floor((90 - b.latMax) / span), 0, m.h - 1);
    var rowMax = U.clamp(Math.floor((90 - b.latMin) / span), 0, m.h - 1);
    var cLon = view.lon, cLat = view.lat;

    for (var k = Math.floor((b.lonMin + 180) / 360); k <= Math.floor((b.lonMax + 180) / 360); k++) {
      var off = k * 360;
      var colMin = U.clamp(Math.floor((b.lonMin - off + 180) / span), 0, m.w - 1);
      var colMax = U.clamp(Math.floor((b.lonMax - off + 180) / span), 0, m.w - 1);
      for (var row = rowMin; row <= rowMax; row++) {
        var lat0 = 90 - row * span;
        if (lat0 <= -90) continue;                       // matrix overhang: no data
        for (var col = colMin; col <= colMax; col++) {
          var lon0 = -180 + col * span;
          if (lon0 >= 180) continue;                     // matrix overhang: no data
          var key = T.key(L.id, time, level, row, col);
          var bmp = T.peek(key);
          var dx0 = (lon0 + off - cLon) / view.res + W / 2;
          var dy0 = (cLat - lat0) / view.res + H / 2;
          var dx1 = dx0 + span / view.res, dy1 = dy0 + span / view.res;
          var X = px(dx0), Y = px(dy0), Wd = px(dx1) - px(dx0), Hd = px(dy1) - px(dy0);
          if (Wd <= 0 || Hd <= 0) continue;
          if (bmp) {
            ctx.drawImage(bmp, X, Y, Wd, Hd);
            if (st) st.drawn++;
          } else if (T.isMissing(key)) {
            if (st) st.missing++;
          } else if (T.isFailed(key)) {
            /*
             * A tile the server said NO DATA to and a tile that never arrived
             * are not the same fact, and the layer row has to be able to tell
             * them apart. With the connection off, every tile lands here — and
             * because this used to fall through to "pending", the honest
             * "Nothing here on this day" went quiet exactly when the app had
             * nothing at all. Still draw the parent-tile placeholder, and still
             * let the queue retry; just do not call it pending.
             */
            if (st) st.failed++;
            drawAncestor(L, time, level, row, col, X, Y, Wd, Hd);
          } else {
            {
              if (st) st.pending++;
              drawAncestor(L, time, level, row, col, X, Y, Wd, Hd);
              // Nearest the middle of the screen first: what the eye is on
              // resolves before the corners.
              var pri = Math.abs(dx0 + span / view.res / 2 - W / 2) + Math.abs(dy0 + span / view.res / 2 - H / 2);
              T.want(L, time, level, row, col, pri);
            }
          }
        }
      }
    }
  }

  // The parent tile, scaled up, until the real one lands. Four levels is
  // enough to cover a two-step zoom without turning into mush.
  function drawAncestor(L, time, level, row, col, X, Y, Wd, Hd) {
    for (var up = 1; up <= 4 && level - up >= 0; up++) {
      var f = Math.pow(2, up);
      var pr = Math.floor(row / f), pc = Math.floor(col / f);
      var bmp = T.peek(T.key(L.id, time, level - up, pr, pc));
      if (!bmp) continue;
      var size = bmp.width || T.TILE;
      var sub = size / f;
      var sx = (col - pc * f) * sub, sy = (row - pr * f) * sub;
      ctx.drawImage(bmp, sx, sy, sub, sub, X, Y, Wd, Hd);
      return true;
    }
    return false;
  }

  // Everything the user drew on the map themselves.
  var furniture = { measure: null, pins: [], cursors: [], spot: null };
  M.furniture = furniture;

  function paintFurniture() {
    var f = furniture;
    if (f.spot) {
      var s = M.toScreen(f.spot.lon, f.spot.lat);
      ctx.save();
      ctx.strokeStyle = 'rgba(76,194,255,0.95)';
      ctx.lineWidth = 2 * dpr;
      var t = (Date.now() % 1600) / 1600;
      var r = (12 + t * 26) * dpr;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(s.x * dpr, s.y * dpr, r, 0, 6.2832);
      ctx.stroke();
      ctx.restore();
      dirty = true;
    }
    if (f.measure && f.measure.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2 * dpr;
      ctx.setLineDash([6 * dpr, 5 * dpr]);
      ctx.beginPath();
      for (var i = 0; i < f.measure.length; i++) {
        var p = M.toScreen(f.measure[i].lon, f.measure[i].lat);
        if (i === 0) ctx.moveTo(p.x * dpr, p.y * dpr); else ctx.lineTo(p.x * dpr, p.y * dpr);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (var j = 0; j < f.measure.length; j++) {
        var q = M.toScreen(f.measure[j].lon, f.measure[j].lat);
        ctx.beginPath();
        ctx.arc(q.x * dpr, q.y * dpr, 4 * dpr, 0, 6.2832);
        ctx.fillStyle = '#4cc2ff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
      ctx.restore();
    }
    for (var p2 = 0; p2 < furniture.pins.length; p2++) paintPin(furniture.pins[p2]);
    for (var c = 0; c < furniture.cursors.length; c++) paintCursor(furniture.cursors[c]);
  }

  function paintPin(pin) {
    var s = M.toScreen(pin.lon, pin.lat);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) return;
    var x = s.x * dpr, y = s.y * dpr;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 6 * dpr, y - 13 * dpr);
    ctx.lineTo(x + 6 * dpr, y - 13 * dpr);
    ctx.closePath();
    ctx.fillStyle = pin.colour || '#ffb454';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 18 * dpr, 7 * dpr, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();
    if (pin.label) {
      ctx.font = '600 ' + Math.round(11.5 * dpr) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      var w = ctx.measureText(pin.label).width + 14 * dpr;
      ctx.fillStyle = 'rgba(10,15,24,0.88)';
      roundRect(x + 11 * dpr, y - 28 * dpr, w, 20 * dpr, 6 * dpr);
      ctx.fill();
      ctx.fillStyle = '#eef3fa';
      ctx.fillText(pin.label, x + 18 * dpr, y - 18 * dpr);
    }
    ctx.restore();
  }

  function paintCursor(c) {
    var s = M.toScreen(c.lon, c.lat);
    if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) return;
    var x = s.x * dpr, y = s.y * dpr;
    ctx.save();
    ctx.fillStyle = c.colour || '#57d9a3';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 15 * dpr);
    ctx.lineTo(x + 4.5 * dpr, y + 11 * dpr);
    ctx.lineTo(x + 10 * dpr, y + 10.5 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    if (c.name) {
      ctx.font = '600 ' + Math.round(10.5 * dpr) + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      var w = ctx.measureText(c.name).width + 12 * dpr;
      ctx.fillStyle = c.colour || '#57d9a3';
      roundRect(x + 12 * dpr, y + 8 * dpr, w, 17 * dpr, 5 * dpr);
      ctx.fill();
      ctx.fillStyle = '#04121c';
      ctx.fillText(c.name, x + 18 * dpr, y + 16.5 * dpr);
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------- input ---
  var inertia = { vx: 0, vy: 0 };
  var pointers = {};
  var drag = null, pinch = null;
  var lastTap = 0;
  var onTap = null, onHover = null;
  M.onTap = function (fn) { onTap = fn; };
  M.onHover = function (fn) { onHover = fn; };

  function stepInertia() {
    if (stepFlight()) { dirty = true; return; }
    if (Math.abs(inertia.vx) < 0.02 && Math.abs(inertia.vy) < 0.02) return;
    view.lon -= inertia.vx * view.res;
    view.lat += inertia.vy * view.res;
    inertia.vx *= 0.92;
    inertia.vy *= 0.92;
    clampView();
    dirty = true;
    if (onMove) onMove();
  }

  function bindInput() {
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var n = Object.keys(pointers).length;
      flight = null;
      if (n === 1) {
        drag = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0, sx: e.clientX, sy: e.clientY };
        inertia.vx = inertia.vy = 0;
        cv.classList.add('dragging');
      } else if (n === 2) {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), res: view.res };
        drag = null;
      }
    });

    cv.addEventListener('pointermove', function (e) {
      var rect = cv.getBoundingClientRect();
      if (!pointers[e.pointerId]) {
        if (onHover) onHover(M.toWorld(e.clientX - rect.left, e.clientY - rect.top));
        return;
      }
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 4 && pinch.d > 4) {
          var mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
          var target = pinch.res * (pinch.d / d);
          var before = M.toWorld(mid.x, mid.y);
          view.res = U.clamp(target, M.MIN_RES, maxRes());
          var after = M.toWorld(mid.x, mid.y);
          view.lon += before.lon - after.lon;
          view.lat += before.lat - after.lat;
          clampView();
          dirty = true;
          if (onMove) onMove();
        }
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      view.lon -= dx * view.res;
      view.lat += dy * view.res;
      inertia.vx = dx * 0.75;
      inertia.vy = dy * 0.75;
      drag.x = e.clientX; drag.y = e.clientY;
      clampView();
      dirty = true;
      if (onMove) onMove();
      if (onHover) onHover(M.toWorld(e.clientX - rect.left, e.clientY - rect.top));
    });

    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      cv.classList.remove('dragging');
      if (drag && drag.moved < 6) {
        var rect = cv.getBoundingClientRect();
        var w = M.toWorld(e.clientX - rect.left, e.clientY - rect.top);
        var now = Date.now();
        if (now - lastTap < 300) { M.zoomBy(0.5, e.clientX - rect.left, e.clientY - rect.top); lastTap = 0; }
        else { lastTap = now; if (onTap) onTap(w, e); }
      }
      drag = null;
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var rect = cv.getBoundingClientRect();
      // Trackpads send many small deltas and mice send few big ones; damping by
      // magnitude makes both feel like the same map.
      var f = Math.exp(U.clamp(e.deltaY, -120, 120) * 0.0022);
      M.zoomBy(f, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    cv.addEventListener('dblclick', function (e) { e.preventDefault(); });
  }

  M.pan = function (dxPx, dyPx) {
    view.lon += dxPx * view.res;
    view.lat -= dyPx * view.res;
    clampView();
    M.invalidate();
    if (onMove) onMove();
  };

  // A picture of exactly what is on the screen, for the snapshot button and
  // for every frame of an exported animation.
  M.snapshot = function () { return cv; };

  // Paint right now rather than on the next frame — an exporter cannot wait
  // for requestAnimationFrame in a tab that may not be in front.
  M.renderNow = function () { draw(); dirty = false; };

  /*
   * One frame for the encoder: the map, scaled, with the date burned in.
   *
   * The stamp is not decoration. An animation that leaves this app is going to
   * be looked at by someone who was not here — in a message, in a slide — and
   * a satellite picture with no date and no source is a rumour. So every
   * exported frame carries the day it shows and who took it.
   */
  var grabCv = null, grabCtx = null;
  M.grabFrame = function (w, h, stampText) {
    if (!grabCv) { grabCv = document.createElement('canvas'); grabCtx = grabCv.getContext('2d'); }
    if (grabCv.width !== w || grabCv.height !== h) { grabCv.width = w; grabCv.height = h; }
    grabCtx.imageSmoothingQuality = 'high';
    grabCtx.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, w, h);
    if (stampText) {
      var pad = Math.round(h * 0.028) + 4;
      var fs = Math.max(12, Math.round(h * 0.045));
      grabCtx.font = '600 ' + fs + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
      var tw = grabCtx.measureText(stampText).width;
      grabCtx.fillStyle = 'rgba(6,10,16,0.72)';
      grabCtx.fillRect(pad - 8, h - pad - fs - 10, tw + 16, fs + 14);
      grabCtx.fillStyle = '#ffffff';
      grabCtx.textBaseline = 'alphabetic';
      grabCtx.fillText(stampText, pad, h - pad - 2);
      var cf = Math.max(9, Math.round(fs * 0.55));
      grabCtx.font = cf + 'px -apple-system, "Segoe UI", Roboto, sans-serif';
      var credit = 'NASA EOSDIS GIBS · made in GifOS Worldview';
      var cw = grabCtx.measureText(credit).width;
      grabCtx.fillStyle = 'rgba(6,10,16,0.6)';
      grabCtx.fillRect(w - cw - pad - 8, h - pad - cf - 8, cw + 14, cf + 12);
      grabCtx.fillStyle = 'rgba(255,255,255,0.86)';
      grabCtx.fillText(credit, w - cw - pad, h - pad - 2);
    }
    var img = grabCtx.getImageData(0, 0, w, h);
    return { data: img.data, width: w, height: h };
  };

  window.WVMap = M;
})();
