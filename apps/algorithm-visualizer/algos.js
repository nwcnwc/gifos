/*
 * Curated algorithms. Each run() emits tracer commands against window.AV.
 * Input is explicit so a saved GIF and a follow-along guest replay the same
 * walk-through. Randomize is only used to fill a missing default.
 */
(function (root) {
  'use strict';

  var T = root.AV;

  function arrOf(input, n) {
    if (input && input.array && input.array.length) {
      return input.array.map(function (x) { return +x; });
    }
    return T.Randomize.Array1D({ N: n || 12, value: function () {
      return T.Randomize.Integer({ min: 1, max: 16 });
    }});
  }
  function sortedOf(input, n) {
    var a = arrOf(input, n);
    a.sort(function (x, y) { return x - y; });
    return a;
  }
  function graphOf(input, opt) {
    opt = opt || {};
    if (input && input.graph && input.graph.length) return T.clone(input.graph);
    return T.Randomize.Graph({
      N: opt.N || 6,
      ratio: opt.ratio == null ? 0.35 : opt.ratio,
      directed: !!opt.directed,
      weighted: opt.weighted !== false
    });
  }
  function pickEnds(G, input) {
    var n = G.length;
    var s = input && input.start != null ? input.start | 0 : 0;
    var e = input && input.end != null ? input.end | 0 : n - 1;
    if (s < 0 || s >= n) s = 0;
    if (e < 0 || e >= n || e === s) e = (s + n - 1) % n;
    return { start: s, end: e };
  }

  function sortLayout() {
    var chart = new T.ChartTracer('ChartTracer');
    var tracer = new T.Array1DTracer('Array1DTracer');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([chart, tracer, logger]));
    tracer.chart(chart);
    return { chart: chart, tracer: tracer, logger: logger };
  }

  function bubble(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');
    var N = D.length;
    var swapped;
    do {
      swapped = false;
      L.tracer.select(N - 1);
      T.Tracer.delay();
      for (var i = 1; i < N; i++) {
        L.tracer.select(i);
        T.Tracer.delay();
        if (D[i - 1] > D[i]) {
          L.logger.println('swap ' + D[i - 1] + ' and ' + D[i]);
          var tmp = D[i - 1];
          D[i - 1] = D[i];
          D[i] = tmp;
          swapped = true;
          L.tracer.patch(i - 1, D[i - 1]);
          L.tracer.patch(i, D[i]);
          T.Tracer.delay();
          L.tracer.depatch(i - 1);
          L.tracer.depatch(i);
        }
        L.tracer.deselect(i);
      }
      L.tracer.deselect(N - 1);
      N--;
    } while (swapped);
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function selection(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');
    for (var i = 0; i < D.length - 1; i++) {
      var min = i;
      L.tracer.select(i);
      T.Tracer.delay();
      for (var j = i + 1; j < D.length; j++) {
        L.tracer.select(j);
        T.Tracer.delay();
        if (D[j] < D[min]) min = j;
        L.tracer.deselect(j);
      }
      if (min !== i) {
        L.logger.println('swap ' + D[i] + ' and ' + D[min]);
        var tmp = D[i]; D[i] = D[min]; D[min] = tmp;
        L.tracer.patch(i, D[i]);
        L.tracer.patch(min, D[min]);
        T.Tracer.delay();
        L.tracer.depatch(i);
        L.tracer.depatch(min);
      }
      L.tracer.deselect(i);
    }
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function insertion(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');
    for (var i = 1; i < D.length; i++) {
      var key = D[i];
      var j = i - 1;
      L.tracer.select(i);
      L.logger.println('insert ' + key);
      T.Tracer.delay();
      while (j >= 0 && D[j] > key) {
        D[j + 1] = D[j];
        L.tracer.patch(j + 1, D[j + 1]);
        T.Tracer.delay();
        L.tracer.depatch(j + 1);
        j--;
      }
      D[j + 1] = key;
      L.tracer.patch(j + 1, key);
      T.Tracer.delay();
      L.tracer.depatch(j + 1);
      L.tracer.deselect(i);
    }
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function mergeSort(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');

    function merge(left, mid, right) {
      var a = D.slice(left, mid + 1);
      var b = D.slice(mid + 1, right + 1);
      var i = 0, j = 0, k = left;
      L.tracer.select(left, right);
      L.logger.println('merge [' + left + '..' + mid + '] and [' + (mid + 1) + '..' + right + ']');
      T.Tracer.delay();
      while (i < a.length && j < b.length) {
        if (a[i] <= b[j]) { D[k] = a[i++]; }
        else { D[k] = b[j++]; }
        L.tracer.patch(k, D[k]);
        T.Tracer.delay();
        L.tracer.depatch(k);
        k++;
      }
      while (i < a.length) {
        D[k] = a[i++];
        L.tracer.patch(k, D[k]);
        T.Tracer.delay();
        L.tracer.depatch(k);
        k++;
      }
      while (j < b.length) {
        D[k] = b[j++];
        L.tracer.patch(k, D[k]);
        T.Tracer.delay();
        L.tracer.depatch(k);
        k++;
      }
      L.tracer.deselect(left, right);
    }
    function sort(left, right) {
      if (left >= right) return;
      var mid = (left + right) >> 1;
      sort(left, mid);
      sort(mid + 1, right);
      merge(left, mid, right);
    }
    sort(0, D.length - 1);
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function quicksort(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');

    function partition(low, high) {
      var pivot = D[high];
      var i = low;
      L.tracer.select(high);
      L.logger.println('pivot ' + pivot + ' at ' + high);
      T.Tracer.delay();
      for (var j = low; j < high; j++) {
        L.tracer.select(j);
        T.Tracer.delay();
        if (D[j] < pivot) {
          var tmp = D[i]; D[i] = D[j]; D[j] = tmp;
          L.tracer.patch(i, D[i]);
          L.tracer.patch(j, D[j]);
          T.Tracer.delay();
          L.tracer.depatch(i);
          L.tracer.depatch(j);
          i++;
        }
        L.tracer.deselect(j);
      }
      var t2 = D[i]; D[i] = D[high]; D[high] = t2;
      L.tracer.patch(i, D[i]);
      L.tracer.patch(high, D[high]);
      T.Tracer.delay();
      L.tracer.depatch(i);
      L.tracer.depatch(high);
      L.tracer.deselect(high);
      return i;
    }
    function qs(low, high) {
      if (low >= high) return;
      var p = partition(low, high);
      qs(low, p - 1);
      qs(p + 1, high);
    }
    qs(0, D.length - 1);
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function heapsort(input) {
    var D = arrOf(input, 12);
    var orig = D.slice();
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('original array = [' + D.join(', ') + ']');

    function heapify(n, i) {
      var largest = i;
      var l = 2 * i + 1, r = 2 * i + 2;
      L.tracer.select(i);
      T.Tracer.delay();
      if (l < n && D[l] > D[largest]) largest = l;
      if (r < n && D[r] > D[largest]) largest = r;
      if (largest !== i) {
        var tmp = D[i]; D[i] = D[largest]; D[largest] = tmp;
        L.tracer.patch(i, D[i]);
        L.tracer.patch(largest, D[largest]);
        T.Tracer.delay();
        L.tracer.depatch(i);
        L.tracer.depatch(largest);
        L.tracer.deselect(i);
        heapify(n, largest);
      } else {
        L.tracer.deselect(i);
      }
    }
    var n = D.length;
    var i;
    for (i = (n >> 1) - 1; i >= 0; i--) heapify(n, i);
    L.logger.println('heap built');
    for (i = n - 1; i > 0; i--) {
      var tmp = D[0]; D[0] = D[i]; D[i] = tmp;
      L.tracer.patch(0, D[0]);
      L.tracer.patch(i, D[i]);
      T.Tracer.delay();
      L.tracer.depatch(0);
      L.tracer.depatch(i);
      heapify(i, 0);
    }
    L.logger.println('sorted array = [' + D.join(', ') + ']');
    return { array: orig };
  }

  function linearSearch(input) {
    var D = arrOf(input, 12);
    var target = input && input.target != null ? +input.target : D[D.length - 2];
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('searching for ' + target);
    var found = -1;
    for (var i = 0; i < D.length; i++) {
      L.tracer.select(i);
      T.Tracer.delay();
      if (D[i] === target) {
        L.tracer.patch(i, D[i]);
        L.logger.println(target + ' is found at position ' + i);
        T.Tracer.delay();
        found = i;
        break;
      }
      L.tracer.deselect(i);
    }
    if (found < 0) L.logger.println(target + ' is not found');
    return { array: D, target: target };
  }

  function binarySearch(input) {
    var D = sortedOf(input, 14);
    var target = input && input.target != null ? +input.target : D[(D.length / 2) | 0];
    var L = sortLayout();
    L.tracer.set(D);
    T.Tracer.delay();
    L.logger.println('searching for ' + target + ' in a sorted array');
    var lo = 0, hi = D.length - 1, found = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      L.tracer.select(lo, hi);
      T.Tracer.delay();
      L.tracer.patch(mid, D[mid]);
      L.logger.println('probing index ' + mid + ' = ' + D[mid]);
      T.Tracer.delay();
      L.tracer.depatch(mid);
      L.tracer.deselect(lo, hi);
      if (D[mid] === target) {
        L.tracer.select(mid);
        L.logger.println(target + ' is found at position ' + mid);
        found = mid;
        break;
      }
      if (D[mid] < target) {
        L.logger.println('going right');
        lo = mid + 1;
      } else {
        L.logger.println('going left');
        hi = mid - 1;
      }
    }
    if (found < 0) L.logger.println(target + ' is not found');
    return { array: D, target: target };
  }

  function bfs(input) {
    var G = graphOf(input, { N: 6, weighted: true });
    var ends = pickEnds(G, input);
    var tracer = new T.GraphTracer('GraphTracer').directed(false).weighted();
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, logger]));
    tracer.log(logger);
    tracer.set(G);
    T.Tracer.delay();
    logger.println('shortest path from ' + ends.start + ' to ' + ends.end);
    var INF = 1e9;
    var W = [];
    var Q = [];
    var i;
    for (i = 0; i < G.length; i++) {
      W[i] = INF;
      tracer.updateNode(i, '∞');
    }
    W[ends.start] = 0;
    Q.push(ends.start);
    tracer.visit(ends.start, undefined, 0);
    T.Tracer.delay();
    while (Q.length) {
      var node = Q.shift();
      for (i = 0; i < G[node].length; i++) {
        if (!G[node][i]) continue;
        if (W[i] > W[node] + G[node][i]) {
          W[i] = W[node] + G[node][i];
          Q.push(i);
          tracer.visit(i, node, W[i]);
          T.Tracer.delay();
        }
      }
    }
    if (W[ends.end] >= INF) logger.println('no path from ' + ends.start + ' to ' + ends.end);
    else logger.println('shortest path from ' + ends.start + ' to ' + ends.end + ' is ' + W[ends.end]);
    return { graph: G, start: ends.start, end: ends.end };
  }

  function dfs(input) {
    var G = graphOf(input, { N: 7, weighted: false, ratio: 0.25 });
    var ends = pickEnds(G, input);
    var tracer = new T.GraphTracer('GraphTracer').directed(false);
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, logger]));
    tracer.log(logger);
    tracer.set(G);
    tracer.layoutTree(ends.start);
    T.Tracer.delay();
    logger.println('depth-first search from ' + ends.start);
    var seen = [];
    function walk(node, parent) {
      seen[node] = true;
      tracer.visit(node, parent);
      logger.println('visit ' + node);
      T.Tracer.delay();
      for (var i = 0; i < G[node].length; i++) {
        if (G[node][i] && !seen[i]) walk(i, node);
      }
      tracer.leave(node, parent);
      T.Tracer.delay();
    }
    walk(ends.start, undefined);
    logger.println('done');
    return { graph: G, start: ends.start, end: ends.end };
  }

  function dijkstra(input) {
    var G = graphOf(input, { N: 6, weighted: true, ratio: 0.45 });
    var ends = pickEnds(G, input);
    var tracer = new T.GraphTracer('GraphTracer').directed(false).weighted();
    var dist = new T.Array1DTracer('distance');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, dist, logger]));
    tracer.log(logger);
    var INF = 1e9;
    var S = [];
    var i;
    for (i = 0; i < G.length; i++) S[i] = INF;
    tracer.set(G);
    dist.set(S.map(function (v) { return v >= INF ? '∞' : v; }));
    T.Tracer.delay();
    logger.println('Dijkstra from ' + ends.start + ' to ' + ends.end);
    var D = [];
    for (i = 0; i < G.length; i++) D[i] = false;
    S[ends.start] = 0;
    dist.patch(ends.start, 0);
    T.Tracer.delay();
    dist.depatch(ends.start);
    dist.select(ends.start);
    var left = G.length;
    while (left--) {
      var minD = INF, minI = -1;
      for (i = 0; i < G.length; i++) {
        if (!D[i] && S[i] < minD) { minD = S[i]; minI = i; }
      }
      if (minI < 0) break;
      D[minI] = true;
      dist.select(minI);
      tracer.visit(minI);
      T.Tracer.delay();
      for (i = 0; i < G.length; i++) {
        if (G[minI][i] && S[i] > S[minI] + G[minI][i]) {
          S[i] = S[minI] + G[minI][i];
          dist.patch(i, S[i]);
          tracer.visit(i, minI, S[i]);
          T.Tracer.delay();
          dist.depatch(i);
          tracer.leave(i, minI);
          T.Tracer.delay();
        }
      }
      tracer.leave(minI);
      T.Tracer.delay();
    }
    if (S[ends.end] >= INF) logger.println('no path from ' + ends.start + ' to ' + ends.end);
    else logger.println('shortest path from ' + ends.start + ' to ' + ends.end + ' is ' + S[ends.end]);
    return { graph: G, start: ends.start, end: ends.end };
  }

  function prim(input) {
    var G = graphOf(input, { N: 6, weighted: true, ratio: 0.4 });
    var tracer = new T.GraphTracer('GraphTracer').directed(false).weighted();
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, logger]));
    tracer.log(logger);
    tracer.set(G);
    T.Tracer.delay();
    var n = G.length;
    var inMst = [];
    var key = [];
    var parent = [];
    var INF = 1e9;
    var i, v;
    for (i = 0; i < n; i++) { inMst[i] = false; key[i] = INF; parent[i] = -1; }
    key[0] = 0;
    logger.println("Prim's MST from node 0");
    tracer.visit(0);
    T.Tracer.delay();
    for (var count = 0; count < n; count++) {
      var minK = INF, u = -1;
      for (v = 0; v < n; v++) if (!inMst[v] && key[v] < minK) { minK = key[v]; u = v; }
      if (u < 0) break;
      inMst[u] = true;
      if (parent[u] >= 0) {
        tracer.visit(u, parent[u], G[parent[u]][u]);
        logger.println('add edge ' + parent[u] + '–' + u + ' weight ' + G[parent[u]][u]);
        T.Tracer.delay();
      }
      for (v = 0; v < n; v++) {
        if (G[u][v] && !inMst[v] && G[u][v] < key[v]) {
          key[v] = G[u][v];
          parent[v] = u;
        }
      }
    }
    logger.println('spanning tree complete');
    return { graph: G, start: 0, end: n - 1 };
  }

  function kruskal(input) {
    var G = graphOf(input, { N: 6, weighted: true, ratio: 0.45 });
    var tracer = new T.GraphTracer('GraphTracer').directed(false).weighted();
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, logger]));
    tracer.log(logger);
    tracer.set(G);
    T.Tracer.delay();
    var n = G.length;
    var edges = [];
    var i, j;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) if (G[i][j]) edges.push([G[i][j], i, j]);
    }
    edges.sort(function (a, b) { return a[0] - b[0]; });
    var p = [];
    for (i = 0; i < n; i++) p[i] = i;
    function find(x) { return p[x] === x ? x : (p[x] = find(p[x])); }
    logger.println("Kruskal's MST — edges by weight");
    var taken = 0;
    for (i = 0; i < edges.length; i++) {
      var w = edges[i][0], a = edges[i][1], b = edges[i][2];
      tracer.visit(b, a, w);
      T.Tracer.delay();
      var fa = find(a), fb = find(b);
      if (fa !== fb) {
        p[fa] = fb;
        taken++;
        logger.println('keep ' + a + '–' + b + ' weight ' + w);
      } else {
        logger.println('skip ' + a + '–' + b + ' (cycle)');
        tracer.leave(b, a);
        T.Tracer.delay();
      }
      if (taken === n - 1) break;
    }
    logger.println('spanning tree complete');
    return { graph: G, start: 0, end: n - 1 };
  }

  function fibonacci(input) {
    var n = input && input.n != null ? Math.max(2, Math.min(12, input.n | 0)) : 8;
    var chart = new T.ChartTracer('F');
    var tracer = new T.Array1DTracer('F');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([chart, tracer, logger]));
    tracer.chart(chart);
    var F = [];
    for (var i = 0; i <= n; i++) F[i] = 0;
    F[0] = 0; F[1] = 1;
    tracer.set(F);
    T.Tracer.delay();
    logger.println('F[0] = 0, F[1] = 1');
    for (i = 2; i <= n; i++) {
      Lselect(tracer, i - 2, i - 1);
      T.Tracer.delay();
      F[i] = F[i - 1] + F[i - 2];
      tracer.patch(i, F[i]);
      logger.println('F[' + i + '] = ' + F[i - 1] + ' + ' + F[i - 2] + ' = ' + F[i]);
      T.Tracer.delay();
      tracer.depatch(i);
      tracer.deselect(i - 2, i - 1);
    }
    logger.println('F[' + n + '] = ' + F[n]);
    return { n: n };
  }
  function Lselect(tr, a, b) { tr.select(a, b); }

  function knapsack(input) {
    var values = (input && input.values) ? input.values.slice() : [1, 4, 5, 7];
    var weights = (input && input.weights) ? input.weights.slice() : [1, 3, 4, 5];
    var cap = input && input.capacity != null ? input.capacity | 0 : 7;
    var n = values.length;
    var table = [];
    var r, c;
    for (r = 0; r <= n; r++) {
      table[r] = [];
      for (c = 0; c <= cap; c++) table[r][c] = 0;
    }
    var grid = new T.Array2DTracer('dp[item][capacity]');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([grid, logger]));
    grid.set(table);
    T.Tracer.delay();
    logger.println('0/1 knapsack  values=[' + values.join(', ') + '] weights=[' + weights.join(', ') + '] cap=' + cap);
    for (r = 1; r <= n; r++) {
      for (c = 0; c <= cap; c++) {
        grid.select(r, c);
        T.Tracer.delay();
        if (weights[r - 1] <= c) {
          var take = values[r - 1] + table[r - 1][c - weights[r - 1]];
          var skip = table[r - 1][c];
          table[r][c] = take > skip ? take : skip;
        } else {
          table[r][c] = table[r - 1][c];
        }
        grid.patch(r, c, table[r][c]);
        T.Tracer.delay();
        grid.depatch(r, c);
        grid.deselect(r, c);
      }
    }
    logger.println('best value = ' + table[n][cap]);
    return { values: values, weights: weights, capacity: cap };
  }

  function lcs(input) {
    var A = (input && input.a) ? String(input.a) : 'ABCBDAB';
    var B = (input && input.b) ? String(input.b) : 'BDCABA';
    var n = A.length, m = B.length;
    var dp = [];
    var i, j;
    for (i = 0; i <= n; i++) {
      dp[i] = [];
      for (j = 0; j <= m; j++) dp[i][j] = 0;
    }
    var grid = new T.Array2DTracer('LCS length');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([grid, logger]));
    grid.set(dp);
    T.Tracer.delay();
    logger.println('LCS of "' + A + '" and "' + B + '"');
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        grid.select(i, j);
        T.Tracer.delay();
        if (A.charAt(i - 1) === B.charAt(j - 1)) dp[i][j] = dp[i - 1][j - 1] + 1;
        else dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
        grid.patch(i, j, dp[i][j]);
        T.Tracer.delay();
        grid.depatch(i, j);
        grid.deselect(i, j);
      }
    }
    var out = '';
    i = n; j = m;
    while (i > 0 && j > 0) {
      if (A.charAt(i - 1) === B.charAt(j - 1)) {
        out = A.charAt(i - 1) + out;
        grid.select(i, j);
        T.Tracer.delay();
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
      else j--;
    }
    logger.println('LCS = "' + out + '" length ' + dp[n][m]);
    return { a: A, b: B };
  }

  function floyd(input) {
    var G = graphOf(input, { N: 5, weighted: true, directed: true, ratio: 0.5 });
    var n = G.length;
    var INF = 99;
    var dist = [];
    var i, j, k;
    for (i = 0; i < n; i++) {
      dist[i] = [];
      for (j = 0; j < n; j++) {
        if (i === j) dist[i][j] = 0;
        else dist[i][j] = G[i][j] ? G[i][j] : INF;
      }
    }
    var grid = new T.Array2DTracer('distances');
    var gtr = new T.GraphTracer('GraphTracer').directed(true).weighted();
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([gtr, grid, logger]));
    gtr.set(G);
    grid.set(dist.map(function (row) {
      return row.map(function (v) { return v >= INF ? '∞' : v; });
    }));
    T.Tracer.delay();
    logger.println("Floyd–Warshall all-pairs shortest paths");
    for (k = 0; k < n; k++) {
      logger.println('via ' + k);
      gtr.visit(k);
      T.Tracer.delay();
      for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
          grid.select(i, j);
          T.Tracer.delay();
          if (dist[i][k] + dist[k][j] < dist[i][j]) {
            dist[i][j] = dist[i][k] + dist[k][j];
            grid.patch(i, j, dist[i][j]);
            T.Tracer.delay();
            grid.depatch(i, j);
          }
          grid.deselect(i, j);
        }
      }
      gtr.leave(k);
    }
    logger.println('done');
    return { graph: G, start: 0, end: n - 1 };
  }

  function nqueens(input) {
    var n = input && input.n != null ? Math.max(4, Math.min(6, input.n | 0)) : 4;
    var board = [];
    var r, c;
    for (r = 0; r < n; r++) {
      board[r] = [];
      for (c = 0; c < n; c++) board[r][c] = '';
    }
    var grid = new T.Array2DTracer(n + '-Queens');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([grid, logger]));
    grid.set(board);
    T.Tracer.delay();
    logger.println('place ' + n + ' queens so none share a row, column or diagonal');

    function safe(row, col) {
      var i;
      for (i = 0; i < row; i++) if (board[i][col] === 'Q') return false;
      for (i = 1; row - i >= 0 && col - i >= 0; i++) if (board[row - i][col - i] === 'Q') return false;
      for (i = 1; row - i >= 0 && col + i < n; i++) if (board[row - i][col + i] === 'Q') return false;
      return true;
    }
    var found = false;
    function solve(row) {
      if (found) return;
      if (row === n) {
        found = true;
        logger.println('solution found');
        return;
      }
      for (var col = 0; col < n; col++) {
        grid.select(row, col);
        T.Tracer.delay();
        if (safe(row, col)) {
          board[row][col] = 'Q';
          grid.patch(row, col, 'Q');
          T.Tracer.delay();
          grid.depatch(row, col);
          grid.deselect(row, col);
          solve(row + 1);
          if (found) return;
          board[row][col] = '';
          grid.patch(row, col, '');
          T.Tracer.delay();
          grid.depatch(row, col);
        } else {
          grid.deselect(row, col);
        }
      }
    }
    solve(0);
    if (!found) logger.println('no solution');
    return { n: n };
  }

  function floodFill(input) {
    var grid0 = (input && input.grid) ? T.clone(input.grid) : [
      [1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 1, 0, 0, 0, 1],
      [1, 0, 0, 1, 0, 1, 0, 1],
      [1, 0, 1, 1, 0, 1, 0, 1],
      [1, 0, 0, 0, 0, 1, 0, 1],
      [1, 1, 1, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1]
    ];
    var sr = input && input.sr != null ? input.sr | 0 : 1;
    var sc = input && input.sc != null ? input.sc | 0 : 1;
    var color = input && input.color != null ? input.color | 0 : 2;
    var G = T.clone(grid0);
    var h = G.length, w = G[0].length;
    var tracer = new T.Array2DTracer('grid');
    var logger = new T.LogTracer('LogTracer');
    T.Layout.setRoot(new T.VerticalLayout([tracer, logger]));
    tracer.set(G);
    T.Tracer.delay();
    var from = G[sr][sc];
    logger.println('flood from (' + sr + ',' + sc + ') value ' + from + ' → ' + color);
    if (from === color) {
      logger.println('already that colour');
      return { grid: grid0, sr: sr, sc: sc, color: color };
    }
    var Q = [[sr, sc]];
    G[sr][sc] = color;
    tracer.patch(sr, sc, color);
    T.Tracer.delay();
    tracer.depatch(sr, sc);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (Q.length) {
      var cur = Q.shift();
      tracer.select(cur[0], cur[1]);
      T.Tracer.delay();
      for (var d = 0; d < 4; d++) {
        var nr = cur[0] + dirs[d][0], nc = cur[1] + dirs[d][1];
        if (nr < 0 || nc < 0 || nr >= h || nc >= w) continue;
        if (G[nr][nc] !== from) continue;
        G[nr][nc] = color;
        tracer.patch(nr, nc, color);
        T.Tracer.delay();
        tracer.depatch(nr, nc);
        Q.push([nr, nc]);
      }
      tracer.deselect(cur[0], cur[1]);
    }
    logger.println('fill complete');
    return { grid: grid0, sr: sr, sc: sc, color: color };
  }

  var LIST = [
    { id: 'bubble-sort', name: 'Bubble Sort', category: 'Sorting', kind: 'array',
      blurb: 'Walk adjacent pairs. Swap an inversion. The next pass is one cell shorter.',
      run: bubble },
    { id: 'selection-sort', name: 'Selection Sort', category: 'Sorting', kind: 'array',
      blurb: 'Each pass finds the smallest remaining value and swaps it into place.',
      run: selection },
    { id: 'insertion-sort', name: 'Insertion Sort', category: 'Sorting', kind: 'array',
      blurb: 'Grow a sorted prefix. Slide the next value left until it fits.',
      run: insertion },
    { id: 'merge-sort', name: 'Merge Sort', category: 'Sorting', kind: 'array',
      blurb: 'Split in half, sort each half, merge the two sorted runs.',
      run: mergeSort },
    { id: 'quicksort', name: 'Quicksort', category: 'Sorting', kind: 'array',
      blurb: 'Pick a pivot. Smaller values to the left, larger to the right, recurse.',
      run: quicksort },
    { id: 'heapsort', name: 'Heapsort', category: 'Sorting', kind: 'array',
      blurb: 'Build a max-heap, then peel the largest value off the front each time.',
      run: heapsort },
    { id: 'linear-search', name: 'Linear Search', category: 'Search', kind: 'search',
      blurb: 'Check every cell, left to right, until the target appears.',
      run: linearSearch },
    { id: 'binary-search', name: 'Binary Search', category: 'Search', kind: 'search',
      blurb: 'On a sorted array, probe the middle and throw away half each time.',
      run: binarySearch },
    { id: 'bfs', name: 'Breadth-First Search', category: 'Graph', kind: 'graph',
      blurb: 'A queue walks layer by layer. First time you reach a node is the shortest unweighted path — here, shortest by edge weight via relaxation.',
      run: bfs },
    { id: 'dfs', name: 'Depth-First Search', category: 'Graph', kind: 'graph',
      blurb: 'Walk as deep as you can, then backtrack. The tree layout is the walk from the start.',
      run: dfs },
    { id: 'dijkstra', name: "Dijkstra's Shortest Path", category: 'Graph', kind: 'graph',
      blurb: 'Always expand the closest unfinished node. Relax every edge out of it.',
      run: dijkstra },
    { id: 'prim', name: "Prim's MST", category: 'Graph', kind: 'graph',
      blurb: 'Grow a tree from one node by always adding the cheapest edge out.',
      run: prim },
    { id: 'kruskal', name: "Kruskal's MST", category: 'Graph', kind: 'graph',
      blurb: 'Sort every edge. Keep it if the two ends are still in different trees.',
      run: kruskal },
    { id: 'fibonacci', name: 'Fibonacci', category: 'Dynamic Programming', kind: 'n',
      blurb: 'Each number is the sum of the two before it. The chart is the table.',
      run: fibonacci },
    { id: 'knapsack', name: '0/1 Knapsack', category: 'Dynamic Programming', kind: 'knapsack',
      blurb: 'For each item and each capacity, take it or skip it. The cell is the better of the two.',
      run: knapsack },
    { id: 'lcs', name: 'Longest Common Subsequence', category: 'Dynamic Programming', kind: 'strings',
      blurb: 'A table of prefixes. Matching letters step diagonally; otherwise take the better neighbour.',
      run: lcs },
    { id: 'floyd', name: "Floyd–Warshall", category: 'Dynamic Programming', kind: 'graph',
      blurb: 'Try every node as a midpoint. The grid is every pair’s best distance so far.',
      run: floyd },
    { id: 'n-queens', name: 'N-Queens', category: 'Backtracking', kind: 'n',
      blurb: 'Place a queen in each row. If the square is attacked, try the next column; if the row is stuck, undo.',
      run: nqueens },
    { id: 'flood-fill', name: 'Flood Fill', category: 'Backtracking', kind: 'grid',
      blurb: 'From a seed cell, paint every 4-connected neighbour that still has the old value.',
      run: floodFill }
  ];

  var BY = {};
  for (var i = 0; i < LIST.length; i++) BY[LIST[i].id] = LIST[i];

  function defaultInput(id) {
    T.Randomize.seed(7);
    var a = BY[id];
    if (!a) return {};
    var captured = {};
    T.record(function () { captured = a.run(null) || {}; });
    return captured;
  }

  function shuffleInput(id) {
    T.Randomize.seed((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    var a = BY[id];
    if (!a) return {};
    var captured = {};
    T.record(function () { captured = a.run(null) || {}; });
    return captured;
  }

  function run(id, input) {
    var a = BY[id];
    if (!a) throw new Error('unknown algorithm ' + id);
    var captured = {};
    var rec = T.record(function () { captured = a.run(input) || {}; });
    rec.id = id;
    rec.input = captured;
    rec.meta = { name: a.name, category: a.category, blurb: a.blurb, kind: a.kind };
    return rec;
  }

  root.AVAlgos = {
    list: LIST,
    byId: function (id) { return BY[id]; },
    run: run,
    defaultInput: defaultInput,
    shuffleInput: shuffleInput
  };
})(typeof window !== 'undefined' ? window : globalThis);
