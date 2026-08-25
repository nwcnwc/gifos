/* chart.js — the four pictures, drawn as SVG, with nothing loud in them.
 *
 * Rules this file is built to, and will not break:
 *   - One y-axis. Ever. Two scales on one plot invent a correlation.
 *   - Thin marks, hairline grid, solid rules — never dashed. The data is the
 *     only thing allowed to be heavy.
 *   - A tooltip ENHANCES, it never gates: every number in a tooltip is also in
 *     the table twin under the chart, and keyboard focus shows what hover shows.
 *   - Labels are set with textContent. A scenario name is user text.
 *   - Colour never carries meaning alone: the worst run is red AND labelled AND
 *     the only dashed-free 2px line in a field of washes.
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // ---- formatting -----------------------------------------------------------

  function money(n) {
    var s = n < 0 ? '-' : '';
    n = Math.abs(Math.round(n));
    return s + '$' + n.toLocaleString('en-US');
  }

  // Axis ticks and hero figures get the short form; tables and tooltips get the
  // whole number. A reader comparing two rows needs the digits.
  function compact(n) {
    var s = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 1e9) return s + '$' + trim(n / 1e9) + 'B';
    if (n >= 1e6) return s + '$' + trim(n / 1e6) + 'M';
    if (n >= 1e3) return s + '$' + trim(n / 1e3) + 'k';
    return s + '$' + Math.round(n);
  }
  function trim(x) {
    return (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(x % 1 ? 1 : 0) : x.toFixed(x * 10 % 10 ? 2 : 1))
      .replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
  }
  function pct(x, dp) {
    return (x * 100).toFixed(dp === undefined ? 0 : dp) + '%';
  }

  // ---- scales ---------------------------------------------------------------

  // Round to numbers a person reads without effort: 1, 2, 5 and their decades.
  function niceStep(raw) {
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }
  function ticks(lo, hi, count) {
    if (!(hi > lo)) return [lo];
    var step = niceStep((hi - lo) / Math.max(1, count));
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
      out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return out;
  }

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---- the shared frame -----------------------------------------------------
  //
  // Every chart is a plot box with a hairline grid, an axis band that is part of
  // the height (never a nested scrollbar), and one hover layer.

  function Frame(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.pad = this.opts.pad || { t: 14, r: 14, b: 26, l: 52 };
    host.classList.add('chart-host');
    this.svg = el('svg', { class: 'chart', role: 'img', tabindex: '0' });
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip';
    this.tip.setAttribute('role', 'status');
    host.appendChild(this.svg);
    host.appendChild(this.tip);
  }

  Frame.prototype.size = function () {
    var r = this.host.getBoundingClientRect();
    this.w = Math.max(220, Math.round(r.width));
    this.h = Math.max(120, Math.round(this.opts.height || r.height || 220));
    this.svg.setAttribute('width', this.w);
    this.svg.setAttribute('height', this.h);
    this.svg.setAttribute('viewBox', '0 0 ' + this.w + ' ' + this.h);
    this.pl = this.pad.l; this.pr = this.w - this.pad.r;
    this.pt = this.pad.t; this.pb = this.h - this.pad.b;
    return this;
  };

  Frame.prototype.clear = function () {
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    return this;
  };

  Frame.prototype.x = function (v) {
    var d = this.xhi - this.xlo || 1;
    return this.pl + (v - this.xlo) / d * (this.pr - this.pl);
  };
  Frame.prototype.y = function (v) {
    var d = this.yhi - this.ylo || 1;
    return this.pb - (v - this.ylo) / d * (this.pb - this.pt);
  };
  Frame.prototype.xInv = function (px) {
    var d = this.xhi - this.xlo || 1;
    return this.xlo + (px - this.pl) / ((this.pr - this.pl) || 1) * d;
  };

  /* Grid, axis rules and tick labels. Solid hairlines one step off the surface;
   * the y ticks carry every value the chart does not directly label. */
  Frame.prototype.grid = function (xt, yt, fmtX, fmtY) {
    var g = el('g', { class: 'grid' });
    var i, v;
    for (i = 0; i < yt.length; i++) {
      v = yt[i];
      var yy = this.y(v);
      g.appendChild(el('line', { x1: this.pl, x2: this.pr, y1: yy, y2: yy, class: v === 0 ? 'rule-zero' : 'rule' }));
      g.appendChild(el('text', { x: this.pl - 8, y: yy + 4, class: 'tick tick-y' }, fmtY(v)));
    }
    for (i = 0; i < xt.length; i++) {
      v = xt[i];
      var xx = this.x(v);
      g.appendChild(el('text', { x: xx, y: this.h - 8, class: 'tick tick-x' }, fmtX(v)));
    }
    g.appendChild(el('line', { x1: this.pl, x2: this.pr, y1: this.pb, y2: this.pb, class: 'axis' }));
    this.svg.appendChild(g);
    return this;
  };

  function path(pts, close) {
    var d = '', i;
    for (i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
    return d + (close ? 'Z' : '');
  }

  /* The hover layer. A vertical hairline snaps to the nearest x index, so the
   * reader aims at an age and never at a 2px line, and the same readout appears
   * on keyboard focus with the arrow keys.
   */
  Frame.prototype.hover = function (n, onIndex) {
    var self = this;
    var line = el('line', { class: 'crosshair', y1: this.pt, y2: this.pb, x1: -99, x2: -99 });
    this.svg.appendChild(line);
    var hit = el('rect', {
      x: this.pl, y: this.pt, width: Math.max(1, this.pr - this.pl),
      height: Math.max(1, this.pb - this.pt), fill: 'transparent', class: 'hit'
    });
    this.svg.appendChild(hit);
    this.idx = -1;

    function show(i) {
      if (i < 0 || i >= n) return hide();
      self.idx = i;
      var xx = self.x(self.xAt ? self.xAt(i) : i);
      line.setAttribute('x1', xx); line.setAttribute('x2', xx);
      line.classList.add('on');
      var r = onIndex(i);
      if (!r) return hide();
      self.tip.textContent = '';
      self.tip.appendChild(r);
      self.tip.classList.add('on');
      var tw = self.tip.offsetWidth || 160;
      var left = xx + 14;
      if (left + tw > self.w - 4) left = xx - tw - 14;
      if (left < 4) left = 4;
      self.tip.style.left = left + 'px';
      self.tip.style.top = Math.max(4, self.pt) + 'px';
    }
    function hide() {
      self.idx = -1;
      line.classList.remove('on');
      self.tip.classList.remove('on');
    }
    function at(ev) {
      var r = self.svg.getBoundingClientRect();
      var v = self.xInv(ev.clientX - r.left);
      show(self.nearest ? self.nearest(v) : Math.round(v));
    }
    hit.addEventListener('pointermove', at);
    hit.addEventListener('pointerdown', at);
    this.svg.addEventListener('pointerleave', hide);
    this.svg.addEventListener('blur', hide);
    this.svg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show(self.idx < 0 ? 0 : Math.min(n - 1, self.idx + 1)); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { show(self.idx < 0 ? n - 1 : Math.max(0, self.idx - 1)); e.preventDefault(); }
      else if (e.key === 'Escape') hide();
    });
    this.showIndex = show;
    return this;
  };

  function row(label, value, colour, strong) {
    var d = document.createElement('div');
    d.className = 'tip-row' + (strong ? ' strong' : '');
    if (colour) {
      var k = document.createElement('i');
      k.className = 'tip-key';
      k.style.background = colour;
      d.appendChild(k);
    }
    var l = document.createElement('span');
    l.className = 'tip-label';
    l.textContent = label;
    var v = document.createElement('b');
    v.textContent = value;
    d.appendChild(l); d.appendChild(v);
    return d;
  }
  function tipBox(title) {
    var d = document.createElement('div');
    var h = document.createElement('div');
    h.className = 'tip-head';
    h.textContent = title;
    d.appendChild(h);
    return d;
  }

  // ---- 1. the fan ----------------------------------------------------------
  //
  // Every retirement history could have handed you, drawn at once. Bands are one
  // hue at two washes (this is ONE series with uncertainty, not five series), the
  // median is the only ordinary line, and the single run that went worst is the
  // red one — emphasis, because that run is the whole question.

  function fan(host, spec) {
    var f = new Frame(host, { height: spec.height, pad: spec.pad });
    f.size().clear();
    var bands = spec.bands, n = bands.length;
    if (!n) return f;
    var age0 = spec.startAge;

    var hi = 0, i, j;
    for (i = 0; i < n; i++) if (bands[i][4] > hi) hi = bands[i][4];
    if (spec.worst) for (i = 0; i < spec.worst.length; i++) if (spec.worst[i] > hi) hi = spec.worst[i];
    f.xlo = age0; f.xhi = age0 + n - 1;
    f.ylo = 0; f.yhi = hi > 0 ? hi * 1.06 : 1;
    f.xAt = function (i) { return age0 + i; };
    f.nearest = function (v) { return Math.max(0, Math.min(n - 1, Math.round(v - age0))); };

    var yt = ticks(0, f.yhi, 4);
    f.yhi = Math.max(f.yhi, yt[yt.length - 1]);
    f.grid(ticks(f.xlo, f.xhi, 6), yt, function (v) { return Math.round(v); }, compact);

    // Retirement: a solid rule and a word, so the two halves of the plan are
    // visibly different places.
    if (spec.retireAge !== undefined && spec.retireAge > age0 && spec.retireAge < age0 + n - 1) {
      var rx = f.x(spec.retireAge);
      f.svg.appendChild(el('line', { x1: rx, x2: rx, y1: f.pt, y2: f.pb, class: 'marker' }));
      f.svg.appendChild(el('text', { x: rx + 5, y: f.pt + 11, class: 'marker-label' }, spec.retireLabel || 'retire'));
    }

    function band(loI, hiI, cls) {
      var up = [], dn = [];
      for (i = 0; i < n; i++) { up.push([f.x(age0 + i), f.y(bands[i][hiI])]); }
      for (i = n - 1; i >= 0; i--) { dn.push([f.x(age0 + i), f.y(bands[i][loI])]); }
      f.svg.appendChild(el('path', { d: path(up.concat(dn), true), class: cls }));
    }
    band(0, 4, 'band band-outer');
    band(1, 3, 'band band-inner');

    var mid = [];
    for (i = 0; i < n; i++) mid.push([f.x(age0 + i), f.y(bands[i][2])]);
    f.svg.appendChild(el('path', { d: path(mid), class: 'line line-median' }));

    if (spec.worst) {
      var w = [];
      for (i = 0; i < spec.worst.length && i < n; i++) w.push([f.x(age0 + i), f.y(spec.worst[i])]);
      f.svg.appendChild(el('path', { d: path(w), class: 'line line-worst' }));
    }
    if (spec.compare) {
      var c = [];
      for (i = 0; i < spec.compare.length && i < n; i++) c.push([f.x(age0 + i), f.y(spec.compare[i])]);
      f.svg.appendChild(el('path', { d: path(c), class: 'line line-compare' }));
    }

    var money0 = spec.money || compact;
    f.hover(n, function (i) {
      var b = bands[i];
      var t = tipBox('Age ' + (age0 + i));
      t.appendChild(row('Best 5%', money0(b[4]), null));
      t.appendChild(row('Typical', money0(b[2]), spec.colours.median, true));
      t.appendChild(row('Worst 5%', money0(b[0]), null));
      if (spec.worst && spec.worst[i] !== undefined) {
        t.appendChild(row(spec.worstLabel || 'Worst ever', money0(spec.worst[i]), spec.colours.worst));
      }
      return t;
    });
    return f;
  }

  // ---- 2. the price of certainty -------------------------------------------
  //
  // Success against spending. One line, one dot where the reader is standing,
  // and a solid rule at the bar they said they wanted. This is the chart that
  // turns "will it work" into "here is what another thousand a year costs".

  function curve(host, spec) {
    var f = new Frame(host, { height: spec.height, pad: spec.pad || { t: 14, r: 14, b: 30, l: 44 } });
    f.size().clear();
    var pts = spec.points, n = pts.length;
    if (!n) return f;
    f.xlo = pts[0].spend; f.xhi = pts[n - 1].spend;
    f.ylo = 0; f.yhi = 1;
    f.xAt = function (i) { return pts[i].spend; };
    f.nearest = function (v) {
      var bi = 0, bd = Infinity;
      for (var i = 0; i < n; i++) { var d = Math.abs(pts[i].spend - v); if (d < bd) { bd = d; bi = i; } }
      return bi;
    };
    f.grid(ticks(f.xlo, f.xhi, 4), [0, 0.25, 0.5, 0.75, 1],
      compact, function (v) { return pct(v); });

    if (spec.target) {
      var ty = f.y(spec.target);
      f.svg.appendChild(el('line', { x1: f.pl, x2: f.pr, y1: ty, y2: ty, class: 'marker' }));
      f.svg.appendChild(el('text', { x: f.pr - 4, y: ty - 6, class: 'marker-label end' },
        pct(spec.target) + ' target'));
    }

    var line = [], area = [];
    for (var i = 0; i < n; i++) line.push([f.x(pts[i].spend), f.y(pts[i].success)]);
    area = line.concat([[f.x(pts[n - 1].spend), f.y(0)], [f.x(pts[0].spend), f.y(0)]]);
    f.svg.appendChild(el('path', { d: path(area, true), class: 'band band-inner' }));
    f.svg.appendChild(el('path', { d: path(line), class: 'line line-median' }));

    // Where the reader is standing right now, labelled directly — the one point
    // on this chart that is about them.
    if (spec.at !== undefined && spec.at >= f.xlo && spec.at <= f.xhi) {
      var k = f.nearest(spec.at);
      var cx = f.x(pts[k].spend), cy = f.y(pts[k].success);
      f.svg.appendChild(el('circle', { cx: cx, cy: cy, r: 5, class: 'dot dot-now' }));
      var lab = el('text', { x: cx, y: cy - 12, class: 'point-label' }, pct(pts[k].success));
      lab.setAttribute('text-anchor', cx > (f.pl + f.pr) / 2 ? 'end' : 'start');
      lab.setAttribute('x', cx + (cx > (f.pl + f.pr) / 2 ? -8 : 8));
      f.svg.appendChild(lab);
    }

    f.hover(n, function (i) {
      var t = tipBox(money(pts[i].spend) + ' a year');
      t.appendChild(row('Worked in', pct(pts[i].success, 1) + ' of history', spec.colours.median, true));
      return t;
    });
    return f;
  }

  // ---- 3. where the money comes from ---------------------------------------
  //
  // A stacked area of the paycheck's sources, year by year. Stacks are an
  // adjacent form, so the categorical order is safe — and every segment is
  // separated by surface, never by a stroke.

  function stack(host, spec) {
    var f = new Frame(host, { height: spec.height, pad: spec.pad });
    f.size().clear();
    var series = spec.series, n = spec.years, age0 = spec.startAge;
    if (!n || !series.length) return f;

    var totals = new Array(n), i, s;
    for (i = 0; i < n; i++) {
      totals[i] = 0;
      for (s = 0; s < series.length; s++) totals[i] += series[s].values[i] || 0;
    }
    var hi = 0;
    for (i = 0; i < n; i++) if (totals[i] > hi) hi = totals[i];
    f.xlo = age0; f.xhi = age0 + n - 1;
    f.ylo = 0; f.yhi = hi > 0 ? hi * 1.08 : 1;
    f.xAt = function (i) { return age0 + i; };
    f.nearest = function (v) { return Math.max(0, Math.min(n - 1, Math.round(v - age0))); };
    var yt = ticks(0, f.yhi, 4);
    f.yhi = Math.max(f.yhi, yt[yt.length - 1]);
    f.grid(ticks(f.xlo, f.xhi, 6), yt, function (v) { return Math.round(v); }, compact);

    // Draw top-down so the 2px surface gap between layers is cut by the layer
    // above it — white doing the separating, no borders anywhere.
    var acc = new Float64Array(n);
    var layers = [];
    for (s = 0; s < series.length; s++) {
      var lo = [], up = [];
      for (i = 0; i < n; i++) {
        lo.push([f.x(age0 + i), f.y(acc[i])]);
        acc[i] += series[s].values[i] || 0;
        up.push([f.x(age0 + i), f.y(acc[i])]);
      }
      lo.reverse();
      layers.push({ d: path(up.concat(lo), true), fill: series[s].colour });
    }
    for (s = layers.length - 1; s >= 0; s--) {
      f.svg.appendChild(el('path', { d: layers[s].d, fill: layers[s].fill, class: 'stack-layer' }));
    }
    if (spec.line) {
      var ln = [];
      for (i = 0; i < n; i++) ln.push([f.x(age0 + i), f.y(spec.line.values[i] || 0)]);
      f.svg.appendChild(el('path', { d: path(ln), class: 'line line-over' }));
    }

    f.hover(n, function (i) {
      var t = tipBox('Age ' + (age0 + i));
      for (var s2 = series.length - 1; s2 >= 0; s2--) {
        if (!series[s2].values[i]) continue;
        t.appendChild(row(series[s2].label, money(series[s2].values[i]), series[s2].colour));
      }
      t.appendChild(row('Total', money(totals[i]), null, true));
      return t;
    });
    return f;
  }

  // ---- 4. the table twin ----------------------------------------------------
  //
  // Every chart has one. It is the WCAG-clean equivalent and the place a number
  // lives when a label would not fit — nothing here is reachable only by hover.

  function table(host, cols, rows) {
    host.textContent = '';
    var t = document.createElement('table');
    t.className = 'data-table';
    var thead = document.createElement('thead');
    var tr = document.createElement('tr');
    for (var c = 0; c < cols.length; c++) {
      var th = document.createElement('th');
      th.textContent = cols[c];
      if (c) th.className = 'num';
      tr.appendChild(th);
    }
    thead.appendChild(tr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    for (var r = 0; r < rows.length; r++) {
      var rr = document.createElement('tr');
      for (var k = 0; k < rows[r].length; k++) {
        var td = document.createElement('td');
        td.textContent = rows[r][k];
        if (k) td.className = 'num';
        rr.appendChild(td);
      }
      tb.appendChild(rr);
    }
    t.appendChild(tb);
    host.appendChild(t);
    return t;
  }

  /* A legend is always present for two or more series — the identity channel
   * that does not depend on anyone's colour vision. */
  function legend(host, items) {
    host.textContent = '';
    for (var i = 0; i < items.length; i++) {
      var s = document.createElement('span');
      s.className = 'legend-item';
      var k = document.createElement('i');
      k.className = 'legend-key' + (items[i].line ? ' line' : '');
      k.style.background = items[i].colour;
      var l = document.createElement('span');
      l.textContent = items[i].label;
      s.appendChild(k); s.appendChild(l);
      host.appendChild(s);
    }
    return host;
  }

  root.Charts = {
    fan: fan, curve: curve, stack: stack, table: table, legend: legend,
    money: money, compact: compact, pct: pct, ticks: ticks, niceStep: niceStep
  };
}(typeof window !== 'undefined' ? window : this));
