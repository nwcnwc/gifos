/*
 * Matter Sandbox — engine, toys, scene I/O.
 *
 * DOM-free so the build can step a real world in Node and paint the cover
 * from it. vendor/matter.min.js must load first.
 */
(function (root) {
  'use strict';

  var M = root.Matter;
  if (!M) throw new Error('matter-js missing');

  var Engine = M.Engine;
  var World = M.Composite;
  var Bodies = M.Bodies;
  var Body = M.Body;
  var Constraint = M.Constraint;
  var Composite = M.Composite;
  var Composites = M.Composites;
  var Query = M.Query;
  var Sleeping = M.Sleeping;
  var Common = M.Common;

  var WORLD_W = 800;
  var WORLD_H = 600;
  var MAX_BODIES = 80;
  var FILLS = ['#f19648', '#f5d259', '#f55a3c', '#063e7b', '#ececd1', '#4ecdc4'];
  var BG = '#0b0d14';
  var WALL_FILL = '#141824';
  var FLOOR_FILL = '#1a2030';

  var engine = null;
  var nextSid = 1;
  var colorI = 0;
  var gen = 1;
  var dirty = false;
  var sling = null;
  var dragC = null;
  var remoteDrags = {};

  function rr(n, p) {
    var m = Math.pow(10, p == null ? 1 : p);
    return Math.round(n * m) / m;
  }

  function nextColor() {
    var c = FILLS[colorI % FILLS.length];
    colorI += 1;
    return c;
  }

  function tag(body, kind, extra) {
    body.plugin = body.plugin || {};
    body.plugin.kind = kind;
    body.plugin.sid = extra && extra.sid ? extra.sid : 's' + (nextSid++);
    if (extra) {
      if (extra.w) body.plugin.w = extra.w;
      if (extra.h) body.plugin.h = extra.h;
      if (extra.r) body.plugin.r = extra.r;
      if (extra.n) body.plugin.n = extra.n;
    }
    return body;
  }

  function noteSid(sid) {
    if (!sid) return;
    var n = parseInt(String(sid).replace(/^s/, ''), 10);
    if (n >= nextSid) nextSid = n + 1;
  }

  function addWalls(world) {
    var T = 80;
    var opts = function (fill) {
      return {
        isStatic: true,
        friction: 0.9,
        restitution: 0.05,
        render: { fillStyle: fill, strokeStyle: '#0a0c12', lineWidth: 1 },
        plugin: { wall: true, kind: 'wall' }
      };
    };
    World.add(world, [
      Bodies.rectangle(WORLD_W / 2, WORLD_H + T / 2 - 10, WORLD_W + 2 * T, T, opts(FLOOR_FILL)),
      Bodies.rectangle(-T / 2, WORLD_H / 2, T, WORLD_H + 2 * T, opts(WALL_FILL)),
      Bodies.rectangle(WORLD_W + T / 2, WORLD_H / 2, T, WORLD_H + 2 * T, opts(WALL_FILL)),
      Bodies.rectangle(WORLD_W / 2, -T / 2, WORLD_W + 2 * T, T, opts(WALL_FILL))
    ]);
  }

  function create() {
    engine = Engine.create({ enableSleeping: true });
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    engine.gravity.scale = 0.001;
    engine.positionIterations = 6;
    engine.velocityIterations = 4;
    nextSid = 1;
    colorI = 0;
    gen = 1;
    sling = null;
    dragC = null;
    remoteDrags = {};
    addWalls(engine.world);
    dirty = true;
    return engine;
  }

  function toys() {
    var all = Composite.allBodies(engine.world);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].plugin && all[i].plugin.wall) continue;
      out.push(all[i]);
    }
    return out;
  }

  function bodyCount() { return toys().length; }

  function roomFor(n) {
    return bodyCount() + n <= MAX_BODIES;
  }

  function bump() {
    gen += 1;
    dirty = true;
  }

  function addBody(body) {
    World.add(engine.world, body);
    bump();
    return body;
  }

  function addBox(x, y, opts) {
    opts = opts || {};
    if (!roomFor(1)) return null;
    var w = opts.w || 36;
    var h = opts.h || 36;
    var spec = {
      restitution: 0.12,
      friction: 0.4,
      frictionAir: 0.01,
      render: { fillStyle: opts.color || nextColor(), strokeStyle: '#0a0c12', lineWidth: 1.4 }
    };
    if (opts.group) spec.collisionFilter = { group: opts.group };
    var body = Bodies.rectangle(x, y, w, h, spec);
    tag(body, 'box', { w: w, h: h, sid: opts.sid });
    noteSid(body.plugin.sid);
    return addBody(body);
  }

  function addBall(x, y, opts) {
    opts = opts || {};
    if (!roomFor(1)) return null;
    var r = opts.r || 22;
    var spec = {
      restitution: 0.65,
      friction: 0.05,
      frictionAir: 0.01,
      render: { fillStyle: opts.color || nextColor(), strokeStyle: '#0a0c12', lineWidth: 1.4 }
    };
    if (opts.group) spec.collisionFilter = { group: opts.group };
    var body = Bodies.circle(x, y, r, spec);
    tag(body, 'ball', { r: r, sid: opts.sid });
    noteSid(body.plugin.sid);
    return addBody(body);
  }

  function addPoly(x, y, opts) {
    opts = opts || {};
    if (!roomFor(1)) return null;
    var n = opts.n || 8;
    var r = opts.r || 20;
    var spec = {
      density: opts.density || 0.004,
      restitution: 0.4,
      friction: 0.2,
      render: { fillStyle: opts.color || nextColor(), strokeStyle: '#0a0c12', lineWidth: 1.4 }
    };
    if (opts.group) spec.collisionFilter = { group: opts.group };
    var body = Bodies.polygon(x, y, n, r, spec);
    tag(body, 'poly', { n: n, r: r, sid: opts.sid });
    noteSid(body.plugin.sid);
    return addBody(body);
  }

  function addPost(x, y, w, h, sid) {
    var body = Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      render: { fillStyle: '#3a2a22', strokeStyle: '#1a100c', lineWidth: 1.2 },
      chamfer: { radius: 4 }
    });
    tag(body, 'post', { w: w, h: h, sid: sid });
    noteSid(body.plugin.sid);
    return addBody(body);
  }

  function boxPart(x, y, w, h, options, sid) {
    var body = Bodies.rectangle(x, y, w, h, options);
    tag(body, 'box', { w: w, h: h, sid: sid });
    noteSid(body.plugin.sid);
    return body;
  }

  // Proportions follow matter-js examples/ragdoll.js (MIT, Liam Brummitt).
  function addRagdoll(x, y, opts) {
    opts = opts || {};
    var scale = opts.scale == null ? 0.85 : opts.scale;
    if (!roomFor(10)) return null;

    var groupHead = Body.nextGroup(true);
    var groupChest = Body.nextGroup(true);
    var groupLA = Body.nextGroup(true);
    var groupRA = Body.nextGroup(true);
    var groupLL = Body.nextGroup(true);
    var groupRL = Body.nextGroup(true);

    function limb(fill, group) {
      return {
        collisionFilter: { group: group },
        chamfer: { radius: 10 * scale },
        render: { fillStyle: fill, strokeStyle: '#0a0c12', lineWidth: 1.2 }
      };
    }

    var head = boxPart(x, y - 60 * scale, 34 * scale, 40 * scale, {
      collisionFilter: { group: groupHead },
      chamfer: { radius: 15 * scale },
      render: { fillStyle: '#FFBC42', strokeStyle: '#0a0c12', lineWidth: 1.2 }
    }, opts.sids && opts.sids[0]);
    var chest = boxPart(x, y, 55 * scale, 80 * scale, {
      collisionFilter: { group: groupChest },
      chamfer: { radius: [20 * scale, 20 * scale, 26 * scale, 26 * scale] },
      render: { fillStyle: '#E0A423', strokeStyle: '#0a0c12', lineWidth: 1.2 }
    }, opts.sids && opts.sids[1]);
    var rUA = boxPart(x + 39 * scale, y - 15 * scale, 20 * scale, 40 * scale, limb('#FFBC42', groupRA), opts.sids && opts.sids[2]);
    var rLA = boxPart(x + 39 * scale, y + 25 * scale, 20 * scale, 60 * scale, limb('#E59B12', groupRA), opts.sids && opts.sids[3]);
    var lUA = boxPart(x - 39 * scale, y - 15 * scale, 20 * scale, 40 * scale, limb('#FFBC42', groupLA), opts.sids && opts.sids[4]);
    var lLA = boxPart(x - 39 * scale, y + 25 * scale, 20 * scale, 60 * scale, limb('#E59B12', groupLA), opts.sids && opts.sids[5]);
    var lUL = boxPart(x - 20 * scale, y + 57 * scale, 20 * scale, 40 * scale, limb('#FFBC42', groupLL), opts.sids && opts.sids[6]);
    var lLL = boxPart(x - 20 * scale, y + 97 * scale, 20 * scale, 60 * scale, limb('#E59B12', groupLL), opts.sids && opts.sids[7]);
    var rUL = boxPart(x + 20 * scale, y + 57 * scale, 20 * scale, 40 * scale, limb('#FFBC42', groupRL), opts.sids && opts.sids[8]);
    var rLL = boxPart(x + 20 * scale, y + 97 * scale, 20 * scale, 60 * scale, limb('#E59B12', groupRL), opts.sids && opts.sids[9]);

    function joint(a, pa, b, pb) {
      return Constraint.create({
        bodyA: a, pointA: pa, bodyB: b, pointB: pb,
        stiffness: 0.6,
        render: { visible: false }
      });
    }

    var person = Composite.create({
      bodies: [chest, head, lLA, lUA, rLA, rUA, lLL, rLL, lUL, rUL],
      constraints: [
        joint(rUA, { x: 0, y: 15 * scale }, rLA, { x: 0, y: -25 * scale }),
        joint(lUA, { x: 0, y: 15 * scale }, lLA, { x: 0, y: -25 * scale }),
        joint(chest, { x: 24 * scale, y: -23 * scale }, rUA, { x: 0, y: -8 * scale }),
        joint(chest, { x: -24 * scale, y: -23 * scale }, lUA, { x: 0, y: -8 * scale }),
        joint(head, { x: 0, y: 25 * scale }, chest, { x: 0, y: -35 * scale }),
        joint(lUL, { x: 0, y: 20 * scale }, lLL, { x: 0, y: -20 * scale }),
        joint(rUL, { x: 0, y: 20 * scale }, rLL, { x: 0, y: -20 * scale }),
        joint(chest, { x: -10 * scale, y: 30 * scale }, lUL, { x: 0, y: -10 * scale }),
        joint(chest, { x: 10 * scale, y: 30 * scale }, rUL, { x: 0, y: -10 * scale }),
        Constraint.create({
          bodyA: lLL, bodyB: rLL, stiffness: 0.01,
          render: { visible: false }
        })
      ]
    });
    World.add(engine.world, person);
    bump();
    return person;
  }

  function addPyramid(px, py, cols, rows, bw, bh) {
    cols = cols || 7;
    rows = rows || 6;
    bw = bw || 28;
    bh = bh || 36;
    var need = 0;
    var r, c, skip;
    var p = Math.min(rows, Math.ceil(cols / 2));
    for (r = 0; r < rows; r++) {
      skip = p - r;
      if (skip < 0) skip = 0;
      for (c = 0; c < cols; c++) {
        if (c >= skip && c <= cols - 1 - skip) need++;
      }
    }
    if (!roomFor(need)) return null;
    var stack = Composites.pyramid(px, py, cols, rows, 0, 0, function (x, y) {
      var body = Bodies.rectangle(x, y, bw, bh, {
        restitution: 0.08,
        friction: 0.5,
        frictionAir: 0.012,
        render: { fillStyle: nextColor(), strokeStyle: '#0a0c12', lineWidth: 1.3 }
      });
      tag(body, 'box', { w: bw, h: bh });
      return body;
    });
    World.add(engine.world, stack);
    bump();
    return stack;
  }

  function addStack(x, y) {
    return addPyramid(x == null ? 430 : x, y == null ? 220 : y, 7, 6, 28, 36);
  }

  function findSling() {
    if (sling && sling.elastic) return sling;
    var cs = Composite.allConstraints(engine.world);
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].label === 'elastic') {
        sling = {
          elastic: cs[i],
          rock: cs[i].bodyB,
          anchor: { x: cs[i].pointA.x, y: cs[i].pointA.y },
          posts: []
        };
        var bodies = toys();
        for (var b = 0; b < bodies.length; b++) {
          if (bodies[b].plugin && bodies[b].plugin.kind === 'post') sling.posts.push(bodies[b]);
        }
        return sling;
      }
    }
    return null;
  }

  function loadRock(sid) {
    var s = findSling();
    if (!s) return null;
    if (!roomFor(1)) return null;
    var rock = addPoly(s.anchor.x, s.anchor.y, {
      n: 8, r: 18, density: 0.004, color: '#c45c38', sid: sid
    });
    if (!rock) return null;
    s.rock = rock;
    s.elastic.bodyB = rock;
    s.elastic.pointB = { x: 0, y: 0 };
    return rock;
  }

  function addSling(opts) {
    opts = opts || {};
    if (findSling()) return sling;
    var ax = opts.x == null ? 150 : opts.x;
    var ay = opts.y == null ? 430 : opts.y;
    var postL = addPost(ax - 18, ay + 28, 14, 72, opts.postL);
    var postR = addPost(ax + 18, ay + 28, 14, 72, opts.postR);
    var rock = addPoly(ax, ay, { n: 8, r: 18, density: 0.004, color: '#c45c38', sid: opts.rock });
    var elastic = Constraint.create({
      pointA: { x: ax, y: ay },
      bodyB: rock,
      length: 0.01,
      damping: 0.01,
      stiffness: 0.05,
      label: 'elastic',
      render: { strokeStyle: '#e8c4a0', lineWidth: 3, type: 'line', visible: true }
    });
    World.add(engine.world, elastic);
    sling = { elastic: elastic, rock: rock, anchor: { x: ax, y: ay }, posts: [postL, postR] };
    bump();
    return sling;
  }

  function maybeReloadSling() {
    var s = findSling();
    if (!s || !s.rock || dragC) return;
    var dx = s.rock.position.x - s.anchor.x;
    var dy = s.rock.position.y - s.anchor.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 110) return;
    if (Body.getSpeed(s.rock) > 45) Body.setSpeed(s.rock, 45);
    if (dist > 130) loadRock();
  }

  function setGravity(y) {
    if (!engine) return;
    if (y < -2) y = -2;
    if (y > 2) y = 2;
    if (engine.gravity.y === y) return;
    engine.gravity.y = y;
    dirty = true;
  }

  function clearToys() {
    if (!engine) return;
    dropGrab();
    Composite.clear(engine.world, false, true);
    addWalls(engine.world);
    sling = null;
    remoteDrags = {};
    bump();
  }

  function resetArena() {
    if (!engine) create();
    clearToys();
    colorI = 0;
    addSling();
    addPyramid(430, 250, 8, 7, 26, 34);
    addPyramid(540, 40, 5, 6, 24, 30);
    var ledge = Bodies.rectangle(610, 230, 210, 16, {
      isStatic: true,
      friction: 0.8,
      render: { fillStyle: FLOOR_FILL, strokeStyle: '#0a0c12', lineWidth: 1 }
    });
    tag(ledge, 'post', { w: 210, h: 16 });
    addBody(ledge);
    addBall(70, 80, { r: 18, color: '#4ecdc4' });
    addBall(110, 50, { r: 14, color: '#f5d259' });
    dirty = true;
    return engine;
  }

  function pick(x, y) {
    if (!engine) return null;
    var hits = Query.point(Composite.allBodies(engine.world), { x: x, y: y });
    for (var i = 0; i < hits.length; i++) {
      var b = hits[i];
      if (b.isStatic) continue;
      if (b.plugin && b.plugin.wall) continue;
      return b;
    }
    return null;
  }

  function grabStart(x, y, body) {
    dropGrab();
    body = body || pick(x, y);
    if (!body) return null;
    Sleeping.set(body, false);
    dragC = Constraint.create({
      pointA: { x: x, y: y },
      bodyB: body,
      pointB: { x: x - body.position.x, y: y - body.position.y },
      stiffness: 0.2,
      damping: 0.05,
      length: 0.01,
      label: 'drag',
      render: { visible: true, strokeStyle: '#9ee27a', lineWidth: 2 }
    });
    World.add(engine.world, dragC);
    dirty = true;
    return body;
  }

  function grabMove(x, y) {
    if (!dragC) return;
    dragC.pointA.x = x;
    dragC.pointA.y = y;
  }

  function dropGrab() {
    if (!dragC || !engine) { dragC = null; return; }
    World.remove(engine.world, dragC);
    dragC = null;
  }

  function grabbing() { return dragC; }

  function setRemoteDrag(pid, sid, x, y) {
    var existing = remoteDrags[pid];
    if (sid == null) {
      if (existing) {
        World.remove(engine.world, existing);
        delete remoteDrags[pid];
      }
      return;
    }
    var body = bodyBySid(sid);
    if (!body) return;
    Sleeping.set(body, false);
    if (existing && existing.bodyB === body) {
      existing.pointA.x = x;
      existing.pointA.y = y;
      return;
    }
    if (existing) World.remove(engine.world, existing);
    var c = Constraint.create({
      pointA: { x: x, y: y },
      bodyB: body,
      pointB: { x: x - body.position.x, y: y - body.position.y },
      stiffness: 0.2,
      damping: 0.05,
      length: 0.01,
      label: 'drag',
      render: { visible: true, strokeStyle: '#7ec8e3', lineWidth: 2 }
    });
    World.add(engine.world, c);
    remoteDrags[pid] = c;
  }

  function bodyBySid(sid) {
    var all = Composite.allBodies(engine.world);
    for (var i = 0; i < all.length; i++) {
      if (all[i].plugin && all[i].plugin.sid === sid) return all[i];
    }
    return null;
  }

  function packBody(body) {
    var p = body.plugin || {};
    var vel = Body.getVelocity(body);
    return {
      s: p.sid,
      k: p.kind || (body.circleRadius ? 'ball' : 'box'),
      x: rr(body.position.x, 1),
      y: rr(body.position.y, 1),
      a: rr(body.angle, 3),
      vx: rr(vel.x, 2),
      vy: rr(vel.y, 2),
      va: rr(Body.getAngularVelocity(body), 3),
      w: p.w || 0,
      h: p.h || 0,
      r: p.r || body.circleRadius || 0,
      n: p.n || 0,
      c: (body.render && body.render.fillStyle) || FILLS[0],
      st: body.isStatic ? 1 : 0,
      g: (body.collisionFilter && body.collisionFilter.group) || 0,
      lb: body.label || ''
    };
  }

  function packConstraint(c) {
    var a = c.bodyA && c.bodyA.plugin ? c.bodyA.plugin.sid : '';
    var b = c.bodyB && c.bodyB.plugin ? c.bodyB.plugin.sid : '';
    return {
      a: a,
      b: b,
      ax: rr((c.pointA && c.pointA.x) || 0, 1),
      ay: rr((c.pointA && c.pointA.y) || 0, 1),
      bx: rr((c.pointB && c.pointB.x) || 0, 1),
      by: rr((c.pointB && c.pointB.y) || 0, 1),
      k: c.stiffness,
      d: c.damping || 0,
      l: c.length,
      lb: c.label || '',
      vis: !!(c.render && c.render.visible)
    };
  }

  function exportScene() {
    if (!engine) return { g: 1, n: 0, b: [], q: [] };
    var bodies = toys();
    var b = [];
    for (var i = 0; i < bodies.length; i++) b.push(packBody(bodies[i]));
    var cs = Composite.allConstraints(engine.world);
    var q = [];
    for (var j = 0; j < cs.length; j++) {
      if (cs[j].label === 'drag') continue;
      q.push(packConstraint(cs[j]));
    }
    return { g: engine.gravity.y, n: gen, b: b, q: q };
  }

  function spawnPacked(p) {
    var opts = { sid: p.s, color: p.c, w: p.w, h: p.h, r: p.r, n: p.n, density: p.k === 'poly' ? 0.004 : undefined, group: p.g || 0 };
    var body = null;
    if (p.k === 'ball') body = addBall(p.x, p.y, opts);
    else if (p.k === 'poly') body = addPoly(p.x, p.y, opts);
    else if (p.k === 'post') {
      body = addPost(p.x, p.y, p.w || 14, p.h || 72, p.s);
    } else {
      body = addBox(p.x, p.y, opts);
    }
    if (!body) return null;
    if (p.st) Body.setStatic(body, true);
    Body.setAngle(body, p.a || 0);
    Body.setVelocity(body, { x: p.vx || 0, y: p.vy || 0 });
    Body.setAngularVelocity(body, p.va || 0);
    return body;
  }

  function importScene(snap) {
    if (!snap || !snap.b) return;
    if (!engine) create();
    clearToys();
    setGravity(typeof snap.g === 'number' ? snap.g : 1);
    colorI = 0;
    var savedGen = snap.n || 1;
    var i;
    for (i = 0; i < snap.b.length; i++) spawnPacked(snap.b[i]);
    var q = snap.q || [];
    for (i = 0; i < q.length; i++) {
      var c = q[i];
      var bodyA = c.a ? bodyBySid(c.a) : null;
      var bodyB = c.b ? bodyBySid(c.b) : null;
      if (!bodyA && !bodyB && (c.ax == null)) continue;
      if (c.lb === 'elastic' && !bodyB) continue;
      var made = Constraint.create({
        bodyA: bodyA || undefined,
        bodyB: bodyB || undefined,
        pointA: { x: c.ax, y: c.ay },
        pointB: { x: c.bx, y: c.by },
        stiffness: c.k == null ? 0.6 : c.k,
        damping: c.d || 0,
        length: c.l,
        label: c.lb || '',
        render: {
          visible: !!c.vis,
          strokeStyle: c.lb === 'elastic' ? '#e8c4a0' : '#ffffff',
          lineWidth: c.lb === 'elastic' ? 3 : 1
        }
      });
      World.add(engine.world, made);
    }
    sling = null;
    findSling();
    gen = savedGen;
    dirty = true;
  }

  function applyPoses(snap) {
    if (!snap || !snap.b) return false;
    if (typeof snap.g === 'number') setGravity(snap.g);
    if ((snap.n || 0) !== gen || snap.b.length !== bodyCount()) {
      importScene(snap);
      return true;
    }
    for (var i = 0; i < snap.b.length; i++) {
      var p = snap.b[i];
      var body = bodyBySid(p.s);
      if (!body) {
        importScene(snap);
        return true;
      }
      Body.setPosition(body, { x: p.x, y: p.y });
      Body.setAngle(body, p.a || 0);
      Body.setVelocity(body, { x: p.vx || 0, y: p.vy || 0 });
      Body.setAngularVelocity(body, p.va || 0);
    }
    gen = snap.n || gen;
    return false;
  }

  function step(delta) {
    if (!engine) return;
    Engine.update(engine, delta == null ? 1000 / 60 : delta);
    maybeReloadSling();
  }

  function paintBody(ctx, body) {
    var fill = (body.render && body.render.fillStyle) || FILLS[0];
    var stroke = (body.render && body.render.strokeStyle) || '#0a0c12';
    var lw = (body.render && body.render.lineWidth) || 1.2;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'round';
    if (body.circleRadius) {
      ctx.beginPath();
      ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(body.position.x, body.position.y);
      ctx.lineTo(
        body.position.x + Math.cos(body.angle) * body.circleRadius * 0.7,
        body.position.y + Math.sin(body.angle) * body.circleRadius * 0.7
      );
      ctx.stroke();
      return;
    }
    var vs = body.vertices;
    if (!vs || !vs.length) return;
    ctx.beginPath();
    ctx.moveTo(vs[0].x, vs[0].y);
    for (var i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function paintConstraint(ctx, c) {
    if (c.render && c.render.visible === false) return;
    var ax = c.bodyA ? c.bodyA.position.x + (c.pointA ? c.pointA.x : 0) : (c.pointA ? c.pointA.x : 0);
    var ay = c.bodyA ? c.bodyA.position.y + (c.pointA ? c.pointA.y : 0) : (c.pointA ? c.pointA.y : 0);
    var bx = c.bodyB ? c.bodyB.position.x + (c.pointB ? c.pointB.x : 0) : (c.pointB ? c.pointB.x : 0);
    var by = c.bodyB ? c.bodyB.position.y + (c.pointB ? c.pointB.y : 0) : (c.pointB ? c.pointB.y : 0);
    ctx.strokeStyle = (c.render && c.render.strokeStyle) || '#e8c4a0';
    ctx.lineWidth = (c.render && c.render.lineWidth) || 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function paintBands(ctx) {
    var s = findSling();
    if (!s || !s.rock) return;
    var posts = s.posts || [];
    ctx.strokeStyle = '#d2a07a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (var i = 0; i < posts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(posts[i].position.x, posts[i].position.y - 28);
      ctx.lineTo(s.rock.position.x, s.rock.position.y);
      ctx.stroke();
    }
  }

  function paint(ctx, extras) {
    if (!engine) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#12161f';
    ctx.fillRect(0, WORLD_H - 10, WORLD_W, 10);
    var bodies = Composite.allBodies(engine.world);
    var i;
    for (i = 0; i < bodies.length; i++) {
      if (bodies[i].plugin && bodies[i].plugin.wall) paintBody(ctx, bodies[i]);
    }
    for (i = 0; i < bodies.length; i++) {
      if (bodies[i].plugin && bodies[i].plugin.wall) continue;
      paintBody(ctx, bodies[i]);
    }
    paintBands(ctx);
    var cs = Composite.allConstraints(engine.world);
    for (i = 0; i < cs.length; i++) paintConstraint(ctx, cs[i]);
    if (extras && extras.cursors) {
      for (i = 0; i < extras.cursors.length; i++) {
        var u = extras.cursors[i];
        ctx.fillStyle = u.color || '#9ee27a';
        ctx.beginPath();
        ctx.arc(u.x, u.y, 6, 0, Math.PI * 2);
        ctx.fill();
        if (u.name) {
          ctx.fillStyle = '#e8eef4';
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(u.name, u.x, u.y - 10);
        }
      }
    }
  }

  function snapshotBodies() {
    if (!engine) return [];
    var bodies = Composite.allBodies(engine.world);
    var out = [];
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      var vs = [];
      if (body.vertices) {
        for (var v = 0; v < body.vertices.length; v++) {
          vs.push(rr(body.vertices[v].x, 1), rr(body.vertices[v].y, 1));
        }
      }
      out.push({
        verts: vs,
        x: rr(body.position.x, 1),
        y: rr(body.position.y, 1),
        r: body.circleRadius || 0,
        color: (body.render && body.render.fillStyle) || FILLS[0],
        wall: !!(body.plugin && body.plugin.wall),
        st: !!body.isStatic
      });
    }
    return out;
  }

  function snapshotConstraints() {
    if (!engine) return [];
    var cs = Composite.allConstraints(engine.world);
    var out = [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.render && c.render.visible === false) continue;
      var ax = c.bodyA ? c.bodyA.position.x + (c.pointA ? c.pointA.x : 0) : (c.pointA ? c.pointA.x : 0);
      var ay = c.bodyA ? c.bodyA.position.y + (c.pointA ? c.pointA.y : 0) : (c.pointA ? c.pointA.y : 0);
      var bx = c.bodyB ? c.bodyB.position.x + (c.pointB ? c.pointB.x : 0) : (c.pointB ? c.pointB.x : 0);
      var by = c.bodyB ? c.bodyB.position.y + (c.pointB ? c.pointB.y : 0) : (c.pointB ? c.pointB.y : 0);
      out.push({ x1: rr(ax, 1), y1: rr(ay, 1), x2: rr(bx, 1), y2: rr(by, 1), sling: c.label === 'elastic' });
    }
    var s = findSling();
    if (s && s.rock && s.posts) {
      for (var p = 0; p < s.posts.length; p++) {
        out.push({
          x1: rr(s.posts[p].position.x, 1), y1: rr(s.posts[p].position.y - 28, 1),
          x2: rr(s.rock.position.x, 1), y2: rr(s.rock.position.y, 1),
          sling: true
        });
      }
    }
    return out;
  }

  root.MSPhysics = {
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    MAX_BODIES: MAX_BODIES,
    FILLS: FILLS,
    BG: BG,
    create: create,
    engine: function () { return engine; },
    step: step,
    setGravity: setGravity,
    gravity: function () { return engine ? engine.gravity.y : 1; },
    resetArena: resetArena,
    clearToys: clearToys,
    addBox: addBox,
    addBall: addBall,
    addRagdoll: addRagdoll,
    addStack: addStack,
    addSling: addSling,
    addPoly: addPoly,
    bodyCount: bodyCount,
    roomFor: roomFor,
    pick: pick,
    grabStart: grabStart,
    grabMove: grabMove,
    dropGrab: dropGrab,
    grabbing: grabbing,
    setRemoteDrag: setRemoteDrag,
    bodyBySid: bodyBySid,
    findSling: findSling,
    loadRock: loadRock,
    exportScene: exportScene,
    importScene: importScene,
    applyPoses: applyPoses,
    paint: paint,
    snapshotBodies: snapshotBodies,
    snapshotConstraints: snapshotConstraints,
    isDirty: function () { return dirty; },
    markClean: function () { dirty = false; },
    markDirty: function () { dirty = true; },
    generation: function () { return gen; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
