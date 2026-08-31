/* WebGL orbit view of a triangulated B-rep (faces + edges). No Three.js. */
(function (root) {
  'use strict';

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader');
    }
    return sh;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'program');
    }
    return p;
  }

  var VS_FACE = [
    'attribute vec3 aPos, aNrm;',
    'uniform mat4 uMVP, uModel;',
    'uniform mat3 uN;',
    'varying vec3 vN, vW;',
    'void main(){',
    '  vec4 w = uModel * vec4(aPos,1.0);',
    '  vW = w.xyz;',
    '  vN = normalize(uN * aNrm);',
    '  gl_Position = uMVP * vec4(aPos,1.0);',
    '}'
  ].join('\n');
  var FS_FACE = [
    'precision mediump float;',
    'varying vec3 vN, vW;',
    'uniform vec3 uLight, uColor, uEye;',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 L = normalize(uLight - vW);',
    '  vec3 V = normalize(uEye - vW);',
    '  float diff = max(dot(n,L), 0.0);',
    '  float spec = pow(max(dot(reflect(-L,n), V), 0.0), 28.0);',
    '  vec3 col = uColor * (0.22 + 0.78 * diff) + vec3(0.55) * spec * 0.35;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');
  var VS_LINE = [
    'attribute vec3 aPos;',
    'uniform mat4 uMVP;',
    'void main(){ gl_Position = uMVP * vec4(aPos,1.0); }'
  ].join('\n');
  var FS_LINE = [
    'precision mediump float;',
    'uniform vec3 uColor;',
    'void main(){ gl_FragColor = vec4(uColor, 1.0); }'
  ].join('\n');

  function ident() {
    return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      o[j * 4 + i] =
        a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] +
        a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    var o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1;
    o[14] = 2 * far * near * nf; return o;
  }
  function lookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var zl = 1 / Math.hypot(zx, zy, zz); zx *= zl; zy *= zl; zz *= zl;
    var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    var xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    var o = ident();
    o[0] = xx; o[1] = yx; o[2] = zx;
    o[4] = xy; o[5] = yy; o[6] = zy;
    o[8] = xz; o[9] = yz; o[10] = zz;
    o[12] = -(xx * ex + xy * ey + xz * ez);
    o[13] = -(yx * ex + yy * ey + yz * ez);
    o[14] = -(zx * ex + zy * ey + zz * ez);
    return o;
  }
  function invert3(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2];
    var a10 = m[4], a11 = m[5], a12 = m[6];
    var a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21;
    var b11 = -a22 * a10 + a12 * a20;
    var b21 = a21 * a10 - a11 * a20;
    var det = a00 * b01 + a01 * b11 + a02 * b21 || 1;
    var o = new Float32Array(9);
    o[0] = b01 / det; o[1] = (-a22 * a01 + a02 * a21) / det; o[2] = (a12 * a01 - a02 * a11) / det;
    o[3] = b11 / det; o[4] = (a22 * a00 - a02 * a20) / det; o[5] = (-a12 * a00 + a02 * a10) / det;
    o[6] = b21 / det; o[7] = (-a21 * a00 + a01 * a20) / det; o[8] = (a11 * a00 - a01 * a10) / det;
    return o;
  }

  function CadView(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('WebGL is not available.');
    var gl = this.gl;
    gl.getExtension('OES_element_index_uint');
    this.faceProg = program(gl, VS_FACE, FS_FACE);
    this.lineProg = program(gl, VS_LINE, FS_LINE);
    this.yaw = 0.7; this.pitch = 0.45; this.dist = 80;
    this.target = [20, 12, 6];
    this.mesh = null;
    this._bufs = null;
    this._dragging = false;
    this._last = null;
    this._pins = [];
    this._bind();
    this.resize();
  }

  CadView.prototype._bind = function () {
    var self = this, el = this.canvas;
    function pos(ev) {
      var t = ev.touches && ev.touches[0] ? ev.touches[0]
            : (ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev);
      return { x: t.clientX, y: t.clientY };
    }
    el.addEventListener('pointerdown', function (ev) {
      el.setPointerCapture(ev.pointerId);
      self._dragging = true; self._last = pos(ev);
    });
    el.addEventListener('pointermove', function (ev) {
      if (!self._dragging || !self._last) return;
      var p = pos(ev);
      self.yaw += (p.x - self._last.x) * 0.008;
      self.pitch += (p.y - self._last.y) * 0.008;
      self.pitch = Math.max(-1.2, Math.min(1.2, self.pitch));
      self._last = p;
      self.draw();
    });
    function up() { self._dragging = false; self._last = null; }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      self.dist *= ev.deltaY > 0 ? 1.08 : 0.92;
      self.dist = Math.max(8, Math.min(400, self.dist));
      self.draw();
    }, { passive: false });
    el.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        var a = ev.touches[0], b = ev.touches[1];
        self._pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        self._dragging = false;
      }
    }, { passive: true });
    el.addEventListener('touchmove', function (ev) {
      if (ev.touches.length === 2 && self._pinch) {
        ev.preventDefault();
        var a = ev.touches[0], b = ev.touches[1];
        var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        self.dist *= self._pinch / d;
        self.dist = Math.max(8, Math.min(400, self.dist));
        self._pinch = d;
        self.draw();
      }
    }, { passive: false });
    window.addEventListener('resize', function () { self.resize(); });
  };

  CadView.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, this.canvas.clientWidth * dpr);
    var h = Math.max(1, this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.draw();
  };

  CadView.prototype.setMesh = function (mesh) {
    var gl = this.gl;
    this.mesh = mesh;
    if (this._bufs) {
      gl.deleteBuffer(this._bufs.pos);
      gl.deleteBuffer(this._bufs.nrm);
      gl.deleteBuffer(this._bufs.idx);
      gl.deleteBuffer(this._bufs.edge);
    }
    this._bufs = null;
    if (!mesh || !mesh.positions || !mesh.positions.length) { this.draw(); return; }
    var pos = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    var nrm = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    var idx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    var edge = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, edge);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.edges || new Float32Array(0), gl.STATIC_DRAW);
    this._bufs = { pos: pos, nrm: nrm, idx: idx, edge: edge };
    if (mesh.center) this.target = mesh.center.slice();
    if (mesh.radius) this.dist = Math.max(20, mesh.radius * 2.6);
    this.draw();
  };

  CadView.prototype.eye = function () {
    var t = this.target;
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return [
      t[0] + this.dist * cp * cy,
      t[1] + this.dist * cp * sy,
      t[2] + this.dist * sp
    ];
  };

  CadView.prototype.draw = function () {
    var gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.027, 0.035, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this._bufs || !this.mesh || !this.mesh.indices.length) return;
    var eye = this.eye();
    var view = lookAt(eye[0], eye[1], eye[2], this.target[0], this.target[1], this.target[2], 0, 0, 1);
    var proj = perspective(0.7, w / Math.max(1, h), 0.2, 2000);
    var model = ident();
    var mvp = mul(proj, mul(view, model));
    var nmat = invert3(model);

    var p = this.faceProg;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufs.pos);
    var aPos = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufs.nrm);
    var aNrm = gl.getAttribLocation(p, 'aNrm');
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uMVP'), false, mvp);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uModel'), false, model);
    gl.uniformMatrix3fv(gl.getUniformLocation(p, 'uN'), false, nmat);
    gl.uniform3f(gl.getUniformLocation(p, 'uLight'), this.target[0] + 40, this.target[1] + 30, this.target[2] + 80);
    gl.uniform3f(gl.getUniformLocation(p, 'uEye'), eye[0], eye[1], eye[2]);
    gl.uniform3f(gl.getUniformLocation(p, 'uColor'), 0.32, 0.68, 0.82);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._bufs.idx);
    var itype = this.mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    if (itype === gl.UNSIGNED_INT) {
      var ext = gl.getExtension('OES_element_index_uint');
      if (!ext) itype = gl.UNSIGNED_SHORT;
    }
    gl.drawElements(gl.TRIANGLES, this.mesh.indices.length, itype, 0);

    var lp = this.lineProg;
    gl.useProgram(lp);
    gl.depthFunc(gl.LEQUAL);
    gl.bindBuffer(gl.ARRAY_BUFFER, this._bufs.edge);
    var lpPos = gl.getAttribLocation(lp, 'aPos');
    gl.enableVertexAttribArray(lpPos);
    gl.vertexAttribPointer(lpPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(lp, 'uMVP'), false, mvp);
    gl.uniform3f(gl.getUniformLocation(lp, 'uColor'), 0.93, 0.95, 0.98);
    if (this.mesh.edges && this.mesh.edges.length) {
      gl.drawArrays(gl.LINES, 0, this.mesh.edges.length / 3);
    }
    gl.depthFunc(gl.LESS);
  };

  CadView.flatten = function (facesAndEdges) {
    var faces = (facesAndEdges && facesAndEdges[0]) || [];
    var edges = (facesAndEdges && facesAndEdges[1]) || [];
    var pos = [], nrm = [], idx = [];
    var min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    function consider(x, y, z) {
      if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    }
    for (var f = 0; f < faces.length; f++) {
      var face = faces[f];
      var base = pos.length / 3;
      var vc = face.vertex_coord || [];
      var nc = face.normal_coord || [];
      for (var i = 0; i < vc.length; i += 3) {
        pos.push(vc[i], vc[i + 1], vc[i + 2]);
        nrm.push(nc[i] || 0, nc[i + 1] || 0, nc[i + 2] || 1);
        consider(vc[i], vc[i + 1], vc[i + 2]);
      }
      var tri = face.tri_indexes || [];
      for (var t = 0; t < tri.length; t++) idx.push(base + tri[t]);
    }
    var elines = [];
    for (var e = 0; e < edges.length; e++) {
      var ev = edges[e].vertex_coord || [];
      for (var k = 0; k + 5 < ev.length; k += 3) {
        elines.push(ev[k], ev[k + 1], ev[k + 2], ev[k + 3], ev[k + 4], ev[k + 5]);
      }
    }
    var center = [
      (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2
    ];
    var radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
    var use32 = idx.some(function (n) { return n > 65535; });
    return {
      positions: new Float32Array(pos),
      normals: new Float32Array(nrm),
      indices: use32 ? new Uint32Array(idx) : new Uint16Array(idx),
      edges: new Float32Array(elines),
      center: center,
      radius: radius || 10,
      triCount: idx.length / 3
    };
  };

  root.CadView = CadView;
})(window);
