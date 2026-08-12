/*
 * The OCR engine — three ONNX models, run on this device, with every step of
 * the classic PP-OCR pipeline reimplemented in plain JavaScript because the
 * sandbox has no OpenCV and no network to fetch one.
 *
 *   1. DETECTION (DBNet, en_PP-OCRv3_det)   image -> per-pixel text probability
 *      -> threshold -> connected components -> min-area rectangle per blob ->
 *      "unclip" (grow the box back out, since DB shrinks its targets) -> quads.
 *   2. RECOGNITION (SVTR-LCNet, en_PP-OCRv3_rec)   one crop per quad, resized to
 *      height 48 -> [1, T, 97] logits -> CTC greedy decode over the charset
 *      ['blank'] + en_dict(95) + [' '].
 *   3. TABLE STRUCTURE (SLANet, en_ppstructure_mobile_v2.0)   the whole page at
 *      488x488 -> 501 decode steps of (30-way token, 4-value box) -> the HTML
 *      token stream <tr><td>…, which lays out into a real row/column grid with
 *      spans. Recognized text is then matched into cells by box overlap.
 *
 * Every class count here is asserted against the model files at build time
 * (build.mjs), so a swapped model cannot silently decode as garbage: the rec
 * head is 97-wide and the structure head is 30-wide, exactly.
 *
 * Nothing in this file touches the network or the DOM beyond a canvas.
 */
(function () {
  'use strict';

  // ---- image plumbing -------------------------------------------------------
  // Everything downstream works on {data: Uint8ClampedArray RGBA, width, height}
  // — an ImageData, or anything shaped like one.

  // Bilinear resize into a planar, normalized CHW Float32Array — the layout
  // every one of these models wants. `mean`/`std` are per-channel and applied
  // after scaling to 0..1, matching PaddleOCR's NormalizeImage.
  function toTensorCHW(img, dstW, dstH, mean, std) {
    var out = new Float32Array(3 * dstH * dstW);
    var sx = img.width / dstW, sy = img.height / dstH;
    var plane = dstH * dstW;
    for (var y = 0; y < dstH; y++) {
      // Sample at pixel centres, which keeps a downscale from drifting half a
      // pixel toward the origin (that shift is visible on 8px-tall text).
      var fy = (y + 0.5) * sy - 0.5;
      var y0 = Math.floor(fy), wy = fy - y0;
      if (y0 < 0) { y0 = 0; wy = 0; }
      var y1 = y0 + 1; if (y1 > img.height - 1) { y1 = img.height - 1; if (y0 > y1) y0 = y1; }
      for (var x = 0; x < dstW; x++) {
        var fx = (x + 0.5) * sx - 0.5;
        var x0 = Math.floor(fx), wx = fx - x0;
        if (x0 < 0) { x0 = 0; wx = 0; }
        var x1 = x0 + 1; if (x1 > img.width - 1) { x1 = img.width - 1; if (x0 > x1) x0 = x1; }
        var o00 = (y0 * img.width + x0) * 4, o01 = (y0 * img.width + x1) * 4;
        var o10 = (y1 * img.width + x0) * 4, o11 = (y1 * img.width + x1) * 4;
        var d = img.data, di = y * dstW + x;
        for (var c = 0; c < 3; c++) {
          var top = d[o00 + c] + (d[o01 + c] - d[o00 + c]) * wx;
          var bot = d[o10 + c] + (d[o11 + c] - d[o10 + c]) * wx;
          out[c * plane + di] = ((top + (bot - top) * wy) / 255 - mean[c]) / std[c];
        }
      }
    }
    return out;
  }

  var IMAGENET_MEAN = [0.485, 0.456, 0.406];
  var IMAGENET_STD = [0.229, 0.224, 0.225];

  // ---- 1. detection: DBNet post-processing ----------------------------------
  // The model emits a shrunk probability map. Getting boxes out of it is four
  // steps, all of them plain array work.

  // Connected components over the binarized map, 4-connected, iterative flood
  // fill (a recursive one blows the stack on a full page of text).
  function components(bin, w, h, minArea) {
    var label = new Int32Array(w * h);
    var out = [];
    var stack = new Int32Array(w * h);
    var next = 1;
    for (var i = 0; i < w * h; i++) {
      if (!bin[i] || label[i]) continue;
      var id = next++, sp = 0, px = [];
      stack[sp++] = i; label[i] = id;
      var minX = w, minY = h, maxX = -1, maxY = -1;
      while (sp) {
        var p = stack[--sp];
        var y = (p / w) | 0, x = p - y * w;
        px.push(p);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x > 0 && bin[p - 1] && !label[p - 1]) { label[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !label[p + 1]) { label[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !label[p - w]) { label[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !label[p + w]) { label[p + w] = id; stack[sp++] = p + w; }
      }
      if (px.length >= minArea) out.push({ px: px, minX: minX, minY: minY, maxX: maxX, maxY: maxY });
    }
    return out;
  }

  // Convex hull (monotone chain) of a component's boundary, then the minimum-
  // area enclosing rectangle by rotating calipers. This is the one piece people
  // reach for OpenCV to do; it is 40 lines.
  function hull(points) {
    var pts = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lower = [];
    for (var i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    var upper = [];
    for (var j = pts.length - 1; j >= 0; j--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[j]) <= 0) upper.pop();
      upper.push(pts[j]);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // Returns {cx, cy, w, h, angle} — angle in radians, the rectangle's own axis.
  function minAreaRect(points) {
    var hl = hull(points);
    if (hl.length < 2) {
      var p = hl[0] || [0, 0];
      return { cx: p[0], cy: p[1], w: 1, h: 1, angle: 0 };
    }
    var best = null;
    for (var i = 0; i < hl.length; i++) {
      var a = hl[i], b = hl[(i + 1) % hl.length];
      var ex = b[0] - a[0], ey = b[1] - a[1];
      var len = Math.hypot(ex, ey);
      if (len < 1e-9) continue;
      var ux = ex / len, uy = ey / len;     // edge direction
      var minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      for (var k = 0; k < hl.length; k++) {
        var u = hl[k][0] * ux + hl[k][1] * uy;
        var v = -hl[k][0] * uy + hl[k][1] * ux;
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
      }
      var wid = maxU - minU, hei = maxV - minV, area = wid * hei;
      if (!best || area < best.area) {
        var mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
        best = {
          area: area, w: wid, h: hei, angle: Math.atan2(uy, ux),
          cx: mu * ux - mv * uy, cy: mu * uy + mv * ux
        };
      }
    }
    return best || { cx: 0, cy: 0, w: 1, h: 1, angle: 0 };
  }

  // A rectangle has FOUR equivalent (angle, w, h) descriptions, and rotating
  // calipers returns whichever edge happened to minimize the area — so the same
  // blob can come back rotated 90 or 180 degrees. Left alone, that hands the
  // recognizer an upside-down crop, which it reads as a plausible wrong word
  // ("Company" came back as "Coonony", the only low-confidence box on the page).
  // Fold the angle into (-45deg, 45deg], swapping w/h when the 90-degree step is
  // taken, so `w` is always the near-horizontal axis and corner 0 is the
  // top-left. Adding a half turn maps the rect onto itself, which is what makes
  // reducing modulo 180 degrees safe here.
  function normalizeRect(r) {
    var a = r.angle, w = r.w, h = r.h, t;
    var PI = Math.PI;
    a = a - PI * Math.floor(a / PI + 0.5);          // -> (-PI/2, PI/2]
    if (a > PI / 4) { a -= PI / 2; t = w; w = h; h = t; }
    else if (a <= -PI / 4) { a += PI / 2; t = w; w = h; h = t; }
    return { cx: r.cx, cy: r.cy, w: w, h: h, angle: a };
  }

  function rectCorners(r, grow) {
    var g = grow || 0;
    var hw = r.w / 2 + g, hh = r.h / 2 + g;
    var c = Math.cos(r.angle), s = Math.sin(r.angle);
    var pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(function (p) { return [r.cx + p[0] * c - p[1] * s, r.cy + p[0] * s + p[1] * c]; });
  }

  // Mean probability inside the component — DB's own box score. Cheap version:
  // average over the component's pixels rather than the filled polygon, which is
  // what the pixels ARE.
  function compScore(prob, comp) {
    var s = 0;
    for (var i = 0; i < comp.px.length; i++) s += prob[comp.px[i]];
    return s / comp.px.length;
  }

  var DET = {
    limitSide: 960,       // longest side fed to the detector, then rounded to /32
    thresh: 0.3,          // binarize the probability map here
    boxThresh: 0.55,      // drop a box whose mean probability is below this
    unclip: 1.5,          // grow the shrunk box back out (DBPostProcess's default)
    minArea: 6
  };

  // The detector's input side must be a multiple of 32 (five 2x downsamples).
  function detSize(w, h) {
    var r = Math.min(DET.limitSide / Math.max(w, h), 1);   // never upscale
    var dw = Math.max(32, Math.round(w * r / 32) * 32);
    var dh = Math.max(32, Math.round(h * r / 32) * 32);
    return { w: dw, h: dh };
  }

  function detect(sess, img, opts) {
    var o = opts || {};
    var size = detSize(img.width, img.height);
    var input = toTensorCHW(img, size.w, size.h, IMAGENET_MEAN, IMAGENET_STD);
    var feeds = {};
    feeds[sess.inputNames[0]] = new window.ort.Tensor('float32', input, [1, 3, size.h, size.w]);
    return sess.run(feeds).then(function (res) {
      var out = res[sess.outputNames[0]];
      var ph = out.dims[2], pw = out.dims[3];
      var prob = out.data;
      var bin = new Uint8Array(pw * ph);
      for (var i = 0; i < bin.length; i++) bin[i] = prob[i] > DET.thresh ? 1 : 0;
      var comps = components(bin, pw, ph, DET.minArea);
      // Map the probability-map grid back onto the ORIGINAL image.
      var kx = img.width / pw, ky = img.height / ph;
      var boxes = [];
      for (var c = 0; c < comps.length; c++) {
        var comp = comps[c];
        var score = compScore(prob, comp);
        if (score < DET.boxThresh) continue;
        var pts = [];
        for (var k = 0; k < comp.px.length; k++) {
          var p = comp.px[k], y = (p / pw) | 0, x = p - y * pw;
          pts.push([x, y]);
        }
        var rect = normalizeRect(minAreaRect(pts));
        var short = Math.min(rect.w, rect.h);
        if (short < 1.5) continue;
        // DB shrinks its training targets, so every predicted blob is smaller
        // than the ink. Grow it back by area*ratio/perimeter — the standard
        // unclip distance, without needing a polygon-offset library.
        var area = rect.w * rect.h, peri = 2 * (rect.w + rect.h);
        var grow = area * DET.unclip / Math.max(peri, 1e-6);
        var quad = rectCorners(rect, grow).map(function (p) {
          return [p[0] * kx, p[1] * ky];
        });
        boxes.push({ quad: quad, score: score });
      }
      // Reading order: top-to-bottom, then left-to-right, with a row tolerance
      // so a slightly-higher neighbour does not jump the queue.
      boxes.forEach(function (b) {
        var xs = b.quad.map(function (p) { return p[0]; }), ys = b.quad.map(function (p) { return p[1]; });
        b.x0 = Math.min.apply(null, xs); b.x1 = Math.max.apply(null, xs);
        b.y0 = Math.min.apply(null, ys); b.y1 = Math.max.apply(null, ys);
        b.h = b.y1 - b.y0; b.w = b.x1 - b.x0;
      });
      boxes = boxes.filter(function (b) { return b.w >= 2 && b.h >= 4; });
      var medH = boxes.length ? boxes.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; })[boxes.length >> 1] : 10;
      boxes.sort(function (a, b) {
        if (Math.abs(a.y0 - b.y0) > medH * 0.5) return a.y0 - b.y0;
        return a.x0 - b.x0;
      });
      if (o.max && boxes.length > o.max) {
        boxes = boxes.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, o.max)
          .sort(function (a, b) { return (Math.abs(a.y0 - b.y0) > medH * 0.5) ? a.y0 - b.y0 : a.x0 - b.x0; });
      }
      return { boxes: boxes, mapW: pw, mapH: ph };
    });
  }

  // ---- crop a (possibly rotated) quad out of the page ----------------------
  // PP-OCR's get_rotate_crop_image, done with a bilinear sample along the quad's
  // own axes. Text taller than it is wide is a vertical column — rotate it so the
  // recognizer, which only ever reads left-to-right, sees a line.
  function cropQuad(img, quad, outH) {
    var d = function (a, b) { return Math.hypot(quad[a][0] - quad[b][0], quad[a][1] - quad[b][1]); };
    var wTop = d(0, 1), wBot = d(3, 2), hLeft = d(0, 3), hRight = d(1, 2);
    var cw = Math.max(wTop, wBot), ch = Math.max(hLeft, hRight);
    var rotate = ch > cw * 1.5;
    if (rotate) { var t = cw; cw = ch; ch = t; }
    var h = outH, w = Math.max(4, Math.round(cw * outH / Math.max(ch, 1e-6)));
    var out = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        // Bilinear position inside the quad. (u,v) in 0..1 across the quad's
        // top->bottom / left->right edges.
        var u = (x + 0.5) / w, v = (y + 0.5) / h;
        var a = u, b = v;
        if (rotate) { a = v; b = 1 - u; }   // read a vertical line bottom-to-top
        var topX = quad[0][0] + (quad[1][0] - quad[0][0]) * a;
        var topY = quad[0][1] + (quad[1][1] - quad[0][1]) * a;
        var botX = quad[3][0] + (quad[2][0] - quad[3][0]) * a;
        var botY = quad[3][1] + (quad[2][1] - quad[3][1]) * a;
        var fx = topX + (botX - topX) * b, fy = topY + (botY - topY) * b;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var wx = fx - x0, wy = fy - y0;
        var cx0 = Math.min(Math.max(x0, 0), img.width - 1), cx1 = Math.min(Math.max(x0 + 1, 0), img.width - 1);
        var cy0 = Math.min(Math.max(y0, 0), img.height - 1), cy1 = Math.min(Math.max(y0 + 1, 0), img.height - 1);
        var o00 = (cy0 * img.width + cx0) * 4, o01 = (cy0 * img.width + cx1) * 4;
        var o10 = (cy1 * img.width + cx0) * 4, o11 = (cy1 * img.width + cx1) * 4;
        var oo = (y * w + x) * 4;
        for (var c = 0; c < 3; c++) {
          var tp = img.data[o00 + c] + (img.data[o01 + c] - img.data[o00 + c]) * wx;
          var bt = img.data[o10 + c] + (img.data[o11 + c] - img.data[o10 + c]) * wx;
          out.data[oo + c] = tp + (bt - tp) * wy;
        }
        out.data[oo + 3] = 255;
      }
    }
    return out;
  }

  // ---- 2. recognition: CTC greedy decode ----------------------------------
  var REC_H = 48, REC_MAX_W = 480;

  // The charset is ['blank'] + en_dict + [' '] — PaddleOCR's CTCLabelDecode with
  // use_space_char. en_dict is 95 entries, so the head is 97 wide; build.mjs
  // asserts that against the model file.
  function buildCharset(dictText) {
    var lines = dictText.split('\n').map(function (l) { return l.replace(/\r$/, ''); });
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return [''].concat(lines).concat([' ']);   // index 0 is CTC blank, never emitted
  }

  function recognize(sess, img, quads, charset, onProgress) {
    var results = [];
    // One crop per call. Batching would want a shared padded width and this runs
    // on a GPU where the per-call overhead is small next to the convolutions.
    var step = function (i) {
      if (i >= quads.length) return Promise.resolve(results);
      if (onProgress && (i % 4 === 0)) onProgress(i, quads.length);
      var crop = cropQuad(img, quads[i].quad, REC_H);
      var w = Math.min(REC_MAX_W, Math.max(16, crop.width));
      var input = toTensorCHW(crop, w, REC_H, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
      var feeds = {};
      feeds[sess.inputNames[0]] = new window.ort.Tensor('float32', input, [1, 3, REC_H, w]);
      return sess.run(feeds).then(function (res) {
        var out = res[sess.outputNames[0]];
        var T = out.dims[1], C = out.dims[2], p = out.data;
        var text = '', conf = 0, n = 0, prev = -1;
        for (var t = 0; t < T; t++) {
          var best = 0, bv = -Infinity, base = t * C;
          for (var c = 0; c < C; c++) { var v = p[base + c]; if (v > bv) { bv = v; best = c; } }
          if (best !== 0 && best !== prev) {           // CTC: skip blank and repeats
            text += charset[best] || '';
            conf += bv; n++;
          }
          prev = best;
        }
        results.push({ box: quads[i], text: text, conf: n ? conf / n : 0 });
        return step(i + 1);
      });
    };
    return step(0);
  }

  // ---- 3. table structure: SLANet ------------------------------------------
  var TABLE_SIDE = 488;

  // ['sos'] + dict + ['eos'] — 30 classes, asserted at build time.
  //
  // The dictionary file is NOT the model's vocabulary as written. This SLANet was
  // exported with merge_no_span_structure on (its own inference.yml says so),
  // and PaddleOCR's TableLabelDecode applies that to the dictionary before
  // indexing: it REMOVES '<td>' and APPENDS the merged empty-cell token
  // '<td></td>' at the end. The count is unchanged, so a wrong mapping here is
  // silent — every index past '<td>' shifts by one and the model's output reads
  // as fluent nonsense. (Before this was fixed, a clean 4x3 table decoded as
  // '<thead><tr> rowspan="10" rowspan="10" rowspan="10"</td>…' — plausible
  // enough to look like a model that could not see the table, when in fact it
  // saw it perfectly.)
  function buildStructureTokens(dictText) {
    var lines = dictText.split('\n').map(function (l) { return l.replace(/\r$/, ''); });
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    var merged = lines.filter(function (l) { return l !== '<td>'; });
    merged.push('<td></td>');
    return ['<sos>'].concat(merged).concat(['<eos>']);
  }

  // Resize so the LONGEST side is 488, then pad to a 488x488 square. The padding
  // goes in AFTER normalization (PaddingTableImage sits after NormalizeImage in
  // the model's own inference.yml), so the pad value is a normalized 0 — not a
  // black pixel.
  function tableInput(img) {
    var r = TABLE_SIDE / Math.max(img.width, img.height);
    var rw = Math.max(1, Math.round(img.width * r)), rh = Math.max(1, Math.round(img.height * r));
    var small = toTensorCHW(img, rw, rh, IMAGENET_MEAN, IMAGENET_STD);
    var out = new Float32Array(3 * TABLE_SIDE * TABLE_SIDE);   // zero = the pad
    var dstPlane = TABLE_SIDE * TABLE_SIDE, srcPlane = rw * rh;
    for (var c = 0; c < 3; c++) {
      for (var y = 0; y < rh; y++) {
        out.set(small.subarray(c * srcPlane + y * rw, c * srcPlane + (y + 1) * rw), c * dstPlane + y * TABLE_SIDE);
      }
    }
    return out;
  }

  function tableStructure(sess, img, tokens) {
    var feeds = {};
    feeds[sess.inputNames[0]] = new window.ort.Tensor('float32', tableInput(img), [1, 3, TABLE_SIDE, TABLE_SIDE]);
    return sess.run(feeds).then(function (res) {
      // Two heads: a [1,501,30] token distribution and a [1,501,4] box. Pick
      // them apart by their last dimension, not by output order.
      var probs = null, locs = null;
      sess.outputNames.forEach(function (n) {
        var t = res[n];
        if (t.dims[t.dims.length - 1] === tokens.length) probs = t;
        else if (t.dims[t.dims.length - 1] === 4) locs = t;
      });
      if (!probs || !locs) throw new Error('The table model returned an unexpected shape.');
      var steps = probs.dims[1], C = probs.dims[2], p = probs.data, L = locs.data;
      var seq = [];
      for (var t2 = 0; t2 < steps; t2++) {
        var best = 0, bv = -Infinity, base = t2 * C;
        for (var c = 0; c < C; c++) { var v = p[base + c]; if (v > bv) { bv = v; best = c; } }
        var tok = tokens[best];
        if (tok === '<eos>') break;
        if (tok === '<sos>') continue;
        // The box for this step, denormalized straight onto the ORIGINAL image:
        // the training targets were normalized by the pre-resize size, so the
        // 488x488 padding needs no compensation here.
        seq.push({
          token: tok,
          box: [L[t2 * 4] * img.width, L[t2 * 4 + 1] * img.height, L[t2 * 4 + 2] * img.width, L[t2 * 4 + 3] * img.height]
        });
      }
      return seq;
    });
  }

  // Turn the <tr>/<td> token stream into a real grid, honouring colspan and
  // rowspan the way an HTML table lays out: a spanning cell reserves the cells
  // below and to the right of it, so later cells step over the hole.
  function structureToCells(seq) {
    var cells = [];
    var occupied = {};                     // "r,c" -> true
    var r = -1, col = 0;
    var pending = null;                    // a <td ... > being assembled
    var free = function (row, c, cs, rs) {
      for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) if (occupied[(row + i) + ',' + (c + j)]) return false;
      return true;
    };
    var place = function (cell) {
      while (!free(r, col, cell.colspan, cell.rowspan)) col++;
      cell.row = r; cell.col = col;
      for (var i = 0; i < cell.rowspan; i++) for (var j = 0; j < cell.colspan; j++) occupied[(r + i) + ',' + (col + j)] = true;
      col += cell.colspan;
      cells.push(cell);
    };
    for (var i = 0; i < seq.length; i++) {
      var tok = seq[i].token;
      if (tok === '<tr>') { r++; col = 0; continue; }
      if (tok === '</tr>' || tok === '<thead>' || tok === '</thead>' || tok === '<tbody>' || tok === '</tbody>') continue;
      // '<td></td>' is the merged single token for an unspanned cell (see
      // buildStructureTokens); '<td>' is its unmerged form, kept for a model
      // exported without merge_no_span_structure.
      if (tok === '<td></td>' || tok === '<td>') {
        if (r < 0) { r = 0; col = 0; }
        place({ colspan: 1, rowspan: 1, box: seq[i].box, text: [] });
        continue;
      }
      if (tok === '<td') { pending = { colspan: 1, rowspan: 1, box: seq[i].box, text: [] }; continue; }
      if (pending) {
        var m = /(col|row)span="(\d+)"/.exec(tok);
        if (m) pending[m[1] + 'span'] = Math.max(1, Math.min(30, parseInt(m[2], 10)));
        if (tok === '>') { if (r < 0) { r = 0; col = 0; } place(pending); pending = null; }
      }
    }
    return cells;
  }

  // ---- matching recognized text into cells ---------------------------------
  function overlap(a, b) {
    var w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
    var h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    return (w > 0 && h > 0) ? w * h : 0;
  }

  function fillCells(cells, texts) {
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (!t.text) continue;
      var tb = [t.box.x0, t.box.y0, t.box.x1, t.box.y1];
      var area = Math.max(1, (tb[2] - tb[0]) * (tb[3] - tb[1]));
      var best = -1, bestScore = 0;
      for (var c = 0; c < cells.length; c++) {
        var ov = overlap(tb, cells[c].box) / area;   // fraction of the TEXT covered
        if (ov > bestScore) { bestScore = ov; best = c; }
      }
      if (best >= 0 && bestScore > 0.3) cells[best].text.push(t);
    }
    return cells.map(function (c) {
      // Within a cell, read top-to-bottom then left-to-right.
      c.text.sort(function (a, b) {
        var dy = a.box.y0 - b.box.y0;
        if (Math.abs(dy) > Math.max(a.box.h, b.box.h) * 0.5) return dy;
        return a.box.x0 - b.box.x0;
      });
      c.value = c.text.map(function (t) { return t.text; }).join(' ').trim();
      return c;
    });
  }

  function cellsToGrid(cells) {
    var rows = 0, cols = 0;
    cells.forEach(function (c) {
      rows = Math.max(rows, c.row + c.rowspan);
      cols = Math.max(cols, c.col + c.colspan);
    });
    if (!rows || !cols) return { grid: [], rows: 0, cols: 0 };
    var grid = [];
    for (var r = 0; r < rows; r++) grid.push(new Array(cols).fill(''));
    cells.forEach(function (c) {
      // A merged cell's value belongs in its top-left; repeating it across the
      // span would invent data the page does not contain.
      if (c.row < rows && c.col < cols) grid[c.row][c.col] = c.value || '';
    });
    return { grid: grid, rows: rows, cols: cols };
  }

  // ---- geometric fallback --------------------------------------------------
  // When the structure model finds no usable grid — a page of prose, a form, a
  // table whose rules it could not see — fall back to the SAME row/column
  // clustering the born-digital path uses, driven by the OCR boxes instead of
  // PDF text runs. Honest second best, and for a clean scan it is often right.
  function geometricGrid(texts) {
    var items = texts.filter(function (t) { return t.text && t.text.trim(); });
    if (!items.length) return { grid: [], rows: 0, cols: 0 };
    var hs = items.map(function (t) { return t.box.h; }).sort(function (a, b) { return a - b; });
    var medH = hs[hs.length >> 1] || 10;
    var yTol = medH * 0.6;

    var rows = [];
    items.slice().sort(function (a, b) { return a.box.y0 - b.box.y0; }).forEach(function (t) {
      var r = rows.length ? rows[rows.length - 1] : null;
      var cy = (t.box.y0 + t.box.y1) / 2;
      if (r && Math.abs(r.y - cy) <= yTol) { r.items.push(t); r.y = (r.y * (r.items.length - 1) + cy) / r.items.length; }
      else rows.push({ y: cy, items: [t] });
    });

    // Column anchors from the left edges that recur down the page.
    var gap = medH * 1.2;
    var xs = items.map(function (t) { return t.box.x0; }).sort(function (a, b) { return a - b; });
    var anchors = [];
    xs.forEach(function (x) {
      if (!anchors.length || x - anchors[anchors.length - 1] > gap) anchors.push(x);
      else anchors[anchors.length - 1] = (anchors[anchors.length - 1] + x) / 2;
    });
    var nearest = function (x) {
      var bi = 0, bd = Infinity;
      for (var i = 0; i < anchors.length; i++) { var d = Math.abs(anchors[i] - x); if (d < bd) { bd = d; bi = i; } }
      return bi;
    };
    var grid = rows.map(function (r) {
      var cells = new Array(anchors.length).fill('');
      r.items.slice().sort(function (a, b) { return a.box.x0 - b.box.x0; }).forEach(function (t) {
        var c = nearest(t.box.x0);
        cells[c] = cells[c] ? cells[c] + ' ' + t.text : t.text;
      });
      return cells;
    }).filter(function (row) { return row.some(function (c) { return String(c).trim(); }); });
    return { grid: grid, rows: grid.length, cols: anchors.length };
  }

  window.GifOcr = {
    detect: detect,
    recognize: recognize,
    tableStructure: tableStructure,
    structureToCells: structureToCells,
    fillCells: fillCells,
    cellsToGrid: cellsToGrid,
    geometricGrid: geometricGrid,
    buildCharset: buildCharset,
    buildStructureTokens: buildStructureTokens,
    cropQuad: cropQuad,
    // exported for the guard: these are the invariants a swapped model breaks
    _internals: { minAreaRect: minAreaRect, normalizeRect: normalizeRect, hull: hull, components: components, toTensorCHW: toTensorCHW, DET: DET }
  };
})();
