/*
 * Toolbar, pointer (pan / pinch / belt-draw / place), HUD, hotkeys.
 */
(function (root) {
  'use strict';

  var g, canvas, hud, toolsEl, goalEl, toastEl, rosterEl;
  var hover = null;
  var pointers = {};
  var nPtr = 0;
  var drawing = false;
  var lastDraw = null;
  var pan0 = null;
  var pinch0 = null;
  var moved = false;
  var cursors = [];
  var meId = '';
  var onPlace = null;
  var onErase = null;
  var onRotate = null;
  var onCam = null;

  var TOOLS = [
    { id: 'hand', name: 'Move', key: 'V' },
    { id: 'belt', name: 'Belt', key: '1' },
    { id: 'miner', name: 'Extractor', key: '2' },
    { id: 'cutter', name: 'Cutter', key: '3' },
    { id: 'rotator', name: 'Rotator', key: '4' },
    { id: 'painter', name: 'Painter', key: '5' },
    { id: 'trash', name: 'Trash', key: '6' },
    { id: 'erase', name: 'Delete', key: 'X' }
  ];

  function $(id) { return document.getElementById(id); }

  function fit() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== (w * dpr | 0) || canvas.height !== (h * dpr | 0)) {
      canvas.width = w * dpr | 0;
      canvas.height = h * dpr | 0;
    }
    return { w: canvas.width, h: canvas.height, dpr: dpr, cssW: w, cssH: h };
  }

  function worldFromEvent(ev) {
    var r = canvas.getBoundingClientRect();
    var sz = fit();
    var sx = (ev.clientX - r.left) * (sz.w / r.width);
    var sy = (ev.clientY - r.top) * (sz.h / r.height);
    return g.worldPoint(sx, sy, sz.w, sz.h);
  }

  function setTool(id) {
    if (id !== 'hand' && id !== 'erase' && id !== 'belt' && id !== 'miner') {
      if (!g.unlocks[id]) return;
    }
    g.tool = id;
    paintTools();
  }

  function paintTools() {
    var i, t, btn, cnv, locked;
    if (!toolsEl) return;
    if (!toolsEl.childNodes.length) {
      for (i = 0; i < TOOLS.length; i++) {
        t = TOOLS[i];
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tool';
        btn.dataset.id = t.id;
        btn.setAttribute('aria-label', t.name);
        cnv = document.createElement('canvas');
        cnv.width = 64; cnv.height = 64;
        btn.appendChild(cnv);
        var lab = document.createElement('span');
        lab.textContent = t.name;
        btn.appendChild(lab);
        btn.addEventListener('click', (function (id) {
          return function (e) { e.preventDefault(); setTool(id); };
        })(t.id));
        toolsEl.appendChild(btn);
      }
    }
    for (i = 0; i < toolsEl.childNodes.length; i++) {
      btn = toolsEl.childNodes[i];
      t = TOOLS[i];
      locked = (t.id !== 'hand' && t.id !== 'erase' && t.id !== 'belt' && t.id !== 'miner' && !g.unlocks[t.id]);
      btn.classList.toggle('on', g.tool === t.id);
      btn.classList.toggle('locked', locked);
      btn.disabled = locked;
      root.SZDraw.drawToolbarIcon(btn.firstChild.getContext('2d'), t.id, 64, locked);
    }
  }

  function paintHud() {
    if (!hud || !goalEl) return;
    var goal = g.goal();
    var lvl = g.level + 1;
    var need = goal ? goal.need : 0;
    var pct = need ? Math.min(100, (g.delivered / need) * 100) : 0;
    hud.querySelector('#lvl').textContent = 'Level ' + lvl;
    hud.querySelector('#goal-name').textContent = goal ? goal.label : '';
    hud.querySelector('#goal-count').textContent = g.delivered + ' / ' + need;
    hud.querySelector('#bar > i').style.width = pct + '%';
    hud.querySelector('#speed').textContent = g.paused ? '❚❚' : (g.rate + '×');
    $('btn-pause').textContent = g.paused ? '▶' : '❚❚';
    var gctx = goalEl.getContext('2d');
    var s = goalEl.width;
    gctx.clearRect(0, 0, s, s);
    gctx.fillStyle = 'rgba(16,20,28,0.35)';
    gctx.fillRect(0, 0, s, s);
    if (goal) root.SZ.drawShape(gctx, goal.goal, s / 2, s / 2, s * 0.78);
    var hint = $('hint');
    if (g.hint) {
      hint.hidden = false;
      hint.textContent = g.hint;
    } else {
      hint.hidden = true;
    }
    var toast = g.toasts[g.toasts.length - 1];
    if (toast) {
      toastEl.hidden = false;
      toastEl.textContent = toast.msg;
    } else {
      toastEl.hidden = true;
    }
    $('zoom-lab').textContent = Math.round(g.zoom * 100) + '%';
  }

  function paintRoster(list) {
    if (!rosterEl) return;
    if (!list || list.length < 2) {
      rosterEl.hidden = true;
      return;
    }
    rosterEl.hidden = false;
    rosterEl.textContent = list.length + ' building';
  }

  function applyDraw(x, y) {
    if (g.tool === 'erase') {
      if (g.erase(x, y) && onErase) onErase(x, y);
      return;
    }
    if (g.tool === 'hand') return;
    if (!g.unlocks[g.tool] && g.tool !== 'belt' && g.tool !== 'miner') return;
    var existing = g.cell(x, y);
    if (g.tool === 'belt') {
      var rot = g.rot;
      if (existing && existing.k !== 'belt') {
        lastDraw = { x: x, y: y };
        return;
      }
      if (lastDraw && (lastDraw.x !== x || lastDraw.y !== y)) {
        var dx = x - lastDraw.x, dy = y - lastDraw.y;
        if (Math.abs(dx) + Math.abs(dy) === 1) {
          if (dx === 1) rot = 0;
          else if (dy === 1) rot = 1;
          else if (dx === -1) rot = 2;
          else rot = 3;
          var prev = g.cell(lastDraw.x, lastDraw.y);
          if (prev && prev.k === 'belt' && prev.r !== rot) {
            g.cells[lastDraw.x + ',' + lastDraw.y].r = rot;
            if (onPlace) onPlace(lastDraw.x, lastDraw.y, 'belt', rot);
          }
        }
      }
      g.rot = rot;
      if (g.place(x, y, 'belt', rot, meId) && onPlace) onPlace(x, y, 'belt', rot);
      lastDraw = { x: x, y: y };
      return;
    }
    if (existing && existing.k === g.tool) {
      g.rotateCell(x, y);
      if (onRotate) onRotate(x, y, g.cell(x, y).r);
      return;
    }
    if (g.place(x, y, g.tool, g.rot, meId) && onPlace) onPlace(x, y, g.tool, g.rot);
  }

  function onDown(ev) {
    if (ev.button === 1 || ev.button === 2) {
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY, pan: true };
      nPtr = Object.keys(pointers).length;
      pan0 = { x: ev.clientX, y: ev.clientY, camX: g.camX, camY: g.camY };
      canvas.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }
    if (ev.button !== 0 && ev.pointerType !== 'touch') return;
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    nPtr = Object.keys(pointers).length;
    moved = false;
    canvas.setPointerCapture(ev.pointerId);
    if (nPtr === 2) {
      drawing = false;
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch0 = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: g.zoom,
        camX: g.camX, camY: g.camY
      };
      pan0 = null;
      return;
    }
    var w = worldFromEvent(ev);
    hover = w;
    if (g.tool === 'hand' || ev.shiftKey) {
      pan0 = { x: ev.clientX, y: ev.clientY, camX: g.camX, camY: g.camY };
      drawing = false;
    } else {
      drawing = true;
      lastDraw = null;
      applyDraw(w.x, w.y);
    }
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!pointers[ev.pointerId]) {
      hover = worldFromEvent(ev);
      return;
    }
    pointers[ev.pointerId].x = ev.clientX;
    pointers[ev.pointerId].y = ev.clientY;
    var dx = 0, dy = 0;
    if (pan0) {
      dx = ev.clientX - pan0.x;
      dy = ev.clientY - pan0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    }
    if (nPtr === 2 && pinch0) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0.d > 8) {
        g.zoom = Math.max(0.28, Math.min(2.4, pinch0.zoom * (d / pinch0.d)));
        if (onCam) onCam();
      }
      return;
    }
    if (pan0 && (g.tool === 'hand' || pointers[ev.pointerId].pan || ev.shiftKey || (moved && g.tool !== 'belt' && g.tool !== 'erase'))) {
      var sz = fit();
      var z = g.zoom * root.SZConst.TILE;
      g.camX = pan0.camX - dx * (sz.w / canvas.getBoundingClientRect().width) / z;
      g.camY = pan0.camY - dy * (sz.h / canvas.getBoundingClientRect().height) / z;
      if (onCam) onCam();
      drawing = false;
      return;
    }
    hover = worldFromEvent(ev);
    if (drawing && (g.tool === 'belt' || g.tool === 'erase')) {
      applyDraw(hover.x, hover.y);
    }
  }

  function onUp(ev) {
    delete pointers[ev.pointerId];
    nPtr = Object.keys(pointers).length;
    if (nPtr < 2) pinch0 = null;
    if (nPtr === 0) {
      if (drawing && !moved && g.tool !== 'belt' && hover) {
        /* tap already placed on down */
      }
      drawing = false;
      lastDraw = null;
      pan0 = null;
    }
  }

  function onWheel(ev) {
    ev.preventDefault();
    var before = worldFromEvent(ev);
    var f = ev.deltaY > 0 ? 0.9 : 1.11;
    g.zoom = Math.max(0.28, Math.min(2.4, g.zoom * f));
    var after = worldFromEvent(ev);
    g.camX += before.x - after.x + (before.x === after.x ? 0 : 0);
    g.camX += (before.x + 0.5) - (after.x + 0.5);
    g.camY += (before.y + 0.5) - (after.y + 0.5);
    if (onCam) onCam();
  }

  function onKey(ev) {
    if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
    var k = ev.key;
    var pan = 0.55 / g.zoom;
    if (k === '1') setTool('belt');
    else if (k === '2') setTool('miner');
    else if (k === '3') setTool('cutter');
    else if (k === '4') setTool('rotator');
    else if (k === '5') setTool('painter');
    else if (k === '6') setTool('trash');
    else if (k === 'v' || k === 'V' || k === 'Escape') setTool('hand');
    else if (k === 'x' || k === 'X' || k === 'Backspace' || k === 'Delete') setTool('erase');
    else if (k === 'r' || k === 'R') {
      g.rot = (g.rot + 1) & 3;
      if (hover && g.cell(hover.x, hover.y)) {
        g.rotateCell(hover.x, hover.y);
        if (onRotate) onRotate(hover.x, hover.y, g.cell(hover.x, hover.y).r);
      }
    }
    else if (k === 'q' || k === 'Q') g.rot = (g.rot + 3) & 3;
    else if (k === 'e' || k === 'E') g.rot = (g.rot + 1) & 3;
    else if (k === ' ') { g.paused = !g.paused; ev.preventDefault(); }
    else if (k === '+' || k === '=') g.rate = Math.min(4, g.rate === 3 ? 4 : g.rate + 1);
    else if (k === '-') g.rate = Math.max(1, g.rate - 1);
    else if (k === 'h' || k === 'H') { g.camX = 0; g.camY = 0; if (onCam) onCam(); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') g.camX -= pan;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') g.camX += pan;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') g.camY -= pan;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') g.camY += pan;
    else return;
    paintTools();
  }

  function frame(t) {
    if (!frame.prev) frame.prev = t;
    var dt = (t - frame.prev) / 1000;
    frame.prev = t;
    g.tick(dt);
    if (frame.lvl !== g.level) {
      frame.lvl = g.level;
      paintTools();
    }
    var sz = fit();
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    root.SZDraw.render(ctx, g, sz.w, sz.h, {
      hover: hover,
      tool: g.tool,
      rot: g.rot,
      cursors: cursors,
      meId: meId
    });
    paintHud();
    if (root.SZNet && root.SZNet.live()) root.SZNet.tick(hover);
    requestAnimationFrame(frame);
  }

  function bindChrome() {
    $('btn-pause').addEventListener('click', function () { g.paused = !g.paused; });
    $('btn-speed').addEventListener('click', function () {
      g.rate = g.rate >= 3 ? 1 : g.rate + 1;
    });
    $('btn-hub').addEventListener('click', function () { g.camX = 0; g.camY = 0; });
    $('btn-zoom-in').addEventListener('click', function () { g.zoom = Math.min(2.4, g.zoom * 1.2); });
    $('btn-zoom-out').addEventListener('click', function () { g.zoom = Math.max(0.28, g.zoom / 1.2); });
    $('btn-reset').addEventListener('click', function () {
      if (!window.confirm('Clear this factory? The hub starts over.')) return;
      if (root.SZNet && root.SZNet.live()) root.SZNet.resetWorld();
      else g.reset();
    });
  }

  function init(game, opts) {
    g = game;
    opts = opts || {};
    canvas = $('map');
    hud = $('hud');
    toolsEl = $('tools');
    goalEl = $('goal-shape');
    toastEl = $('toast');
    rosterEl = $('roster');
    onPlace = opts.onPlace;
    onErase = opts.onErase;
    onRotate = opts.onRotate;
    onCam = opts.onCam;
    meId = opts.meId || '';
    if (root.SZDraw && root.SZDraw.bind) root.SZDraw.bind();
    paintTools();
    bindChrome();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', fit);
    fit();
    requestAnimationFrame(frame);
  }

  function back() {
    if (g.tool !== 'hand') {
      setTool('hand');
      return true;
    }
    return false;
  }

  root.SZUI = {
    init: init,
    setTool: setTool,
    paintTools: paintTools,
    paintRoster: paintRoster,
    setCursors: function (c) { cursors = c || []; },
    setMe: function (id) { meId = id; },
    back: back
  };
})(window);
