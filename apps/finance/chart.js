/* chart.js — two charts, drawn as SVG strings.
 *
 * SVG rather than canvas because these are small, static, and want to be
 * crisp on a phone at whatever pixel ratio it has without anybody managing a
 * backing store. Both return markup; the caller sets innerHTML on a container
 * it owns and nothing here touches the document.
 *
 * Colours come in as CSS values so one theme switch moves both charts.
 */
(function (root) {
  'use strict';

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };
  function money(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(Math.round(n));
  }

  /* Net worth over time. Points are DATED, not evenly spaced — snapshots
   * happen when the user opens the app, which is not a schedule. Plotting them
   * evenly would draw a straight climb through a six-month gap and a cliff
   * through a busy week; the x axis is real time. */
  function netWorthChart(snaps, opts) {
    opts = opts || {};
    var W = opts.width || 640, H = opts.height || 200, P = { l: 46, r: 10, t: 12, b: 22 };
    if (!snaps || snaps.length < 2) return '';
    var pts = snaps.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date);
    var span = Math.max(1, t1 - t0);
    var vals = pts.map(function (p) { return p.total; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    // Always include zero when the line crosses it — a net worth chart that
    // hides the axis makes -2,000 and +2,000 look like the same kind of year.
    if (lo > 0 && lo < hi * 0.6) lo = 0;
    if (hi < 0) hi = 0;
    if (hi === lo) { hi = lo + 1; }
    var x = function (d) { return P.l + (Date.parse(d) - t0) / span * (W - P.l - P.r); };
    var y = function (v) { return P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b); };
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.total).toFixed(1); }).join(' ');
    var area = line + ' L' + x(pts[pts.length - 1].date).toFixed(1) + ' ' + y(Math.max(lo, 0)).toFixed(1) +
      ' L' + x(pts[0].date).toFixed(1) + ' ' + y(Math.max(lo, 0)).toFixed(1) + ' Z';
    var ticks = [lo, lo + (hi - lo) / 2, hi].map(function (v) {
      return '<line x1="' + P.l + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - P.r) + '" y2="' + y(v).toFixed(1) + '" class="grid"/>' +
        '<text x="' + (P.l - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" class="ylab">' + esc(money(v)) + '</text>';
    }).join('');
    var zero = (lo < 0 && hi > 0) ? '<line x1="' + P.l + '" y1="' + y(0).toFixed(1) + '" x2="' + (W - P.r) + '" y2="' + y(0).toFixed(1) + '" class="zero"/>' : '';
    var dots = pts.map(function (p) {
      return '<circle cx="' + x(p.date).toFixed(1) + '" cy="' + y(p.total).toFixed(1) + '" r="2.5" class="dot"><title>' +
        esc(p.date + ' — ' + Math.round(p.total).toLocaleString('en-US')) + '</title></circle>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="Net worth over time">' +
      ticks + zero + '<path d="' + area + '" class="area"/><path d="' + line + '" class="line"/>' + dots +
      '<text x="' + P.l + '" y="' + (H - 6) + '" class="xlab">' + esc(pts[0].date) + '</text>' +
      '<text x="' + (W - P.r) + '" y="' + (H - 6) + '" class="xlab end">' + esc(pts[pts.length - 1].date) + '</text>' +
      '</svg>';
  }

  /* Income and spending, one pair of bars a month, on a shared baseline so the
   * gap between them IS the saving. Partial months are drawn hatched rather
   * than dropped: leaving them out makes the chart look like the data stops,
   * and drawing them plain makes a half-imported month look like a frugal one.
   */
  function monthBars(months, opts) {
    opts = opts || {};
    var W = opts.width || 640, H = opts.height || 200, P = { l: 46, r: 10, t: 12, b: 26 };
    if (!months || !months.length) return '';
    var ms = months.slice(-18);
    var hi = Math.max.apply(null, ms.map(function (m) { return Math.max(m.income, m.spend); }));
    if (!(hi > 0)) hi = 1;
    var iw = (W - P.l - P.r) / ms.length, bw = Math.max(2, iw * 0.34);
    var y = function (v) { return P.t + (1 - v / hi) * (H - P.t - P.b); };
    var grid = [0, hi / 2, hi].map(function (v) {
      return '<line x1="' + P.l + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - P.r) + '" y2="' + y(v).toFixed(1) + '" class="grid"/>' +
        '<text x="' + (P.l - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" class="ylab">' + esc(money(v)) + '</text>';
    }).join('');
    var base = H - P.b;
    var bars = ms.map(function (m, i) {
      var cx = P.l + i * iw + iw / 2;
      var hatch = m.partial ? ' partial' : '';
      var lab = m.month.slice(2).replace('-', '/');
      return '<rect x="' + (cx - bw - 1).toFixed(1) + '" y="' + y(m.income).toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + Math.max(0, base - y(m.income)).toFixed(1) + '" class="bar in' + hatch + '"><title>' +
          esc(m.month + ' in ' + Math.round(m.income).toLocaleString('en-US') + (m.partial ? ' (part month)' : '')) + '</title></rect>' +
        '<rect x="' + (cx + 1).toFixed(1) + '" y="' + y(m.spend).toFixed(1) + '" width="' + bw.toFixed(1) +
          '" height="' + Math.max(0, base - y(m.spend)).toFixed(1) + '" class="bar out' + hatch + '"><title>' +
          esc(m.month + ' out ' + Math.round(m.spend).toLocaleString('en-US') + (m.partial ? ' (part month)' : '')) + '</title></rect>' +
        (ms.length <= 14 || i % 2 === 0 ? '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" class="xlab mid">' + esc(lab) + '</text>' : '');
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="Money in and out each month">' +
      '<defs><pattern id="hatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="4" stroke-width="2" class="hatchline"/></pattern></defs>' +
      grid + bars + '<line x1="' + P.l + '" y1="' + base + '" x2="' + (W - P.r) + '" y2="' + base + '" class="axis"/></svg>';
  }

  /* What the net worth is MADE of. A stacked bar rather than a pie: the four
   * groups are of wildly different sizes and a pie of them is unreadable at
   * phone width, where this app mostly lives. */
  function groupBar(byGroup, groups, opts) {
    opts = opts || {};
    var total = groups.reduce(function (a, g) { return a + (byGroup[g] || 0); }, 0);
    if (!(total > 0)) return '';
    var x = 0;
    var segs = groups.map(function (g, i) {
      var v = byGroup[g] || 0;
      if (!v) return '';
      var w = v / total * 100;
      var s = '<div class="seg g' + i + '" style="width:' + w.toFixed(2) + '%" title="' + esc(g + ' ' + Math.round(v).toLocaleString('en-US')) + '"></div>';
      x += w; return s;
    }).join('');
    var keys = groups.filter(function (g) { return byGroup[g]; }).map(function (g, i) {
      var idx = groups.indexOf(g);
      return '<span class="key"><i class="g' + idx + '"></i>' + esc(g) + ' <b>' + esc(Math.round(byGroup[g]).toLocaleString('en-US')) + '</b></span>';
    }).join('');
    return '<div class="stack">' + segs + '</div><div class="keys">' + keys + '</div>';
  }

  root.FinChart = { netWorthChart: netWorthChart, monthBars: monthBars, groupBar: groupBar, money: money };
})(typeof window !== 'undefined' ? window : this);
