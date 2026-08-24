/*
 * Boot the pouring engine from bytes packed in this GIF. No fetch.
 * If WebAssembly is missing or instantiate fails, the caller falls back
 * to the classic JS universe and shows a sentence — never a black canvas.
 */
(function (root) {
  'use strict';

  var S = root.Sandspiel;
  var UNDO = S && S.UNDO ? S.UNDO : 20;
  var PAGES = 8;
  var lastFail = '';

  function b64ToBuf(b64) {
    var s = atob(b64), u = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  function importsFor(mod, mem) {
    var env = {}, i, list = WebAssembly.Module.imports(mod);
    for (i = 0; i < list.length; i++) {
      if (list[i].module !== 'env') continue;
      if (list[i].kind === 'memory') env[list[i].name] = mem;
      else if (list[i].kind === 'global') {
        env[list[i].name] = new WebAssembly.Global({ value: 'i32', mutable: true }, 65536);
      } else if (list[i].kind === 'table') {
        env[list[i].name] = new WebAssembly.Table({ initial: 8, element: 'anyfunc' });
      }
    }
    return { env: env };
  }

  function WasmUniverse(exp, mem) {
    this.exp = exp;
    this.mem = mem;
    this.width = exp.sand_width();
    this.height = exp.sand_height();
    this.ptr = exp.sand_cells();
    this.n = exp.sand_count();
    this.undo = [];
    this.generation = 0;
    this.rng = 0x734f6b89;
    this.cells = new Array(this.n);
    exp.sand_init();
    this._syncCells();
  }
  WasmUniverse.prototype.rawBytes = function () {
    return new Uint8Array(this.mem.buffer, this.ptr, this.n * 4);
  };
  WasmUniverse.prototype._syncCells = function () {
    var raw = this.rawBytes(), n = this.n, i, cells = this.cells, o;
    for (i = 0; i < n; i++) {
      o = i * 4;
      cells[i] = {
        species: raw[o],
        ra: raw[o + 1],
        rb: raw[o + 2],
        clock: raw[o + 3]
      };
    }
  };
  WasmUniverse.prototype.index = function (x, y) { return x * this.height + y; };
  WasmUniverse.prototype.getCell = function (x, y) {
    var v = this.exp.sand_get(x, y);
    return {
      species: v & 255,
      ra: (v >>> 8) & 255,
      rb: (v >>> 16) & 255,
      clock: (v >>> 24) & 255
    };
  };
  WasmUniverse.prototype.setCell = function (x, y, cell) {
    this.exp.sand_set(x, y, cell.species, cell.ra, cell.rb);
  };
  WasmUniverse.prototype.tick = function () {
    this.exp.sand_tick();
    this._syncCells();
  };
  WasmUniverse.prototype.paint = function (x, y, size, species) {
    this.exp.sand_paint(x, y, size, species);
    this._syncCells();
  };
  WasmUniverse.prototype.reset = function () {
    this.exp.sand_reset();
    this._syncCells();
  };
  WasmUniverse.prototype.pushUndo = function () {
    var copy = this.rawBytes().slice();
    this.undo.unshift(copy);
    if (this.undo.length > UNDO) this.undo.length = UNDO;
  };
  WasmUniverse.prototype.popUndo = function () {
    var old = this.undo.shift();
    if (!old) return;
    this.rawBytes().set(old);
    this._syncCells();
  };
  WasmUniverse.prototype.pack = function () { return S.packRaw(this.rawBytes()); };
  WasmUniverse.prototype.loadPacked = function (w, h, packed) {
    var raw, i, x, y, sx, sy, src, dest;
    if (w === this.width && h === this.height) {
      raw = S.unpackRaw(packed, this.n);
      this.rawBytes().set(raw);
      this._syncCells();
      return;
    }
    this.reset();
    raw = S.unpackRaw(packed, (w | 0) * (h | 0));
    dest = this.rawBytes();
    for (x = 0; x < this.width; x++) {
      for (y = 0; y < this.height; y++) {
        sx = w ? Math.min(w - 1, (x * w / this.width) | 0) : 0;
        sy = h ? Math.min(h - 1, (y * h / this.height) | 0) : 0;
        src = (sx * h + sy) * 4;
        i = (x * this.height + y) * 4;
        dest[i] = raw[src] || 0;
        dest[i + 1] = raw[src + 1] || 0;
        dest[i + 2] = raw[src + 2] || 0;
        dest[i + 3] = 0;
      }
    }
    this._syncCells();
  };
  WasmUniverse.prototype.thumb = function () {
    var tw = S.THUMB_W, th = S.THUMB_H, bytes = new Uint8Array(tw * th);
    var raw = this.rawBytes(), x, y, sx, sy;
    for (y = 0; y < th; y++) {
      for (x = 0; x < tw; x++) {
        sx = Math.min(this.width - 1, (x * this.width / tw) | 0);
        sy = Math.min(this.height - 1, (y * this.height / th) | 0);
        bytes[y * tw + x] = raw[(sx * this.height + sy) * 4];
      }
    }
    return S.bytesToB64(bytes);
  };

  function boot() {
    lastFail = '';
    if (typeof WebAssembly === 'undefined' || !WebAssembly.compile) {
      lastFail = 'This toy needs WebAssembly, and this browser does not have it. The world will still pour, slower.';
      return Promise.resolve(null);
    }
    if (!root.SAND_WASM_B64) {
      lastFail = 'The pouring engine is missing from this file. The world will still pour, slower.';
      return Promise.resolve(null);
    }
    var buf;
    try { buf = b64ToBuf(root.SAND_WASM_B64); }
    catch (e) {
      lastFail = 'The pouring engine in this file could not be read. The world will still pour, slower.';
      return Promise.resolve(null);
    }
    var mem = new WebAssembly.Memory({ initial: PAGES });
    return WebAssembly.compile(buf).then(function (mod) {
      return WebAssembly.instantiate(mod, importsFor(mod, mem));
    }).then(function (inst) {
      var exp = inst.exports;
      if (!exp || !exp.sand_tick || !exp.sand_init) {
        lastFail = 'The pouring engine started empty. The world will still pour, slower.';
        return null;
      }
      var uni = new WasmUniverse(exp, mem);
      if (uni.width !== S.WIDTH || uni.height !== S.HEIGHT) {
        lastFail = 'The pouring engine came up the wrong size. The world will still pour, slower.';
        return null;
      }
      return uni;
    }).catch(function (e) {
      lastFail = (e && e.message)
        ? ('The pouring engine did not start: ' + e.message + ' The world will still pour, slower.')
        : 'The pouring engine did not start. The world will still pour, slower.';
      return null;
    });
  }

  root.SandWasm = {
    boot: boot,
    fail: function () { return lastFail; },
    Universe: WasmUniverse
  };
})(window);
