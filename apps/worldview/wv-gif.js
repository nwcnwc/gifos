/*
 * wv-gif.js — an animated GIF encoder, entirely inside the app.
 *
 * NASA's Worldview can hand you an animation too, but the frames are rendered
 * on their servers and the request has limits and a queue. This one runs on
 * the pixels already on your screen: the same frames the map just painted,
 * quantised and packed here, on a phone, in a tab, with no connection at all.
 * The app is a GIF; it seemed only fair that it can write one.
 *
 * Three pieces, all standard and all small:
 *   MEDIAN CUT   one palette for the whole animation (a per-frame palette
 *                makes the sea shimmer between frames), built from a sample.
 *   ORDERED DITHER  a 4x4 Bayer offset before quantising. Satellite imagery is
 *                mostly gradients — ocean, cloud, haze — and 256 flat colours
 *                across a gradient bands horribly without it.
 *   LZW          the GIF variable-code compressor, as specified.
 */
(function () {
  'use strict';

  var G = {};

  // ---- median cut ----------------------------------------------------------
  function buildPalette(samples, want) {
    var boxes = [{ lo: 0, hi: samples.length / 3 }];
    var idx = new Uint32Array(samples.length / 3);
    for (var i = 0; i < idx.length; i++) idx[i] = i;

    function rangeOf(box) {
      var rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
      for (var i = box.lo; i < box.hi; i++) {
        var p = idx[i] * 3;
        var r = samples[p], g = samples[p + 1], b = samples[p + 2];
        if (r < rmin) rmin = r; if (r > rmax) rmax = r;
        if (g < gmin) gmin = g; if (g > gmax) gmax = g;
        if (b < bmin) bmin = b; if (b > bmax) bmax = b;
      }
      return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
    }

    while (boxes.length < want) {
      // Split the box with the widest channel — the classic heuristic, and the
      // one that keeps a bright fire pixel from being averaged into the ocean.
      var best = -1, bestSpread = 0, bestCh = 0;
      for (var bi = 0; bi < boxes.length; bi++) {
        var box = boxes[bi];
        if (box.hi - box.lo < 2) continue;
        var rg = rangeOf(box);
        var spread = Math.max(rg.r, rg.g, rg.b);
        if (spread > bestSpread) {
          bestSpread = spread; best = bi;
          bestCh = rg.r >= rg.g && rg.r >= rg.b ? 0 : (rg.g >= rg.b ? 1 : 2);
        }
      }
      if (best < 0 || bestSpread === 0) break;
      var b2 = boxes[best];
      var slice = Array.prototype.slice.call(idx.subarray(b2.lo, b2.hi));
      slice.sort(function (x, y) { return samples[x * 3 + bestCh] - samples[y * 3 + bestCh]; });
      for (var s = 0; s < slice.length; s++) idx[b2.lo + s] = slice[s];
      var mid = b2.lo + Math.floor((b2.hi - b2.lo) / 2);
      boxes.splice(best, 1, { lo: b2.lo, hi: mid }, { lo: mid, hi: b2.hi });
    }

    var pal = new Uint8Array(boxes.length * 3);
    for (var k = 0; k < boxes.length; k++) {
      var box3 = boxes[k], r = 0, g = 0, b = 0, n = box3.hi - box3.lo;
      for (var j = box3.lo; j < box3.hi; j++) {
        var q = idx[j] * 3;
        r += samples[q]; g += samples[q + 1]; b += samples[q + 2];
      }
      pal[k * 3] = n ? Math.round(r / n) : 0;
      pal[k * 3 + 1] = n ? Math.round(g / n) : 0;
      pal[k * 3 + 2] = n ? Math.round(b / n) : 0;
    }
    return pal;
  }

  function sampleFrames(frames, target) {
    var total = 0;
    for (var i = 0; i < frames.length; i++) total += frames[i].width * frames[i].height;
    var stride = Math.max(1, Math.floor(total / target));
    var out = [];
    for (var f = 0; f < frames.length; f++) {
      var d = frames[f].data;
      for (var p = 0; p < d.length / 4; p += stride) {
        out.push(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
      }
    }
    return new Uint8Array(out);
  }

  // A 15-bit RGB cube memo over the nearest-colour search: without it, a
  // 640x360 frame is 230k linear scans through 256 colours.
  function mapper(pal) {
    var n = pal.length / 3;
    var memo = new Int16Array(32768).fill(-1);
    return function (r, g, b) {
      var key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      var got = memo[key];
      if (got >= 0) return got;
      var best = 0, bd = 1e9;
      for (var i = 0; i < n; i++) {
        var dr = r - pal[i * 3], dg = g - pal[i * 3 + 1], db = b - pal[i * 3 + 2];
        var d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bd) { bd = d; best = i; }
      }
      memo[key] = best;
      return best;
    };
  }

  var BAYER = [
    [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]
  ];

  function quantise(frame, pal, map, dither) {
    var w = frame.width, h = frame.height, d = frame.data;
    var out = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var p = (y * w + x) * 4;
        var r = d[p], g = d[p + 1], b = d[p + 2];
        if (dither) {
          var t = (BAYER[y & 3][x & 3] / 16 - 0.5) * dither;
          r = r + t; g = g + t; b = b + t;
          r = r < 0 ? 0 : r > 255 ? 255 : r;
          g = g < 0 ? 0 : g > 255 ? 255 : g;
          b = b < 0 ? 0 : b > 255 ? 255 : b;
        }
        out[y * w + x] = map(r | 0, g | 0, b | 0);
      }
    }
    return out;
  }

  // ---- LZW -----------------------------------------------------------------
  function lzw(indices, minCode) {
    var out = [];
    var bits = 0, cur = 0;
    var clear = 1 << minCode, eoi = clear + 1;
    var size = minCode + 1, next = eoi + 1;
    var dict = new Map();

    function emit(code) {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; }
    }
    function reset() {
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    }

    emit(clear);
    reset();
    var prefix = indices[0];
    for (var i = 1; i < indices.length; i++) {
      var k = indices[i];
      var key = prefix * 4096 + k;
      var found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      emit(prefix);
      if (next < 4096) {
        dict.set(key, next++);
        if (next - 1 === (1 << size) && size < 12) size++;
      } else {
        emit(clear);
        reset();
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) out.push(cur & 255);
    return out;
  }

  // ---- the file ------------------------------------------------------------
  /*
   * frames: [{ data: Uint8ClampedArray RGBA, width, height }]
   * opts:   { delayCs, loop, colors, dither, onProgress }
   */
  G.encode = function (frames, opts) {
    opts = opts || {};
    var colors = Math.min(256, Math.max(8, opts.colors || 256));
    var delay = Math.max(2, opts.delayCs || 12);
    var w = frames[0].width, h = frames[0].height;
    var progress = opts.onProgress || function () {};

    progress(0.02, 'Choosing colours');
    var pal = buildPalette(sampleFrames(frames, 42000), colors);
    var map = mapper(pal);
    var bits = Math.max(2, Math.ceil(Math.log(pal.length / 3) / Math.LN2));
    var tableSize = 1 << bits;

    var bytes = [];
    function push() { for (var i = 0; i < arguments.length; i++) bytes.push(arguments[i] & 255); }
    function pushStr(s) { for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); }
    function push16(v) { bytes.push(v & 255, (v >> 8) & 255); }

    pushStr('GIF89a');
    push16(w); push16(h);
    push(0x80 | ((bits - 1) & 7));       // global colour table, its size
    push(0, 0);
    for (var i = 0; i < tableSize; i++) {
      push(pal[i * 3] || 0, pal[i * 3 + 1] || 0, pal[i * 3 + 2] || 0);
    }
    // NETSCAPE2.0 — the loop-forever block every viewer understands.
    push(0x21, 0xff, 11);
    pushStr('NETSCAPE2.0');
    push(3, 1);
    push16(opts.loop == null ? 0 : opts.loop);
    push(0);

    for (var f = 0; f < frames.length; f++) {
      progress(0.05 + 0.9 * (f / frames.length), 'Frame ' + (f + 1) + ' of ' + frames.length);
      var idx = quantise(frames[f], pal, map, opts.dither === false ? 0 : (opts.dither || 12));
      push(0x21, 0xf9, 4, 0x04);          // graphic control: dispose = background
      push16(delay);
      push(0, 0);
      push(0x2c);
      push16(0); push16(0); push16(w); push16(h);
      push(0);
      push(bits);
      var data = lzw(idx, bits);
      for (var p = 0; p < data.length; p += 255) {
        var chunk = data.slice(p, p + 255);
        push(chunk.length);
        for (var c = 0; c < chunk.length; c++) push(chunk[c]);
      }
      push(0);
    }
    push(0x3b);
    progress(1, 'Done');
    return new Uint8Array(bytes);
  };

  window.WVGif = G;
})();
