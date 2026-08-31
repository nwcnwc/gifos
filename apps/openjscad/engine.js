/* Compile a JSCAD v2 script, turn solids into a triangle mesh, emit STL. */
(function (root) {
  'use strict';

  function modeling() {
    var j = root.jscadModeling;
    if (!j) throw new Error('JSCAD modeling library did not load.');
    return j;
  }

  function requireJscad(id) {
    var j = modeling();
    id = String(id == null ? '' : id);
    if (id === '@jscad/modeling') return j;
    var prefix = '@jscad/modeling/';
    if (id.indexOf(prefix) === 0) {
      var parts = id.slice(prefix.length).split('/');
      var cur = j;
      for (var i = 0; i < parts.length; i++) {
        if (!cur || cur[parts[i]] == null) {
          throw new Error('Cannot find module \'' + id + '\'');
        }
        cur = cur[parts[i]];
      }
      return cur;
    }
    throw new Error('Cannot find module \'' + id + '\' — only @jscad/modeling is bundled here.');
  }

  // GifOS CSP is script-src 'unsafe-inline' with NO 'unsafe-eval', so
  // new Function / eval throw EvalError in the app frame. A classic
  // <script> inserted with textContent is an inline script and is legal.
  // Node (build checks) has no document — Function is fine there.
  function compile(src) {
    var source = String(src == null ? '' : src);
    if (!source.trim()) throw new Error('The script is empty. Load Cube or Gear, or write a main() that returns a shape.');
    if (typeof document !== 'undefined' && document.createElement) return compileScript(source);
    return compileFunction(source);
  }

  function fromBox(box, moduleObj) {
    var exp = (box && box.exports) || (moduleObj && moduleObj.exports) || {};
    var main = (box && box.main) || exp.main;
    var gpd = (box && box.getParameterDefinitions) || exp.getParameterDefinitions;
    if (typeof main !== 'function') {
      throw new Error('The script must define main() and return a shape (cube, cylinder, a union…).');
    }
    return {
      main: main,
      getParameterDefinitions: typeof gpd === 'function' ? gpd : null
    };
  }

  function compileFunction(source) {
    var moduleObj = { exports: {} };
    var fn;
    try {
      fn = new Function(
        'require', 'module', 'exports', 'jscad',
        source +
          '\nreturn {' +
          'exports: module.exports,' +
          'main: (typeof main === "function" ? main : undefined),' +
          'getParameterDefinitions: (typeof getParameterDefinitions === "function" ? getParameterDefinitions : undefined)' +
          '};'
      );
    } catch (e) {
      throw new Error(cleanErr(e, 'Syntax error'));
    }
    var box;
    try {
      box = fn(requireJscad, moduleObj, moduleObj.exports, modeling());
    } catch (e) {
      throw new Error(cleanErr(e, 'The script failed'));
    }
    return fromBox(box, moduleObj);
  }

  function compileScript(source) {
    var token = '__jscadC' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var moduleObj = { exports: {} };
    root[token + 'R'] = requireJscad;
    root[token + 'M'] = moduleObj;
    root[token + 'J'] = modeling();
    root[token + 'E'] = null;
    var prevOnError = root.onerror;
    root.onerror = function (msg) {
      root[token + 'E'] = new Error(String(msg || 'Syntax error'));
      return true;
    };
    var el = document.createElement('script');
    el.textContent =
      '(function(require,module,exports,jscad){\n' +
      'try {\n' +
      source +
      '\nwindow.' + token + '={' +
      'exports:module.exports,' +
      'main:(typeof main==="function"?main:undefined),' +
      'getParameterDefinitions:(typeof getParameterDefinitions==="function"?getParameterDefinitions:undefined)' +
      '};\n' +
      '} catch (e) { window.' + token + 'E = e; }\n' +
      '})(window.' + token + 'R, window.' + token + 'M, window.' + token + 'M.exports, window.' + token + 'J);';
    try {
      document.head.appendChild(el);
    } catch (e) {
      root[token + 'E'] = e;
    }
    if (el.parentNode) el.parentNode.removeChild(el);
    root.onerror = prevOnError;
    var err = root[token + 'E'];
    var box = root[token];
    delete root[token];
    delete root[token + 'R'];
    delete root[token + 'M'];
    delete root[token + 'J'];
    delete root[token + 'E'];
    if (err) throw new Error(cleanErr(err, /syntax/i.test(String(err.message || err)) ? 'Syntax error' : 'The script failed'));
    return fromBox(box, moduleObj);
  }

  function cleanErr(e, prefix) {
    var msg = String((e && e.message) || e || 'error');
    msg = msg.replace(/\s+/g, ' ').trim();
    if (msg.length > 240) msg = msg.slice(0, 237) + '…';
    return prefix + ': ' + msg;
  }

  function defaultParams(defs) {
    var out = {};
    (defs || []).forEach(function (d) {
      if (!d || !d.name) return;
      if (d.type === 'group') return;
      if (d.initial !== undefined) out[d.name] = d.initial;
      else if (d['default'] !== undefined) out[d.name] = d['default'];
      else if (d.type === 'checkbox' || d.type === 'boolean') out[d.name] = false;
      else if (d.type === 'choice' && d.values && d.values.length) out[d.name] = d.values[0];
      else out[d.name] = 0;
    });
    return out;
  }

  function flattenSolids(x, into) {
    if (x == null) return into;
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length; i++) flattenSolids(x[i], into);
      return into;
    }
    into.push(x);
    return into;
  }

  function run(src, params) {
    var compiled = compile(src);
    var defs = compiled.getParameterDefinitions ? compiled.getParameterDefinitions() : [];
    if (!Array.isArray(defs)) defs = [];
    var p = Object.assign(defaultParams(defs), params || {});
    var raw;
    try {
      raw = compiled.main(p);
    } catch (e) {
      throw new Error(cleanErr(e, 'main() threw'));
    }
    var solids = flattenSolids(raw, []);
    if (!solids.length) throw new Error('main() returned nothing. Return a cube, a union, or an array of shapes.');
    var mesh = solidsToMesh(solids);
    if (!mesh.count) throw new Error('That script produced no 3D triangles. Return a 3D solid (or a 2D shape — those are extruded thinly so you can see them).');
    return { mesh: mesh, defs: defs, params: p };
  }

  function nrm(a, b, c) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy;
    var ny = uz * vx - ux * vz;
    var nz = ux * vy - uy * vx;
    var l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  function pushTri(pos, nrmA, colA, a, b, c, rgb) {
    var n = nrm(a, b, c);
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    nrmA.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    colA.push(rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2], rgb[0], rgb[1], rgb[2]);
  }

  function geomColor(g) {
    var c = g && g.color;
    if (c && c.length >= 3) return [c[0], c[1], c[2]];
    return [0.78, 0.82, 0.88];
  }

  function solidsToMesh(solids) {
    var j = modeling();
    var geom2 = j.geometries.geom2;
    var geom3 = j.geometries.geom3;
    var path2 = j.geometries.path2;
    var pos = [], nrmA = [], colA = [];
    var min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    function grow(v) {
      if (v[0] < min[0]) min[0] = v[0];
      if (v[1] < min[1]) min[1] = v[1];
      if (v[2] < min[2]) min[2] = v[2];
      if (v[0] > max[0]) max[0] = v[0];
      if (v[1] > max[1]) max[1] = v[1];
      if (v[2] > max[2]) max[2] = v[2];
    }
    for (var s = 0; s < solids.length; s++) {
      var g = solids[s];
      if (path2.isA(g)) continue;
      if (geom2.isA(g)) {
        try { g = j.extrusions.extrudeLinear({ height: 0.4 }, g); } catch (e) { continue; }
      }
      if (!geom3.isA(g)) continue;
      var rgb = geomColor(g);
      var polys = geom3.toPolygons(g);
      for (var p = 0; p < polys.length; p++) {
        var verts = polys[p].vertices;
        if (!verts || verts.length < 3) continue;
        for (var i = 1; i < verts.length - 1; i++) {
          var a = verts[0], b = verts[i], c = verts[i + 1];
          pushTri(pos, nrmA, colA, a, b, c, rgb);
          grow(a); grow(b); grow(c);
        }
      }
    }
    var count = (pos.length / 9) | 0;
    if (!count) {
      min = [-1, -1, -1];
      max = [1, 1, 1];
    }
    return {
      count: count,
      positions: new Float32Array(pos),
      normals: new Float32Array(nrmA),
      colors: new Float32Array(colA),
      min: min,
      max: max
    };
  }

  function meshToStl(mesh) {
    var n = mesh.count | 0;
    var buf = new ArrayBuffer(80 + 4 + n * 50);
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);
    var head = 'GifOS OpenJSCAD';
    for (var i = 0; i < head.length && i < 80; i++) u8[i] = head.charCodeAt(i);
    dv.setUint32(80, n, true);
    var pos = mesh.positions, nrmA = mesh.normals;
    var o = 84;
    for (var t = 0; t < n; t++) {
      var k = t * 9;
      dv.setFloat32(o, nrmA[k], true); dv.setFloat32(o + 4, nrmA[k + 1], true); dv.setFloat32(o + 8, nrmA[k + 2], true);
      dv.setFloat32(o + 12, pos[k], true); dv.setFloat32(o + 16, pos[k + 1], true); dv.setFloat32(o + 20, pos[k + 2], true);
      dv.setFloat32(o + 24, pos[k + 3], true); dv.setFloat32(o + 28, pos[k + 4], true); dv.setFloat32(o + 32, pos[k + 5], true);
      dv.setFloat32(o + 36, pos[k + 6], true); dv.setFloat32(o + 40, pos[k + 7], true); dv.setFloat32(o + 44, pos[k + 8], true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
    return buf;
  }

  root.JscadEngine = {
    compile: compile,
    run: run,
    defaultParams: defaultParams,
    solidsToMesh: solidsToMesh,
    meshToStl: meshToStl,
    requireJscad: requireJscad
  };
})(typeof window !== 'undefined' ? window : this);
