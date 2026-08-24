/*
 * Sandspiel shell: paint, pause, undo, reset, private last + named boards.
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var S = root.Sandspiel;
  var SP = S.Species;
  var $ = function (id) { return document.getElementById(id); };
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var uni = new S.Universe(S.WIDTH, S.HEIGHT);
  var species = SP.Water;
  var sizeIdx = 2;
  var paused = false;
  var painting = false;
  var saveDb = null;
  var saveTimer = 0;
  var named = [];
  var canvas = $('world');
  var ctx = canvas.getContext('2d');
  var img = ctx.createImageData(uni.width, uni.height);
  var dirty = true;

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

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        w: uni.width,
        h: uni.height,
        cells: uni.pack(),
        species: species,
        sizeIdx: sizeIdx,
        paused: paused
      }).catch(function () {});
    }, 400);
  }

  function paintWorld() {
    var d = img.data, cells = uni.cells, w = uni.width, h = uni.height;
    var x, y, c, p, o, t, r, g, b;
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) {
        c = cells[x * h + y];
        p = S.PALETTE[c.species] || S.PALETTE[0];
        t = c.species ? ((c.ra - 70) / 140) : 0;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        r = (p[0] + (255 - p[0]) * t * 0.22) | 0;
        g = (p[1] + (255 - p[1]) * t * 0.22) | 0;
        b = (p[2] + (255 - p[2]) * t * 0.18) | 0;
        o = (y * w + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    dirty = false;
  }

  function loop() {
    if (!paused) {
      uni.tick();
      dirty = true;
      persist();
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
  }

  function refreshNamed() {
    if (!saveDb) return;
    saveDb.getAll().then(function (rows) {
      named = (rows || []).filter(function (r) {
        return r && r.id && r.id !== 'last' && r.cells;
      }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      paintSaves();
    }).catch(function () {});
  }

  function loadNamed(id) {
    if (!saveDb) return;
    saveDb.get(id).then(function (rec) {
      if (!rec || !rec.cells) return;
      uni.pushUndo();
      uni.loadPacked(rec.w || uni.width, rec.h || uni.height, rec.cells);
      dirty = true;
      persist();
    }).catch(function () {});
  }

  function deleteNamed(id) {
    if (!saveDb) return;
    saveDb.delete(id).then(refreshNamed).catch(function () {});
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
    }).catch(function () {});
  }

  function setPaused(v) {
    paused = !!v;
    $('pauseBtn').textContent = paused ? 'Play' : 'Pause';
    $('pauseBtn').classList.toggle('on', paused);
  }

  function bind() {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      painting = true;
      uni.pushUndo();
      paintAt(e);
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
      persist();
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
    });
    $('keepBtn').addEventListener('click', function (e) {
      e.preventDefault();
      keepNamed();
    });
  }

  function boot() {
    paintPalette();
    paintBrushes();
    bind();
    if (saveDb) {
      saveDb.get('last').then(function (rec) {
        if (rec && rec.cells) {
          uni.loadPacked(rec.w || uni.width, rec.h || uni.height, rec.cells);
          if (rec.species != null) species = rec.species;
          if (rec.sizeIdx != null) sizeIdx = rec.sizeIdx;
          if (rec.paused) setPaused(true);
          paintPalette();
          paintBrushes();
          dirty = true;
        }
      }).catch(function () {});
      refreshNamed();
    }
    if (!root.requestAnimationFrame) {
      root.requestAnimationFrame = function (fn) { return setTimeout(fn, 33); };
    }
    loop();
  }

  root.SandApp = {
    universe: function () { return uni; },
    pack: function () { return uni.pack(); },
    thumb: function () { return uni.thumb(); },
    loadPacked: function (w, h, packed) {
      uni.pushUndo();
      uni.loadPacked(w, h, packed);
      dirty = true;
      persist();
    },
    setPaused: setPaused,
    paused: function () { return paused; },
    persist: persist
  };

  boot();
})(window);
