/*
 * engine.js — IS-Net background cut.
 *
 * Transcribed from @imgly/background-removal 1.7.0 (AGPL-3.0, IMG.LY GmbH):
 *   inference.ts runInference
 *   utils.ts     tensorResizeBilinear, tensorHWCtoBCHW, convertFloat32ToUint8
 *   api/v1.ts    removeBackground (write the mask into the alpha channel)
 *
 * Resolution 1024, keepAspect false, mean 128, std 256. ndarray is not here;
 * the typed-array arithmetic is the same.
 */
(function (root) {
  'use strict';

  var RES = 1024;
  var MEAN = 128;
  var STD = 256;

  function b64ToU8(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function initOrt() {
    if (!root.ort) throw new Error('The inference engine failed to load.');
    if (!root.BR_ORT_WASM_B64) throw new Error('The engine wasm failed to load.');
    var wasm = b64ToU8(root.BR_ORT_WASM_B64);
    root.ort.env.wasm.wasmBinary = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
    root.ort.env.wasm.numThreads = 1;
    root.ort.env.wasm.proxy = false;
    root.ort.env.logLevel = 'error';
  }

  async function gpuAdapter() {
    try {
      if (!navigator.gpu) return { ok: false };
      var a = await navigator.gpu.requestAdapter();
      if (!a) return { ok: false };
      if (a.isFallbackAdapter) return { ok: false, fallback: true };
      return { ok: true };
    } catch (e) {
      return { ok: false };
    }
  }

  // Same bilinear as utils.ts tensorResizeBilinear (keepAspect = false).
  function resizeBilinear(src, srcW, srcH, srcC, dstW, dstH) {
    var dst = src instanceof Uint8Array || src instanceof Uint8ClampedArray
      ? new Uint8Array(dstW * dstH * srcC)
      : new Float32Array(dstW * dstH * srcC);
    var scaleX = srcW / dstW;
    var scaleY = srcH / dstH;
    var y, x, c, srcX, srcY, x1, x2, y1, y2, dx, dy, p1, p2, p3, p4;
    for (y = 0; y < dstH; y++) {
      for (x = 0; x < dstW; x++) {
        srcX = x * scaleX;
        srcY = y * scaleY;
        x1 = Math.max(Math.floor(srcX), 0);
        x2 = Math.min(Math.ceil(srcX), srcW - 1);
        y1 = Math.max(Math.floor(srcY), 0);
        y2 = Math.min(Math.ceil(srcY), srcH - 1);
        dx = srcX - x1;
        dy = srcY - y1;
        for (c = 0; c < srcC; c++) {
          p1 = src[(y1 * srcW + x1) * srcC + c];
          p2 = src[(y1 * srcW + x2) * srcC + c];
          p3 = src[(y2 * srcW + x1) * srcC + c];
          p4 = src[(y2 * srcW + x2) * srcC + c];
          dst[(y * dstW + x) * srcC + c] =
            (1 - dx) * (1 - dy) * p1 +
            dx * (1 - dy) * p2 +
            (1 - dx) * dy * p3 +
            dx * dy * p4;
        }
      }
    }
    return dst;
  }

  // utils.ts tensorHWCtoBCHW — RGBA HWC uint8 → BCHW float32, RGB only.
  function hwcToBchw(rgba, w, h) {
    var stride = w * h;
    var out = new Float32Array(3 * stride);
    var i, j, n = rgba.length;
    for (i = 0, j = 0; i < n; i += 4, j += 1) {
      out[j] = (rgba[i] - MEAN) / STD;
      out[j + stride] = (rgba[i + 1] - MEAN) / STD;
      out[j + stride + stride] = (rgba[i + 2] - MEAN) / STD;
    }
    return out;
  }

  function floatMaskToU8(f32) {
    var u = new Uint8Array(f32.length);
    for (var i = 0; i < f32.length; i++) u[i] = f32[i] * 255;
    return u;
  }

  // Separable box blur on a single-channel uint8 mask. radius 0 is a copy.
  function blurMask(src, w, h, radius) {
    radius = radius | 0;
    if (radius < 1) return src;
    var tmp = new Uint8Array(src.length);
    var dst = new Uint8Array(src.length);
    var win = radius * 2 + 1;
    var x, y, i, acc, left, right, up, down;
    for (y = 0; y < h; y++) {
      acc = 0;
      for (i = -radius; i <= radius; i++) {
        x = i < 0 ? 0 : (i >= w ? w - 1 : i);
        acc += src[y * w + x];
      }
      for (x = 0; x < w; x++) {
        tmp[y * w + x] = (acc / win) | 0;
        left = x - radius; if (left < 0) left = 0;
        right = x + radius + 1; if (right >= w) right = w - 1;
        acc += src[y * w + right] - src[y * w + left];
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0;
      for (i = -radius; i <= radius; i++) {
        y = i < 0 ? 0 : (i >= h ? h - 1 : i);
        acc += tmp[y * w + x];
      }
      for (y = 0; y < h; y++) {
        dst[y * w + x] = (acc / win) | 0;
        up = y - radius; if (up < 0) up = 0;
        down = y + radius + 1; if (down >= h) down = h - 1;
        acc += tmp[down * w + x] - tmp[up * w + x];
      }
    }
    return dst;
  }

  function decodeImage(blob) {
    var opts = { imageOrientation: 'from-image' };
    return createImageBitmap(blob, opts).catch(function () {
      return createImageBitmap(blob);
    }).then(function (bmp) {
      var c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      var g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      try { bmp.close(); } catch (e) {}
      return g.getImageData(0, 0, c.width, c.height);
    });
  }

  function Engine() {
    this.sessions = {};
    this.ep = 'wasm';
    this.gpu = false;
  }

  Engine.prototype.release = function () {
    var old = this.sessions;
    this.sessions = {};
    Object.keys(old).forEach(function (k) {
      Promise.resolve(old[k]).then(function (s) {
        try { s.release(); } catch (e) {}
      }, function () {});
    });
  };

  Engine.prototype.sessionFor = async function (id, bytes, wantGpu) {
    var key = id + ':' + (wantGpu ? 'gpu' : 'cpu');
    if (this.sessions[key]) return this.sessions[key];
    var self = this;
    var p = (async function () {
      var eps = wantGpu ? ['webgpu', 'wasm'] : ['wasm'];
      try {
        var s = await root.ort.InferenceSession.create(bytes, {
          executionProviders: eps,
          graphOptimizationLevel: 'all'
        });
        self.ep = wantGpu ? 'webgpu' : 'wasm';
        self.gpu = wantGpu && self.ep === 'webgpu';
        return s;
      } catch (e) {
        if (!wantGpu) throw e;
        var s2 = await root.ort.InferenceSession.create(bytes, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        });
        self.ep = 'wasm';
        self.gpu = false;
        return s2;
      }
    })();
    this.sessions[key] = p;
    try {
      return await p;
    } catch (e) {
      delete this.sessions[key];
      throw e;
    }
  };

  Engine.prototype.cut = async function (imageData, session) {
    var srcW = imageData.width, srcH = imageData.height;
    var resized = resizeBilinear(imageData.data, srcW, srcH, 4, RES, RES);
    var input = hwcToBchw(resized, RES, RES);
    var feeds = { input: new root.ort.Tensor('float32', input, [1, 3, RES, RES]) };
    var out = await session.run(feeds);
    var name = session.outputNames && session.outputNames[0] ? session.outputNames[0] : 'output';
    var t = out[name] || out.output;
    if (!t) throw new Error('the model returned no output tensor');
    var mask1024 = floatMaskToU8(t.data);
    var mask = resizeBilinear(mask1024, RES, RES, 1, srcW, srcH);
    return { width: srcW, height: srcH, rgba: new Uint8ClampedArray(imageData.data), mask: mask };
  };

  function composite(cut, opts) {
    opts = opts || {};
    var w = cut.width, h = cut.height;
    var radius = opts.feather | 0;
    var mask = radius > 0 ? blurMask(cut.mask, w, h, radius) : cut.mask;
    var invert = !!opts.invert;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext('2d');

    if (opts.bg === 'color' && opts.color) {
      g.fillStyle = opts.color;
      g.fillRect(0, 0, w, h);
    } else if (opts.bg === 'image' && opts.bgImage) {
      try {
        g.drawImage(opts.bgImage, 0, 0, w, h);
      } catch (e) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
      }
    } else {
      g.clearRect(0, 0, w, h);
    }

    if (opts.shadow && opts.bg !== 'transparent') {
      var sh = g.getImageData(0, 0, w, h);
      var off = Math.max(2, Math.round(Math.min(w, h) * 0.012));
      var i, x, y, a, d = sh.data;
      for (y = 0; y < h; y++) {
        for (x = 0; x < w; x++) {
          var sx = x - off, sy = y - off;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          a = mask[sy * w + sx];
          if (invert) a = 255 - a;
          if (a < 8) continue;
          i = (y * w + x) * 4;
          var k = (a / 255) * 0.35;
          d[i] = d[i] * (1 - k);
          d[i + 1] = d[i + 1] * (1 - k);
          d[i + 2] = d[i + 2] * (1 - k);
        }
      }
      g.putImageData(sh, 0, 0);
    }

    var overlay = g.getImageData(0, 0, w, h);
    var o = overlay.data;
    var s = cut.rgba;
    var i, a, ia, ma;
    for (i = 0; i < w * h; i++) {
      ma = mask[i];
      if (invert) ma = 255 - ma;
      a = ma / 255;
      ia = 1 - a;
      var p = i * 4;
      if (opts.bg === 'transparent') {
        o[p] = s[p];
        o[p + 1] = s[p + 1];
        o[p + 2] = s[p + 2];
        o[p + 3] = ma;
      } else {
        o[p] = s[p] * a + o[p] * ia;
        o[p + 1] = s[p + 1] * a + o[p + 1] * ia;
        o[p + 2] = s[p + 2] * a + o[p + 2] * ia;
        o[p + 3] = 255;
      }
    }
    g.putImageData(overlay, 0, 0);
    return c;
  }

  function encodeCanvas(canvas, mime, quality) {
    mime = mime || 'image/png';
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) {
          if (!b) reject(new Error('Could not encode the picture.'));
          else resolve(b);
        }, mime, quality);
      } else {
        try {
          var url = canvas.toDataURL(mime, quality);
          var bin = atob(url.split(',')[1] || '');
          var u = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          resolve(new Blob([u], { type: mime }));
        } catch (e) { reject(e); }
      }
    });
  }

  root.BREngine = {
    RES: RES,
    initOrt: initOrt,
    gpuAdapter: gpuAdapter,
    decodeImage: decodeImage,
    resizeBilinear: resizeBilinear,
    blurMask: blurMask,
    composite: composite,
    encodeCanvas: encodeCanvas,
    Engine: Engine
  };
})(typeof window !== 'undefined' ? window : globalThis);
