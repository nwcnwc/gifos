/*
 * Sandspiel shell: paint, pause, undo, reset, private last + named boards.
 * WASM engine if it boots; JS universe if it does not. A failed GPU/WASM
 * path is a sentence, never a black canvas. Classic IIFE. No fetch.
 */
(function (root) {
  'use strict';

  var S = root.Sandspiel;
  var SP = S.Species;
  var $ = function (id) { return document.getElementById(id); };
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var uni = null;
  var species = SP.Water;
  var sizeIdx = 2;
  var paused = false;
  var painting = false;
  var saveDb = null;
  var saveTimer = 0;
  var persistTicks = 0;
  var named = [];
  var canvas = $('world');
  var renderer = null;
  var img = null;
  var dirty = true;
  var poured = false;
  var engineKind = 'js';

  try {
    if (root.gifos) saveDb = gifos.db('save');
  } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }
  function size() { return S.SIZE_MAP[sizeIdx] || 7; }
  function labelOf(id) {
    var i;
    for (i = 0; i < S.LABELS.length; i++) if (S.LABELS[i].id === id) return S.LABELS[i].name;
    return 'Sand';
  }

  function showFail(msg, sticky) {
    var el = $('fail');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('sticky', !!sticky);
  }
  function showHint(on) {
    var el = $('hint');
    if (el) el.hidden = !on;
  }

  function persistNow() {
    if (!saveDb || !uni) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    saveDb.put({
      id: 'last',
      w: uni.width,
      h: uni.height,
      cells: uni.pack(),
      species: species,
      sizeIdx: sizeIdx,
      paused: paused
    }).catch(function (err) {
      showFail((err && err.message) || 'Could not save this world in the file.');
    });
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      persistNow();
    }, 400);
  }

  function makeGl(cv) {
    var gl, vs, fs, prog, buf, loc, tex;
    try {
      gl = cv.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true }) ||
           cv.getContext('experimental-webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    } catch (e) { gl = null; }
    if (!gl) return null;
    try {
      vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*0.5+0.5,0.5-a.y*0.5);gl_Position=vec4(a,0.0,1.0);}');
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return null;
      fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, 'precision mediump float;varying vec2 v;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,v);}');
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return null;
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      loc = gl.getAttribLocation(prog, 'a');
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (e) { return null; }
    return {
      kind: 'gl',
      blit: function (image) {
        gl.viewport(0, 0, cv.width, cv.height);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  function make2d(cv) {
    var ctx;
    try { ctx = cv.getContext('2d'); } catch (e) { ctx = null; }
    if (!ctx) return null;
    return {
      kind: '2d',
      blit: function (image) { ctx.putImageData(image, 0, 0); }
    };
  }

  function attachRenderer(cv) {
    var r = makeGl(cv);
    if (r) return r;
    return make2d(cv);
  }

  function fillImage() {
    var d = img.data, w = uni.width, h = uni.height, x, y, c, p, o, t, r, g, b, raw, cells;
    raw = uni.rawBytes ? uni.rawBytes() : null;
    cells = uni.cells;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        if (raw) {
          o = (x * h + y) * 4;
          p = S.PALETTE[raw[o]] || S.PALETTE[0];
          t = raw[o] ? ((raw[o + 1] - 70) / 140) : 0;
        } else {
          c = cells[x * h + y];
          p = S.PALETTE[c.species] || S.PALETTE[0];
          t = c.species ? ((c.ra - 70) / 140) : 0;
        }
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        r = (p[0] + (255 - p[0]) * t * 0.22) | 0;
        g = (p[1] + (255 - p[1]) * t * 0.22) | 0;
        b = (p[2] + (255 - p[2]) * t * 0.18) | 0;
        o = (y * w + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
  }

  function paintWorld() {
    if (!renderer || !img) return;
    fillImage();
    try {
      renderer.blit(img);
    } catch (e) {
      showFail('Drawing failed. This toy needs a canvas, and it stopped. The world is still in this file.', true);
      renderer = null;
      return;
    }
    dirty = false;
  }

  function loop() {
    if (!paused && uni) {
      uni.tick();
      dirty = true;
      persistTicks++;
      if (persistTicks >= 90) {
        persistTicks = 0;
        persist();
      }
    }
    if (dirty) paintWorld();
    root.requestAnimationFrame(loop);
  }

  function cellAt(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * uni.width);
    var y = Math.floor((e.clientY - r.top) / r.height * uni.height);
    return { x: x, y: y };
  }
  function paintAt(e) {
    var p = cellAt(e);
    uni.paint(p.x, p.y, size(), species);
    dirty = true;
  }

  function paintPalette() {
    var box = $('palette');
    box.textContent = '';
    S.LABELS.forEach(function (el) {
      var b = document.createElement('button');
      var col = S.PALETTE[el.id] || S.PALETTE[0];
      b.type = 'button';
      b.textContent = el.name;
      b.setAttribute('data-sp', String(el.id));
      b.style.background = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      b.style.color = el.id === SP.Empty || el.id === SP.Oil || el.id === SP.Wall || el.id === SP.Wood ? '#f0e6d4' : '#1a1410';
      b.className = el.id === species ? 'on' : '';
      b.addEventListener('click', function () {
        species = el.id;
        $('which').textContent = el.name;
        paintPalette();
        persist();
      });
      box.appendChild(b);
    });
    $('which').textContent = labelOf(species);
  }

  function paintBrushes() {
    var box = $('brushes');
    box.textContent = '';
    S.SIZE_MAP.forEach(function (sz, i) {
      var b = document.createElement('button');
      var d = document.createElement('span');
      var px = 4 + i * 3;
      b.type = 'button';
      b.className = i === sizeIdx ? 'on' : '';
      b.setAttribute('aria-label', 'Brush ' + sz);
      d.style.width = px + 'px';
      d.style.height = px + 'px';
      b.appendChild(d);
      b.addEventListener('click', function () {
        sizeIdx = i;
        paintBrushes();
        persist();
      });
      box.appendChild(b);
    });
  }

  function paintSaves() {
    var list = $('saveList');
    var wrap = $('saves');
    list.textContent = '';
    named.forEach(function (n) {
      var li = document.createElement('li');
      var load = document.createElement('button');
      var del = document.createElement('button');
      load.type = 'button';
      load.className = 'load';
      load.textContent = n.title;
      load.addEventListener('click', function () { loadNamed(n.id); });
      del.type = 'button';
      del.className = 'row-del';
      del.setAttribute('aria-label', 'Remove');
      del.innerHTML = DEL;
      del.addEventListener('click', function () { deleteNamed(n.id); });
      li.appendChild(load);
      li.appendChild(del);
      list.appendChild(li);
    });
    wrap.classList.toggle('empty', named.length === 0);
  }

  function refreshNamed() {
    if (!saveDb) return;
    saveDb.getAll().then(function (rows) {
      named = (rows || []).filter(function (r) {
        return r && r.id && r.id !== 'last' && r.cells;
      }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      paintSaves();
    }).catch(function (err) {
      showFail((err && err.message) || 'Could not read named boards.');
    });
  }

  function loadNamed(id) {
    if (!saveDb) return;
    saveDb.get(id).then(function (rec) {
      if (!rec || !rec.cells) return;
      uni.pushUndo();
      uni.loadPacked(rec.w || uni.width, rec.h || uni.height, rec.cells);
      dirty = true;
      persist();
    }).catch(function (err) {
      showFail((err && err.message) || 'Could not open that board.');
    });
  }

  function deleteNamed(id) {
    if (!saveDb) return;
    saveDb.delete(id).then(refreshNamed).catch(function (err) {
      showFail((err && err.message) || 'Could not remove that board.');
    });
  }

  function keepNamed() {
    if (!saveDb) return;
    var title = ($('saveName').value || '').trim() || 'Board';
    var id = 'n_' + Date.now().toString(36);
    saveDb.put({
      id: id,
      title: title.slice(0, 40),
      w: uni.width,
      h: uni.height,
      cells: uni.pack(),
      at: Date.now()
    }).then(function () {
      $('saveName').value = '';
      refreshNamed();
    }).catch(function (err) {
      showFail((err && err.message) || 'Could not keep this board in the file.');
    });
  }

  function setPaused(v) {
    paused = !!v;
    $('pauseBtn').textContent = paused ? 'Play' : 'Pause';
    $('pauseBtn').classList.toggle('on', paused);
  }

  function dismissHint() {
    if (poured) return;
    poured = true;
    showHint(false);
  }

  function bind() {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      painting = true;
      uni.pushUndo();
      paintAt(e);
      dismissHint();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!painting) return;
      paintAt(e);
    });
    function up() {
      if (!painting) return;
      painting = false;
      persist();
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setPaused(!paused);
      persistNow();
    });
    $('undoBtn').addEventListener('click', function (e) {
      e.preventDefault();
      uni.popUndo();
      dirty = true;
      persist();
    });
    $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      uni.pushUndo();
      uni.reset();
      dirty = true;
      persist();
      poured = false;
      showHint(true);
    });
    $('keepBtn').addEventListener('click', function (e) {
      e.preventDefault();
      keepNamed();
    });
    $('fail').addEventListener('click', function () {
      if (!$('fail').classList.contains('sticky')) showFail('');
    });

    if (root.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (root.SandWall && root.SandWall.busy()) {
          root.SandWall.leave();
          return true;
        }
        if ($('fail') && !$('fail').hidden && !$('fail').classList.contains('sticky')) {
          showFail('');
          return true;
        }
        return false;
      });
    }

    function flush() { persistNow(); }
    root.addEventListener('pagehide', flush);
    root.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) persistNow();
    });
  }

  function loadLast() {
    if (!saveDb) return Promise.resolve(false);
    return saveDb.get('last').then(function (rec) {
      if (rec && rec.cells) {
        uni.loadPacked(rec.w || uni.width, rec.h || uni.height, rec.cells);
        if (rec.species != null) species = rec.species;
        if (rec.sizeIdx != null) sizeIdx = rec.sizeIdx;
        if (rec.paused) setPaused(true);
        poured = true;
        return true;
      }
      return false;
    }).catch(function (err) {
      showFail((err && err.message) || 'Could not open the world in this file.');
      return false;
    });
  }

  function start(engine, kind) {
    uni = engine;
    engineKind = kind;
    canvas.width = uni.width;
    canvas.height = uni.height;
    renderer = attachRenderer(canvas);
    if (!renderer) {
      showFail('This toy needs a canvas (WebGL or 2D), and this browser did not give it one. The world is still in this file; it cannot draw here.', true);
      showHint(false);
      return;
    }
    if (renderer.kind === '2d') {
      img = canvas.getContext('2d').createImageData(uni.width, uni.height);
    } else {
      try { img = new ImageData(uni.width, uni.height); }
      catch (e) {
        img = { data: new Uint8ClampedArray(uni.width * uni.height * 4), width: uni.width, height: uni.height };
      }
    }
    paintPalette();
    paintBrushes();
    bind();
    loadLast().then(function (had) {
      paintPalette();
      paintBrushes();
      showHint(!had);
      dirty = true;
      if (!root.requestAnimationFrame) {
        root.requestAnimationFrame = function (fn) { return setTimeout(fn, 33); };
      }
      loop();
    });
    refreshNamed();
  }

  function boot() {
    var p = (root.SandWasm && root.SandWasm.boot) ? root.SandWasm.boot() : Promise.resolve(null);
    p.then(function (engine) {
      if (engine) {
        start(engine, 'wasm');
        return;
      }
      var why = (root.SandWasm && root.SandWasm.fail && root.SandWasm.fail()) ||
        'The pouring engine did not start. The world will still pour, slower.';
      showFail(why, false);
      start(new S.Universe(S.WIDTH, S.HEIGHT), 'js');
    }).catch(function (err) {
      showFail((err && err.message) || 'The pouring engine did not start. The world will still pour, slower.', false);
      start(new S.Universe(S.WIDTH, S.HEIGHT), 'js');
    });
  }

  root.SandApp = {
    universe: function () { return uni; },
    pack: function () { return uni ? uni.pack() : ''; },
    thumb: function () { return uni ? uni.thumb() : ''; },
    loadPacked: function (w, h, packed) {
      if (!uni) return;
      uni.pushUndo();
      uni.loadPacked(w, h, packed);
      dirty = true;
      persist();
    },
    setPaused: setPaused,
    paused: function () { return paused; },
    persist: persist,
    engine: function () { return engineKind; },
    note: function (msg) { showFail(msg, false); }
  };

  boot();
})(window);
