/* RAWGraphs visual models: map columns → SVG. Classic IIFE. No d3, no eval. */
(function (root) {
  'use strict';

  var PAL = ['#ff6b1a', '#3d8bfd', '#16a34a', '#eab308', '#a855f7', '#fb7185', '#0891b2', '#84cc16', '#f97316', '#6366f1', '#0d9488', '#e11d48'];
  var PAPER = '#fbf7f0';
  var INK = '#1c1917';
  var MUTED = '#78716c';
  var W = 960, H = 540;

  var CHARTS = [
    { id: 'alluvial', name: 'Alluvial diagram', cat: 'Flows', blurb: 'How the same rows regroup across categories.',
      dims: [
        { id: 'steps', label: 'Steps', types: ['string', 'number'], multiple: true, min: 2, required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false }
      ] },
    { id: 'barchart', name: 'Bar chart', cat: 'Correlations', blurb: 'A category and an amount. Bars grow sideways.',
      dims: [
        { id: 'bars', label: 'Bars', types: ['string', 'number'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: true },
        { id: 'color', label: 'Color', types: ['string', 'number'], required: false }
      ] },
    { id: 'stackedbar', name: 'Stacked bar', cat: 'Correlations', blurb: 'A category split into series.',
      dims: [
        { id: 'bars', label: 'Bars', types: ['string', 'number'], required: true },
        { id: 'series', label: 'Stacks', types: ['string', 'number'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: true }
      ] },
    { id: 'linechart', name: 'Line chart', cat: 'Time series', blurb: 'A value over an ordered axis, one line per series.',
      dims: [
        { id: 'x', label: 'X axis', types: ['number', 'string'], required: true },
        { id: 'y', label: 'Y axis', types: ['number'], required: true },
        { id: 'series', label: 'Series', types: ['string'], required: false }
      ] },
    { id: 'bubblechart', name: 'Bubble chart', cat: 'Dispersions', blurb: 'X, Y, and a size. Colour is optional.',
      dims: [
        { id: 'x', label: 'X axis', types: ['number'], required: true },
        { id: 'y', label: 'Y axis', types: ['number'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false },
        { id: 'color', label: 'Color', types: ['string', 'number'], required: false },
        { id: 'label', label: 'Label', types: ['string'], required: false }
      ] },
    { id: 'piechart', name: 'Pie chart', cat: 'Proportions', blurb: 'Parts of a whole.',
      dims: [
        { id: 'arcs', label: 'Arcs', types: ['string', 'number'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false }
      ] },
    { id: 'treemap', name: 'Treemap', cat: 'Hierarchies', blurb: 'Nested rectangles. Area is the amount.',
      dims: [
        { id: 'hierarchy', label: 'Hierarchy', types: ['string', 'number'], multiple: true, min: 1, required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false }
      ] },
    { id: 'circlepacking', name: 'Circle packing', cat: 'Hierarchies', blurb: 'Nested circles. Area is the amount.',
      dims: [
        { id: 'hierarchy', label: 'Hierarchy', types: ['string', 'number'], multiple: true, min: 1, required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false }
      ] },
    { id: 'sunburst', name: 'Sunburst', cat: 'Hierarchies', blurb: 'A hierarchy as rings.',
      dims: [
        { id: 'hierarchy', label: 'Hierarchy', types: ['string', 'number'], multiple: true, min: 1, required: true },
        { id: 'size', label: 'Size', types: ['number'], required: false }
      ] },
    { id: 'bumpchart', name: 'Bump chart', cat: 'Time series', blurb: 'Ranks over an ordered axis.',
      dims: [
        { id: 'x', label: 'X axis', types: ['string', 'number'], required: true },
        { id: 'series', label: 'Series', types: ['string'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: true }
      ] },
    { id: 'beeswarm', name: 'Beeswarm plot', cat: 'Distributions', blurb: 'Every row as a dot, packed so they do not overlap.',
      dims: [
        { id: 'x', label: 'X axis', types: ['number'], required: true },
        { id: 'group', label: 'Groups', types: ['string'], required: false },
        { id: 'color', label: 'Color', types: ['string'], required: false }
      ] },
    { id: 'streamgraph', name: 'Streamgraph', cat: 'Time series', blurb: 'Stacked series, centred.',
      dims: [
        { id: 'x', label: 'X axis', types: ['string', 'number'], required: true },
        { id: 'series', label: 'Series', types: ['string'], required: true },
        { id: 'size', label: 'Size', types: ['number'], required: true }
      ] }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v) {
    if (v == null || v === '') return 0;
    var n = +String(v).replace(/,/g, '');
    return isFinite(n) ? n : 0;
  }
  function str(v) { return v == null ? '' : String(v); }
  function fmt(n) {
    if (!isFinite(n)) return '';
    if (Math.abs(n) >= 1000) return (Math.round(n * 10) / 10).toLocaleString('en-US');
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }
  function colorKey(k) {
    var h = 2166136261;
    k = String(k);
    for (var i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
    return PAL[(h >>> 0) % PAL.length];
  }
  function colorI(i) { return PAL[((i % PAL.length) + PAL.length) % PAL.length]; }

  function group(rows, keys, sizeF) {
    var map = Object.create(null), order = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var kparts = [];
      var skip = false;
      for (var j = 0; j < keys.length; j++) {
        var v = str(r[keys[j]]);
        if (v === '') { skip = true; break; }
        kparts.push(v);
      }
      if (skip) continue;
      var k = kparts.join('\x1f');
      if (!map[k]) {
        map[k] = { keys: kparts, size: 0, n: 0 };
        order.push(map[k]);
      }
      map[k].size += sizeF ? num(r[sizeF]) : 1;
      map[k].n += 1;
    }
    return order;
  }

  function wrap(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h +
      '" width="100%" preserveAspectRatio="xMidYMid meet" role="img">' +
      '<rect width="' + w + '" height="' + h + '" fill="' + PAPER + '"/>' + body + '</svg>';
  }
  function ok(svg) { return { ok: true, svg: svg }; }
  function fail(msg) { return { ok: false, message: msg || 'Could not draw that.' }; }

  function need(mapping, dim) {
    var v = mapping[dim.id];
    if (dim.multiple) {
      var arr = Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
      var min = dim.min || 1;
      if (dim.required && arr.length < min) {
        return 'Map ' + (min > 1 ? min + ' ' + dim.label : dim.label) + '.';
      }
      return null;
    }
    if (dim.required && (v == null || v === '')) return 'Map ' + dim.label + '.';
    return null;
  }

  function scaleLinear(d0, d1, r0, r1) {
    var d = d1 - d0 || 1;
    return function (x) { return r0 + (x - d0) / d * (r1 - r0); };
  }

  function ticks(d0, d1, n) {
    if (!isFinite(d0) || !isFinite(d1)) return [];
    if (d0 === d1) return [d0];
    var span = d1 - d0;
    var step = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10));
    var err = n / (span / step);
    if (err <= 0.15) step *= 10;
    else if (err <= 0.35) step *= 5;
    else if (err <= 0.75) step *= 2;
    var t0 = Math.ceil(d0 / step) * step;
    var out = [];
    for (var v = t0; v <= d1 + step * 0.01; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  function nest(rows, fields, sizeF) {
    if (!fields.length) return [];
    var g = group(rows, [fields[0]], null);
    var rest = fields.slice(1);
    var nodes = [];
    for (var i = 0; i < g.length; i++) {
      var name = g[i].keys[0];
      var subset = [];
      for (var r = 0; r < rows.length; r++) if (str(rows[r][fields[0]]) === name) subset.push(rows[r]);
      var node = { name: name, kids: rest.length ? nest(subset, rest, sizeF) : [] };
      if (!node.kids.length) {
        var s = 0;
        for (var r = 0; r < subset.length; r++) s += sizeF ? num(subset[r][sizeF]) : 1;
        node.size = s;
      } else {
        var s2 = 0;
        for (var k = 0; k < node.kids.length; k++) s2 += node.kids[k].size;
        node.size = s2;
      }
      if (node.size > 0) nodes.push(node);
    }
    nodes.sort(function (a, b) { return b.size - a.size; });
    return nodes;
  }

  function squarify(items, x, y, w, h) {
    items = (items || []).filter(function (d) { return d.size > 0; }).slice()
      .sort(function (a, b) { return b.size - a.size; });
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += items[i].size;
    if (!total || w < 0.5 || h < 0.5) return;
    var scale = (w * h) / total;
    var row = [];
    var rect = { x: x, y: y, w: w, h: h };
    function worst(row, len) {
      var s = 0, mx = 0, mn = Infinity, a;
      for (var i = 0; i < row.length; i++) {
        a = row[i].size * scale;
        s += a; if (a > mx) mx = a; if (a < mn) mn = a;
      }
      if (!s || !len) return Infinity;
      return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
    }
    function layoutRow(row, rect) {
      var s = 0, i;
      for (i = 0; i < row.length; i++) s += row[i].size * scale;
      var vertical = rect.w <= rect.h;
      var x = rect.x, y = rect.y;
      if (vertical) {
        var hh = rect.w ? s / rect.w : 0;
        for (i = 0; i < row.length; i++) {
          var ww = hh ? (row[i].size * scale) / hh : 0;
          row[i].x = x; row[i].y = y; row[i].w = ww; row[i].h = hh;
          x += ww;
        }
        rect.y += hh; rect.h -= hh;
      } else {
        var ww = rect.h ? s / rect.h : 0;
        for (i = 0; i < row.length; i++) {
          var hh2 = ww ? (row[i].size * scale) / ww : 0;
          row[i].x = x; row[i].y = y; row[i].w = ww; row[i].h = hh2;
          y += hh2;
        }
        rect.x += ww; rect.w -= ww;
      }
    }
    var queue = items.slice();
    while (queue.length) {
      var item = queue.shift();
      var len = Math.min(rect.w, rect.h);
      if (!row.length || worst(row.concat([item]), len) <= worst(row, len)) row.push(item);
      else { layoutRow(row, rect); row = [item]; }
    }
    if (row.length) layoutRow(row, rect);
    for (i = 0; i < items.length; i++) {
      var n = items[i];
      if (n.kids && n.kids.length && n.w > 8 && n.h > 8) squarify(n.kids, n.x, n.y, n.w, n.h);
    }
  }

  function drawAlluvial(rows, mapping, opt) {
    var steps = mapping.steps || [];
    if (steps.length < 2) return fail('Map at least two Steps.');
    var sizeF = mapping.size;
    var m = { t: 32, r: 88, b: 16, l: 88 };
    var nodeW = 12;
    var n = steps.length;
    var innerW = opt.w - m.l - m.r;
    var innerH = opt.h - m.t - m.b;
    var gapX = n === 1 ? 0 : innerW / (n - 1);
    var nodes = [], nodeList = [];
    var s, i;
    for (s = 0; s < n; s++) {
      var g = group(rows, [steps[s]], sizeF);
      g.sort(function (a, b) { return b.size - a.size; });
      if (g.length > 16) g = g.slice(0, 16);
      var total = 0;
      for (i = 0; i < g.length; i++) total += g[i].size;
      if (!total) return fail('Size is zero for every row.');
      var pad = Math.min(6, innerH / Math.max(g.length, 1) * 0.12);
      var usable = innerH - pad * Math.max(0, g.length - 1);
      var y = m.t;
      var col = Object.create(null);
      for (i = 0; i < g.length; i++) {
        var hh = (g[i].size / total) * usable;
        var nd = { name: g[i].keys[0], size: g[i].size, y: y, h: hh, step: s, out: 0, inn: 0 };
        col[nd.name] = nd;
        nodeList.push(nd);
        y += hh + pad;
      }
      nodes.push(col);
    }
    var links = [];
    for (s = 0; s < n - 1; s++) {
      var g2 = group(rows, [steps[s], steps[s + 1]], sizeF);
      for (i = 0; i < g2.length; i++) {
        var a = nodes[s][g2[i].keys[0]];
        var b = nodes[s + 1][g2[i].keys[1]];
        if (!a || !b || g2[i].size <= 0) continue;
        links.push({ a: a, b: b, size: g2[i].size });
      }
    }
    links.sort(function (p, q) { return p.a.y - q.a.y || p.b.y - q.b.y; });
    var parts = [];
    for (s = 0; s < n; s++) {
      var x = m.l + s * gapX;
      parts.push('<text x="' + (x + nodeW / 2) + '" y="20" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(steps[s]) + '</text>');
    }
    for (i = 0; i < links.length; i++) {
      var L = links[i];
      var h0 = L.a.size ? (L.size / L.a.size) * L.a.h : 0;
      var h1 = L.b.size ? (L.size / L.b.size) * L.b.h : 0;
      var x0 = m.l + L.a.step * gapX + nodeW;
      var x1 = m.l + L.b.step * gapX;
      var y0 = L.a.y + L.a.out;
      var y1 = L.b.y + L.b.inn;
      L.a.out += h0;
      L.b.inn += h1;
      var mx = (x0 + x1) / 2;
      var d = 'M' + x0 + ',' + y0 + 'C' + mx + ',' + y0 + ' ' + mx + ',' + y1 + ' ' + x1 + ',' + y1 +
        'L' + x1 + ',' + (y1 + h1) + 'C' + mx + ',' + (y1 + h1) + ' ' + mx + ',' + (y0 + h0) + ' ' + x0 + ',' + (y0 + h0) + 'Z';
      parts.push('<path d="' + d + '" fill="' + colorKey(L.a.name) + '" fill-opacity="0.58"><title>' +
        esc(L.a.name + ' → ' + L.b.name + '  ' + fmt(L.size)) + '</title></path>');
    }
    for (i = 0; i < nodeList.length; i++) {
      var nd = nodeList[i];
      var x = m.l + nd.step * gapX;
      parts.push('<rect x="' + x + '" y="' + nd.y + '" width="' + nodeW + '" height="' + Math.max(nd.h, 0.8) + '" fill="' + INK + '" rx="1"/>');
      if (opt.labels !== false && nd.h > 9) {
        var first = nd.step === 0;
        var lx = first ? x - 6 : x + nodeW + 6;
        var anchor = first ? 'end' : 'start';
        parts.push('<text x="' + lx + '" y="' + (nd.y + nd.h / 2 + 3.5) + '" text-anchor="' + anchor +
          '" font-size="10" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(nd.name) + '</text>');
      }
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawBar(rows, mapping, opt) {
    var barsF = mapping.bars, sizeF = mapping.size, colorF = mapping.color;
    var g = group(rows, colorF ? [barsF, colorF] : [barsF], sizeF);
    var byBar = Object.create(null), order = [];
    for (var i = 0; i < g.length; i++) {
      var name = g[i].keys[0];
      if (!byBar[name]) { byBar[name] = { name: name, size: 0, parts: [] }; order.push(byBar[name]); }
      byBar[name].size += g[i].size;
      byBar[name].parts.push({ color: colorF ? g[i].keys[1] : name, size: g[i].size });
    }
    order.sort(function (a, b) { return b.size - a.size; });
    if (!order.length) return fail('No rows to plot.');
    if (order.length > 40) order = order.slice(0, 40);
    var max = 0;
    for (i = 0; i < order.length; i++) if (order[i].size > max) max = order[i].size;
    var m = { t: 20, r: 28, b: 28, l: 140 };
    var innerW = opt.w - m.l - m.r;
    var innerH = opt.h - m.t - m.b;
    var rowH = innerH / order.length;
    var barH = Math.min(22, rowH * 0.7);
    var x = scaleLinear(0, max, 0, innerW);
    var parts = [];
    var xt = ticks(0, max, 5);
    for (i = 0; i < xt.length; i++) {
      var px = m.l + x(xt[i]);
      parts.push('<line x1="' + px + '" y1="' + m.t + '" x2="' + px + '" y2="' + (opt.h - m.b) + '" stroke="#e7e0d6" stroke-width="1"/>');
      parts.push('<text x="' + px + '" y="' + (opt.h - 8) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(fmt(xt[i])) + '</text>');
    }
    for (i = 0; i < order.length; i++) {
      var y = m.t + i * rowH + (rowH - barH) / 2;
      var x0 = m.l, rest = order[i].parts;
      for (var j = 0; j < rest.length; j++) {
        var ww = x(rest[j].size);
        parts.push('<rect x="' + x0 + '" y="' + y + '" width="' + Math.max(ww, 0) + '" height="' + barH + '" fill="' + colorKey(rest[j].color) + '" rx="2"><title>' +
          esc(order[i].name + (colorF ? ' · ' + rest[j].color : '') + '  ' + fmt(rest[j].size)) + '</title></rect>');
        x0 += ww;
      }
      if (opt.labels !== false) {
        parts.push('<text x="' + (m.l - 8) + '" y="' + (y + barH / 2 + 3.5) + '" text-anchor="end" font-size="11" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(order[i].name) + '</text>');
      }
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawStacked(rows, mapping, opt) {
    var barsF = mapping.bars, serF = mapping.series, sizeF = mapping.size;
    var g = group(rows, [barsF, serF], sizeF);
    var seriesSet = [], seenS = Object.create(null);
    var barSet = [], seenB = Object.create(null);
    var cell = Object.create(null);
    for (var i = 0; i < g.length; i++) {
      var b = g[i].keys[0], s = g[i].keys[1];
      if (!seenB[b]) { seenB[b] = true; barSet.push(b); }
      if (!seenS[s]) { seenS[s] = true; seriesSet.push(s); }
      cell[b + '\x1f' + s] = g[i].size;
    }
    var totals = barSet.map(function (b) {
      var t = 0;
      for (var j = 0; j < seriesSet.length; j++) t += cell[b + '\x1f' + seriesSet[j]] || 0;
      return { name: b, size: t };
    });
    totals.sort(function (a, b) { return b.size - a.size; });
    if (totals.length > 24) totals = totals.slice(0, 24);
    var max = 0;
    for (i = 0; i < totals.length; i++) if (totals[i].size > max) max = totals[i].size;
    var m = { t: 20, r: 28, b: 36, l: 140 };
    var innerW = opt.w - m.l - m.r;
    var innerH = opt.h - m.t - m.b;
    var rowH = innerH / Math.max(totals.length, 1);
    var barH = Math.min(22, rowH * 0.7);
    var x = scaleLinear(0, max, 0, innerW);
    var parts = [];
    for (i = 0; i < totals.length; i++) {
      var y = m.t + i * rowH + (rowH - barH) / 2;
      var x0 = m.l;
      for (var j = 0; j < seriesSet.length; j++) {
        var v = cell[totals[i].name + '\x1f' + seriesSet[j]] || 0;
        if (!v) continue;
        var ww = x(v);
        parts.push('<rect x="' + x0 + '" y="' + y + '" width="' + ww + '" height="' + barH + '" fill="' + colorKey(seriesSet[j]) + '"><title>' +
          esc(totals[i].name + ' · ' + seriesSet[j] + '  ' + fmt(v)) + '</title></rect>');
        x0 += ww;
      }
      parts.push('<text x="' + (m.l - 8) + '" y="' + (y + barH / 2 + 3.5) + '" text-anchor="end" font-size="11" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(totals[i].name) + '</text>');
    }
    var lx = m.l;
    for (i = 0; i < seriesSet.length && i < 12; i++) {
      parts.push('<rect x="' + lx + '" y="' + (opt.h - 18) + '" width="10" height="10" fill="' + colorKey(seriesSet[i]) + '" rx="1"/>');
      parts.push('<text x="' + (lx + 14) + '" y="' + (opt.h - 9) + '" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(seriesSet[i]) + '</text>');
      lx += 14 + Math.min(esc(seriesSet[i]).length, 14) * 6 + 10;
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawLine(rows, mapping, opt) {
    var xF = mapping.x, yF = mapping.y, serF = mapping.series;
    var keys = serF ? [xF, serF] : [xF];
    var g = group(rows, keys, yF);
    var series = Object.create(null), names = [];
    var xs = [], seenX = Object.create(null);
    for (var i = 0; i < g.length; i++) {
      var xv = g[i].keys[0];
      var sn = serF ? g[i].keys[1] : 'value';
      if (!series[sn]) { series[sn] = Object.create(null); names.push(sn); }
      series[sn][xv] = (series[sn][xv] || 0) + g[i].size;
      if (!seenX[xv]) { seenX[xv] = true; xs.push(xv); }
    }
    var xNum = xs.every(function (v) { return isFinite(+v); });
    if (xNum) xs.sort(function (a, b) { return +a - +b; });
    else xs.sort();
    if (!xs.length) return fail('No rows to plot.');
    var ymin = Infinity, ymax = -Infinity;
    names.forEach(function (sn) {
      xs.forEach(function (x) {
        var v = series[sn][x];
        if (v == null) return;
        if (v < ymin) ymin = v;
        if (v > ymax) ymax = v;
      });
    });
    if (!isFinite(ymin)) return fail('Y axis has no numbers.');
    if (ymin > 0) ymin = 0;
    if (ymax === ymin) ymax = ymin + 1;
    var m = { t: 24, r: 24, b: 40, l: 52 };
    var x = xNum
      ? scaleLinear(+xs[0], +xs[xs.length - 1], m.l, opt.w - m.r)
      : function (v) { return m.l + (xs.indexOf(v) / Math.max(xs.length - 1, 1)) * (opt.w - m.l - m.r); };
    var y = scaleLinear(ymin, ymax, opt.h - m.b, m.t);
    var parts = [];
    var yt = ticks(ymin, ymax, 5);
    for (i = 0; i < yt.length; i++) {
      parts.push('<line x1="' + m.l + '" y1="' + y(yt[i]) + '" x2="' + (opt.w - m.r) + '" y2="' + y(yt[i]) + '" stroke="#e7e0d6"/>');
      parts.push('<text x="' + (m.l - 6) + '" y="' + (y(yt[i]) + 3) + '" text-anchor="end" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(fmt(yt[i])) + '</text>');
    }
    var step = xs.length > 12 ? Math.ceil(xs.length / 8) : 1;
    for (i = 0; i < xs.length; i += step) {
      parts.push('<text x="' + x(xNum ? +xs[i] : xs[i]) + '" y="' + (opt.h - 14) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(xs[i]) + '</text>');
    }
    for (var s = 0; s < names.length; s++) {
      var d = '', first = true, col = colorKey(names[s]);
      for (i = 0; i < xs.length; i++) {
        var v = series[names[s]][xs[i]];
        if (v == null) continue;
        var px = x(xNum ? +xs[i] : xs[i]), py = y(v);
        d += (first ? 'M' : 'L') + px + ',' + py;
        first = false;
        parts.push('<circle cx="' + px + '" cy="' + py + '" r="3" fill="' + col + '"><title>' + esc(names[s] + ' · ' + xs[i] + '  ' + fmt(v)) + '</title></circle>');
      }
      if (d) parts.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2"/>');
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawBubble(rows, mapping, opt) {
    var xF = mapping.x, yF = mapping.y, sizeF = mapping.size, colorF = mapping.color, labF = mapping.label;
    var pts = [];
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, smax = 0;
    for (var i = 0; i < rows.length; i++) {
      var xv = num(rows[i][xF]), yv = num(rows[i][yF]);
      if (!isFinite(xv) || !isFinite(yv)) continue;
      var sv = sizeF ? num(rows[i][sizeF]) : 1;
      pts.push({ x: xv, y: yv, s: sv, c: colorF ? str(rows[i][colorF]) : '', l: labF ? str(rows[i][labF]) : '' });
      if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
      if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
      if (sv > smax) smax = sv;
    }
    if (!pts.length) return fail('X and Y need numbers.');
    if (xmin === xmax) { xmin -= 1; xmax += 1; }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    var m = { t: 24, r: 24, b: 40, l: 52 };
    var x = scaleLinear(xmin, xmax, m.l, opt.w - m.r);
    var y = scaleLinear(ymin, ymax, opt.h - m.b, m.t);
    var parts = [];
    var xt = ticks(xmin, xmax, 6), yt = ticks(ymin, ymax, 5);
    for (i = 0; i < yt.length; i++) {
      parts.push('<line x1="' + m.l + '" y1="' + y(yt[i]) + '" x2="' + (opt.w - m.r) + '" y2="' + y(yt[i]) + '" stroke="#e7e0d6"/>');
      parts.push('<text x="' + (m.l - 6) + '" y="' + (y(yt[i]) + 3) + '" text-anchor="end" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(fmt(yt[i])) + '</text>');
    }
    for (i = 0; i < xt.length; i++) {
      parts.push('<text x="' + x(xt[i]) + '" y="' + (opt.h - 14) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(fmt(xt[i])) + '</text>');
    }
    for (i = 0; i < pts.length; i++) {
      var r = 5 + (smax ? Math.sqrt(pts[i].s / smax) * 18 : 0);
      var fill = colorF ? colorKey(pts[i].c) : colorI(0);
      parts.push('<circle cx="' + x(pts[i].x) + '" cy="' + y(pts[i].y) + '" r="' + r + '" fill="' + fill + '" fill-opacity="0.75" stroke="#fff" stroke-width="0.8"><title>' +
        esc((pts[i].l || pts[i].c || '') + '  ' + fmt(pts[i].x) + ', ' + fmt(pts[i].y)) + '</title></circle>');
      if (opt.labels && pts[i].l && r > 9) {
        parts.push('<text x="' + x(pts[i].x) + '" y="' + (y(pts[i].y) + 3) + '" text-anchor="middle" font-size="9" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(pts[i].l) + '</text>');
      }
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawPie(rows, mapping, opt) {
    var g = group(rows, [mapping.arcs], mapping.size);
    g.sort(function (a, b) { return b.size - a.size; });
    var total = 0;
    for (var i = 0; i < g.length; i++) total += g[i].size;
    if (!total) return fail('Size is zero for every row.');
    var cx = opt.w * 0.42, cy = opt.h / 2, R = Math.min(opt.w, opt.h) * 0.36;
    var a = -Math.PI / 2, parts = [];
    function pt(r, ang) { return (cx + r * Math.cos(ang)) + ',' + (cy + r * Math.sin(ang)); }
    for (i = 0; i < g.length; i++) {
      var da = (g[i].size / total) * Math.PI * 2;
      var a1 = a + da;
      var large = da > Math.PI ? 1 : 0;
      var d = 'M' + cx + ',' + cy + 'L' + pt(R, a) + 'A' + R + ',' + R + ' 0 ' + large + ' 1 ' + pt(R, a1) + 'Z';
      parts.push('<path d="' + d + '" fill="' + colorKey(g[i].keys[0]) + '" stroke="' + PAPER + '" stroke-width="1.5"><title>' +
        esc(g[i].keys[0] + '  ' + fmt(g[i].size)) + '</title></path>');
      if (opt.labels !== false && da > 0.18) {
        var mid = a + da / 2;
        parts.push('<text x="' + (cx + Math.cos(mid) * R * 0.62) + '" y="' + (cy + Math.sin(mid) * R * 0.62 + 4) +
          '" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif" fill="#fff">' + esc(g[i].keys[0]) + '</text>');
      }
      a = a1;
    }
    var ly = 28;
    for (i = 0; i < g.length && i < 14; i++) {
      parts.push('<rect x="' + (opt.w - 160) + '" y="' + ly + '" width="10" height="10" fill="' + colorKey(g[i].keys[0]) + '" rx="1"/>');
      parts.push('<text x="' + (opt.w - 144) + '" y="' + (ly + 9) + '" font-size="11" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(g[i].keys[0]) + '</text>');
      ly += 18;
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawTreemap(rows, mapping, opt) {
    var fields = mapping.hierarchy || [];
    if (!fields.length) return fail('Map Hierarchy.');
    var tree = nest(rows, fields, mapping.size);
    if (!tree.length) return fail('No rows to plot.');
    var m = 8;
    squarify(tree, m, m, opt.w - m * 2, opt.h - m * 2);
    var parts = [];
    function paint(nodes, depth) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.w < 1 || n.h < 1) continue;
        var leaf = !n.kids || !n.kids.length;
        if (leaf || depth === 0) {
          parts.push('<rect x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h +
            '" fill="' + colorKey(n.name) + '" fill-opacity="' + (leaf ? '0.92' : '0.35') +
            '" stroke="' + PAPER + '" stroke-width="1.5"><title>' + esc(n.name + '  ' + fmt(n.size)) + '</title></rect>');
        }
        if (opt.labels !== false && n.w > 36 && n.h > 18) {
          parts.push('<text x="' + (n.x + 6) + '" y="' + (n.y + 14) + '" font-size="11" font-family="system-ui,sans-serif" fill="' +
            (leaf ? '#fff' : INK) + '">' + esc(n.name) + '</text>');
        }
        if (n.kids && n.kids.length) paint(n.kids, depth + 1);
      }
    }
    paint(tree, 0);
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function packKids(kids, cx, cy, R) {
    if (!kids || !kids.length || R <= 1) return;
    var n = kids.length, i, total = 0;
    for (i = 0; i < n; i++) total += kids[i].size;
    if (n === 1) {
      kids[0].r = R * 0.86; kids[0].cx = cx; kids[0].cy = cy;
      packKids(kids[0].kids, cx, cy, kids[0].r);
      return;
    }
    var rs = [], sumR = 0;
    for (i = 0; i < n; i++) {
      rs[i] = Math.max(4, Math.sqrt(kids[i].size / total) * R * 0.78);
      sumR += rs[i];
    }
    var ang = -Math.PI / 2;
    for (i = 0; i < n; i++) {
      var slice = (rs[i] / sumR) * Math.PI * 2;
      ang += slice / 2;
      var dist = Math.max(0, R - rs[i] - 2) * 0.58;
      kids[i].r = rs[i];
      kids[i].cx = cx + Math.cos(ang) * dist;
      kids[i].cy = cy + Math.sin(ang) * dist;
      ang += slice / 2;
      packKids(kids[i].kids, kids[i].cx, kids[i].cy, kids[i].r);
    }
  }

  function drawPack(rows, mapping, opt) {
    var fields = mapping.hierarchy || [];
    if (!fields.length) return fail('Map Hierarchy.');
    var tree = nest(rows, fields, mapping.size);
    if (!tree.length) return fail('No rows to plot.');
    var cx = opt.w / 2, cy = opt.h / 2, R = Math.min(opt.w, opt.h) / 2 - 8;
    var root = { name: 'root', size: 0, kids: tree, cx: cx, cy: cy, r: R };
    for (var i = 0; i < tree.length; i++) root.size += tree[i].size;
    packKids(tree, cx, cy, R);
    var parts = [];
    function paint(nodes, depth) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!n.r) continue;
        parts.push('<circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + n.r + '" fill="' + colorKey(n.name) +
          '" fill-opacity="' + (n.kids && n.kids.length ? '0.22' : '0.88') + '" stroke="' + INK + '" stroke-opacity="0.25"><title>' +
          esc(n.name + '  ' + fmt(n.size)) + '</title></circle>');
        if (opt.labels !== false && n.r > 14 && (!n.kids || !n.kids.length)) {
          parts.push('<text x="' + n.cx + '" y="' + (n.cy + 4) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="#fff">' + esc(n.name) + '</text>');
        }
        if (n.kids && n.kids.length) paint(n.kids, depth + 1);
      }
    }
    paint(tree, 0);
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function annular(cx, cy, r0, r1, a0, a1, fill, title) {
    if (a1 - a0 < 0.002) return '';
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    function p(r, a) { return (cx + r * Math.cos(a)) + ',' + (cy + r * Math.sin(a)); }
    var d = 'M' + p(r0, a0) + 'L' + p(r1, a0) + 'A' + r1 + ',' + r1 + ' 0 ' + large + ' 1 ' + p(r1, a1) +
      'L' + p(r0, a1) + 'A' + r0 + ',' + r0 + ' 0 ' + large + ' 0 ' + p(r0, a0) + 'Z';
    return '<path d="' + d + '" fill="' + fill + '" stroke="' + PAPER + '" stroke-width="1"><title>' + esc(title) + '</title></path>';
  }

  function drawSunburst(rows, mapping, opt) {
    var fields = mapping.hierarchy || [];
    if (!fields.length) return fail('Map Hierarchy.');
    var tree = nest(rows, fields, mapping.size);
    if (!tree.length) return fail('No rows to plot.');
    var depth = fields.length;
    var cx = opt.w / 2, cy = opt.h / 2;
    var rMax = Math.min(opt.w, opt.h) / 2 - 8;
    var r0 = rMax * 0.18;
    var ring = (rMax - r0) / depth;
    var parts = [];
    function walk(nodes, a0, a1, d) {
      var total = 0, i;
      for (i = 0; i < nodes.length; i++) total += nodes[i].size;
      if (!total) return;
      var a = a0;
      for (i = 0; i < nodes.length; i++) {
        var da = (nodes[i].size / total) * (a1 - a0);
        var a2 = a + da;
        parts.push(annular(cx, cy, r0 + d * ring, r0 + (d + 1) * ring, a, a2, colorKey(nodes[i].name), nodes[i].name + '  ' + fmt(nodes[i].size)));
        if (opt.labels !== false && da > 0.22) {
          var mid = a + da / 2, rr = r0 + (d + 0.5) * ring;
          parts.push('<text x="' + (cx + Math.cos(mid) * rr) + '" y="' + (cy + Math.sin(mid) * rr + 3) +
            '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="#fff">' + esc(nodes[i].name) + '</text>');
        }
        if (nodes[i].kids && nodes[i].kids.length) walk(nodes[i].kids, a, a2, d + 1);
        a = a2;
      }
    }
    walk(tree, -Math.PI / 2, Math.PI * 1.5, 0);
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawBump(rows, mapping, opt) {
    var xF = mapping.x, serF = mapping.series, sizeF = mapping.size;
    var g = group(rows, [xF, serF], sizeF);
    var xs = [], seenX = Object.create(null);
    var series = Object.create(null), names = [];
    for (var i = 0; i < g.length; i++) {
      var xv = g[i].keys[0], sn = g[i].keys[1];
      if (!seenX[xv]) { seenX[xv] = true; xs.push(xv); }
      if (!series[sn]) { series[sn] = Object.create(null); names.push(sn); }
      series[sn][xv] = (series[sn][xv] || 0) + g[i].size;
    }
    var xNum = xs.every(function (v) { return isFinite(+v); });
    if (xNum) xs.sort(function (a, b) { return +a - +b; }); else xs.sort();
    var ranks = Object.create(null);
    var maxRank = 1;
    for (i = 0; i < xs.length; i++) {
      var list = names.map(function (sn) { return { sn: sn, v: series[sn][xs[i]] || 0 }; });
      list.sort(function (a, b) { return b.v - a.v; });
      ranks[xs[i]] = Object.create(null);
      for (var r = 0; r < list.length; r++) {
        ranks[xs[i]][list[r].sn] = r + 1;
        if (r + 1 > maxRank) maxRank = r + 1;
      }
    }
    var m = { t: 28, r: 96, b: 36, l: 36 };
    var x = function (v) { return m.l + (xs.indexOf(v) / Math.max(xs.length - 1, 1)) * (opt.w - m.l - m.r); };
    var y = scaleLinear(1, maxRank, m.t + 8, opt.h - m.b - 8);
    var parts = [];
    for (i = 0; i < xs.length; i++) {
      parts.push('<text x="' + x(xs[i]) + '" y="' + (opt.h - 14) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(xs[i]) + '</text>');
    }
    for (var s = 0; s < names.length; s++) {
      var d = '', col = colorKey(names[s]);
      for (i = 0; i < xs.length; i++) {
        var rk = ranks[xs[i]][names[s]];
        if (rk == null) continue;
        var px = x(xs[i]), py = y(rk);
        d += (d ? 'L' : 'M') + px + ',' + py;
        parts.push('<circle cx="' + px + '" cy="' + py + '" r="5" fill="' + col + '"><title>' + esc(names[s] + ' · ' + xs[i] + '  #' + rk) + '</title></circle>');
      }
      if (d) parts.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.4"/>');
      var last = xs[xs.length - 1];
      if (ranks[last][names[s]]) {
        parts.push('<text x="' + (x(last) + 10) + '" y="' + (y(ranks[last][names[s]]) + 4) + '" font-size="11" font-family="system-ui,sans-serif" fill="' + col + '">' + esc(names[s]) + '</text>');
      }
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawBeeswarm(rows, mapping, opt) {
    var xF = mapping.x, grpF = mapping.group, colorF = mapping.color;
    var pts = [];
    var xmin = Infinity, xmax = -Infinity;
    for (var i = 0; i < rows.length; i++) {
      var xv = num(rows[i][xF]);
      if (!isFinite(xv)) continue;
      pts.push({ x: xv, g: grpF ? str(rows[i][grpF]) : '', c: colorF ? str(rows[i][colorF]) : (grpF ? str(rows[i][grpF]) : '') });
      if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
    }
    if (!pts.length) return fail('X axis needs numbers.');
    if (xmin === xmax) { xmin -= 1; xmax += 1; }
    var groups = [];
    var seen = Object.create(null);
    for (i = 0; i < pts.length; i++) {
      var g = pts[i].g || 'all';
      if (!seen[g]) { seen[g] = true; groups.push(g); }
    }
    var m = { t: 24, r: 24, b: 40, l: 88 };
    var x = scaleLinear(xmin, xmax, m.l, opt.w - m.r);
    var band = (opt.h - m.t - m.b) / groups.length;
    var r = Math.max(3.2, Math.min(6, band / 10));
    var parts = [];
    var xt = ticks(xmin, xmax, 6);
    for (i = 0; i < xt.length; i++) {
      parts.push('<line x1="' + x(xt[i]) + '" y1="' + m.t + '" x2="' + x(xt[i]) + '" y2="' + (opt.h - m.b) + '" stroke="#e7e0d6"/>');
      parts.push('<text x="' + x(xt[i]) + '" y="' + (opt.h - 14) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(fmt(xt[i])) + '</text>');
    }
    for (var gi = 0; gi < groups.length; gi++) {
      var y0 = m.t + gi * band + band / 2;
      parts.push('<text x="' + (m.l - 8) + '" y="' + (y0 + 4) + '" text-anchor="end" font-size="11" font-family="system-ui,sans-serif" fill="' + INK + '">' + esc(groups[gi] === 'all' ? '' : groups[gi]) + '</text>');
      var subset = pts.filter(function (p) { return (p.g || 'all') === groups[gi]; });
      subset.sort(function (a, b) { return a.x - b.x; });
      var placed = [];
      for (i = 0; i < subset.length; i++) {
        var px = x(subset[i].x), py = y0, tries = 0, clash = true;
        while (clash && tries < 60) {
          clash = false;
          for (var j = 0; j < placed.length; j++) {
            var dx = px - placed[j].x, dy = py - placed[j].y;
            if (dx * dx + dy * dy < (r * 2.15) * (r * 2.15)) { clash = true; break; }
          }
          if (clash) {
            tries++;
            py = y0 + ((tries % 2) ? 1 : -1) * Math.ceil(tries / 2) * (r * 0.95);
          }
        }
        placed.push({ x: px, y: py });
        parts.push('<circle cx="' + px + '" cy="' + py + '" r="' + r + '" fill="' + colorKey(subset[i].c || groups[gi]) + '" fill-opacity="0.9"><title>' +
          esc((subset[i].c || groups[gi]) + '  ' + fmt(subset[i].x)) + '</title></circle>');
      }
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  function drawStream(rows, mapping, opt) {
    var xF = mapping.x, serF = mapping.series, sizeF = mapping.size;
    var g = group(rows, [xF, serF], sizeF);
    var xs = [], seenX = Object.create(null);
    var names = [], seenS = Object.create(null);
    var cell = Object.create(null);
    for (var i = 0; i < g.length; i++) {
      var xv = g[i].keys[0], sn = g[i].keys[1];
      if (!seenX[xv]) { seenX[xv] = true; xs.push(xv); }
      if (!seenS[sn]) { seenS[sn] = true; names.push(sn); }
      cell[xv + '\x1f' + sn] = (cell[xv + '\x1f' + sn] || 0) + g[i].size;
    }
    var xNum = xs.every(function (v) { return isFinite(+v); });
    if (xNum) xs.sort(function (a, b) { return +a - +b; }); else xs.sort();
    if (xs.length < 2) return fail('Need at least two X values.');
    var layers = names.map(function (sn) {
      return xs.map(function (x) { return cell[x + '\x1f' + sn] || 0; });
    });
    var nX = xs.length, nS = names.length;
    var y0 = [], y1 = [];
    var maxH = 0;
    for (i = 0; i < nX; i++) {
      var sum = 0;
      for (var s = 0; s < nS; s++) sum += layers[s][i];
      var acc = -sum / 2;
      y0[i] = []; y1[i] = [];
      for (s = 0; s < nS; s++) {
        y0[i][s] = acc;
        acc += layers[s][i];
        y1[i][s] = acc;
      }
      if (sum > maxH) maxH = sum;
    }
    if (!maxH) return fail('Size is zero for every row.');
    var m = { t: 24, r: 24, b: 40, l: 24 };
    var x = function (idx) { return m.l + idx / (nX - 1) * (opt.w - m.l - m.r); };
    var y = scaleLinear(-maxH / 2, maxH / 2, opt.h - m.b, m.t);
    function area(s) {
      var d = '';
      for (var i = 0; i < nX; i++) d += (i ? 'L' : 'M') + x(i) + ',' + y(y1[i][s]);
      for (i = nX - 1; i >= 0; i--) d += 'L' + x(i) + ',' + y(y0[i][s]);
      return d + 'Z';
    }
    var parts = [];
    for (s = 0; s < nS; s++) {
      parts.push('<path d="' + area(s) + '" fill="' + colorKey(names[s]) + '" fill-opacity="0.88"><title>' + esc(names[s]) + '</title></path>');
    }
    var step = nX > 12 ? Math.ceil(nX / 8) : 1;
    for (i = 0; i < nX; i += step) {
      parts.push('<text x="' + x(i) + '" y="' + (opt.h - 14) + '" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" fill="' + MUTED + '">' + esc(xs[i]) + '</text>');
    }
    return ok(wrap(opt.w, opt.h, parts.join('')));
  }

  var DRAW = {
    alluvial: drawAlluvial,
    barchart: drawBar,
    stackedbar: drawStacked,
    linechart: drawLine,
    bubblechart: drawBubble,
    piechart: drawPie,
    treemap: drawTreemap,
    circlepacking: drawPack,
    sunburst: drawSunburst,
    bumpchart: drawBump,
    beeswarm: drawBeeswarm,
    streamgraph: drawStream
  };

  function chartById(id) {
    for (var i = 0; i < CHARTS.length; i++) if (CHARTS[i].id === id) return CHARTS[i];
    return null;
  }

  function normalizeMapping(chart, mapping) {
    var out = {};
    (chart.dims || []).forEach(function (d) {
      var v = mapping && mapping[d.id];
      if (d.multiple) {
        if (Array.isArray(v)) out[d.id] = v.filter(Boolean);
        else if (v) out[d.id] = [v];
        else out[d.id] = [];
      } else out[d.id] = v || '';
    });
    return out;
  }

  function autoMap(chart, fields, types) {
    types = types || {};
    var strings = fields.filter(function (f) { return types[f] !== 'number'; });
    var numbers = fields.filter(function (f) { return types[f] === 'number'; });
    var si = 0, ni = 0, mapping = {};
    (chart.dims || []).forEach(function (d) {
      var takeNum = d.types && d.types.indexOf('number') >= 0 &&
        (d.id === 'size' || d.id === 'x' || d.id === 'y' || d.types.indexOf('string') < 0);
      if (d.multiple) {
        var pool = takeNum ? numbers : (strings.length ? strings : fields);
        var n = Math.max(d.min || 1, Math.min(3, pool.length || 1));
        var arr = pool.slice(0, n);
        if (takeNum) ni += arr.length; else si += arr.length;
        mapping[d.id] = arr;
      } else {
        var f = takeNum ? numbers[ni++] : strings[si++];
        if (!f) f = takeNum ? numbers[0] : (strings[0] || fields[0]);
        mapping[d.id] = f || '';
      }
    });
    return mapping;
  }

  function sampleMapping(chartId) {
    var m = {
      alluvial: { steps: ['origin', 'studio', 'genre'], size: '' },
      barchart: { bars: 'studio', size: 'box', color: 'genre' },
      stackedbar: { bars: 'year', series: 'genre', size: 'box' },
      linechart: { x: 'year', y: 'box', series: 'genre' },
      bubblechart: { x: 'budget', y: 'box', size: 'box', color: 'genre', label: 'title' },
      piechart: { arcs: 'genre', size: 'box' },
      treemap: { hierarchy: ['studio', 'genre'], size: 'box' },
      circlepacking: { hierarchy: ['origin', 'studio'], size: 'box' },
      sunburst: { hierarchy: ['origin', 'studio', 'genre'], size: 'box' },
      bumpchart: { x: 'year', series: 'genre', size: 'box' },
      beeswarm: { x: 'box', group: 'genre', color: 'genre' },
      streamgraph: { x: 'year', series: 'genre', size: 'box' }
    };
    return m[chartId] || null;
  }

  function drawChart(id, rows, mapping, opt) {
    opt = opt || {};
    opt.w = opt.w || W;
    opt.h = opt.h || H;
    if (opt.labels == null) opt.labels = true;
    var chart = chartById(id);
    if (!chart) return fail('Unknown chart.');
    if (!rows || !rows.length) return fail('Paste a table, choose a CSV, or load the sample.');
    var map = normalizeMapping(chart, mapping || {});
    for (var i = 0; i < chart.dims.length; i++) {
      var err = need(map, chart.dims[i]);
      if (err) return fail(err);
    }
    var fn = DRAW[id];
    if (!fn) return fail('That chart is not in this copy.');
    try {
      return fn(rows, map, opt);
    } catch (e) {
      return fail('Could not draw that.');
    }
  }

  root.RawCharts = {
    CHARTS: CHARTS,
    chartById: chartById,
    drawChart: drawChart,
    autoMap: autoMap,
    sampleMapping: sampleMapping,
    normalizeMapping: normalizeMapping
  };
}(typeof window !== 'undefined' ? window : globalThis));
