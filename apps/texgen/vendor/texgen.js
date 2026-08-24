/* texgen.js by mrdoob / fernandojsg, MIT.
 * Ported off the Function constructor: each generator has a fill() the
 * Texture loop calls. Same operators, same params, same pixels. No eval.
 */
(function (root) {
  'use strict';

  var TG = {
    OP: {
      SET: function (x, y) { return y; },
      ADD: function (x, y) { return x + y; },
      SUB: function (x, y) { return x - y; },
      MUL: function (x, y) { return x * y; },
      DIV: function (x, y) { return x / y; },
      AND: function (x, y) { return x & y; },
      XOR: function (x, y) { return x ^ y; },
      MIN: function (x, y) { return Math.min(x, y); },
      MAX: function (x, y) { return Math.max(x, y); }
    }
  };

  TG.Texture = function (width, height) {
    this.color = new Float32Array(4);
    this.buffer = new TG.Buffer(width, height);
    this.bufferCopy = new TG.Buffer(width, height);
  };

  TG.Texture.prototype = {
    constructor: TG.Texture,
    set: function (program, operation) {
      if (operation === undefined) operation = TG.OP.SET;
      this.bufferCopy.copy(this.buffer);
      var dst = this.buffer, src = this.bufferCopy;
      var params = program.getParams();
      var tint = program.getTint();
      var color = this.color;
      var fill = program.fill;
      var array = dst.array;
      var width = dst.width, height = dst.height;
      var x = 0, y = 0, i, il;
      for (i = 0, il = array.length; i < il; i += 4) {
        color[0] = 0; color[1] = 0; color[2] = 0; color[3] = 1;
        fill(color, x, y, width, height, params, src);
        array[i]     = operation(array[i],     color[0] * tint[0]);
        array[i + 1] = operation(array[i + 1], color[1] * tint[1]);
        array[i + 2] = operation(array[i + 2], color[2] * tint[2]);
        if (++x === width) { x = 0; y++; }
      }
      return this;
    },
    add: function (p) { return this.set(p, TG.OP.ADD); },
    sub: function (p) { return this.set(p, TG.OP.SUB); },
    mul: function (p) { return this.set(p, TG.OP.MUL); },
    div: function (p) { return this.set(p, TG.OP.DIV); },
    and: function (p) { return this.set(p, TG.OP.AND); },
    xor: function (p) { return this.set(p, TG.OP.XOR); },
    min: function (p) { return this.set(p, TG.OP.MIN); },
    max: function (p) { return this.set(p, TG.OP.MAX); },
    toImageData: function (context) {
      var array = this.buffer.array;
      var imagedata = context.createImageData(this.buffer.width, this.buffer.height);
      var data = imagedata.data;
      var i, il;
      for (i = 0, il = array.length; i < il; i += 4) {
        data[i]     = array[i] * 255;
        data[i + 1] = array[i + 1] * 255;
        data[i + 2] = array[i + 2] * 255;
        data[i + 3] = 255;
      }
      return imagedata;
    },
    toCanvas: function (canvas) {
      if (canvas === undefined) canvas = document.createElement('canvas');
      canvas.width = this.buffer.width;
      canvas.height = this.buffer.height;
      var context = canvas.getContext('2d');
      context.putImageData(this.toImageData(context), 0, 0);
      return canvas;
    }
  };

  TG.Program = function (object) {
    var tint = new Float32Array([1, 1, 1]);
    object.tint = function (r, g, b) { tint[0] = r; tint[1] = g; tint[2] = b; return this; };
    object.getTint = function () { return tint; };
    return object;
  };

  function wrap(params, fill, extras) {
    var o = {
      getParams: function () { return params; },
      fill: fill
    };
    var k;
    if (extras) for (k in extras) o[k] = extras[k];
    return new TG.Program(o);
  }

  TG.Number = function () {
    return wrap({}, function (color) { color[0] = 1; color[1] = 1; color[2] = 1; });
  };

  TG.SinX = function () {
    var params = { frequency: 1, offset: 0 };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = Math.sin((x + p.offset) * p.frequency);
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      frequency: function (v) { params.frequency = v * Math.PI; return this; },
      offset: function (v) { params.offset = v; return this; }
    });
  };

  TG.SinY = function () {
    var params = { frequency: 1, offset: 0 };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = Math.sin((y + p.offset) * p.frequency);
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      frequency: function (v) { params.frequency = v * Math.PI; return this; },
      offset: function (v) { params.offset = v; return this; }
    });
  };

  TG.OR = function () {
    return wrap({}, function (color, x, y, width) {
      var value = (x | y) / width;
      color[0] = value; color[1] = value; color[2] = value;
    });
  };

  TG.XOR = function () {
    return wrap({}, function (color, x, y, width) {
      var value = (x ^ y) / width;
      color[0] = value; color[1] = value; color[2] = value;
    });
  };

  TG.Noise = function () {
    var params = { seed: 1 };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = TG.Utils.hashRNG(p.seed, x, y);
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      seed: function (v) { params.seed = v; return this; }
    });
  };

  TG.CheckerBoard = function () {
    var params = { size: [32, 32], offset: [0, 0], rowShift: 0 };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = ((((y + p.offset[1]) / p.size[1]) & 1) ^ (((x + p.offset[0] + parseInt(y / p.size[1]) * p.rowShift) / p.size[0]) & 1)) ? 0 : 1;
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      size: function (x, y) { params.size = [x, y]; return this; },
      offset: function (x, y) { params.offset = [x, y]; return this; },
      rowShift: function (v) { params.rowShift = v; return this; }
    });
  };

  TG.Rect = function () {
    var params = { position: [0, 0], size: [32, 32] };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = (x >= p.position[0] && x <= (p.position[0] + p.size[0]) && y <= (p.position[1] + p.size[1]) && y >= p.position[1]) ? 1 : 0;
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      position: function (x, y) { params.position = [x, y]; return this; },
      size: function (x, y) { params.size = [x, y]; return this; }
    });
  };

  TG.Circle = function () {
    var params = { position: [0, 0], radius: 50, delta: 1 };
    return wrap(params, function (color, x, y, w, h, p) {
      var dist = TG.Utils.distance(x, y, p.position[0], p.position[1]);
      var value = 1 - TG.Utils.smoothStep(p.radius - p.delta, p.radius, dist);
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      delta: function (v) { params.delta = v; return this; },
      position: function (x, y) { params.position = [x, y]; return this; },
      radius: function (v) { params.radius = v; return this; }
    });
  };

  TG.SineDistort = function () {
    var params = { sines: [4, 4], offset: [0, 0], amplitude: [16, 16] };
    return wrap(params, function (color, x, y, w, h, p, src) {
      var s = Math.sin(p.sines[0] / 100 * y + p.offset[0]) * p.amplitude[0] + x;
      var t = Math.sin(p.sines[1] / 100 * x + p.offset[1]) * p.amplitude[1] + y;
      var c = src.getPixelBilinear(s, t);
      color[0] = c[0]; color[1] = c[1]; color[2] = c[2];
    }, {
      sines: function (x, y) { params.sines = [x, y]; return this; },
      offset: function (x, y) { params.offset = [x, y]; return this; },
      amplitude: function (x, y) { params.amplitude = [x, y]; return this; }
    });
  };

  TG.Twirl = function () {
    var params = { strength: 0, radius: 120, position: [128, 128] };
    return wrap(params, function (color, x, y, w, h, p, src) {
      var dist = TG.Utils.distance(x, y, p.position[0], p.position[1]);
      var s, t, angle;
      if (dist < p.radius) {
        dist = Math.pow(p.radius - dist, 2) / p.radius;
        angle = 2.0 * Math.PI * (dist / (p.radius / p.strength));
        s = (((x - p.position[0]) * Math.cos(angle)) - ((y - p.position[0]) * Math.sin(angle)) + p.position[0] + 0.5);
        t = (((y - p.position[1]) * Math.cos(angle)) + ((x - p.position[1]) * Math.sin(angle)) + p.position[1] + 0.5);
      } else { s = x; t = y; }
      var c = src.getPixelBilinear(s, t);
      color[0] = c[0]; color[1] = c[1]; color[2] = c[2];
    }, {
      strength: function (v) { params.strength = v / 100.0; return this; },
      radius: function (v) { params.radius = v; return this; },
      position: function (x, y) { params.position = [x, y]; return this; }
    });
  };

  TG.Transform = function () {
    var params = { offset: [0, 0], angle: 0, scale: [1, 1] };
    return wrap(params, function (color, x, y, width, height, p, src) {
      var x2 = x - width / 2;
      var y2 = y - height / 2;
      var s = x2 * (Math.cos(p.angle) / p.scale[0]) + y2 * -(Math.sin(p.angle) / p.scale[0]);
      var t = x2 * (Math.sin(p.angle) / p.scale[1]) + y2 * (Math.cos(p.angle) / p.scale[1]);
      s += p.offset[0] + width / 2;
      t += p.offset[1] + height / 2;
      var c = src.getPixelBilinear(s, t);
      color[0] = c[0]; color[1] = c[1]; color[2] = c[2];
    }, {
      offset: function (x, y) { params.offset = [x, y]; return this; },
      angle: function (v) { params.angle = TG.Utils.deg2rad(v); return this; },
      scale: function (x, y) { if (x === 0 || y === 0) return this; params.scale = [x, y]; return this; }
    });
  };

  TG.Pixelate = function () {
    var params = { size: [1, 1] };
    return wrap(params, function (color, x, y, w, h, p, src) {
      var s = p.size[0] * Math.floor(x / p.size[0]);
      var t = p.size[1] * Math.floor(y / p.size[1]);
      var c = src.getPixelNearest(s, t);
      color[0] = c[0]; color[1] = c[1]; color[2] = c[2];
    }, {
      size: function (x, y) { params.size = [x, y]; return this; }
    });
  };

  TG.FractalNoise = function () {
    var params = { seed: 1, baseFrequency: 0.03125, amplitude: 0.4, persistence: 0.72, octaves: 4, step: 4 };
    return wrap(params, function (color, x, y, w, h, p) {
      var value = 0, amp = p.amplitude, freq = p.baseFrequency, j, x1, y1;
      for (j = 1; j <= p.octaves; j++) {
        x1 = Math.floor(x * freq); y1 = Math.floor(y * freq);
        value += TG.Utils.hashRNG(p.seed * j, x1, y1) * amp;
        freq *= p.step;
        amp *= p.persistence;
      }
      color[0] = value; color[1] = value; color[2] = value;
    }, {
      seed: function (v) { params.seed = v; return this; },
      baseFrequency: function (v) { params.baseFrequency = 1 / v; return this; },
      amplitude: function (v) { params.amplitude = v; return this; },
      persistence: function (v) { params.persistence = v; return this; },
      octaves: function (v) { params.octaves = Math.max(1, v); return this; },
      step: function (v) { params.step = Math.max(1, v); return this; }
    });
  };

  TG.Posterize = function () {
    var params = { step: 2 };
    return wrap(params, function (color, x, y, w, h, p, src) {
      var v = src.getPixelNearest(x, y);
      color[0] = Math.floor(Math.floor(v[0] * 255 / (255 / p.step)) * 255 / (p.step - 1)) / 255;
      color[1] = Math.floor(Math.floor(v[1] * 255 / (255 / p.step)) * 255 / (p.step - 1)) / 255;
      color[2] = Math.floor(Math.floor(v[2] * 255 / (255 / p.step)) * 255 / (p.step - 1)) / 255;
    }, {
      step: function (v) { params.step = Math.max(v, 2); return this; }
    });
  };

  TG.Buffer = function (width, height) {
    this.width = width;
    this.height = height;
    this.array = new Float32Array(width * height * 4);
    this.color = new Float32Array(4);
  };

  TG.Buffer.prototype = {
    constructor: TG.Buffer,
    copy: function (buffer) { this.array.set(buffer.array); },
    getPixelNearest: function (x, y) {
      if (y >= this.height) y -= this.height;
      if (y < 0) y += this.height;
      if (x >= this.width) x -= this.width;
      if (x < 0) x += this.width;
      var offset = Math.round(y) * this.width * 4 + Math.round(x) * 4;
      var array = this.array, color = this.color;
      color[0] = array[offset]; color[1] = array[offset + 1]; color[2] = array[offset + 2];
      return color;
    },
    getPixelBilinear: function (x, y) {
      var px = Math.floor(x), py = Math.floor(y);
      var p0 = px + py * this.width;
      var array = this.array, color = this.color;
      var fx = x - px, fy = y - py, fx1 = 1 - fx, fy1 = 1 - fy;
      var w1 = fx1 * fy1, w2 = fx * fy1, w3 = fx1 * fy, w4 = fx * fy;
      var p1 = p0 * 4, p2 = (1 + p0) * 4, p3 = (1 * this.width + p0) * 4, p4 = (1 + 1 * this.width + p0) * 4;
      var len = this.width * this.height * 4;
      if (p1 >= len) p1 -= len; if (p1 < 0) p1 += len;
      if (p2 >= len) p2 -= len; if (p2 < 0) p2 += len;
      if (p3 >= len) p3 -= len; if (p3 < 0) p3 += len;
      if (p4 >= len) p4 -= len; if (p4 < 0) p4 += len;
      color[0] = array[p1] * w1 + array[p2] * w2 + array[p3] * w3 + array[p4] * w4;
      color[1] = array[p1 + 1] * w1 + array[p2 + 1] * w2 + array[p3 + 1] * w3 + array[p4 + 1] * w4;
      color[2] = array[p1 + 2] * w1 + array[p2 + 2] * w2 + array[p3 + 2] * w3 + array[p4 + 2] * w4;
      color[3] = array[p1 + 3] * w1 + array[p2 + 3] * w2 + array[p3 + 3] * w3 + array[p4 + 3] * w4;
      return color;
    }
  };

  TG.Utils = {
    smoothStep: function (edge0, edge1, x) {
      x = TG.Utils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
      return x * x * (3 - 2 * x);
    },
    distance: function (x0, y0, x1, y1) {
      var dx = x1 - x0, dy = y1 - y0;
      return Math.sqrt(dx * dx + dy * dy);
    },
    clamp: function (value, min, max) { return Math.min(Math.max(value, min), max); },
    deg2rad: function (deg) { return deg * Math.PI / 180; },
    hashRNG: function (seed, x, y) {
      seed = (Math.abs(seed % 2147483648) === 0) ? 1 : seed;
      var a = ((seed * (x + 1) * 777) ^ (seed * (y + 1) * 123)) % 2147483647;
      a = (a ^ 61) ^ (a >> 16);
      a = a + (a << 3);
      a = a ^ (a >> 4);
      a = a * 0x27d4eb2d;
      a = a ^ (a >> 15);
      a = a / 2147483647;
      return a;
    }
  };

  root.TG = TG;
})(typeof window !== 'undefined' ? window : this);
