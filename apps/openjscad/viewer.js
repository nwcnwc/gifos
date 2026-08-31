/* Orbit + pinch WebGL view of a JscadEngine mesh. Classic script. */
(function (root) {
  'use strict';

  var VS = [
    'attribute vec3 aPos, aNrm, aCol;',
    'uniform mat4 uMVP, uN;',
    'uniform vec3 uLight, uFill;',
    'varying vec3 vCol;',
    'void main(){',
    '  vec3 n = normalize((uN * vec4(aNrm, 0.0)).xyz);',
    '  float d = 0.22 + 0.78 * abs(dot(n, uLight));',
    '  float f = 0.18 * max(0.0, dot(n, uFill));',
    '  vCol = aCol * (d + f);',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vCol;',
    'uniform float uWire;',
    'void main(){',
    '  vec3 c = mix(vCol, vec3(0.92, 0.95, 1.0), uWire);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var GRID_VS = [
    'attribute vec3 aPos;',
    'uniform mat4 uMVP;',
    'void main(){ gl_Position = uMVP * vec4(aPos, 1.0); }'
  ].join('\n');
  var GRID_FS = [
    'precision mediump float;',
    'uniform vec3 uCol;',
    'void main(){ gl_FragColor = vec4(uCol, 1.0); }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || 'shader');
    }
    return s;
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

  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function persp(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }
  function lookAt(eye, target, up) {
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    var m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  }
  function invert3(m) {
    var a00 = m[0], a01 = m[1], a02 = m[2];
    var a10 = m[4], a11 = m[5], a12 = m[6];
    var a20 = m[8], a21 = m[9], a22 = m[10];
    var b01 = a22 * a11 - a12 * a21;
    var b11 = -a22 * a10 + a12 * a20;
    var b21 = a21 * a10 - a11 * a20;
    var det = a00 * b01 + a01 * b11 + a02 * b21 || 1;
    var o = new Float32Array(16);
    o[0] = b01 / det; o[1] = (-a22 * a01 + a02 * a21) / det; o[2] = (a12 * a01 - a02 * a11) / det;
    o[4] = b11 / det; o[5] = (a22 * a00 - a02 * a20) / det; o[6] = (-a12 * a00 + a02 * a10) / det;
    o[8] = b21 / det; o[9] = (-a21 * a00 + a01 * a20) / det; o[10] = (a11 * a00 - a01 * a10) / det;
    o[15] = 1;
    return o;
  }

  function JscadView(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
              canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('This browser has no WebGL, so the model cannot be drawn.');
    var gl = this.gl;
    this.prog = program(gl, VS, FS);
    this.gridProg = program(gl, GRID_VS, GRID_FS);
    this.aPos = gl.getAttribLocation(this.prog, 'aPos');
    this.aNrm = gl.getAttribLocation(this.prog, 'aNrm');
    this.aCol = gl.getAttribLocation(this.prog, 'aCol');
    this.uMVP = gl.getUniformLocation(this.prog, 'uMVP');
    this.uN = gl.getUniformLocation(this.prog, 'uN');
    this.uLight = gl.getUniformLocation(this.prog, 'uLight');
    this.uFill = gl.getUniformLocation(this.prog, 'uFill');
    this.uWire = gl.getUniformLocation(this.prog, 'uWire');
    this.gPos = gl.getAttribLocation(this.gridProg, 'aPos');
    this.gMVP = gl.getUniformLocation(this.gridProg, 'uMVP');
    this.gCol = gl.getUniformLocation(this.gridProg, 'uCol');
    this.bufPos = gl.createBuffer();
    this.bufNrm = gl.createBuffer();
    this.bufCol = gl.createBuffer();
    this.bufGrid = gl.createBuffer();
    this.count = 0;
    this.gridCount = 0;
    this.yaw = 0.7;
    this.pitch = 0.45;
    this.radius = 60;
    this.target = [0, 0, 0];
    this.autoRotate = false;
    this.wireframe = false;
    this.grid = true;
    this.min = [-10, -10, -10];
    this.max = [10, 10, 10];
    this._pointers = {};
    this._lastPinch = 0;
    this._raf = 0;
    this._dirty = true;
    this._bind();
    this.resize();
    this._loop();
  }

  JscadView.prototype._bind = function () {
    var self = this, el = this.canvas;
    el.addEventListener('pointerdown', function (e) {
      el.setPointerCapture(e.pointerId);
      self._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      self._lastPinch = 0;
    });
    el.addEventListener('pointermove', function (e) {
      var p = self._pointers[e.pointerId];
      if (!p) return;
      var ids = Object.keys(self._pointers);
      if (ids.length >= 2) {
        var a = self._pointers[ids[0]], b = self._pointers[ids[1]];
        if (!a || !b) return;
        var dx = a.x - b.x, dy = a.y - b.y;
        var dist = Math.hypot(dx, dy) || 1;
        if (self._lastPinch) {
          var s = self._lastPinch / dist;
          self.radius = Math.max(1, Math.min(4000, self.radius * s));
          self._dirty = true;
        }
        self._lastPinch = dist;
        p.x = e.clientX; p.y = e.clientY;
        return;
      }
      var mx = e.clientX - p.x, my = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (e.buttons === 2 || e.shiftKey) {
        var k = self.radius * 0.0025;
        var cy = Math.cos(self.yaw), sy = Math.sin(self.yaw);
        self.target[0] += (-mx * cy - my * sy) * k;
        self.target[2] += (mx * sy - my * cy) * k;
      } else {
        self.yaw += mx * 0.008;
        self.pitch = Math.max(-1.4, Math.min(1.4, self.pitch + my * 0.008));
      }
      self._dirty = true;
    });
    function up(e) {
      delete self._pointers[e.pointerId];
      self._lastPinch = 0;
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      var s = e.deltaY > 0 ? 1.08 : 0.92;
      self.radius = Math.max(1, Math.min(4000, self.radius * s));
      self._dirty = true;
    }, { passive: false });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('lostpointercapture', up);
  };

  JscadView.prototype.resize = function () {
    var el = this.canvas, dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = Math.max(1, el.clientWidth * dpr | 0);
    var h = Math.max(1, el.clientHeight * dpr | 0);
    if (el.width !== w || el.height !== h) {
      el.width = w; el.height = h;
      this._dirty = true;
    }
    this.gl.viewport(0, 0, el.width, el.height);
  };

  JscadView.prototype.fit = function (mesh) {
    if (!mesh || !mesh.count) return;
    this.min = mesh.min; this.max = mesh.max;
    this.target = [
      (mesh.min[0] + mesh.max[0]) / 2,
      (mesh.min[1] + mesh.max[1]) / 2,
      (mesh.min[2] + mesh.max[2]) / 2
    ];
    var dx = mesh.max[0] - mesh.min[0];
    var dy = mesh.max[1] - mesh.min[1];
    var dz = mesh.max[2] - mesh.min[2];
    var span = Math.max(dx, dy, dz, 1);
    this.radius = span * 2.2;
    this._buildGrid();
    this._dirty = true;
  };

  JscadView.prototype._buildGrid = function () {
    var span = Math.max(
      this.max[0] - this.min[0],
      this.max[1] - this.min[1],
      this.max[2] - this.min[2],
      10
    );
    var y = this.min[1];
    var half = span * 1.2;
    var step = span / 8;
    var cx = (this.min[0] + this.max[0]) / 2;
    var cz = (this.min[2] + this.max[2]) / 2;
    var pts = [];
    for (var i = -8; i <= 8; i++) {
      var x = cx + i * step;
      pts.push(x, y, cz - half, x, y, cz + half);
      var z = cz + i * step;
      pts.push(cx - half, y, z, cx + half, y, z);
    }
    this.gridCount = (pts.length / 3) | 0;
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
  };

  JscadView.prototype.setMesh = function (mesh, opts) {
    opts = opts || {};
    this.count = mesh && mesh.count ? mesh.count : 0;
    var gl = this.gl;
    if (this.count) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    }
    if (!opts.keepCamera) this.fit(mesh);
    else {
      this.min = mesh.min; this.max = mesh.max;
      this._buildGrid();
    }
    this._dirty = true;
  };

  JscadView.prototype.reset = function () {
    this.yaw = 0.7;
    this.pitch = 0.45;
    this.fit({ count: 1, min: this.min, max: this.max });
  };

  JscadView.prototype._mvp = function () {
    var aspect = this.canvas.width / Math.max(1, this.canvas.height);
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var eye = [
      this.target[0] + this.radius * cp * sy,
      this.target[1] + this.radius * sp,
      this.target[2] + this.radius * cp * cy
    ];
    var view = lookAt(eye, this.target, [0, 1, 0]);
    var proj = persp(Math.PI / 4, aspect, Math.max(0.05, this.radius / 80), this.radius * 8);
    return { mvp: mul(proj, view), view: view };
  };

  JscadView.prototype._draw = function () {
    var gl = this.gl;
    this.resize();
    gl.clearColor(0.07, 0.08, 0.1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    var mats = this._mvp();
    if (this.grid && this.gridCount) {
      gl.useProgram(this.gridProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufGrid);
      gl.enableVertexAttribArray(this.gPos);
      gl.vertexAttribPointer(this.gPos, 3, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(this.gMVP, false, mats.mvp);
      gl.uniform3f(this.gCol, 0.18, 0.2, 0.24);
      gl.drawArrays(gl.LINES, 0, this.gridCount);
    }
    if (!this.count) return;
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufNrm);
    gl.enableVertexAttribArray(this.aNrm);
    gl.vertexAttribPointer(this.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.enableVertexAttribArray(this.aCol);
    gl.vertexAttribPointer(this.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(this.uMVP, false, mats.mvp);
    gl.uniformMatrix4fv(this.uN, false, invert3(mats.view));
    gl.uniform3f(this.uLight, 0.35, 0.75, 0.55);
    gl.uniform3f(this.uFill, -0.4, 0.2, -0.3);
    gl.uniform1f(this.uWire, this.wireframe ? 0.55 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, this.count * 3);
  };

  JscadView.prototype._loop = function () {
    var self = this;
    function tick() {
      self._raf = requestAnimationFrame(tick);
      if (self.autoRotate) {
        self.yaw += 0.006;
        self._dirty = true;
      }
      if (self._dirty) {
        self._dirty = false;
        self._draw();
      }
    }
    tick();
  };

  root.JscadView = JscadView;
})(typeof window !== 'undefined' ? window : this);
