/* Commit-graph painter. Newest sits high, like Learn Git Branching. */
(function (root) {
  'use strict';

  var HUES = [200, 12, 145, 42, 280, 320, 90, 170, 25, 230, 60, 310];

  function hueFor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }

  function depthMap(commits) {
    var d = {};
    function depth(id) {
      if (d[id] != null) return d[id];
      var c = commits[id];
      if (!c || !c.parents.length) { d[id] = 0; return 0; }
      var m = 0;
      for (var i = 0; i < c.parents.length; i++) m = Math.max(m, depth(c.parents[i]));
      d[id] = m + 1;
      return d[id];
    }
    Object.keys(commits).forEach(depth);
    return d;
  }

  function layout(tree) {
    var commits = tree.commits || {};
    var branches = tree.branches || {};
    var tags = tree.tags || {};
    var depths = depthMap(commits);
    var ids = Object.keys(commits);
    if (!ids.length) return { nodes: [], edges: [], labels: [], width: 120, height: 120 };

    var branchNames = Object.keys(branches);
    branchNames.sort(function (a, b) {
      if (a === 'main') return -1;
      if (b === 'main') return 1;
      if (a.slice(0, 2) === 'o/' && b.slice(0, 2) !== 'o/') return 1;
      if (b.slice(0, 2) === 'o/' && a.slice(0, 2) !== 'o/') return -1;
      return a < b ? -1 : 1;
    });

    var colOf = {};
    var nextCol = 0;
    function walkFirst(id, col) {
      var guard = 0;
      while (id && colOf[id] == null && commits[id] && guard++ < 200) {
        colOf[id] = col;
        id = commits[id].parents[0];
      }
    }
    branchNames.forEach(function (name) {
      var tip = branches[name].target;
      if (colOf[tip] == null) {
        walkFirst(tip, nextCol);
        nextCol++;
      }
    });
    ids.forEach(function (id) {
      if (colOf[id] == null) {
        walkFirst(id, nextCol);
        nextCol++;
      }
    });

    var colCount = Math.max(1, nextCol);
    var maxD = 0;
    ids.forEach(function (id) { if (depths[id] > maxD) maxD = depths[id]; });

    var R = 16;
    var XGAP = 74;
    var YGAP = 58;
    var PADX = 36;
    var PADY = 48;
    var nodes = {};
    ids.forEach(function (id) {
      nodes[id] = {
        id: id,
        x: PADX + colOf[id] * XGAP,
        y: PADY + (maxD - depths[id]) * YGAP,
        r: R
      };
    });

    var edges = [];
    ids.forEach(function (id) {
      (commits[id].parents || []).forEach(function (p, pi) {
        if (!nodes[p]) return;
        edges.push({ from: p, to: id, merge: pi > 0 });
      });
    });

    var labels = [];
    function addLabel(text, at, kind, hue) {
      labels.push({ text: text, at: at, kind: kind, hue: hue });
    }
    branchNames.forEach(function (name) {
      addLabel(name, branches[name].target, 'branch', hueFor(name));
    });
    Object.keys(tags).forEach(function (name) {
      addLabel(name, tags[name].target, 'tag', 48);
    });
    if (tree.HEAD) addLabel('HEAD', tree.HEAD.target, 'head', 0);

    var width = PADX * 2 + (colCount - 1) * XGAP + 120;
    var height = PADY * 2 + maxD * YGAP;
    return { nodes: nodes, edges: edges, labels: labels, width: width, height: height, branches: branches, commits: commits };
  }

  function containingBranches(tree, commitId) {
    var names = [];
    Object.keys(tree.branches || {}).forEach(function (name) {
      var set = {};
      var q = [tree.branches[name].target];
      while (q.length) {
        var id = q.pop();
        if (set[id] || !tree.commits[id]) continue;
        set[id] = true;
        q = q.concat(tree.commits[id].parents || []);
      }
      if (set[commitId]) names.push(name);
    });
    return names;
  }

  function commitFill(tree, id) {
    var names = containingBranches(tree, id);
    if (!names.length) return 'hsl(210,18%,45%)';
    var h = 0;
    names.forEach(function (n) { h += hueFor(n); });
    h = Math.round(h / names.length);
    return 'hsl(' + h + ',62%,52%)';
  }

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  function labelStack(labels, id) {
    return labels.filter(function (l) { return l.at === id; });
  }

  function render(svg, tree, opts) {
    opts = opts || {};
    svg.innerHTML = '';
    var L = layout(tree);
    var vbW = Math.max(L.width, 200);
    var vbH = Math.max(L.height, 160);
    svg.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');

    var g = svgEl('g', { 'class': 'graph' });
    svg.appendChild(g);

    L.edges.forEach(function (e) {
      var a = L.nodes[e.from], b = L.nodes[e.to];
      var mx = (a.x + b.x) / 2;
      var path = 'M ' + a.x + ' ' + a.y + ' C ' + a.x + ' ' + (a.y + b.y) / 2 + ', ' + b.x + ' ' + (a.y + b.y) / 2 + ', ' + b.x + ' ' + b.y;
      if (a.x === b.x) path = 'M ' + a.x + ' ' + a.y + ' L ' + b.x + ' ' + b.y;
      else path = 'M ' + a.x + ' ' + a.y + ' C ' + mx + ' ' + a.y + ', ' + mx + ' ' + b.y + ', ' + b.x + ' ' + b.y;
      g.appendChild(svgEl('path', {
        d: path,
        fill: 'none',
        stroke: e.merge ? '#c9a45c' : 'rgba(232,240,248,.55)',
        'stroke-width': e.merge ? 2.2 : 2,
        'stroke-linecap': 'round'
      }));
    });

    Object.keys(L.nodes).forEach(function (id) {
      var n = L.nodes[id];
      var c = svgEl('g', { transform: 'translate(' + n.x + ',' + n.y + ')' });
      c.appendChild(svgEl('circle', {
        r: n.r,
        fill: commitFill(tree, id),
        stroke: '#f4f7fb',
        'stroke-width': 2.2
      }));
      var t = svgEl('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: '#fff',
        'font-size': id.length > 4 ? 8 : 10,
        'font-family': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        'font-weight': 700
      });
      t.textContent = id;
      c.appendChild(t);
      g.appendChild(c);

      var labs = labelStack(L.labels, id);
      var x = n.x + n.r + 10;
      var y = n.y - (labs.length - 1) * 11;
      labs.forEach(function (lab, i) {
        var isHead = lab.kind === 'head';
        var isTag = lab.kind === 'tag';
        var bg = isHead ? '#f6d36b' : isTag ? '#c9a45c' : ('hsl(' + lab.hue + ',55%,38%)');
        var fg = isHead ? '#1a1404' : '#fff';
        var rect = svgEl('rect', {
          x: x, y: y + i * 22 - 9,
          rx: 4, ry: 4,
          width: Math.max(36, lab.text.length * 7.2 + 12),
          height: 18,
          fill: bg
        });
        g.appendChild(rect);
        var tx = svgEl('text', {
          x: x + 6, y: y + i * 22 + 3,
          fill: fg,
          'font-size': 11,
          'font-family': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          'font-weight': 700
        });
        tx.textContent = lab.text;
        g.appendChild(tx);
      });
    });

    if (opts.title) {
      var title = svgEl('text', {
        x: 8, y: 16,
        fill: 'rgba(232,240,248,.55)',
        'font-size': 11,
        'font-family': 'system-ui, sans-serif'
      });
      title.textContent = opts.title;
      svg.appendChild(title);
    }
  }

  function enablePan(svg) {
    var ox = 0, oy = 0, dragging = false, sx, sy, vx, vy;
    svg.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      vx = ox; vy = oy;
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    });
    svg.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      ox = vx + (e.clientX - sx);
      oy = vy + (e.clientY - sy);
      svg.style.transform = 'translate(' + ox + 'px,' + oy + 'px)';
    });
    function up() { dragging = false; }
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  }

  root.LGBVis = { render: render, layout: layout, enablePan: enablePan };
})(window);
