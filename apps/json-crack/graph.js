/* JSON Crack graph core: object/array → card, nested → child edge, primitives
 * stay on the parent. Classic script. Layout is left-to-right. */
(function (root) {
  'use strict';

  function isObj(v) {
    return v !== null && typeof v === 'object';
  }

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function fmt(v) {
    var t = typeOf(v);
    if (t === 'string') return v;
    if (t === 'number' || t === 'boolean' || t === 'null') return String(v);
    return t;
  }

  /* Same node rule as JSON Crack's graph: a node per object/array. Primitive
   * properties stay as rows. Nested objects/arrays become children. */
  function toGraph(data) {
    var nodes = [];
    var edges = [];
    var n = 0;
    function uid() { return 'n' + (n++); }

    function walk(value, parentId, key) {
      var id = uid();
      var arr = Array.isArray(value);
      var rows = [];
      var kids = [];
      if (isObj(value)) {
        if (arr) {
          value.forEach(function (v, i) {
            if (isObj(v)) kids.push({ key: String(i), value: v });
            else rows.push({ k: String(i), v: v, t: typeOf(v) });
          });
        } else {
          Object.keys(value).forEach(function (k) {
            var v = value[k];
            if (isObj(v)) kids.push({ key: k, value: v });
            else rows.push({ k: k, v: v, t: typeOf(v) });
          });
        }
      } else {
        rows.push({ k: key == null ? '' : String(key), v: value, t: typeOf(value) });
      }
      nodes.push({
        id: id,
        isArray: arr,
        rows: rows,
        key: key,
        size: arr ? value.length : (isObj(value) ? Object.keys(value).length : 0),
        parentId: parentId
      });
      if (parentId != null) {
        edges.push({ from: parentId, to: id, label: key == null ? '' : String(key) });
      }
      kids.forEach(function (c) { walk(c.value, id, c.key); });
      return id;
    }
    walk(data, null, null);
    return { nodes: nodes, edges: edges };
  }

  var ROW_H = 22;
  var PAD = 10;
  var MIN_W = 160;
  var COL_GAP = 64;
  var ROW_GAP = 18;
  var CHAR_W = 7.2;

  function nodeSize(node) {
    var title = node.isArray ? ('[] ' + node.size + ' items') : ('{} ' + node.size + ' keys');
    var w = Math.max(MIN_W, title.length * CHAR_W + 40);
    node.rows.forEach(function (r) {
      var line = (r.k ? r.k + ': ' : '') + fmt(r.v);
      if (line.length > 48) line = line.slice(0, 45) + '…';
      w = Math.max(w, line.length * CHAR_W + 28);
    });
    var h = PAD * 2 + 18 + node.rows.length * ROW_H;
    if (!node.rows.length) h = PAD * 2 + 22;
    return { w: Math.min(280, w), h: h, title: title };
  }

  function layout(graph, collapsed) {
    collapsed = collapsed || {};
    var hide = {};
    function hideDesc(id) {
      graph.edges.forEach(function (e) {
        if (e.from === id && !hide[e.to]) {
          hide[e.to] = true;
          hideDesc(e.to);
        }
      });
    }
    Object.keys(collapsed).forEach(function (id) {
      if (collapsed[id]) hideDesc(id);
    });

    var vis = graph.nodes.filter(function (n) { return !hide[n.id]; });
    var visE = graph.edges.filter(function (e) { return !hide[e.from] && !hide[e.to]; });

    var depth = {};
    vis.forEach(function (n) { depth[n.id] = 0; });
    visE.forEach(function () {
      visE.forEach(function (e) {
        depth[e.to] = Math.max(depth[e.to] || 0, (depth[e.from] || 0) + 1);
      });
    });

    var cols = [];
    vis.forEach(function (n) {
      var d = depth[n.id] || 0;
      if (!cols[d]) cols[d] = [];
      cols[d].push(n);
    });

    var colW = [];
    cols.forEach(function (col, i) {
      var mw = MIN_W;
      col.forEach(function (n) {
        n._sz = nodeSize(n);
        mw = Math.max(mw, n._sz.w);
      });
      colW[i] = mw;
    });

    var x = 24;
    cols.forEach(function (col, i) {
      var y = 24;
      col.forEach(function (n) {
        n.x = x;
        n.y = y;
        n.w = n._sz.w;
        n.h = n._sz.h;
        n.title = n._sz.title;
        y += n.h + ROW_GAP;
      });
      x += colW[i] + COL_GAP;
    });

    visE.forEach(function (e) {
      var a = graph.nodes.filter(function (n) { return n.id === e.from; })[0];
      var b = graph.nodes.filter(function (n) { return n.id === e.to; })[0];
      if (!a || !b) return;
      e.x1 = a.x + a.w;
      e.y1 = a.y + 18;
      e.x2 = b.x;
      e.y2 = b.y + 18;
    });

    var maxX = 200, maxY = 200;
    vis.forEach(function (n) {
      maxX = Math.max(maxX, n.x + n.w + 40);
      maxY = Math.max(maxY, n.y + n.h + 40);
    });
    return { nodes: vis, edges: visE, width: maxX, height: maxY };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function path(e) {
    var mx = (e.x1 + e.x2) / 2;
    return 'M' + e.x1 + ',' + e.y1 + ' C' + mx + ',' + e.y1 + ' ' + mx + ',' + e.y2 + ' ' + e.x2 + ',' + e.y2;
  }

  function render(el, laid, collapsed, onToggle) {
    collapsed = collapsed || {};
    var ns = 'http://www.w3.org/2000/svg';
    var svg = el.querySelector('svg');
    if (!svg) {
      svg = document.createElementNS(ns, 'svg');
      el.appendChild(svg);
    }
    svg.setAttribute('width', laid.width);
    svg.setAttribute('height', laid.height);
    svg.setAttribute('viewBox', '0 0 ' + laid.width + ' ' + laid.height);
    var html = '';
    laid.edges.forEach(function (e) {
      html += '<path class="edge" d="' + path(e) + '" fill="none"/>';
      if (e.label) {
        html += '<text class="elabel" x="' + ((e.x1 + e.x2) / 2) + '" y="' + (Math.min(e.y1, e.y2) - 6) + '">' + esc(e.label) + '</text>';
      }
    });
    laid.nodes.forEach(function (n) {
      var kids = laid.edges.some(function (e) { return e.from === n.id; }) || collapsed[n.id];
      html += '<g class="node" data-id="' + esc(n.id) + '" transform="translate(' + n.x + ',' + n.y + ')">';
      html += '<rect class="card" width="' + n.w + '" height="' + n.h + '" rx="8"/>';
      html += '<rect class="accent" width="4" height="' + n.h + '" rx="2"/>';
      html += '<text class="title" x="14" y="18">' + esc(n.title) + '</text>';
      if (kids) {
        html += '<text class="fold" x="' + (n.w - 16) + '" y="18">' + (collapsed[n.id] ? '+' : '–') + '</text>';
      }
      n.rows.forEach(function (r, i) {
        var val = fmt(r.v);
        if (val.length > 42) val = val.slice(0, 39) + '…';
        var y = 20 + (i + 1) * ROW_H;
        html += '<text class="k" x="14" y="' + y + '">' + esc(r.k) + (r.k ? ':' : '') + '</text>';
        html += '<text class="v t-' + esc(r.t) + '" x="' + (14 + (r.k ? (r.k.length + 2) * CHAR_W : 0)) + '" y="' + y + '">' + esc(val) + '</text>';
      });
      html += '</g>';
    });
    svg.innerHTML = html;
    if (onToggle) {
      Array.prototype.forEach.call(svg.querySelectorAll('.node'), function (g) {
        g.addEventListener('click', function (ev) {
          ev.stopPropagation();
          onToggle(g.getAttribute('data-id'));
        });
      });
    }
    return svg;
  }

  var SAMPLE = {
    squadName: 'Super hero squad',
    homeTown: 'Metro City',
    formed: 2016,
    active: true,
    members: [
      { name: 'Molecule Man', age: 29, secretIdentity: 'Dan Jukes', powers: ['Radiation resistance', 'Turning tiny', 'Radiation blast'] },
      { name: 'Madame Uppercut', age: 39, secretIdentity: 'Jane Wilson', powers: ['Million tonne punch', 'Damage resistance', 'Superhuman reflexes'] }
    ]
  };

  root.JsonCrack = {
    toGraph: toGraph,
    layout: layout,
    render: render,
    typeOf: typeOf,
    fmt: fmt,
    SAMPLE: SAMPLE
  };
})(typeof window !== 'undefined' ? window : this);
