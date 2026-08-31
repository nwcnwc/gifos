/*
 * Apply tracer commands to DOM. One renderer per tracer kind. Layout is
 * nested flex. Graph is SVG (circle, or a BFS tree after layoutTree).
 */
(function (root) {
  'use strict';

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function keyOfEdge(a, b, directed) {
    if (!directed && a > b) return b + '-' + a;
    return a + '-' + b;
  }

  function Renderer() {
    this.el = h('div', 'viz');
    this.panes = {};
    this.states = {};
    this.order = [];
  }

  Renderer.prototype.mount = function (host) {
    host.innerHTML = '';
    host.appendChild(this.el);
  };

  Renderer.prototype.reset = function (rec) {
    this.el.innerHTML = '';
    this.panes = {};
    this.states = {};
    this.order = rec.tracers || [];
    var self = this;
    (rec.tracers || []).forEach(function (t) {
      self.states[t.key] = emptyState(t.type);
      self.states[t.key].title = t.title;
      self.states[t.key].type = t.type;
    });
    var tree = rec.layout ? buildLayout(this, rec.layout) : fallback(this, rec.tracers);
    this.el.appendChild(tree);
    this.paintAll();
  };

  function emptyState(type) {
    if (type === 'log') return { text: '', type: type };
    if (type === 'graph') {
      return {
        type: type, adj: [], directed: false, weighted: false,
        visited: {}, left: {}, edgeVis: {}, edgeLeft: {}, labels: {},
        treeRoot: null
      };
    }
    if (type === 'array2d') return { type: type, data: [], selected: {}, patched: {} };
    return { type: type, data: [], selected: {}, patched: {} };
  }

  function buildLayout(R, node) {
    if (!node) return h('div');
    if (node.kind === 'vertical' || node.kind === 'horizontal') {
      var box = h('div', 'layout ' + node.kind);
      (node.children || []).forEach(function (ch) { box.appendChild(buildLayout(R, ch)); });
      return box;
    }
    return paneFor(R, node.key, node.type, node.title);
  }

  function fallback(R, tracers) {
    var box = h('div', 'layout vertical');
    (tracers || []).forEach(function (t) {
      box.appendChild(paneFor(R, t.key, t.type, t.title));
    });
    return box;
  }

  function paneFor(R, key, type, title) {
    var pane = h('section', 'pane pane-' + type);
    var head = h('header', 'pane-h', title || type);
    var body = h('div', 'pane-b');
    pane.appendChild(head);
    pane.appendChild(body);
    R.panes[key] = { el: pane, body: body, type: type };
    return pane;
  }

  Renderer.prototype.apply = function (commands) {
    for (var i = 0; i < commands.length; i++) this.applyOne(commands[i]);
    this.paintAll();
  };

  Renderer.prototype.applyOne = function (c) {
    var st = this.states[c.key];
    if (!st) return;
    var m = c.method, a = c.args || [];
    if (m === 'chart') return;
    if (m === 'directed') { st.directed = !!a[0]; return; }
    if (m === 'weighted') { st.weighted = !!a[0]; return; }
    if (m === 'log') return;
    if (m === 'layoutTree') { st.treeRoot = a[0]; return; }
    if (m === 'set') {
      if (st.type === 'log') { st.text = a[0] == null ? '' : String(a[0]); return; }
      if (st.type === 'graph') {
        st.adj = a[0] || [];
        st.visited = {}; st.left = {}; st.edgeVis = {}; st.edgeLeft = {}; st.labels = {};
        return;
      }
      st.data = a[0] || [];
      st.selected = {}; st.patched = {};
      return;
    }
    if (m === 'reset') {
      var t = st.type, title = st.title;
      var fresh = emptyState(t);
      fresh.title = title;
      this.states[c.key] = fresh;
      return;
    }
    if (st.type === 'log') {
      if (m === 'print') st.text += a[0] == null ? '' : String(a[0]);
      if (m === 'println') st.text += (a[0] == null ? '' : String(a[0])) + '\n';
      return;
    }
    if (st.type === 'graph') {
      applyGraph(st, m, a);
      return;
    }
    if (st.type === 'array2d') {
      apply2d(st, m, a);
      return;
    }
    apply1d(st, m, a);
  };

  function markRange(map, sx, ex, on) {
    if (ex == null) ex = sx;
    if (sx > ex) { var t = sx; sx = ex; ex = t; }
    for (var i = sx; i <= ex; i++) {
      if (on) map[i] = 1; else delete map[i];
    }
  }

  function apply1d(st, m, a) {
    if (m === 'select') markRange(st.selected, a[0], a[1], true);
    else if (m === 'deselect') markRange(st.selected, a[0], a[1], false);
    else if (m === 'patch') {
      st.patched[a[0]] = 1;
      if (a.length > 1) st.data[a[0]] = a[1];
    } else if (m === 'depatch') delete st.patched[a[0]];
  }

  function cellKey(y, x) { return y + ',' + x; }

  function apply2d(st, m, a) {
    var y, x, ey, ex;
    if (m === 'select' || m === 'deselect') {
      y = a[0]; x = a[1];
      ey = a.length > 2 ? a[2] : y;
      ex = a.length > 3 ? a[3] : x;
      for (var r = Math.min(y, ey); r <= Math.max(y, ey); r++) {
        for (var c = Math.min(x, ex); c <= Math.max(x, ex); c++) {
          if (m === 'select') st.selected[cellKey(r, c)] = 1;
          else delete st.selected[cellKey(r, c)];
        }
      }
    } else if (m === 'selectRow' || m === 'deselectRow') {
      y = a[0]; x = a[1]; ex = a[2];
      for (var c2 = x; c2 <= ex; c2++) {
        if (m === 'selectRow') st.selected[cellKey(y, c2)] = 1;
        else delete st.selected[cellKey(y, c2)];
      }
    } else if (m === 'selectCol' || m === 'deselectCol') {
      x = a[0]; y = a[1]; ey = a[2];
      for (var r2 = y; r2 <= ey; r2++) {
        if (m === 'selectCol') st.selected[cellKey(r2, x)] = 1;
        else delete st.selected[cellKey(r2, x)];
      }
    } else if (m === 'patch') {
      y = a[0]; x = a[1];
      st.patched[cellKey(y, x)] = 1;
      if (a.length > 2) {
        if (!st.data[y]) st.data[y] = [];
        st.data[y][x] = a[2];
      }
    } else if (m === 'depatch') {
      delete st.patched[cellKey(a[0], a[1])];
    }
  }

  function applyGraph(st, m, a) {
    var node = a[0], parent = a[1], weight = a[2];
    if (m === 'visit') {
      st.visited[node] = 1;
      delete st.left[node];
      if (parent != null && parent !== undefined) {
        st.edgeVis[keyOfEdge(parent, node, st.directed)] = 1;
        delete st.edgeLeft[keyOfEdge(parent, node, st.directed)];
      }
      if (arguments.length >= 1 && a.length > 2 && weight !== undefined) st.labels[node] = weight;
    } else if (m === 'leave') {
      st.left[node] = 1;
      if (parent != null && parent !== undefined) {
        st.edgeLeft[keyOfEdge(parent, node, st.directed)] = 1;
      }
    } else if (m === 'updateNode') {
      st.labels[a[0]] = a[1];
    }
  }

  Renderer.prototype.paintAll = function () {
    for (var key in this.panes) {
      if (!Object.prototype.hasOwnProperty.call(this.panes, key)) continue;
      this.paint(key);
    }
  };

  Renderer.prototype.paint = function (key) {
    var pane = this.panes[key];
    var st = this.states[key];
    if (!pane || !st) return;
    if (st.type === 'chart') paintChart(pane.body, st);
    else if (st.type === 'array1d') paintArray1D(pane.body, st);
    else if (st.type === 'array2d') paintArray2D(pane.body, st);
    else if (st.type === 'graph') paintGraph(pane.body, st);
    else if (st.type === 'log') paintLog(pane.body, st);
  };

  function clsFor(st, i) {
    if (st.patched[i]) return 'cell patch';
    if (st.selected[i]) return 'cell sel';
    return 'cell';
  }

  function fmt(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (!isFinite(v) || v >= 1e8) return '∞';
      if (Math.abs(v - (v | 0)) < 1e-9) return String(v | 0);
      return String(Math.round(v * 100) / 100);
    }
    return String(v);
  }

  function paintArray1D(body, st) {
    body.innerHTML = '';
    var row = h('div', 'arr');
    for (var i = 0; i < st.data.length; i++) {
      var cell = h('div', clsFor(st, i));
      cell.appendChild(h('span', 'v', fmt(st.data[i])));
      cell.appendChild(h('span', 'i', String(i)));
      row.appendChild(cell);
    }
    body.appendChild(row);
  }

  function paintChart(body, st) {
    body.innerHTML = '';
    var wrap = h('div', 'chart');
    var max = 1;
    var i;
    for (i = 0; i < st.data.length; i++) {
      var n = +st.data[i];
      if (isFinite(n) && n > max) max = n;
    }
    for (i = 0; i < st.data.length; i++) {
      var col = h('div', 'bar-col');
      var val = +st.data[i];
      if (!isFinite(val)) val = 0;
      var bar = h('div', 'bar ' + clsFor(st, i).replace('cell', 'b'));
      bar.style.height = Math.max(6, (val / max) * 100) + '%';
      bar.title = fmt(st.data[i]);
      col.appendChild(bar);
      col.appendChild(h('span', 'bar-v', fmt(st.data[i])));
      wrap.appendChild(col);
    }
    body.appendChild(wrap);
  }

  function paintArray2D(body, st) {
    body.innerHTML = '';
    var table = h('div', 'grid');
    for (var y = 0; y < st.data.length; y++) {
      var row = h('div', 'grow');
      var rowData = st.data[y] || [];
      for (var x = 0; x < rowData.length; x++) {
        var k = cellKey(y, x);
        var cls = 'gcell';
        if (st.patched[k]) cls += ' patch';
        else if (st.selected[k]) cls += ' sel';
        var cell = h('div', cls, fmt(rowData[x]));
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    body.appendChild(table);
  }

  function paintLog(body, st) {
    var pre = body.querySelector('pre');
    if (!pre) {
      body.innerHTML = '';
      pre = h('pre', 'log');
      body.appendChild(pre);
    }
    if (pre.textContent !== st.text) {
      pre.textContent = st.text;
      pre.scrollTop = pre.scrollHeight;
    }
  }

  function layoutPositions(st, W, H) {
    var n = st.adj.length;
    var pos = [];
    var i;
    if (st.treeRoot != null && n) {
      var depth = [];
      var kids = [];
      for (i = 0; i < n; i++) { depth[i] = -1; kids[i] = []; }
      var q = [st.treeRoot];
      depth[st.treeRoot] = 0;
      while (q.length) {
        var u = q.shift();
        for (var v = 0; v < n; v++) {
          if (st.adj[u] && st.adj[u][v] && depth[v] < 0) {
            depth[v] = depth[u] + 1;
            kids[u].push(v);
            q.push(v);
          }
        }
      }
      var maxD = 0;
      for (i = 0; i < n; i++) if (depth[i] > maxD) maxD = depth[i];
      var level = [];
      for (i = 0; i <= maxD; i++) level[i] = [];
      function place(u) {
        if (depth[u] < 0) return;
        level[depth[u]].push(u);
        for (var k = 0; k < kids[u].length; k++) place(kids[u][k]);
      }
      place(st.treeRoot);
      for (i = 0; i < n; i++) if (depth[i] < 0) {
        maxD++;
        level[maxD] = [i];
        depth[i] = maxD;
      }
      for (var d = 0; d < level.length; d++) {
        var row = level[d];
        for (var j = 0; j < row.length; j++) {
          var id = row[j];
          pos[id] = {
            x: row.length === 1 ? W / 2 : 36 + (W - 72) * (j / (row.length - 1)),
            y: 28 + (H - 56) * (maxD ? d / maxD : 0)
          };
        }
      }
      for (i = 0; i < n; i++) if (!pos[i]) pos[i] = { x: W / 2, y: H / 2 };
      return pos;
    }
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.38;
    for (i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(n, 1);
      pos[i] = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) };
    }
    return pos;
  }

  function paintGraph(body, st) {
    var n = st.adj.length;
    var W = Math.max(280, body.clientWidth || 480);
    var H = Math.max(200, (body.clientHeight || 260));
    var pos = layoutPositions(st, W, H);
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'gsvg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    function line(x1, y1, x2, y2, cls) {
      var e = document.createElementNS(ns, 'line');
      e.setAttribute('x1', x1); e.setAttribute('y1', y1);
      e.setAttribute('x2', x2); e.setAttribute('y2', y2);
      e.setAttribute('class', cls);
      return e;
    }
    function txt(x, y, s, cls) {
      var e = document.createElementNS(ns, 'text');
      e.setAttribute('x', x); e.setAttribute('y', y);
      e.setAttribute('class', cls);
      e.textContent = s;
      return e;
    }

    var i, j;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (!st.adj[i] || !st.adj[i][j]) continue;
        if (!st.directed && j < i) continue;
        var a = pos[i], b = pos[j];
        if (!a || !b) continue;
        var ek = keyOfEdge(i, j, st.directed);
        var cls = 'gedge';
        if (st.edgeLeft[ek]) cls += ' left';
        else if (st.edgeVis[ek]) cls += ' vis';
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.hypot(dx, dy) || 1;
        var ux = dx / len, uy = dy / len;
        var x1 = a.x + ux * 16, y1 = a.y + uy * 16;
        var x2 = b.x - ux * 16, y2 = b.y - uy * 16;
        svg.appendChild(line(x1, y1, x2, y2, cls));
        if (st.directed) {
          var mx = x2 - ux * 8, my = y2 - uy * 8;
          var px = -uy, py = ux;
          var p1x = x2, p1y = y2;
          var p2x = mx + px * 5, p2y = my + py * 5;
          var p3x = mx - px * 5, p3y = my - py * 5;
          var poly = document.createElementNS(ns, 'polygon');
          poly.setAttribute('points', p1x + ',' + p1y + ' ' + p2x + ',' + p2y + ' ' + p3x + ',' + p3y);
          poly.setAttribute('class', cls);
          svg.appendChild(poly);
        }
        if (st.weighted) {
          svg.appendChild(txt((x1 + x2) / 2, (y1 + y2) / 2 - 4, fmt(st.adj[i][j]), 'ew'));
        }
      }
    }
    for (i = 0; i < n; i++) {
      var p = pos[i];
      if (!p) continue;
      var g = document.createElementNS(ns, 'g');
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 16);
      var ncls = 'gnode';
      if (st.left[i]) ncls += ' left';
      else if (st.visited[i]) ncls += ' vis';
      c.setAttribute('class', ncls);
      g.appendChild(c);
      var label = st.labels[i] != null ? i + ':' + fmt(st.labels[i]) : String(i);
      var t = txt(p.x, p.y + 4, label, 'nl');
      t.setAttribute('text-anchor', 'middle');
      g.appendChild(t);
      svg.appendChild(g);
    }
    body.innerHTML = '';
    body.appendChild(svg);
  }

  root.AVRender = { Renderer: Renderer };
})(typeof window !== 'undefined' ? window : globalThis);
