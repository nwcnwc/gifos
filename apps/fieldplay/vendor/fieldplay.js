/*
 * Field Play — WebGL particle field extracted from anvaka/fieldplay
 * (MIT, Andrei Kashcha). Particle ping-pong + RGBA float packing + RK4
 * follow fieldplay's shader graph (which itself follows Mapbox webgl-wind,
 * ISC). User GLSL is compiled as get_velocity(vec2). Classic IIFE.
 * See UPSTREAM.txt.
 */
(function (root) {
  'use strict';

  var DECODE = [
    'highp float decodeFloatRGBA( vec4 v ) {',
    '  float a = floor(v.r * 255.0 + 0.5);',
    '  float b = floor(v.g * 255.0 + 0.5);',
    '  float c = floor(v.b * 255.0 + 0.5);',
    '  float d = floor(v.a * 255.0 + 0.5);',
    '  float exponent = a - 127.0;',
    '  float sign = 1.0 - mod(d, 2.0)*2.0;',
    '  float mantissa = float(a > 0.0)',
    '                  + b / 256.0',
    '                  + c / 65536.0',
    '                  + floor(d / 2.0) / 8388608.0;',
    '  return sign * mantissa * exp2(exponent);',
    '}'
  ].join('\n');

  var ENCODE = [
    'vec4 encodeFloatRGBA(highp float val) {',
    '    if (val == 0.0) {',
    '        return vec4(0.0, 0.0, 0.0, 0.0);',
    '    }',
    '    float mag = abs(val);',
    '    float exponent = floor(log2(mag));',
    '    exponent += float(exp2(exponent) <= mag / 2.0);',
    '    exponent -= float(exp2(exponent) > mag);',
    '    float mantissa;',
    '    if (exponent > 100.0) {',
    '        mantissa = mag / 1024.0 / exp2(exponent - 10.0) - 1.0;',
    '    } else {',
    '        mantissa = mag / float(exp2(exponent)) - 1.0;',
    '    }',
    '    float a = exponent + 127.0;',
    '    mantissa *= 256.0;',
    '    float b = floor(mantissa);',
    '    mantissa -= b;',
    '    mantissa *= 256.0;',
    '    float c = floor(mantissa);',
    '    mantissa -= c;',
    '    mantissa *= 128.0;',
    '    float d = floor(mantissa) * 2.0 + float(val < 0.0);',
    '    return vec4(a, b, c, d) / 255.0;',
    '}'
  ].join('\n');

  var SNOISE = [
    'vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }',
    'vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy) );',
    '  vec2 x0 = v -   i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289(i);',
    '  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m ; m = m*m ;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );',
    '  vec3 g;',
    '  g.x  = a0.x  * x0.x  + h.x  * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}'
  ].join('\n');

  var HELPERS = [
    'const vec3 rand_constants = vec3(12.9898, 78.233, 4375.85453);',
    'float rand(const vec2 co) {',
    '    float t = dot(rand_constants.xy, co);',
    '    return fract(sin(t) * (rand_constants.z + t));',
    '}',
    'vec2 rotate(vec2 p,float a) {',
    '	return cos(a)*p+sin(a)*vec2(p.y,-p.x);',
    '}',
    'float audio(float index) { return 0.0; }',
    'vec2 rk4(const vec2 point) {',
    '  vec2 k1 = get_velocity( point );',
    '  vec2 k2 = get_velocity( point + k1 * u_h * 0.5);',
    '  vec2 k3 = get_velocity( point + k2 * u_h * 0.5);',
    '  vec2 k4 = get_velocity( point + k3 * u_h);',
    '  return k1 * u_h / 6. + k2 * u_h/3. + k3 * u_h/3. + k4 * u_h/6.;',
    '}'
  ].join('\n');

  function exp2(exponent) { return Math.exp(exponent * Math.LN2); }

  function encodeFloatRGBA(val, out, writeOffset) {
    if (val === 0.0) {
      out[writeOffset] = 0; out[writeOffset + 1] = 0; out[writeOffset + 2] = 0; out[writeOffset + 3] = 0;
      return;
    }
    var mag = Math.abs(val);
    var exponent = Math.floor(Math.log(mag) / Math.LN2);
    exponent += (exp2(exponent) <= mag / 2.0) ? 1 : 0;
    exponent -= (exp2(exponent) > mag) ? 1 : 0;
    var mantissa;
    if (exponent > 100.0) mantissa = mag / 1024.0 / exp2(exponent - 10.0) - 1.0;
    else mantissa = mag / exp2(exponent) - 1.0;
    var a = exponent + 127.0;
    mantissa *= 256.0;
    var b = Math.floor(mantissa);
    mantissa -= b;
    mantissa *= 256.0;
    var c = Math.floor(mantissa);
    mantissa -= c;
    mantissa *= 128.0;
    var d = Math.floor(mantissa) * 2.0 + ((val < 0.0) ? 1 : 0);
    out[writeOffset] = a; out[writeOffset + 1] = b; out[writeOffset + 2] = c; out[writeOffset + 3] = d;
  }

  function createShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var err = gl.getShaderInfoLog(s) || 'shader compile failed';
      gl.deleteShader(s);
      return { error: err };
    }
    return { shader: s };
  }

  function createProgram(gl, vs, fs) {
    var v = createShader(gl, gl.VERTEX_SHADER, vs);
    if (v.error) return v;
    var f = createShader(gl, gl.FRAGMENT_SHADER, fs);
    if (f.error) { gl.deleteShader(v.shader); return f; }
    var p = gl.createProgram();
    gl.attachShader(p, v.shader);
    gl.attachShader(p, f.shader);
    gl.linkProgram(p);
    gl.deleteShader(v.shader);
    gl.deleteShader(f.shader);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var err = gl.getProgramInfoLog(p) || 'link failed';
      gl.deleteProgram(p);
      return { error: err };
    }
    var wrap = { program: p, loc: {} };
    var nA = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    var i, info;
    for (i = 0; i < nA; i++) {
      info = gl.getActiveAttrib(p, i);
      wrap.loc[info.name] = gl.getAttribLocation(p, info.name);
    }
    var nU = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (i = 0; i < nU; i++) {
      info = gl.getActiveUniform(p, i);
      wrap.loc[info.name] = gl.getUniformLocation(p, info.name);
    }
    return wrap;
  }

  function makeTexture(gl, w, h, data) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return t;
  }

  var QUAD_VS = [
    'precision highp float;',
    'attribute vec2 a_pos;',
    'varying vec2 v_tex_pos;',
    'void main() {',
    '  v_tex_pos = a_pos;',
    '  gl_Position = vec4(2.0 * a_pos.x - 1.0, 2.0 * a_pos.y - 1.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var SCREEN_FS = [
    'precision highp float;',
    'uniform sampler2D u_screen;',
    'uniform float u_opacity;',
    'varying vec2 v_tex_pos;',
    'void main() {',
    '  vec4 c = texture2D(u_screen, v_tex_pos);',
    '  gl_FragColor = vec4(c.rgb, c.a * u_opacity);',
    '}'
  ].join('\n');

  function updateFS(userCode) {
    return [
      'precision highp float;',
      'uniform sampler2D u_particles_x;',
      'uniform sampler2D u_particles_y;',
      'uniform int u_out_coordinate;',
      'uniform vec2 u_min;',
      'uniform vec2 u_max;',
      'uniform float u_h;',
      'uniform float u_drop_rate;',
      'uniform float u_rand_seed;',
      'uniform float frame;',
      'uniform vec4 cursor;',
      '#define PI 3.1415926535897932384626433832795',
      'varying vec2 v_tex_pos;',
      DECODE,
      ENCODE,
      SNOISE,
      HELPERS,
      userCode,
      'void main() {',
      '  vec2 pos = vec2(',
      '    decodeFloatRGBA(texture2D(u_particles_x, v_tex_pos)),',
      '    decodeFloatRGBA(texture2D(u_particles_y, v_tex_pos))',
      '  );',
      '  vec2 seed = (pos + v_tex_pos) * u_rand_seed;',
      '  float drop = step(1.0 - u_drop_rate, rand(seed));',
      '  vec2 random_pos = vec2(rand(seed + 1.9), rand(seed + 8.4)) * (u_max - u_min) + u_min;',
      '  pos = mix(pos, random_pos, drop);',
      '  vec2 velocity = rk4(pos);',
      '  vec2 newPos = pos + velocity;',
      '  if (u_out_coordinate == 0) gl_FragColor = encodeFloatRGBA(newPos.x);',
      '  else gl_FragColor = encodeFloatRGBA(newPos.y);',
      '}'
    ].join('\n');
  }

  function drawVS(userCode, colorMode) {
    var colorMain;
    if (colorMode === 2) {
      colorMain = [
        '  vec2 vel = get_velocity(v_particle_pos);',
        '  float sp = length(vel);',
        '  float t = clamp(sp * 4.0, 0.0, 1.0);',
        '  v_particle_color = vec4(0.2 + 0.8*t, 0.55 + 0.4*(1.0-t), 1.0, 0.9);'
      ].join('\n');
    } else {
      colorMain = '  v_particle_color = vec4(0.55, 0.85, 1.0, 0.85);';
    }
    return [
      'precision highp float;',
      'attribute float a_index;',
      'uniform float u_particles_res;',
      'uniform vec2 u_min;',
      'uniform vec2 u_max;',
      'uniform sampler2D u_particles_x;',
      'uniform sampler2D u_particles_y;',
      'uniform float u_h;',
      'uniform float frame;',
      'uniform vec4 cursor;',
      '#define PI 3.1415926535897932384626433832795',
      'varying vec4 v_particle_color;',
      DECODE,
      SNOISE,
      HELPERS,
      userCode,
      'void main() {',
      '  vec2 txPos = vec2(fract(a_index / u_particles_res), floor(a_index / u_particles_res) / u_particles_res);',
      '  vec2 v_particle_pos = vec2(',
      '    decodeFloatRGBA(texture2D(u_particles_x, txPos)),',
      '    decodeFloatRGBA(texture2D(u_particles_y, txPos))',
      '  );',
      colorMain,
      '  vec2 du = (u_max - u_min);',
      '  vec2 np = (v_particle_pos - u_min) / du;',
      '  gl_PointSize = 1.5;',
      '  gl_Position = vec4(2.0 * np.x - 1.0, 2.0 * np.y - 1.0, 0.0, 1.0);',
      '}'
    ].join('\n');
  }

  var DRAW_FS = [
    'precision highp float;',
    'varying vec4 v_particle_color;',
    'void main() {',
    '  gl_FragColor = v_particle_color;',
    '}'
  ].join('\n');

  var canvas = null;
  var gl = null;
  var running = false;
  var raf = 0;
  var frame = 0;
  var res = 128;
  var code = '';
  var lastError = '';
  var updateProg = null;
  var drawProg = null;
  var screenProg = null;
  var quadBuf = null;
  var indexBuf = null;
  var fbo = null;
  var texX = [null, null];
  var texY = [null, null];
  var ping = 0;
  var screenTex = [null, null];
  var screenPing = 0;
  var settings = {
    timeStep: 0.01,
    fadeOut: 0.998,
    dropProbability: 0.009,
    colorMode: 1,
    cx: 0, cy: 0, w: 12, h: 12,
    particleRes: 128
  };
  var cursor = { clickX: 0, clickY: 0, hoverX: 0, hoverY: 0 };
  var dragging = false;
  var lastPtr = null;

  function loc(prog, name) { return prog.loc[name]; }

  function bbox() {
    var hw = settings.w / 2, hh = settings.h / 2;
    return {
      minX: settings.cx - hw, maxX: settings.cx + hw,
      minY: settings.cy - hh, maxY: settings.cy + hh
    };
  }

  function seedParticles() {
    var n = res * res;
    var x = new Uint8Array(n * 4);
    var y = new Uint8Array(n * 4);
    var b = bbox();
    var i, px, py;
    for (i = 0; i < n; i++) {
      px = b.minX + Math.random() * (b.maxX - b.minX);
      py = b.minY + Math.random() * (b.maxY - b.minY);
      encodeFloatRGBA(px, x, i * 4);
      encodeFloatRGBA(py, y, i * 4);
    }
    if (texX[0]) gl.deleteTexture(texX[0]);
    if (texX[1]) gl.deleteTexture(texX[1]);
    if (texY[0]) gl.deleteTexture(texY[0]);
    if (texY[1]) gl.deleteTexture(texY[1]);
    texX[0] = makeTexture(gl, res, res, x);
    texX[1] = makeTexture(gl, res, res, x);
    texY[0] = makeTexture(gl, res, res, y);
    texY[1] = makeTexture(gl, res, res, y);
    ping = 0;
    frame = 0;
    var indices = new Float32Array(n);
    for (i = 0; i < n; i++) indices[i] = i;
    if (!indexBuf) indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  }

  function resizeScreen() {
    var w = canvas.width, h = canvas.height;
    var empty = new Uint8Array(w * h * 4);
    if (screenTex[0]) gl.deleteTexture(screenTex[0]);
    if (screenTex[1]) gl.deleteTexture(screenTex[1]);
    screenTex[0] = makeTexture(gl, w, h, empty);
    screenTex[1] = makeTexture(gl, w, h, empty);
    screenPing = 0;
  }

  function bindQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(loc(prog, 'a_pos'));
    gl.vertexAttribPointer(loc(prog, 'a_pos'), 2, gl.FLOAT, false, 0, 0);
  }

  function setCommon(prog) {
    var b = bbox();
    if (loc(prog, 'u_min')) gl.uniform2f(loc(prog, 'u_min'), b.minX, b.minY);
    if (loc(prog, 'u_max')) gl.uniform2f(loc(prog, 'u_max'), b.maxX, b.maxY);
    if (loc(prog, 'u_h')) gl.uniform1f(loc(prog, 'u_h'), settings.timeStep);
    if (loc(prog, 'frame')) gl.uniform1f(loc(prog, 'frame'), frame);
    if (loc(prog, 'cursor')) gl.uniform4f(loc(prog, 'cursor'), cursor.clickX, cursor.clickY, cursor.hoverX, cursor.hoverY);
  }

  function compile(userCode) {
    var u = createProgram(gl, QUAD_VS, updateFS(userCode));
    if (u.error) return u;
    var d = createProgram(gl, drawVS(userCode, settings.colorMode), DRAW_FS);
    if (d.error) { gl.deleteProgram(u.program); return d; }
    if (updateProg) gl.deleteProgram(updateProg.program);
    if (drawProg) gl.deleteProgram(drawProg.program);
    updateProg = u;
    drawProg = d;
    return { ok: true };
  }

  function stepUpdate() {
    var src = ping, dst = 1 - ping;
    var b = bbox();
    gl.viewport(0, 0, res, res);
    gl.useProgram(updateProg.program);
    bindQuad(updateProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texX[src]);
    gl.uniform1i(loc(updateProg, 'u_particles_x'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texY[src]);
    gl.uniform1i(loc(updateProg, 'u_particles_y'), 1);
    setCommon(updateProg);
    gl.uniform1f(loc(updateProg, 'u_drop_rate'), settings.dropProbability);
    gl.uniform1f(loc(updateProg, 'u_rand_seed'), Math.random());
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.uniform1i(loc(updateProg, 'u_out_coordinate'), 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texX[dst], 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1i(loc(updateProg, 'u_out_coordinate'), 1);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texY[dst], 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ping = dst;
  }

  function drawParticlesToScreen() {
    var w = canvas.width, h = canvas.height;
    var srcS = screenPing, dstS = 1 - screenPing;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, screenTex[dstS], 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(screenProg.program);
    bindQuad(screenProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, screenTex[srcS]);
    gl.uniform1i(loc(screenProg, 'u_screen'), 0);
    gl.uniform1f(loc(screenProg, 'u_opacity'), settings.fadeOut);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(drawProg.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.enableVertexAttribArray(loc(drawProg, 'a_index'));
    gl.vertexAttribPointer(loc(drawProg, 'a_index'), 1, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texX[ping]);
    gl.uniform1i(loc(drawProg, 'u_particles_x'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texY[ping]);
    gl.uniform1i(loc(drawProg, 'u_particles_y'), 1);
    gl.uniform1f(loc(drawProg, 'u_particles_res'), res);
    setCommon(drawProg);
    gl.drawArrays(gl.POINTS, 0, res * res);
    gl.disable(gl.BLEND);
    screenPing = dstS;
  }

  function blit() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(19 / 255, 41 / 255, 79 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(screenProg.program);
    bindQuad(screenProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, screenTex[screenPing]);
    gl.uniform1i(loc(screenProg, 'u_screen'), 0);
    gl.uniform1f(loc(screenProg, 'u_opacity'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function loop() {
    if (!running) return;
    raf = root.requestAnimationFrame(loop);
    if (!updateProg || !drawProg) return;
    frame += 1;
    stepUpdate();
    drawParticlesToScreen();
    blit();
  }

  function worldFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width;
    var y = 1 - (e.clientY - rect.top) / rect.height;
    var b = bbox();
    return {
      x: b.minX + x * (b.maxX - b.minX),
      y: b.minY + y * (b.maxY - b.minY),
      sx: e.clientX,
      sy: e.clientY
    };
  }

  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    dragging = true;
    lastPtr = { x: e.clientX, y: e.clientY };
    var w = worldFromEvent(e);
    cursor.clickX = w.x; cursor.clickY = w.y;
    cursor.hoverX = w.x; cursor.hoverY = w.y;
  }
  function onMove(e) {
    var w = worldFromEvent(e);
    cursor.hoverX = w.x; cursor.hoverY = w.y;
    if (!dragging) return;
    var dx = e.clientX - lastPtr.x;
    var dy = e.clientY - lastPtr.y;
    lastPtr = { x: e.clientX, y: e.clientY };
    var rect = canvas.getBoundingClientRect();
    settings.cx -= dx / rect.width * settings.w;
    settings.cy += dy / rect.height * settings.h;
  }
  function onUp() { dragging = false; }
  function onWheel(e) {
    e.preventDefault();
    var factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    settings.w *= factor;
    settings.h *= factor;
  }

  function fitCanvas() {
    if (!canvas) return;
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = Math.max(32, canvas.clientWidth | 0);
    var h = Math.max(32, canvas.clientHeight | 0);
    var W = Math.max(32, (w * dpr) | 0);
    var H = Math.max(32, (h * dpr) | 0);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      if (gl) resizeScreen();
    }
  }

  function mount(el) {
    canvas = el;
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true })
      || canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
    if (!gl) {
      lastError = 'This toy needs WebGL.';
      return false;
    }
    fbo = gl.createFramebuffer();
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    screenProg = createProgram(gl, QUAD_VS, SCREEN_FS);
    if (screenProg.error) { lastError = screenProg.error; return false; }
    fitCanvas();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return true;
  }

  function setCode(userCode) {
    if (!gl) return { ok: false, error: lastError || 'no WebGL' };
    code = String(userCode || '');
    var r = compile(code);
    if (r.error) { lastError = r.error; return { ok: false, error: r.error }; }
    lastError = '';
    if (!texX[0]) seedParticles();
    return { ok: true };
  }

  function applyPreset(p) {
    if (!p) return;
    settings.timeStep = p.timeStep;
    settings.fadeOut = p.fadeOut;
    settings.dropProbability = p.dropProbability;
    settings.colorMode = p.colorMode || 1;
    settings.cx = p.cx; settings.cy = p.cy; settings.w = p.w; settings.h = p.h;
    seedParticles();
    return setCode(p.code);
  }

  function setSettings(s) {
    var k;
    for (k in s) if (Object.prototype.hasOwnProperty.call(s, k) && s[k] != null) settings[k] = s[k];
    if (s && s.particleRes && s.particleRes !== res) {
      res = s.particleRes;
      seedParticles();
    }
    if (s && s.colorMode != null && code) compile(code);
  }

  function play() {
    if (running) return;
    running = true;
    loop();
  }
  function pause() {
    running = false;
    if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
  }
  function reset() { seedParticles(); resizeScreen(); }

  function getState() {
    return {
      code: code,
      timeStep: settings.timeStep,
      fadeOut: settings.fadeOut,
      dropProbability: settings.dropProbability,
      colorMode: settings.colorMode,
      cx: settings.cx, cy: settings.cy, w: settings.w, h: settings.h,
      particleRes: res
    };
  }

  root.FieldPlay = {
    mount: mount,
    setCode: setCode,
    applyPreset: applyPreset,
    setSettings: setSettings,
    getState: getState,
    play: play,
    pause: pause,
    reset: reset,
    fitCanvas: fitCanvas,
    isRunning: function () { return running; },
    lastError: function () { return lastError; },
    encodeFloatRGBA: encodeFloatRGBA
  };
})(this);
