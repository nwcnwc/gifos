/*
 * Matter Sandbox — tools, pointer, paint loop.
 *
 * physics.js owns the world. This file is the hands: tool buttons, drag,
 * sling pull, gravity slider, and the canvas.
 */
(function (root) {
  'use strict';

  var P = root.MSPhysics;
  var canvas = null;
  var ctx = null;
  var tool = 'grab';
  var paused = false;
  var owner = true;
  var running = false;
  var last = 0;
  var hint = '';
  var fullFlash = 0;
  var pointers = {};
  var onAction = null;
  var onTick = null;
  var cursors = [];

  var HINTS = {
    grab: 'Drag anything.',
    box: 'Tap to drop a box.',
    ball: 'Tap to drop a ball.',
    ragdoll: 'Tap to drop a ragdoll.',
    sling: 'Pull the rock, then let go.'
  };

  function $(id) { return document.getElementById(id); }

  function worldFromEvent(e) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (e.clientX - r.left) * (P.WORLD_W / r.width),
      y: (e.clientY - r.top) * (P.WORLD_H / r.height)
    };
  }

  function fit() {
    if (!canvas) return;
    var stage = $('stage') || canvas.parentElement;
    var rw = stage.clientWidth || P.WORLD_W;
    var rh = stage.clientHeight || P.WORLD_H;
    var scale = Math.min(rw / P.WORLD_W, rh / P.WORLD_H);
    var cssW = Math.max(1, P.WORLD_W * scale);
    var cssH = Math.max(1, P.WORLD_H * scale);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.round(P.WORLD_W * dpr);
    canvas.height = Math.round(P.WORLD_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setHint(s) {
    hint = s || HINTS[tool] || '';
    var el = $('hint');
    if (el) el.textContent = hint;
  }

  function flashFull() {
    fullFlash = Date.now();
    setHint('Room is full — reset to make space.');
  }

  function paintTools() {
    var btns = document.querySelectorAll('[data-tool]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-tool') === tool);
    }
    var pauseBtn = $('pauseBtn');
    if (pauseBtn) pauseBtn.textContent = paused ? 'Play' : 'Pause';
    document.body.classList.toggle('paused', paused);
  }

  function setTool(name) {
    if (!HINTS[name] && name !== 'grab') return;
    tool = name || 'grab';
    if (tool !== 'grab' && tool !== 'sling') P.dropGrab();
    if (tool === 'sling') P.addSling();
    paintTools();
    setHint(HINTS[tool]);
    if (onAction) onAction({ op: 'tool', tool: tool });
  }

  function setPaused(on) {
    if (!owner) return;
    paused = !!on;
    paintTools();
    setHint(paused ? 'Paused.' : HINTS[tool]);
  }

  function spawnAt(op, x, y, silent) {
    var made = true;
    if (owner) {
      made = null;
      if (op === 'box') made = P.addBox(x, y);
      else if (op === 'ball') made = P.addBall(x, y);
      else if (op === 'ragdoll') made = P.addRagdoll(x, y);
      else if (op === 'stack') made = P.addStack(x, y);
      if (!made) {
        flashFull();
        return null;
      }
    }
    if (!silent && onAction) onAction({ op: op, x: x, y: y });
    return made;
  }

  function resetArena(silent) {
    if (owner) P.resetArena();
    paused = false;
    paintTools();
    setHint(HINTS[tool]);
    if (!silent && onAction) onAction({ op: 'reset' });
  }

  function setGravityUI(y, silent) {
    P.setGravity(y);
    var grav = $('grav');
    var lab = $('gravN');
    if (grav && document.activeElement !== grav) grav.value = String(Math.round(y * 10));
    if (lab) lab.textContent = y.toFixed(1);
    if (!silent && onAction) onAction({ op: 'grav', g: y });
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    var w = worldFromEvent(e);
    if (!w) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: w.x, y: w.y, t: Date.now(), sid: null };
    if (tool === 'grab' || tool === 'sling') {
      var body = P.pick(w.x, w.y);
      if (tool === 'sling') {
        var s = P.findSling();
        if (s && s.rock && body !== s.rock) {
          var dx = w.x - s.anchor.x, dy = w.y - s.anchor.y;
          if (Math.sqrt(dx * dx + dy * dy) < 46) body = s.rock;
          else body = null;
        }
      }
      if (body) {
        pointers[e.pointerId].sid = body.plugin && body.plugin.sid;
        if (owner) P.grabStart(w.x, w.y, body);
        if (onAction) onAction({ op: 'drag', sid: body.plugin && body.plugin.sid, x: w.x, y: w.y });
      }
      return;
    }
    spawnAt(tool, w.x, w.y);
  }

  function onPointerMove(e) {
    var w = worldFromEvent(e);
    if (!w) return;
    var p = pointers[e.pointerId];
    if (!p && (e.buttons === 0 && e.pressure === 0)) {
      if (onAction) onAction({ op: 'cursor', x: w.x, y: w.y });
      return;
    }
    if (!p) return;
    p.x = w.x; p.y = w.y;
    if (p.sid) {
      if (owner && P.grabbing()) P.grabMove(w.x, w.y);
      if (onAction) onAction({ op: 'drag', sid: p.sid, x: w.x, y: w.y });
      return;
    }
    if (onAction) onAction({ op: 'cursor', x: w.x, y: w.y });
  }

  function onPointerUp(e) {
    var p = pointers[e.pointerId];
    delete pointers[e.pointerId];
    if (!p) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (owner && P.grabbing()) P.dropGrab();
    if (p.sid && onAction) onAction({ op: 'undrag' });
    else if (onAction) onAction({ op: 'cursor', x: p.x, y: p.y });
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    var dt = last ? Math.min(48, now - last) : 16.6;
    last = now;
    if (owner && !paused) P.step(dt);
    if (onTick) onTick(dt);
    P.paint(ctx, { cursors: cursors });
    if (paused) {
      ctx.fillStyle = 'rgba(11,13,20,0.28)';
      ctx.fillRect(0, 0, P.WORLD_W, P.WORLD_H);
    }
    if (fullFlash && now - fullFlash > 2200) {
      fullFlash = 0;
      setHint(HINTS[tool]);
    }
  }

  function bind() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var tools = document.querySelectorAll('[data-tool]');
    for (var i = 0; i < tools.length; i++) {
      tools[i].addEventListener('click', function (e) {
        e.preventDefault();
        setTool(this.getAttribute('data-tool'));
      });
    }
    $('stackBtn').addEventListener('click', function (e) {
      e.preventDefault();
      spawnAt('stack', 430, 200);
    });
    $('resetBtn').addEventListener('click', function (e) {
      e.preventDefault();
      resetArena();
    });
    $('pauseBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setPaused(!paused);
    });
    var grav = $('grav');
    grav.addEventListener('input', function () {
      setGravityUI(parseInt(grav.value, 10) / 10);
    });

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag && /INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if (e.key === '1') setTool('grab');
      else if (e.key === '2') setTool('box');
      else if (e.key === '3') setTool('ball');
      else if (e.key === '4') setTool('ragdoll');
      else if (e.key === '5') setTool('sling');
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); resetArena(); }
      else if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
    });

    root.addEventListener('resize', fit);
  }

  function mount(cv, opts) {
    opts = opts || {};
    canvas = cv;
    ctx = canvas.getContext('2d');
    owner = opts.owner !== false;
    onAction = opts.onAction || null;
    onTick = opts.onTick || null;
    P.create();
    if (opts.scene) P.importScene(opts.scene);
    else P.resetArena();
    fit();
    bind();
    paintTools();
    setGravityUI(P.gravity(), true);
    setHint(HINTS[tool]);
    running = true;
    last = 0;
    requestAnimationFrame(loop);
    return {
      fit: fit,
      setTool: setTool,
      setPaused: setPaused,
      setOwner: function (v) { owner = !!v; },
      isOwner: function () { return owner; },
      tool: function () { return tool; },
      paused: function () { return paused; },
      resetArena: resetArena,
      spawnAt: spawnAt,
      setGravity: setGravityUI,
      setCursors: function (list) { cursors = list || []; },
      setHint: setHint
    };
  }

  root.MSApp = {
    mount: mount,
    HINTS: HINTS
  };
})(window);
