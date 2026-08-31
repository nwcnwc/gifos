/*
 * Tracer engine — records visualization commands the way tracers.js does,
 * then splits them on Tracer.delay() into playback chunks.
 *
 * API is the Algorithm Visualizer surface: Array1DTracer, Array2DTracer,
 * ChartTracer, GraphTracer, LogTracer, Layout, VerticalLayout,
 * HorizontalLayout, Randomize. Commands are cloned so a later mutation of
 * the algorithm's own array cannot rewrite a recorded frame.
 */
(function (root) {
  'use strict';

  var commands = [];
  var tracers = [];
  var nextId = 0;
  var rootLayout = null;
  var rngState = 1;

  function clone(v) {
    if (Array.isArray(v)) {
      var a = new Array(v.length);
      for (var i = 0; i < v.length; i++) a[i] = clone(v[i]);
      return a;
    }
    if (v && typeof v === 'object') {
      var o = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = clone(v[k]);
      return o;
    }
    return v;
  }

  function cmd(key, method, args) {
    commands.push({ key: key, method: method, args: clone(args || []) });
  }

  function Tracer(title) {
    this.title = title || '';
    this.key = 't' + (nextId++);
    this.kind = 'tracer';
    tracers.push(this);
  }
  Tracer.prototype._ = function (method, args) {
    cmd(this.key, method, args);
    return this;
  };
  Tracer.delay = function () {
    cmd(null, 'delay', []);
  };

  function Array1DTracer(title) {
    Tracer.call(this, title || 'Array1DTracer');
    this.kind = 'array1d';
    this._chart = null;
  }
  Array1DTracer.prototype = Object.create(Tracer.prototype);
  Array1DTracer.prototype.set = function (arr) {
    this._('set', [arr || []]);
    if (this._chart) this._chart.set(arr);
    return this;
  };
  Array1DTracer.prototype.reset = function () { return this._('reset', []); };
  Array1DTracer.prototype.patch = function (x, v) {
    var args = arguments.length > 1 ? [x, v] : [x];
    this._('patch', args);
    if (this._chart) this._chart.patch.apply(this._chart, args);
    return this;
  };
  Array1DTracer.prototype.depatch = function (x) {
    this._('depatch', [x]);
    if (this._chart) this._chart.depatch(x);
    return this;
  };
  Array1DTracer.prototype.select = function (sx, ex) {
    var args = arguments.length > 1 ? [sx, ex] : [sx];
    this._('select', args);
    if (this._chart) this._chart.select.apply(this._chart, args);
    return this;
  };
  Array1DTracer.prototype.deselect = function (sx, ex) {
    var args = arguments.length > 1 ? [sx, ex] : [sx];
    this._('deselect', args);
    if (this._chart) this._chart.deselect.apply(this._chart, args);
    return this;
  };
  Array1DTracer.prototype.chart = function (chartTracer) {
    this._chart = chartTracer;
    this._('chart', [chartTracer && chartTracer.key]);
    return this;
  };

  function ChartTracer(title) {
    Array1DTracer.call(this, title || 'ChartTracer');
    this.kind = 'chart';
    this._chart = null; // a chart is not linked to another chart
  }
  ChartTracer.prototype = Object.create(Array1DTracer.prototype);

  function Array2DTracer(title) {
    Tracer.call(this, title || 'Array2DTracer');
    this.kind = 'array2d';
  }
  Array2DTracer.prototype = Object.create(Tracer.prototype);
  Array2DTracer.prototype.set = function (arr) { return this._('set', [arr || []]); };
  Array2DTracer.prototype.reset = function () { return this._('reset', []); };
  Array2DTracer.prototype.patch = function (y, x, v) {
    var args = arguments.length > 2 ? [y, x, v] : [y, x];
    return this._('patch', args);
  };
  Array2DTracer.prototype.depatch = function (y, x) { return this._('depatch', [y, x]); };
  Array2DTracer.prototype.select = function (sy, sx, ey, ex) {
    var args = arguments.length > 2 ? [sy, sx, ey, ex] : [sy, sx];
    return this._('select', args);
  };
  Array2DTracer.prototype.deselect = function (sy, sx, ey, ex) {
    var args = arguments.length > 2 ? [sy, sx, ey, ex] : [sy, sx];
    return this._('deselect', args);
  };
  Array2DTracer.prototype.selectRow = function (y, sx, ex) { return this._('selectRow', [y, sx, ex]); };
  Array2DTracer.prototype.deselectRow = function (y, sx, ex) { return this._('deselectRow', [y, sx, ex]); };
  Array2DTracer.prototype.selectCol = function (x, sy, ey) { return this._('selectCol', [x, sy, ey]); };
  Array2DTracer.prototype.deselectCol = function (x, sy, ey) { return this._('deselectCol', [x, sy, ey]); };

  function GraphTracer(title) {
    Tracer.call(this, title || 'GraphTracer');
    this.kind = 'graph';
  }
  GraphTracer.prototype = Object.create(Tracer.prototype);
  GraphTracer.prototype.directed = function (d) { return this._('directed', [d !== false]); };
  GraphTracer.prototype.weighted = function (w) { return this._('weighted', [w !== false]); };
  GraphTracer.prototype.set = function (G) { return this._('set', [G]); };
  GraphTracer.prototype.visit = function (node, parent, weight) {
    var args = [node];
    if (arguments.length > 1) args.push(parent);
    if (arguments.length > 2) args.push(weight);
    return this._('visit', args);
  };
  GraphTracer.prototype.leave = function (node, parent) {
    var args = [node];
    if (arguments.length > 1) args.push(parent);
    return this._('leave', args);
  };
  GraphTracer.prototype.updateNode = function (id, v) { return this._('updateNode', [id, v]); };
  GraphTracer.prototype.layoutTree = function (root) { return this._('layoutTree', [root]); };
  GraphTracer.prototype.log = function (logger) {
    this._('log', [logger && logger.key]);
    return this;
  };

  function LogTracer(title) {
    Tracer.call(this, title || 'LogTracer');
    this.kind = 'log';
  }
  LogTracer.prototype = Object.create(Tracer.prototype);
  LogTracer.prototype.set = function (s) { return this._('set', [s == null ? '' : String(s)]); };
  LogTracer.prototype.print = function (s) { return this._('print', [s == null ? '' : String(s)]); };
  LogTracer.prototype.println = function (s) { return this._('println', [s == null ? '' : String(s)]); };
  LogTracer.prototype.printf = function (fmt) {
    var args = [];
    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
    var out = String(fmt);
    var n = 0;
    out = out.replace(/%s|%d|%f|%%/g, function (m) {
      if (m === '%%') return '%';
      var v = args[n++];
      return v == null ? '' : String(v);
    });
    return this.println(out);
  };

  function LayoutBox(kind, children) {
    this.kind = kind;
    this.children = children || [];
    this.key = 'l' + (nextId++);
  }
  function VerticalLayout(children) { return new LayoutBox('vertical', children); }
  function HorizontalLayout(children) { return new LayoutBox('horizontal', children); }
  var Layout = {
    setRoot: function (layout) { rootLayout = layout; }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(1);

  var Randomize = {
    seed: function (s) {
      rngState = (s >>> 0) || 1;
      rand = mulberry32(rngState);
    },
    Integer: function (opt) {
      opt = opt || {};
      var min = opt.min == null ? 0 : opt.min | 0;
      var max = opt.max == null ? 9 : opt.max | 0;
      return min + ((rand() * (max - min + 1)) | 0);
    },
    Array1D: function (opt) {
      opt = opt || {};
      var N = opt.N == null ? 10 : opt.N | 0;
      var value = opt.value || function () { return Randomize.Integer({ min: 1, max: 16 }); };
      var a = [];
      for (var i = 0; i < N; i++) a.push(value());
      if (opt.sorted) a.sort(function (x, y) { return x - y; });
      return a;
    },
    Graph: function (opt) {
      opt = opt || {};
      var N = opt.N == null ? 6 : opt.N | 0;
      var ratio = opt.ratio == null ? 0.4 : opt.ratio;
      var directed = !!opt.directed;
      var weighted = !!opt.weighted;
      var G = [];
      var i, j;
      for (i = 0; i < N; i++) {
        G[i] = [];
        for (j = 0; j < N; j++) G[i][j] = 0;
      }
      // A ring so the graph is connected, then extra random edges.
      for (i = 0; i < N; i++) {
        j = (i + 1) % N;
        var w = weighted ? Randomize.Integer({ min: 1, max: 9 }) : 1;
        G[i][j] = w;
        if (!directed) G[j][i] = w;
      }
      for (i = 0; i < N; i++) {
        for (j = 0; j < N; j++) {
          if (i === j) continue;
          if (!directed && j < i) continue;
          if (G[i][j]) continue;
          if (rand() < ratio) {
            w = weighted ? Randomize.Integer({ min: 1, max: 9 }) : 1;
            G[i][j] = w;
            if (!directed) G[j][i] = w;
          }
        }
      }
      return G;
    }
  };

  function describeLayout(node) {
    if (!node) return null;
    if (node.kind === 'vertical' || node.kind === 'horizontal') {
      return {
        kind: node.kind,
        children: (node.children || []).map(describeLayout)
      };
    }
    return { kind: 'tracer', key: node.key, type: node.kind, title: node.title };
  }

  function chunkify(list) {
    var chunks = [{ commands: [] }];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.key == null && c.method === 'delay') {
        chunks.push({ commands: [] });
      } else {
        chunks[chunks.length - 1].commands.push(c);
      }
    }
    while (chunks.length > 1 && chunks[chunks.length - 1].commands.length === 0) chunks.pop();
    return chunks;
  }

  function reset() {
    commands = [];
    tracers = [];
    nextId = 0;
    rootLayout = null;
  }

  function record(fn) {
    reset();
    fn();
    return {
      chunks: chunkify(commands),
      tracers: tracers.map(function (t) {
        return { key: t.key, type: t.kind, title: t.title };
      }),
      layout: describeLayout(rootLayout)
    };
  }

  root.AV = {
    Tracer: Tracer,
    Array1DTracer: Array1DTracer,
    Array2DTracer: Array2DTracer,
    ChartTracer: ChartTracer,
    GraphTracer: GraphTracer,
    LogTracer: LogTracer,
    Layout: Layout,
    VerticalLayout: VerticalLayout,
    HorizontalLayout: HorizontalLayout,
    Randomize: Randomize,
    record: record,
    reset: reset,
    clone: clone
  };
})(typeof window !== 'undefined' ? window : globalThis);
