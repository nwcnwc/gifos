/*
 * Mini Photo Editor — crop / rotate / filter loop from xdadda/mini-photo-editor
 * (MIT). The upstream UI is mini-js + mini-gl; GifOS inlines classic scripts,
 * so this file is the same jobs on a 2D canvas: crop rect with handles, 90°
 * rotate, flip, lights and colour, plus the MTX looks (polaroid / kodak /
 * vintage / browni). Classic IIFE. No fetch.
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
  var flipH = false;
  var flipV = false;
  var crop = null;
  var adj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };
  var filter = 'none';
  var dirty = true;
  var rotCanvas = null;
  var filtered = null;
  var outCanvas = null;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function applyMatrix(px, m) {
    var r = px[0], g = px[1], b = px[2];
    px[0] = m[0] * r + m[1] * g + m[2] * b + m[4] * 255;
    px[1] = m[5] * r + m[6] * g + m[7] * b + m[9] * 255;
    px[2] = m[10] * r + m[11] * g + m[12] * b + m[14] * 255;
  }

  function applyPixels(data, w, h, a, filterId) {
    a = a || adj;
    var m = MTX[filterId];
    var br = a.brightness * 80;
    var ct = 1 + a.contrast;
    var sat = a.saturation;
    var warm = a.warmth * 40;
    var vig = a.vignette;
    var cx = w / 2, cy = h / 2;
    var maxd = Math.sqrt(cx * cx + cy * cy) || 1;
    var i, r, g, b, luma, dx, dy, f, px;
    for (i = 0; i < data.length; i += 4) {
      r = data[i]; g = data[i + 1]; b = data[i + 2];
      if (m) {
        px = [r, g, b];
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
        dx = ((i / 4) % w) - cx;
        dy = Math.floor(i / 4 / w) - cy;
        f = 1 - vig * (dx * dx + dy * dy) / (maxd * maxd);
        r *= f; g *= f; b *= f;
      }
      data[i] = clamp(r, 0, 255);
      data[i + 1] = clamp(g, 0, 255);
      data[i + 2] = clamp(b, 0, 255);
    }
    return data;
  }

  function dims() {
    if (!src) return { w: 0, h: 0 };
    var swap = rot % 180 !== 0;
    return { w: swap ? src.height : src.width, h: swap ? src.width : src.height };
  }

  function fullCrop() {
    var d = dims();
    return { x: 0, y: 0, w: d.w, h: d.h };
  }

  function setCrop(c) {
    var d = dims();
    if (!d.w) { crop = null; return; }
    crop = {
      x: clamp(Math.round(c.x), 0, Math.max(0, d.w - 1)),
      y: clamp(Math.round(c.y), 0, Math.max(0, d.h - 1)),
      w: clamp(Math.round(c.w), 1, d.w),
      h: clamp(Math.round(c.h), 1, d.h)
    };
    if (crop.x + crop.w > d.w) crop.w = d.w - crop.x;
    if (crop.y + crop.h > d.h) crop.h = d.h - crop.y;
    if (crop.w < 1) crop.w = 1;
    if (crop.h < 1) crop.h = 1;
  }

  function getCrop() {
    var d = dims();
    var c = crop || fullCrop();
    return { x: c.x, y: c.y, w: c.w, h: c.h, W: d.w, H: d.h };
  }

  function invalidate() { dirty = true; }

  function makeCanvas() {
    if (root.document && root.document.createElement) return root.document.createElement('canvas');
    return null;
  }

  function drawOriented(ctx, w, h) {
    if (!rotCanvas) rotCanvas = makeCanvas();
    if (!rotCanvas) return;
    rotCanvas.width = w;
    rotCanvas.height = h;
    var t = rotCanvas.getContext('2d');
    t.save();
    t.translate(w / 2, h / 2);
    t.rotate(rot * Math.PI / 180);
    t.drawImage(src, -src.width / 2, -src.height / 2);
    t.restore();
    ctx.save();
    if (flipH || flipV) {
      ctx.translate(flipH ? w : 0, flipV ? h : 0);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    }
    ctx.drawImage(rotCanvas, 0, 0);
    ctx.restore();
  }

  function ensureFiltered() {
    if (!src) return null;
    if (filtered && !dirty) return filtered;
    var d = dims();
    if (!filtered) filtered = makeCanvas();
    if (!filtered) return null;
    filtered.width = d.w;
    filtered.height = d.h;
    var ctx = filtered.getContext('2d');
    ctx.clearRect(0, 0, d.w, d.h);
    drawOriented(ctx, d.w, d.h);
    var img = ctx.getImageData(0, 0, d.w, d.h);
    applyPixels(img.data, d.w, d.h, adj, filter);
    ctx.putImageData(img, 0, 0);
    dirty = false;
    return filtered;
  }

  function handleSize(d) {
    d = d || dims();
    return Math.max(12, Math.round(Math.min(d.w, d.h) / 24));
  }

  function paintPreview(dest) {
    if (!src || !dest) return;
    var f = ensureFiltered();
    if (!f) return;
    var d = dims();
    var c = crop || fullCrop();
    dest.width = d.w;
    dest.height = d.h;
    var ctx = dest.getContext('2d');
    ctx.drawImage(f, 0, 0);
    ctx.fillStyle = 'rgba(8,8,10,0.5)';
    ctx.fillRect(0, 0, d.w, c.y);
    ctx.fillRect(0, c.y, c.x, c.h);
    ctx.fillRect(c.x + c.w, c.y, d.w - (c.x + c.w), c.h);
    ctx.fillRect(0, c.y + c.h, d.w, d.h - (c.y + c.h));
    var lw = Math.max(2, Math.round(Math.min(d.w, d.h) / 180));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lw;
    ctx.strokeRect(c.x + lw / 2, c.y + lw / 2, Math.max(1, c.w - lw), Math.max(1, c.h - lw));
    var hs = handleSize(d);
    var pts = [
      [c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]
    ];
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#c45c26';
    ctx.lineWidth = Math.max(2, lw);
    var i, px, py;
    for (i = 0; i < pts.length; i++) {
      px = pts[i][0]; py = pts[i][1];
      ctx.fillRect(px - hs / 2, py - hs / 2, hs, hs);
      ctx.strokeRect(px - hs / 2, py - hs / 2, hs, hs);
    }
  }

  function paintExport(dest) {
    if (!src || !dest) return;
    var f = ensureFiltered();
    if (!f) return;
    var c = crop || fullCrop();
    dest.width = Math.max(1, c.w | 0);
    dest.height = Math.max(1, c.h | 0);
    dest.getContext('2d').drawImage(f, c.x, c.y, c.w, c.h, 0, 0, dest.width, dest.height);
  }

  function paint(dest, mode) {
    if (mode === 'export') paintExport(dest);
    else paintPreview(dest);
  }

  function setSource(img) {
    src = img;
    rot = 0;
    flipH = false;
    flipV = false;
    crop = fullCrop();
    invalidate();
  }

  function rotate(dir) {
    var d0 = dims();
    var c = crop || fullCrop();
    var cw = dir < 0 ? -1 : 1;
    rot = (rot + (cw < 0 ? -90 : 90) + 360) % 360;
    var nc;
    if (cw > 0) nc = { x: d0.h - c.y - c.h, y: c.x, w: c.h, h: c.w };
    else nc = { x: c.y, y: d0.w - c.x - c.w, w: c.h, h: c.w };
    setCrop(nc);
    invalidate();
  }

  function flip(axis) {
    var d = dims();
    var c = crop || fullCrop();
    if (axis === 'v') {
      flipV = !flipV;
      setCrop({ x: c.x, y: d.h - c.y - c.h, w: c.w, h: c.h });
    } else {
      flipH = !flipH;
      setCrop({ x: d.w - c.x - c.w, y: c.y, w: c.w, h: c.h });
    }
    invalidate();
  }

  function cropToAspect(ratio) {
    var d = dims();
    if (!d.w) return;
    if (!ratio) { setCrop(fullCrop()); return; }
    var tw = d.w, th = tw / ratio;
    if (th > d.h) { th = d.h; tw = th * ratio; }
    setCrop({ x: (d.w - tw) / 2, y: (d.h - th) / 2, w: tw, h: th });
  }

  function hitHandle(px, py) {
    var d = dims();
    var c = crop || fullCrop();
    var hs = handleSize(d) * 1.6;
    var corners = {
      nw: [c.x, c.y],
      ne: [c.x + c.w, c.y],
      sw: [c.x, c.y + c.h],
      se: [c.x + c.w, c.y + c.h]
    };
    var k, dx, dy;
    for (k in corners) {
      dx = px - corners[k][0];
      dy = py - corners[k][1];
      if (dx * dx + dy * dy <= hs * hs) return k;
    }
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return 'move';
    return null;
  }

  function resizeCrop(handle, x, y, aspect) {
    var d = dims();
    var c = crop || fullCrop();
    var left = c.x, right = c.x + c.w, top = c.y, bot = c.y + c.h;
    x = clamp(x, 0, d.w);
    y = clamp(y, 0, d.h);
    if (handle === 'nw') { left = x; top = y; }
    else if (handle === 'ne') { right = x; top = y; }
    else if (handle === 'sw') { left = x; bot = y; }
    else if (handle === 'se') { right = x; bot = y; }
    if (right < left) { var t = left; left = right; right = t; }
    if (bot < top) { var u = top; top = bot; bot = u; }
    var w = Math.max(1, right - left), h = Math.max(1, bot - top);
    if (aspect && aspect > 0) {
      var nw = w, nh = w / aspect;
      if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se') {
        if (nh > h) { nh = h; nw = h * aspect; }
        if (handle === 'nw') { left = right - nw; top = bot - nh; }
        else if (handle === 'ne') { right = left + nw; top = bot - nh; }
        else if (handle === 'sw') { left = right - nw; bot = top + nh; }
        else { right = left + nw; bot = top + nh; }
        w = nw; h = nh;
      }
    }
    setCrop({ x: left, y: top, w: w, h: h });
  }

  function moveCrop(dx, dy) {
    var d = dims();
    var c = crop || fullCrop();
    setCrop({
      x: clamp(c.x + dx, 0, d.w - c.w),
      y: clamp(c.y + dy, 0, d.h - c.h),
      w: c.w, h: c.h
    });
  }

  function isFullCrop() {
    var d = dims();
    var c = crop || fullCrop();
    return c.x === 0 && c.y === 0 && c.w === d.w && c.h === d.h;
  }

  function getState() {
    return {
      rot: rot,
      flipH: !!flipH,
      flipV: !!flipV,
      crop: crop ? { x: crop.x, y: crop.y, w: crop.w, h: crop.h } : null,
      adj: {
        brightness: adj.brightness, contrast: adj.contrast, saturation: adj.saturation,
        warmth: adj.warmth, vignette: adj.vignette
      },
      filter: filter
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.rot != null) rot = ((s.rot % 360) + 360) % 360;
    flipH = !!s.flipH;
    flipV = !!s.flipV;
    if (s.crop) setCrop(s.crop);
    if (s.adj) {
      var k;
      for (k in adj) if (s.adj[k] != null) adj[k] = s.adj[k];
    }
    if (s.filter && MTX[s.filter] !== undefined) filter = s.filter;
    invalidate();
  }

  function hasImage() { return !!src; }
  function sourceSize() { return src ? { w: src.width, h: src.height } : { w: 0, h: 0 }; }
  function rotatedSize() { return dims(); }

  function exportBlob(mime, quality, cb) {
    if (!outCanvas) outCanvas = makeCanvas();
    if (!outCanvas) { cb(null); return; }
    paintExport(outCanvas);
    if (outCanvas.toBlob) outCanvas.toBlob(cb, mime || 'image/jpeg', quality == null ? 0.92 : quality);
    else cb(null);
  }

  function dataUrl(mime, quality) {
    if (!outCanvas) outCanvas = makeCanvas();
    if (!outCanvas) return '';
    paintExport(outCanvas);
    try { return outCanvas.toDataURL(mime || 'image/jpeg', quality == null ? 0.85 : quality); }
    catch (e) { return ''; }
  }

  root.MiniPhoto = {
    MTX: MTX,
    applyPixels: applyPixels,
    setSource: setSource,
    setCrop: setCrop,
    getCrop: getCrop,
    rotate: rotate,
    flip: flip,
    cropToAspect: cropToAspect,
    hitHandle: hitHandle,
    resizeCrop: resizeCrop,
    moveCrop: moveCrop,
    isFullCrop: isFullCrop,
    paint: paint,
    paintPreview: paintPreview,
    paintExport: paintExport,
    getState: getState,
    setState: setState,
    hasImage: hasImage,
    sourceSize: sourceSize,
    rotatedSize: rotatedSize,
    exportBlob: exportBlob,
    dataUrl: dataUrl,
    adj: adj,
    setFilter: function (id) { if (MTX[id] !== undefined) { filter = id; invalidate(); } },
    getFilter: function () { return filter; },
    invalidate: invalidate,
    handleSize: handleSize,
    resetAdj: function () {
      adj.brightness = adj.contrast = adj.saturation = adj.warmth = adj.vignette = 0;
      filter = 'none';
      rot = 0;
      flipH = false;
      flipV = false;
      if (src) crop = fullCrop();
      invalidate();
    }
  };
})(this);
