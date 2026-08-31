/* hydra-synth 1.4.0 pipeline (Olivia Jack, AGPL-3.0) with regl/eval/audio
 * stripped. GLSL tables live in glsl-functions.js + utility-functions.js.
 * WebGL compiles the generated fragment shader directly — no Function().
 */
(function (root) {
  'use strict';

  var EASING = {
    linear: function (t) { return t; },
    easeInQuad: function (t) { return t * t; },
    easeOutQuad: function (t) { return t * (2 - t); },
    easeInOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    easeInCubic: function (t) { return t * t * t; },
    easeOutCubic: function (t) { return (--t) * t * t + 1; },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    easeInQuart: function (t) { return t * t * t * t; },
    easeOutQuart: function (t) { return 1 - (--t) * t * t * t; },
    easeInOutQuart: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t; },
    easeInQuint: function (t) { return t * t * t * t * t; },
    easeOutQuint: function (t) { return 1 + (--t) * t * t * t * t; },
    easeInOutQuint: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t; },
    sin: function (t) { return (1 + Math.sin(Math.PI * t - Math.PI / 2)) / 2; }
  };

  function modulo(n, d) { return ((n % d) + d) % d; }
  function mapRange(num, a, b, c, d) { return (num - a) * (d - c) / (b - a) + c; }

  function initArrayExtras() {
    if (Array.prototype.fast) return;
    Array.prototype.fast = function (speed) {
      this._speed = speed == null ? 1 : speed;
      return this;
    };
    Array.prototype.smooth = function (smooth) {
      this._smooth = smooth == null ? 1 : smooth;
      return this;
    };
    Array.prototype.ease = function (ease) {
      if (typeof ease === 'function') {
        this._smooth = 1;
        this._ease = ease;
      } else if (EASING[ease || 'linear']) {
        this._smooth = 1;
        this._ease = EASING[ease || 'linear'];
      }
      return this;
    };
    Array.prototype.offset = function (offset) {
      this._offset = (offset == null ? 0.5 : offset) % 1;
      return this;
    };
    Array.prototype.fit = function (low, high) {
      if (low == null) low = 0;
      if (high == null) high = 1;
      var lowest = Math.min.apply(null, this);
      var highest = Math.max.apply(null, this);
      var next = this.map(function (n) { return mapRange(n, lowest, highest, low, high); });
      next._speed = this._speed;
      next._smooth = this._smooth;
      next._ease = this._ease;
      return next;
    };
  }

  function arrayValue(arr) {
    return function (props) {
      var speed = arr._speed ? arr._speed : 1;
      var smooth = arr._smooth ? arr._smooth : 0;
      var time = (props && props.time) || 0;
      var bpm = (props && props.bpm) || 30;
      var index = time * speed * (bpm / 60) + (arr._offset || 0);
      if (smooth !== 0) {
        var ease = arr._ease ? arr._ease : EASING.linear;
        var _index = index - (smooth / 2);
        var currValue = arr[Math.floor(modulo(_index, arr.length))];
        var nextValue = arr[Math.floor(modulo(_index + 1, arr.length))];
        var t = Math.min(modulo(_index, 1) / smooth, 1);
        return ease(t) * (nextValue - currValue) + currValue;
      }
      return arr[Math.floor(index % arr.length)];
    };
  }

  function ensureDecimal(val) {
    val = String(val);
    if (val.indexOf('.') < 0) val += '.';
    return val;
  }

  var TYPE_LOOKUP = {
    src: { returnType: 'vec4', args: [{ type: 'vec2', name: '_st' }] },
    coord: { returnType: 'vec2', args: [{ type: 'vec2', name: '_st' }] },
    color: { returnType: 'vec4', args: [{ type: 'vec4', name: '_c0' }] },
    combine: { returnType: 'vec4', args: [{ type: 'vec4', name: '_c0' }, { type: 'vec4', name: '_c1' }] },
    combineCoord: { returnType: 'vec2', args: [{ type: 'vec2', name: '_st' }, { type: 'vec4', name: '_c0' }] }
  };

  function processGlsl(obj) {
    var t = TYPE_LOOKUP[obj.type];
    if (!t) return null;
    var inputs = t.args.concat(obj.inputs || []);
    var args = inputs.map(function (input) { return input.type + ' ' + input.name; }).join(', ');
    var glslFunction = '\n  ' + t.returnType + ' ' + obj.name + '(' + args + ') {\n      ' + obj.glsl + '\n  }\n';
    return Object.assign({}, obj, { inputs: inputs.slice(1), glsl: glslFunction });
  }

  function markHydra(func, name) {
    func.isHydraFunction = true;
    func.hydraFunctionName = name;
    return func;
  }

  function formatArguments(transform, startIndex) {
    var defaultArgs = transform.transform.inputs || [];
    var userArgs = transform.userArgs || [];
    var generators = transform.synth && transform.synth.generators;
    var srcFn = generators && generators.src;
    return defaultArgs.map(function (input, index) {
      var typedArg = {
        value: input.default,
        type: input.type,
        isUniform: false,
        name: input.name,
        vecLen: 0
      };
      if (typedArg.type === 'float') typedArg.value = ensureDecimal(input.default);
      if (input.type && input.type.indexOf('vec') === 0) {
        typedArg.vecLen = parseInt(input.type.substr(3), 10) || 0;
      }
      if (userArgs.length > index) {
        typedArg.value = userArgs[index];
        if (typeof typedArg.value === 'function' && typedArg.value.isHydraFunction) {
          throw new Error(transform.name + '() received ' + typedArg.value.hydraFunctionName +
            ' without parentheses for "' + input.name + '" — did you mean ' + typedArg.value.hydraFunctionName + '()?');
        }
        if (typeof userArgs[index] === 'function') {
          typedArg.value = function (context, props) {
            try {
              var val = userArgs[index](props);
              if (typeof val === 'number') return val;
              return input.default;
            } catch (e) {
              return input.default;
            }
          };
          typedArg.isUniform = true;
        } else if (userArgs[index] && userArgs[index].constructor === Array) {
          typedArg.value = function (context, props) {
            return arrayValue(userArgs[index])(props);
          };
          typedArg.isUniform = true;
        }
      }
      if (startIndex >= 0) {
        if (typedArg.value && typedArg.value.transforms) {
          typedArg.isUniform = false;
        } else if (typedArg.type === 'float' && typeof typedArg.value === 'number') {
          typedArg.value = ensureDecimal(typedArg.value);
        } else if (typedArg.type && typedArg.type.indexOf('vec') === 0 && Array.isArray(typedArg.value)) {
          typedArg.isUniform = false;
          typedArg.value = typedArg.type + '(' + typedArg.value.map(ensureDecimal).join(', ') + ')';
        } else if (input.type === 'sampler2D') {
          var texSrc = typedArg.value;
          if (!texSrc || typeof texSrc.getTexture !== 'function') {
            throw new Error(transform.name + '() expects a texture source (s0 or o0) for "' + input.name + '"');
          }
          typedArg.value = function () { return texSrc.getTexture(); };
          typedArg.isUniform = true;
        } else if (typedArg.value && typedArg.value.getTexture && input.type === 'vec4' && srcFn) {
          typedArg.value = srcFn(typedArg.value);
          typedArg.isUniform = false;
        }
        if (typedArg.isUniform) typedArg.name += startIndex;
      }
      return typedArg;
    });
  }

  function generateInputName(v, index) { return v + '_i' + index; }

  function shaderString(c, uv, method, inputs) {
    var str = inputs.map(function (input, i) {
      if (input.isUniform) return input.name;
      if (input.value && input.value.transforms) return generateInputName(c, i);
      return input.value;
    }).reduce(function (p, cur) { return p + ', ' + cur; }, '');
    return method + '(' + uv + str + ')';
  }

  function containsFn(object, arr) {
    for (var i = 0; i < arr.length; i++) if (object.name === arr[i].name) return true;
    return false;
  }

  function generateGlsl(transforms, shaderParams) {
    var generator = function () { return ''; };
    transforms.forEach(function (transform, i) {
      var inputs = formatArguments(transform, shaderParams.uniforms.length);
      inputs.forEach(function (input) {
        if (input.isUniform) shaderParams.uniforms.push(input);
      });
      if (!containsFn(transform, shaderParams.glslFunctions)) shaderParams.glslFunctions.push(transform);
      var prev = generator;
      function inputGen(ins) {
        var g = function () { return ''; };
        var p = g;
        ins.forEach(function (input, ii) {
          if (input.value && input.value.transforms) {
            p = g;
            g = function (c, uv) {
              var ci = generateInputName(c, ii);
              var uvi = generateInputName(uv + '_' + c, ii);
              return 'vec2 ' + uvi + ' = ' + uv + ';' + p(c, uv) + '\n         ' +
                generateGlsl(input.value.transforms, shaderParams)(ci, uvi);
            };
          }
        });
        return g;
      }
      if (transform.transform.type === 'src') {
        generator = function (c, uv) {
          return inputGen(inputs)(c + i, uv) + '\n         vec4 ' + c + ' = ' +
            shaderString(c + i, uv, transform.name, inputs) + ';';
        };
      } else if (transform.transform.type === 'color') {
        generator = function (c, uv) {
          return inputGen(inputs)(c + i, uv) + '\n         ' + prev(c, uv) +
            '\n         ' + c + ' = ' + shaderString(c + i, c, transform.name, inputs) + ';';
        };
      } else if (transform.transform.type === 'coord') {
        generator = function (c, uv) {
          return inputGen(inputs)(c + i, uv) + '\n         ' + uv + ' = ' +
            shaderString(c + i, uv, transform.name, inputs) + ';\n         ' + prev(c, uv);
        };
      } else if (transform.transform.type === 'combine') {
        generator = function (c, uv) {
          return inputGen(inputs)(c + i, uv) + '\n         ' + prev(c, uv) +
            '\n         ' + c + ' = ' + shaderString(c + i, c, transform.name, inputs) + ';';
        };
      } else if (transform.transform.type === 'combineCoord') {
        generator = function (c, uv) {
          return inputGen(inputs)(c + i, uv) + '\n         ' + uv + ' = ' +
            shaderString(c + i, uv, transform.name, inputs) + ';\n         ' + prev(c, uv);
        };
      }
    });
    return generator;
  }

  function compileTransforms(transforms) {
    var shaderParams = { uniforms: [], glslFunctions: [], fragColor: '' };
    shaderParams.fragColor = generateGlsl(transforms, shaderParams)('c', 'st');
    var uniforms = {};
    shaderParams.uniforms.forEach(function (u) { uniforms[u.name] = u; });
    shaderParams.uniforms = Object.keys(uniforms).map(function (k) { return uniforms[k]; });
    return shaderParams;
  }

  function GlslSource(obj) {
    this.transforms = [obj];
    this.defaultOutput = obj.defaultOutput;
    this.synth = obj.synth;
    this.type = 'GlslSource';
    this.defaultUniforms = obj.defaultUniforms;
  }
  GlslSource.prototype.out = function (output) {
    output = output || this.defaultOutput;
    if (!output) return this;
    try {
      var passes = this.glsl();
      output.render(passes);
    } catch (err) {
      if (this.synth && this.synth._onError) this.synth._onError(err);
      else throw err;
    }
    return this;
  };
  GlslSource.prototype.glsl = function () {
    var transforms = [];
    for (var i = 0; i < this.transforms.length; i++) {
      if (this.transforms[i].transform && this.transforms[i].transform.type === 'renderpass') {
        throw new Error('renderpass is not in this copy');
      }
      transforms.push(this.transforms[i]);
    }
    return transforms.length ? [this.compile(transforms)] : [];
  };
  GlslSource.prototype.compile = function (transforms) {
    var info = compileTransforms(transforms);
    var uniforms = {};
    info.uniforms.forEach(function (u) { uniforms[u.name] = u.value; });
    var precision = (this.defaultOutput && this.defaultOutput.precision) || 'mediump';
    var utils = root.HYDRA_GLSL_UTILS || {};
    var utilGlsl = Object.keys(utils).map(function (k) { return utils[k].glsl; }).join('\n');
    var fnGlsl = info.glslFunctions.map(function (t) { return t.transform.glsl; }).join('\n');
    var uniDecl = info.uniforms.map(function (u) {
      var type = u.type === 'texture' ? 'sampler2D' : u.type;
      if (type === 'sampler2D' || type === 'float' || (type && type.indexOf('vec') === 0)) {
        return 'uniform ' + type + ' ' + u.name + ';';
      }
      return 'uniform float ' + u.name + ';';
    }).join('\n');
    var frag = 'precision ' + precision + ' float;\n' +
      uniDecl + '\n' +
      'uniform float time;\nuniform vec2 resolution;\nvarying vec2 uv;\nuniform sampler2D prevBuffer;\n' +
      utilGlsl + '\n' + fnGlsl + '\n' +
      'void main () {\n  vec2 st = gl_FragCoord.xy/resolution.xy;\n' +
      info.fragColor + '\n  gl_FragColor = c;\n}\n';
    return { frag: frag, uniforms: uniforms };
  };

  function GeneratorFactory(opts) {
    this.defaultOutput = opts.defaultOutput;
    this.defaultUniforms = opts.defaultUniforms || {};
    this.generators = {};
    this.glslTransforms = {};
    var self = this;
    this.sourceClass = function () { return GlslSource.apply(this, arguments); };
    this.sourceClass.prototype = Object.create(GlslSource.prototype);
    this.sourceClass.prototype.constructor = this.sourceClass;
    var fns = (root.HYDRA_GLSL_FUNCTIONS || function () { return []; })();
    fns.forEach(function (t) { self.setFunction(t); });
  }
  GeneratorFactory.prototype.setFunction = function (obj) {
    var processed = processGlsl(obj);
    if (!processed) return;
    this._addMethod(obj.name, processed);
  };
  GeneratorFactory.prototype._addMethod = function (method, transform) {
    var self = this;
    this.glslTransforms[method] = transform;
    if (transform.type === 'src') {
      var func = function () {
        return new self.sourceClass({
          name: method,
          transform: transform,
          userArgs: Array.prototype.slice.call(arguments),
          defaultOutput: self.defaultOutput,
          defaultUniforms: self.defaultUniforms,
          synth: self
        });
      };
      markHydra(func, method);
      this.generators[method] = func;
      return func;
    }
    this.sourceClass.prototype[method] = function () {
      this.transforms.push({
        name: method,
        transform: transform,
        userArgs: Array.prototype.slice.call(arguments),
        synth: self
      });
      return this;
    };
    markHydra(this.sourceClass.prototype[method], method);
  };

  var VERT = 'precision mediump float;\nattribute vec2 position;\nvarying vec2 uv;\nvoid main(){\n  uv = position * 0.5 + 0.5;\n  gl_Position = vec4(position, 0.0, 1.0);\n}';
  var PRESENT_FRAG = 'precision mediump float;\nvarying vec2 uv;\nuniform sampler2D tex0;\nvoid main(){\n  gl_FragColor = texture2D(tex0, vec2(1.0 - uv.x, uv.y));\n}';

  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s) || 'shader compile failed';
      gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  }
  function compileProgram(gl, vert, frag) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vert);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'position');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'shader link failed');
    }
    return p;
  }

  function makeTarget(gl, w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo: fbo, tex: tex, width: w, height: h };
  }

  function Output(gl, opts) {
    this.gl = gl;
    this.precision = opts.precision || 'mediump';
    this.width = opts.width;
    this.height = opts.height;
    this.ping = 0;
    this.targets = [makeTarget(gl, this.width, this.height), makeTarget(gl, this.width, this.height)];
    this.program = null;
    this.passUniforms = null;
    this.vertBuf = opts.vertBuf;
  }
  Output.prototype.resize = function (w, h) {
    var gl = this.gl;
    this.width = w;
    this.height = h;
    this.targets.forEach(function (t) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    });
    this.targets = [makeTarget(gl, w, h), makeTarget(gl, w, h)];
    this.ping = 0;
  };
  Output.prototype.getCurrent = function () {
    return this.targets[this.ping];
  };
  Output.prototype.getTexture = function () {
    return this.targets[this.ping ? 0 : 1];
  };
  Output.prototype.render = function (passes) {
    if (!passes || !passes[0]) return;
    var gl = this.gl;
    var pass = passes[0];
    this.program = compileProgram(gl, VERT, pass.frag);
    this.passUniforms = pass.uniforms || {};
  };
  Output.prototype.tick = function (props) {
    if (!this.program) return;
    var gl = this.gl;
    var read = this.ping;
    var write = this.ping ? 0 : 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[write].fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    var texUnit = 0;
    function loc(name) { return gl.getUniformLocation(this.program, name); }
    var timeLoc = gl.getUniformLocation(this.program, 'time');
    if (timeLoc) gl.uniform1f(timeLoc, props.time);
    var resLoc = gl.getUniformLocation(this.program, 'resolution');
    if (resLoc) gl.uniform2f(resLoc, this.width, this.height);
    var prevLoc = gl.getUniformLocation(this.program, 'prevBuffer');
    if (prevLoc) {
      gl.activeTexture(gl.TEXTURE0 + texUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.targets[read].tex);
      gl.uniform1i(prevLoc, texUnit);
      texUnit += 1;
    }
    var names = Object.keys(this.passUniforms);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var raw = this.passUniforms[name];
      var uloc = gl.getUniformLocation(this.program, name);
      if (!uloc) continue;
      var v = raw;
      if (typeof v === 'function') {
        try { v = v(null, props); } catch (e) { v = 0; }
      }
      if (v && v.tex) {
        gl.activeTexture(gl.TEXTURE0 + texUnit);
        gl.bindTexture(gl.TEXTURE_2D, v.tex);
        gl.uniform1i(uloc, texUnit);
        texUnit += 1;
      } else if (typeof v === 'number') {
        gl.uniform1f(uloc, v);
      } else if (v && typeof v.length === 'number') {
        if (v.length === 2) gl.uniform2f(uloc, v[0], v[1]);
        else if (v.length === 3) gl.uniform3f(uloc, v[0], v[1], v[2]);
        else if (v.length === 4) gl.uniform4f(uloc, v[0], v[1], v[2], v[3]);
        else gl.uniform1f(uloc, v[0] || 0);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.ping = write;
  };

  function SourceStub(gl, label) {
    this.label = label;
    this._tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.tex = this._tex;
  }
  SourceStub.prototype.getTexture = function () { return this; };
  function blocked(name) {
    return function () {
      throw new Error(name + ' needs a live camera, a video file, or the network — this copy is offline. Use osc(), noise(), voronoi(), shape(), or src(o0) instead.');
    };
  }
  SourceStub.prototype.initCam = blocked('s.initCam()');
  SourceStub.prototype.initVideo = blocked('s.initVideo()');
  SourceStub.prototype.initImage = blocked('s.initImage()');
  SourceStub.prototype.initScreen = blocked('s.initScreen()');
  SourceStub.prototype.init = blocked('s.init()');
  SourceStub.prototype.initStream = blocked('s.initStream()');
  SourceStub.prototype.clear = function () {};
  SourceStub.prototype.tick = function () {};
  SourceStub.prototype.resize = function () {};

  function HydraSynth(opts) {
    opts = opts || {};
    initArrayExtras();
    this.canvas = opts.canvas;
    if (!this.canvas) throw new Error('HydraSynth needs a canvas');
    var gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true }) ||
      this.canvas.getContext('experimental-webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      this.gl = null;
      this.error = 'This device has no WebGL, so the synth cannot paint.';
      return;
    }
    this.gl = gl;
    this.width = this.canvas.width || 1280;
    this.height = this.canvas.height || 720;
    var isIOS = (/iPad|iPhone|iPod/.test(navigator.platform) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !window.MSStream;
    this.precision = opts.precision || (isIOS ? 'highp' : 'mediump');
    this.mouse = { x: 0, y: 0 };
    this.time = 0;
    this.speed = 1;
    this.bpm = 30;
    this.fps = undefined;
    this._accum = 0;
    this._raf = 0;
    this.paused = false;
    this._onError = opts.onError || function () {};
    this.output = null;
    this.isRenderingAll = false;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vertBuf = buf;
    this.present = compileProgram(gl, VERT, PRESENT_FRAG);

    var self = this;
    this.o = [0, 1, 2, 3].map(function (i) {
      var o = new Output(gl, {
        precision: self.precision,
        width: self.width,
        height: self.height,
        vertBuf: buf
      });
      o.id = i;
      o.label = 'o' + i;
      return o;
    });
    this.s = [0, 1, 2, 3].map(function (i) { return new SourceStub(gl, 's' + i); });
    this.generator = new GeneratorFactory({
      defaultOutput: this.o[0],
      defaultUniforms: {}
    });
    this.output = this.o[0];

    this.api = this._buildApi();
    var c = this.canvas;
    function pointer(ev) {
      var r = c.getBoundingClientRect();
      var src = (ev.touches && ev.touches[0]) || ev;
      self.mouse.x = (src.clientX - r.left) * (c.width / (r.width || 1));
      self.mouse.y = (src.clientY - r.top) * (c.height / (r.height || 1));
    }
    c.addEventListener('pointermove', pointer, { passive: true });
    c.addEventListener('pointerdown', pointer, { passive: true });
    c.addEventListener('touchmove', pointer, { passive: true });

    this._loop = this._loop.bind(this);
    this._last = 0;
    this._raf = requestAnimationFrame(this._loop);
  }

  HydraSynth.prototype._buildApi = function () {
    var self = this;
    var api = {
      time: 0,
      bpm: this.bpm,
      speed: this.speed,
      fps: this.fps,
      width: this.width,
      height: this.height,
      mouse: this.mouse,
      Math: Math,
      PI: Math.PI,
      sin: Math.sin,
      cos: Math.cos,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      floor: Math.floor,
      ceil: Math.ceil,
      sqrt: Math.sqrt,
      pow: Math.pow,
      random: Math.random,
      atan2: Math.atan2,
      hypot: Math.hypot,
      o0: this.o[0],
      o1: this.o[1],
      o2: this.o[2],
      o3: this.o[3],
      s0: this.s[0],
      s1: this.s[1],
      s2: this.s[2],
      s3: this.s[3],
      render: function (out) {
        if (out) {
          self.output = out;
          self.isRenderingAll = false;
        } else {
          self.isRenderingAll = false;
          self.output = self.o[0];
        }
      },
      hush: function () {
        self.hush();
      },
      setResolution: function (w, h) { self.setResolution(w, h); }
    };
    var gens = this.generator.generators;
    Object.keys(gens).forEach(function (k) { api[k] = gens[k]; });
    this.generator.defaultOutput = this.o[0];
    api._hydra = this;
    return api;
  };

  HydraSynth.prototype.hush = function () {
    if (!this.api || !this.api.solid) return;
    for (var i = 0; i < this.o.length; i++) this.api.solid(0, 0, 0, 1).out(this.o[i]);
    this.output = this.o[0];
  };

  HydraSynth.prototype.setResolution = function (w, h) {
    if (!this.gl) return;
    w = Math.max(16, w | 0);
    h = Math.max(16, h | 0);
    if (w === this.width && h === this.height && this.canvas.width === w && this.canvas.height === h) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.api) {
      this.api.width = w;
      this.api.height = h;
    }
    for (var i = 0; i < this.o.length; i++) this.o[i].resize(w, h);
  };

  HydraSynth.prototype._loop = function (now) {
    this._raf = requestAnimationFrame(this._loop);
    if (this.paused || !this.gl) return;
    var dt = this._last ? now - this._last : 16.6;
    this._last = now;
    if (dt > 80) dt = 80;
    this.time += dt * 0.001 * (this.api.speed || 1);
    this.api.time = this.time;
    this.api.bpm = this.bpm = this.api.bpm || 30;
    this.speed = this.api.speed;
    var fps = this.api.fps;
    this._accum += dt;
    if (fps && this._accum < 1000 / fps) return;
    this._accum = 0;
    var props = {
      time: this.time,
      mouse: this.mouse,
      bpm: this.bpm,
      resolution: [this.width, this.height]
    };
    for (var i = 0; i < this.o.length; i++) this.o[i].tick(props);
    this._present();
  };

  HydraSynth.prototype._present = function () {
    var gl = this.gl;
    var src = (this.output || this.o[0]).getCurrent();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.present);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    var loc = gl.getUniformLocation(this.present, 'tex0');
    if (loc) gl.uniform1i(loc, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  HydraSynth.prototype.destroy = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  root.HydraSynth = HydraSynth;
})(typeof window !== 'undefined' ? window : this);
