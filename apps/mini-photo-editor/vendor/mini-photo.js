/*
 * Mini Photo Editor — crop / rotate / filter loop from xdadda/mini-photo-editor
 * (MIT). The upstream UI is mini-js + mini-gl; GifOS inlines classic scripts,
 * so this file is the same jobs on a 2D canvas: crop rect, 90° rotate, lights
 * and colour, plus the MTX looks (polaroid / kodak / vintage / browni).
 * Classic IIFE. No fetch.
 */
(function (root) {
  'use strict';

  var MTX = {
    none: null,
    grayscale: [
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0, 0, 0, 1, 0
    ],
    polaroid: [
      1.438, -0.062, -0.062, 0, 0,
      -0.122, 1.378, -0.122, 0, 0,
      -0.016, -0.016, 1.483, 0, 0,
      0, 0, 0, 1, 0
    ],
    kodak: [
      1.128, -0.396, -0.039, 0, 0.255,
      -0.164, 1.083, -0.054, 0, 0.097,
      -0.167, -0.560, 1.601, 0, 0.140,
      0, 0, 0, 1, 0
    ],
    browni: [
      0.599, 0.345, -0.271, 0, 0.186,
      -0.038, 0.861, 0.150, 0, -0.029,
      0.241, -0.074, 0.449, 0, -0.009,
      0, 0, 0, 1, 0
    ],
    vintage: [
      0.628, 0.320, -0.040, 0, 0.038,
      0.026, 0.644, 0.033, 0, 0.029,
      0.047, -0.085, 0.524, 0, 0.020,
      0, 0, 0, 1, 0
    ]
  };

  var src = null;
  var rot = 0;
  var crop = null;
  var adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };
  var filter = 'none';
  var outCanvas = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function applyMatrix(px, m) {
    var r = px[0], g = px[1], b = px[2];
    px[0] = m[0] * r + m[1] * g + m[2] * b + m[4] * 255;
    px[1] = m[5] * r + m[6] * g + m[7] * b + m[9] * 255;
    px[2] = m[10] * r + m[11] * g + m[12] * b + m[14] * 255;
  }

  function dims() {
    if (!src) return { w: 0, h: 0 };
    var swap = rot % 180 !== 0;
    return { w: swap ? src.height : src.width, h: swap ? src.width : src.height };
  }

  function paint(dest) {
    if (!src || !dest) return;
    var d = dims();
    var c = crop || { x: 0, y: 0, w: d.w, h: d.h };
    dest.width = Math.max(1, c.w | 0);
    dest.height = Math.max(1, c.h | 0);
    var ctx = dest.getContext('2d');
    ctx.save();
    ctx.translate(dest.width / 2, dest.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    var dw = rot % 180 !== 0 ? dest.height : dest.width;
    var dh = rot % 180 !== 0 ? dest.width : dest.height;
    var sx = c.x, sy = c.y, sw = c.w, sh = c.h;
    if (rot === 90) { /* crop is in rotated space; draw full then we'd need remap.
      Simpler: draw rotated full image onto temp, then crop. */ }
    ctx.restore();

    var tmp = paint.rotCanvas || (paint.rotCanvas = document.createElement('canvas'));
    tmp.width = d.w; tmp.height = d.h;
    var t = tmp.getContext('2d');
    t.save();
    t.translate(d.w / 2, d.h / 2);
    t.rotate(rot * Math.PI / 180);
    t.drawImage(src, -src.width / 2, -src.height / 2);
    t.restore();

    dest.width = Math.max(1, c.w | 0);
    dest.height = Math.max(1, c.h | 0);
    ctx = dest.getContext('2d');
    ctx.drawImage(tmp, c.x, c.y, c.w, c.h, 0, 0, dest.width, dest.height);

    var img = ctx.getImageData(0, 0, dest.width, dest.height);
    var data = img.data;
    var m = MTX[filter];
    var br = adj.brightness * 80;
    var ct = 1 + adj.contrast;
    var sat = adj.saturation;
    var warm = adj.warmth * 40;
    var vig = adj.vignette;
    var cx = dest.width / 2, cy = dest.height / 2;
    var maxd = Math.sqrt(cx * cx + cy * cy) || 1;
    var i, r, g, b, luma, rr, gg, bb, dx, dy, f;
    for (i = 0; i < data.length; i += 4) {
      r = data[i]; g = data[i + 1]; b = data[i + 2];
      if (m) {
        var px = [r, g, b];
        applyMatrix(px, m);
        r = px[0]; g = px[1]; b = px[2];
      }
      r = (r - 128) * ct + 128 + br + warm;
      g = (g - 128) * ct + 128 + br;
      b = (b - 128) * ct + 128 + br - warm;
      luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * (1 + sat);
      g = luma + (g - luma) * (1 + sat);
      b = luma + (b - luma) * (1 + sat);
      if (vig) {
        dx = ((i / 4) % dest.width) - cx;
        dy = Math.floor(i / 4 / dest.width) - cy;
        f = 1 - vig * (dx * dx + dy * dy) / (maxd * maxd);
        r *= f; g *= f; b *= f;
      }
      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  function setSource(img) {
    src = img;
    rot = 0;
    var d = dims();
    crop = { x: 0, y: 0, w: d.w, h: d.h };
  }

  function setCrop(c) {
    var d = dims();
    crop = {
      x: clamp(c.x | 0, 0, d.w - 1),
      y: clamp(c.y | 0, 0, d.h - 1),
      w: clamp(c.w | 0, 1, d.w),
      h: clamp(c.h | 0, 1, d.h)
    };
    if (crop.x + crop.w > d.w) crop.w = d.w - crop.x;
    if (crop.y + crop.h > d.h) crop.h = d.h - crop.y;
  }

  function rotate(dir) {
    rot = (rot + (dir < 0 ? -90 : 90) + 360) % 360;
    var d = dims();
    crop = { x: 0, y: 0, w: d.w, h: d.h };
  }

  function getState() {
    return {
      rot: rot, crop: crop, adj: {
        brightness: adj.brightness, contrast: adj.contrast, saturation: adj.saturation,
        warmth: adj.warmth, vignette: adj.vignette
      }, filter: filter
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.rot != null) rot = s.rot;
    if (s.crop) setCrop(s.crop);
    if (s.adj) {
      var k;
      for (k in adj) if (s.adj[k] != null) adj[k] = s.adj[k];
    }
    if (s.filter && MTX[s.filter] !== undefined) filter = s.filter;
  }

  function hasImage() { return !!src; }
  function sourceSize() { return src ? { w: src.width, h: src.height } : { w: 0, h: 0 }; }
  function rotatedSize() { return dims(); }

  function exportBlob(mime, quality, cb) {
    if (!outCanvas) outCanvas = document.createElement('canvas');
    paint(outCanvas);
    if (outCanvas.toBlob) outCanvas.toBlob(cb, mime || 'image/jpeg', quality == null ? 0.92 : quality);
    else cb(null);
  }

  root.MiniPhoto = {
    MTX: MTX,
    setSource: setSource,
    setCrop: setCrop,
    rotate: rotate,
    paint: paint,
    getState: getState,
    setState: setState,
    hasImage: hasImage,
    sourceSize: sourceSize,
    rotatedSize: rotatedSize,
    exportBlob: exportBlob,
    adj: adj,
    setFilter: function (id) { if (MTX[id] !== undefined) filter = id; },
    getFilter: function () { return filter; },
    resetAdj: function () {
      adj.brightness = adj.contrast = adj.saturation = adj.warmth = adj.vignette = 0;
      filter = 'none';
      if (src) {
        var d = dims();
        crop = { x: 0, y: 0, w: d.w, h: d.h };
      }
      rot = 0;
    }
  };
})(this);
