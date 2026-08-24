/* JSON Crack graph core: object/array → card, nested → child edge, primitives
 * stay on the parent. Nested keys also stay as rows (the original's rule).
 * Classic script. Layout is a left-to-right tree. */
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

  function fmtRow(r) {
    if (r.nested) {
      if (r.t === 'array') return '[' + r.size + ']';
      if (r.t === 'object') return '{' + r.size + '}';
    }
    var t = r.t;
    if (t === 'string') return r.v;
    if (t === 'number' || t === 'boolean' || t === 'null') return String(r.v);
    return String(r.t);
  }

  function copyOf(r) {
    if (r.nested) {
      try { return JSON.stringify(r.v); } catch (e) { return fmtRow(r); }
    }
    if (r.t === 'string') return String(r.v);
    if (r.t === 'number' || r.t === 'boolean' || r.t === 'null') return String(r.v);
    return fmtRow(r);
  }

  /* Same node rule as JSON Crack's graph: a node per object/array. Primitive
   * properties stay as rows. Nested objects/arrays are BOTH a row on the
   * parent (so you can see the key) AND a child card with an edge. */
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
            var k = String(i);
            if (isObj(v)) {
              kids.push({ key: k, value: v });
              rows.push({
                k: k, v: v, t: typeOf(v), nested: true,
                size: Array.isArray(v) ? v.length : Object.keys(v).length
              });
            } else {
              rows.push({ k: k, v: v, t: typeOf(v) });
            }
          });
        } else {
          Object.keys(value).forEach(function (k) {
            var v = value[k];
            if (isObj(v)) {
              kids.push({ key: k, value: v });
              rows.push({
                k: k, v: v, t: typeOf(v), nested: true,
                size: Array.isArray(v) ? v.length : Object.keys(v).length
              });
            } else {
              rows.push({ k: k, v: v, t: typeOf(v) });
            }
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
  var MIN_W = 168;
  var COL_GAP = 72;
  var ROW_GAP = 20;
  var CHAR_W = 7.2;

  function nodeSize(node) {
    var title = node.isArray ? ('[] ' + node.size + ' items') : ('{} ' + node.size + ' keys');
    var w = Math.max(MIN_W, title.length * CHAR_W + 48);
    node.rows.forEach(function (r) {
      var line = (r.k ? r.k + ': ' : '') + fmtRow(r);
      if (line.length > 48) line = line.slice(0, 45) + '…';
      w = Math.max(w, line.length * CHAR_W + 28);
    });
    var h = PAD * 2 + 18 + node.rows.length * ROW_H;
    if (!node.rows.length) h = PAD * 2 + 22;
    return { w: Math.min(280, w), h: h, title: title };
  }

  function rowAnchorY(node, key) {
    var want = key == null ? '' : String(key);
    for (var i = 0; i < node.rows.length; i++) {
      if (node.rows[i].k === want && node.rows[i].nested) {
        return 20 + (i + 1) * ROW_H - 4;
      }
    }
    return 18;
  }

  function layout(graph, collapsed) {
    collapsed = collapsed || {};
    var byId = {};
    graph.nodes.forEach(function (n) { byId[n.id] = n; });
    var kids = {};
    graph.nodes.forEach(function (n) { kids[n.id] = []; });
    graph.edges.forEach(function (e) {
      if (kids[e.from]) kids[e.from].push(e.to);
    });

    var hide = {};
    function hideDesc(id) {
      (kids[id] || []).forEach(function (cid) {
        if (!hide[cid]) {
          hide[cid] = true;
          hideDesc(cid);
        }
      });
    }
    Object.keys(collapsed).forEach(function (id) {
      if (collapsed[id]) hideDesc(id);
    });

    graph.nodes.forEach(function (n) {
      n._sz = nodeSize(n);
      n.w = n._sz.w;
      n.h = n._sz.h;
      n.title = n._sz.title;
    });

    function shift(id, dy) {
      byId[id].y += dy;
      (kids[id] || []).forEach(function (cid) {
        if (!hide[cid]) shift(cid, dy);
      });
    }

    function pack(id, x, y) {
      var n = byId[id];
      n.x = x;
      var visKids = (kids[id] || []).filter(function (cid) { return !hide[cid]; });
      if (!visKids.length) {
        n.y = y;
        return { w: n.w, h: n.h };
      }
      var childX = x + n.w + COL_GAP;
      var cy = y;
      var childW = 0;
      visKids.forEach(function (cid, i) {
        if (i) cy += ROW_GAP;
        var box = pack(cid, childX, cy);
        childW = Math.max(childW, box.w);
        cy += box.h;
      });
      var childH = cy - y;
      if (childH > n.h) {
        n.y = y + (childH - n.h) / 2;
      } else {
        n.y = y;
        var extra = (n.h - childH) / 2;
        visKids.forEach(function (cid) { shift(cid, extra); });
        childH = n.h;
      }
      return { w: n.w + COL_GAP + childW, h: Math.max(n.h, childH) };
    }

    var root = graph.nodes[0];
    var packed = { w: MIN_W, h: 80 };
    if (root && !hide[root.id]) packed = pack(root.id, 24, 24);

    var vis = graph.nodes.filter(function (n) { return !hide[n.id]; });
    var visE = graph.edges.filter(function (e) { return !hide[e.from] && !hide[e.to]; });

    visE.forEach(function (e) {
      var a = byId[e.from];
      var b = byId[e.to];
      if (!a || !b) return;
      e.x1 = a.x + a.w;
      e.y1 = a.y + rowAnchorY(a, e.label);
      e.x2 = b.x;
      e.y2 = b.y + 18;
    });

    var maxX = 200, maxY = 200;
    vis.forEach(function (n) {
      maxX = Math.max(maxX, n.x + n.w + 40);
      maxY = Math.max(maxY, n.y + n.h + 40);
    });
    return { nodes: vis, edges: visE, width: Math.max(maxX, packed.w + 48), height: maxY };
  }

  function cardsOverlap(laid) {
    var nodes = laid.nodes;
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          return true;
        }
      }
    }
    return false;
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

  function render(el, laid, collapsed, handlers) {
    collapsed = collapsed || {};
    handlers = handlers || {};
    var ns = 'http://www.w3.org/2000/svg';
    var svg = el.querySelector && el.querySelector('svg');
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
        html += '<text class="elabel" x="' + ((e.x1 + e.x2) / 2) + '" y="' + ((e.y1 + e.y2) / 2 - 8) + '">' + esc(e.label) + '</text>';
      }
    });
    laid.nodes.forEach(function (n) {
      var hasKids = laid.edges.some(function (e) { return e.from === n.id; }) || collapsed[n.id];
      html += '<g class="node" data-id="' + esc(n.id) + '" transform="translate(' + n.x + ',' + n.y + ')">';
      html += '<rect class="card" width="' + n.w + '" height="' + n.h + '" rx="8"/>';
      html += '<rect class="accent" width="4" height="' + n.h + '" rx="2"/>';
      html += '<text class="title" x="14" y="18">' + esc(n.title) + '</text>';
      if (hasKids) {
        html += '<text class="fold" data-fold="' + esc(n.id) + '" x="' + (n.w - 16) + '" y="18">' + (collapsed[n.id] ? '+' : '–') + '</text>';
      }
      n.rows.forEach(function (r, i) {
        var val = fmtRow(r);
        if (val.length > 42) val = val.slice(0, 39) + '…';
        var y = 20 + (i + 1) * ROW_H;
        var copy = copyOf(r);
        html += '<g class="row" data-copy="' + esc(copy) + '">';
        html += '<rect class="row-hit" x="8" y="' + (y - 14) + '" width="' + (n.w - 16) + '" height="' + ROW_H + '" fill="transparent"/>';
        html += '<text class="k" x="14" y="' + y + '">' + esc(r.k) + (r.k ? ':' : '') + '</text>';
        html += '<text class="v t-' + esc(r.t) + (r.nested ? ' nested' : '') + '" x="' + (14 + (r.k ? (r.k.length + 2) * CHAR_W : 0)) + '" y="' + y + '">' + esc(val) + '</text>';
        html += '</g>';
      });
      html += '</g>';
    });
    svg.innerHTML = html;
    if (handlers.onToggle) {
      Array.prototype.forEach.call(svg.querySelectorAll('.fold'), function (g) {
        g.addEventListener('click', function (ev) {
          ev.stopPropagation();
          handlers.onToggle(g.getAttribute('data-fold'));
        });
      });
    }
    if (handlers.onCopy) {
      Array.prototype.forEach.call(svg.querySelectorAll('.row'), function (g) {
        g.addEventListener('click', function (ev) {
          ev.stopPropagation();
          handlers.onCopy(g.getAttribute('data-copy') || '');
        });
      });
    }
    return svg;
  }

  function tidyParseError(e, text) {
    var msg = String(e && e.message || e);
    var where = '';
    var m = /position\s+(\d+)/i.exec(msg);
    if (m) {
      var pos = +m[1];
      var line = 1, col = 1;
      var src = String(text || '');
      for (var i = 0; i < pos && i < src.length; i++) {
        if (src.charAt(i) === '\n') { line++; col = 1; }
        else col++;
      }
      where = ' (line ' + line + ', column ' + col + ')';
    }
    if (/Unexpected end/i.test(msg)) {
      return 'Not valid JSON — the text ends early.' + where;
    }
    if (/Unexpected token/i.test(msg) || /Expected/i.test(msg)) {
      return 'Not valid JSON — unexpected character.' + where;
    }
    return 'Not valid JSON.' + where;
  }

  function parseJson(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return { empty: true };
    try {
      return { value: JSON.parse(s) };
    } catch (e) {
      return { error: true, message: tidyParseError(e, s), raw: String(e && e.message || e) };
    }
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
    fmtRow: fmtRow,
    copyOf: copyOf,
    parseJson: parseJson,
    tidyParseError: tidyParseError,
    cardsOverlap: cardsOverlap,
    SAMPLE: SAMPLE,
    ROW_H: ROW_H,
    COL_GAP: COL_GAP
  };
})(typeof window !== 'undefined' ? window : this);
