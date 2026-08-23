// Isometric cube walls, isomer.js-style (the original used purescript-isometric).
// Wall index 0 is the back row (the starting shape); later steps come forward.
(function (root) {
  'use strict';

  var CC = root.CC = root.CC || {};

  var COS = Math.sqrt(3) / 2; // cos(30°)
  var SIN = 0.5;              // sin(30°)
  var SIZE = 0.9;
  var SPACING = 5.5;

  var RGB = {
    Cyan:   [0, 160, 176],
    Brown:  [106, 74, 60],
    Red:    [204, 51, 63],
    Orange: [235, 104, 65],
    Yellow: [237, 201, 81]
  };

  function shade(rgb, k) {
    return [
      Math.round(Math.max(0, Math.min(255, rgb[0] * k))),
      Math.round(Math.max(0, Math.min(255, rgb[1] * k))),
      Math.round(Math.max(0, Math.min(255, rgb[2] * k)))
    ];
  }

  function iso(x, y, z) {
    return { x: (x - y) * COS, y: z - (x + y) * SIN };
  }

  function cubeFaces(wx, wy, wz, rgb) {
    var s = SIZE;
    function p(dx, dy, dz) { return iso(wx + dx * s, wy + dy * s, wz + dz * s); }
    var depth = wx + wy + wz;
    return [
      { pts: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], color: shade(rgb, 0.58), depth: depth - 0.02 },
      { pts: [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)], color: shade(rgb, 0.78), depth: depth - 0.01 },
      { pts: [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], color: shade(rgb, 1.05), depth: depth }
    ];
  }

  function prismFaces(x, y, z, dx, dy, dz, rgb) {
    function p(ix, iy, iz) { return iso(x + ix * dx, y + iy * dy, z + iz * dz); }
    var depth = x + y + z;
    return [
      { pts: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)], color: shade(rgb, 0.55), depth: depth - 0.02 },
      { pts: [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)], color: shade(rgb, 0.75), depth: depth - 0.01 },
      { pts: [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], color: shade(rgb, 1.0), depth: depth }
    ];
  }

  function wallFaces(wall, wy) {
    var faces = [], len, x, z, reversed, stack, color;
    if (!wall || !wall.length) {
      return prismFaces(-8, wy, 0, 8, 0.9, 0.1, [140, 140, 140]);
    }
    reversed = wall.slice().reverse();
    len = reversed.length;
    for (x = 0; x < len; x++) {
      stack = reversed[x];
      for (z = 0; z < stack.length; z++) {
        color = RGB[stack[z]];
        if (!color) continue;
        faces = faces.concat(cubeFaces(-(len - x), wy, z, color));
      }
    }
    return faces;
  }

  function stepsFaces(steps) {
    var faces = [], i;
    for (i = 0; i < steps.length; i++) faces = faces.concat(wallFaces(steps[i], i * SPACING));
    return faces;
  }

  function boundsOf(faces) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, i, j, p;
    for (i = 0; i < faces.length; i++) {
      for (j = 0; j < faces[i].pts.length; j++) {
        p = faces[i].pts[j];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    if (minX === 1e9) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  function drawFaces(ctx, faces, ox, oy, scale) {
    faces = faces.slice().sort(function (a, b) { return a.depth - b.depth; });
    var i, f, j, p;
    for (i = 0; i < faces.length; i++) {
      f = faces[i];
      ctx.beginPath();
      p = f.pts[0];
      ctx.moveTo(ox + p.x * scale, oy - p.y * scale);
      for (j = 1; j < f.pts.length; j++) {
        p = f.pts[j];
        ctx.lineTo(ox + p.x * scale, oy - p.y * scale);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgb(' + f.color[0] + ',' + f.color[1] + ',' + f.color[2] + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,16,0.28)';
      ctx.lineWidth = Math.max(0.6, scale * 0.012);
      ctx.stroke();
    }
  }

  function fit(faces, w, h, pad) {
    var b = boundsOf(faces);
    var bw = Math.max(0.01, b.maxX - b.minX);
    var bh = Math.max(0.01, b.maxY - b.minY);
    var scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
    var ox = pad + (w - pad * 2 - bw * scale) / 2 - b.minX * scale;
    var oy = pad + b.maxY * scale + (h - pad * 2 - bh * scale) / 2;
    return { ox: ox, oy: oy, scale: scale };
  }

  function paint(canvas, faces, opt) {
    opt = opt || {};
    var dpr = opt.dpr || 1;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!faces.length) return;
    var f = fit(faces, w, h, opt.pad == null ? 16 : opt.pad);
    drawFaces(ctx, faces, f.ox, f.oy, f.scale);
  }

  function sizeCanvas(canvas, cssW, cssH, dpr) {
    dpr = dpr || (root.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    return dpr;
  }

  CC.RGB = RGB;
  CC.isoFaces = {
    wall: wallFaces,
    steps: stepsFaces,
    paint: paint,
    sizeCanvas: sizeCanvas,
    cube: cubeFaces
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
