/*
 * Catch the Cat — the board you can pick up and turn.
 *
 * The honeycomb, the walls and the cats are DOM inside one `preserve-3d`
 * plate, not pixels in a canvas. That is the whole reason this file exists:
 * a canvas can be tilted, but everything on it tilts WITH it, so the cat ends
 * up lying on the floor and a wall is still a flat dot. Here the plate is the
 * table, wall caps stand up off it on `translateZ`, and each cat is a billboard
 * that counter-rotates by exactly the plate's own rotation, so it stays on its
 * feet however you turn the board.
 *
 * THE TRANSFORM, and why it is shaped like this:
 *
 *   plate: translateZ(dz) translate(pan) rotateX(tilt) rotateZ(spin)
 *   cat:   translate3d(x, y, 0) rotateZ(-spin) rotateX(-tilt)
 *
 * There is deliberately NO scale() anywhere. Zoom is a DOLLY — translateZ
 * against the scene's `perspective`, so zooming in really does walk the camera
 * toward the table and the perspective deepens with it. It also keeps the
 * counter-rotation honest: rotateX does not commute with a non-uniform scale
 * (scale() leaves z alone), so a scaled plate would need the cat to undo the
 * scale, undo the rotations and redo the scale. A dolly is outermost and
 * applies to everything equally, so `rotateZ(-spin) rotateX(-tilt)` cancels the
 * plate exactly. Zoom factor k is dz = P(1 - 1/k).
 *
 * HIT TESTING IS THE BROWSER'S JOB. Every hex carries an invisible hexagonal
 * clip-path pad, and a tap is whatever `pointerdown` lands on. Unprojecting a
 * screen point back through a perspective matrix by hand is a homography and
 * an inverse, and every one of those is a chance to disagree with what the
 * compositor actually drew. The browser already knows. The hexagons tessellate
 * (inradius r, circumradius 2r/sqrt3), so there is no overlap to arbitrate and
 * no gap to fall through.
 *
 * WALKING. rules.js moves a cat a whole hex at once; this file is the only
 * thing that knows the cat takes time to get there. Each cat view keeps a queue
 * of hexes and eases across one at a time over WALK_MS, cycling the five stride
 * frames as it goes. Tap faster than that and the queue grows, so the stride
 * SHORTENS — the cat breaks into a run and catches up. It never skips a hex,
 * which is what the old animation did the moment a tap interrupted it.
 *
 * Upstream drew the travel INTO the frames (over left_1..left_5 the cat slides
 * most of a hex across its own canvas). We carry the cat ourselves, so every
 * frame is pinned by its measured ink box (engine.js) — legs cycle in place,
 * travel is ours. Leave the drift in and one stride would cover two hexes.
 */
(function (root) {
  'use strict';

  var GifCat = root.GifCat = root.GifCat || {};
  var doc = root.document;

  var SQRT3 = Math.sqrt(3);
  var WALK_MS = 620;          // one hex at a stroll — the whole point of 1.2.0
  var RUN_MIN_MS = 170;       // ...and the floor when taps outrun the walk
  var PERSPECTIVE = 1150;     // px; matches #scene in style.css
  var WALL_H = 1.0;           // wall cap lift, in dot radii
  var CAT_SCALE = 1.55;       // against upstream's catStepLength of 20

  var TILT_MIN = 0, TILT_MAX = 74, TILT_DEF = 34;
  var ZOOM_MIN = 0.55, ZOOM_MAX = 3.2;

  var HEX_CLIP = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)';

  // Which way each of upstream's six hex directions POINTS on an unspun board,
  // in screen degrees (y down). Needed because the cat is a billboard: it is
  // counter-rotated to stay on its feet, so once the board is spun its FACING
  // no longer follows its travel. A cat walking board-left across a board
  // turned a quarter turn walks UP the screen — and with the raw direction it
  // would do that in profile, side-on, sliding like a sticker. So the sprite is
  // chosen by where the step goes ON SCREEN, not by where it goes on the board.
  var DIR_ANGLE = [180, 240, 300, 0, 60, 120];

  var stage = null, scene = null, plate = null, cellsEl = null, catsEl = null;
  var W = 11, H = 11, r = 16;
  var cells = [];             // [i][j] -> { el, cap, hit }
  var views = {};             // id -> cat view
  var order = [];             // draw order, so cats overlap sanely
  var art = null;
  var tapCb = null;
  var view = { tilt: TILT_DEF, spin: 0, zoom: 1, panX: 0, panY: 0 };
  var raf = 0;
  var reduce = false;
  var homeSpin = 0;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ------------------------------------------------------------ hex layout
  function px(i, j) {
    return {
      x: r + i * 2 * r + ((j & 1) ? r : 0),
      y: r + j * r * SQRT3
    };
  }
  function boardW() { return (2 * W + 1) * r; }
  function boardH() { return (H - 1) * r * SQRT3 + 2 * r; }

  // ------------------------------------------------------------- transform
  function apply() {
    var dz = PERSPECTIVE * (1 - 1 / view.zoom);
    plate.style.transform =
      'translateZ(' + dz.toFixed(2) + 'px) translate(' + view.panX.toFixed(1) + 'px,' +
      view.panY.toFixed(1) + 'px) rotateX(' + view.tilt.toFixed(2) + 'deg) rotateZ(' +
      view.spin.toFixed(2) + 'deg)';
    var counter = ' rotateZ(' + (-view.spin).toFixed(2) + 'deg) rotateX(' + (-view.tilt).toFixed(2) + 'deg)';
    for (var id in views) {
      var v = views[id];
      v.counter = counter;
      paintCat(v);
    }
  }

  function setView(next, animate) {
    view.tilt = clamp(next.tilt, TILT_MIN, TILT_MAX);
    view.spin = ((next.spin % 360) + 360) % 360;
    view.zoom = clamp(next.zoom, ZOOM_MIN, ZOOM_MAX);
    view.panX = next.panX; view.panY = next.panY;
    plate.style.transition = (animate && !reduce) ? 'transform .42s cubic-bezier(.22,.9,.3,1)' : '';
    apply();
    if (animate && !reduce) {
      root.setTimeout(function () { plate.style.transition = ''; }, 460);
    }
  }

  function resetView(animate) {
    setView({ tilt: reduce ? 0 : TILT_DEF, spin: homeSpin, zoom: 1, panX: 0, panY: 0 }, animate);
  }

  // Straight down on the table — upstream's view, one button away. Keeps
  // whatever spin and zoom you had, because those are still yours.
  function flatten() {
    var flat = view.tilt < 3;
    setView({ tilt: flat ? TILT_DEF : 0, spin: view.spin, zoom: view.zoom,
              panX: view.panX, panY: view.panY }, true);
  }

  // ---------------------------------------------------------------- layout
  //
  // Pick a dot radius that fits the stage with the DEFAULT tilt, then leave
  // zoom alone — the player drives it from there. Height allows for the cats,
  // which stand up off the board and so are taller than any dot.
  // Pick a dot radius that fits the stage, and pick the ORIENTATION that gives
  // the biggest one. The honeycomb is 23r across and 19.3r down, so on a
  // portrait phone the width always binds and a quarter turn is worth about a
  // fifth more dot — which is the difference between squinting and not. On a
  // wide screen the quarter turn loses, so it is not taken. Either way the
  // player can turn it anywhere they like from there; this only chooses where
  // "reset view" puts it.
  function fitFor(spin, availW, availH, ct) {
    var acr = 2 * W + 1, dwn = (H - 1) * SQRT3 + 2;
    var wide = spin ? dwn : acr;
    var tall = spin ? acr : dwn;
    return Math.min(availW / wide, availH / (tall * ct + 3.2));
  }

  function layout() {
    var availW = Math.max(120, stage.clientWidth - 10);
    var availH = Math.max(120, stage.clientHeight - 10);
    var ct = Math.cos((reduce ? 0 : TILT_DEF) * Math.PI / 180);
    var flat = fitFor(0, availW, availH, ct);
    var turned = fitFor(90, availW, availH, ct);
    var wantSpin = turned > flat * 1.08 ? 90 : 0;
    if (wantSpin !== homeSpin) {
      // Carry a view the player has already turned along with the change (a
      // phone rotating in the hand), rather than yanking the board flat.
      view.spin = ((view.spin + (wantSpin - homeSpin)) % 360 + 360) % 360;
      homeSpin = wantSpin;
    }
    var next = clamp(Math.floor(Math.max(flat, turned)), 8, 46);
    if (next === r && cells.length) { apply(); return; }
    r = next;
    build();
  }

  function build() {
    var bw = boardW(), bh = boardH();
    plate.style.width = bw + 'px';
    plate.style.height = bh + 'px';
    plate.style.marginLeft = (-bw / 2) + 'px';
    plate.style.marginTop = (-bh / 2) + 'px';
    plate.style.setProperty('--r', r + 'px');
    plate.style.setProperty('--wall', (r * WALL_H).toFixed(2) + 'px');
    plate.style.setProperty('--hit', (2 * r / SQRT3).toFixed(2) + 'px');

    cellsEl.textContent = '';
    cells = [];
    var frag = doc.createDocumentFragment();
    for (var i = 0; i < W; i++) {
      cells[i] = [];
      for (var j = 0; j < H; j++) {
        var p = px(i, j);
        var el = doc.createElement('div');
        el.className = 'cell' + (isRim(i, j) ? ' rim' : '');
        el.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)';
        var socket = doc.createElement('i');
        socket.className = 'socket';
        // The shaft. A cap floating on translateZ with nothing under it reads
        // as a bug, not as a wall — two discs between the socket and the cap
        // are enough to make it a column from every angle the board can be
        // turned to. They are display:none until the hex is walled, so the
        // ~110 hexes that are not walls cost nothing to draw.
        var s1 = doc.createElement('i'); s1.className = 'shaft s1';
        var s2 = doc.createElement('i'); s2.className = 'shaft s2';
        var cap = doc.createElement('i');
        cap.className = 'cap';
        var hit = doc.createElement('b');
        hit.className = 'hit';
        hit.style.clipPath = HEX_CLIP;
        hit.dataset.i = i; hit.dataset.j = j;
        el.appendChild(socket); el.appendChild(s1); el.appendChild(s2);
        el.appendChild(cap); el.appendChild(hit);
        frag.appendChild(el);
        cells[i][j] = { el: el, cap: cap, hit: hit };
      }
    }
    cellsEl.appendChild(frag);
    // The cats were sized against the old radius.
    for (var id in views) sizeCat(views[id]);
    apply();
  }

  function isRim(i, j) { return i <= 0 || i >= W - 1 || j <= 0 || j >= H - 1; }

  // ----------------------------------------------------------------- walls
  function setWalls(isWall) {
    for (var i = 0; i < W; i++) {
      for (var j = 0; j < H; j++) {
        var c = cells[i][j];
        if (!c) continue;
        var on = !!isWall(i, j);
        if (c.on === on) continue;
        c.on = on;
        c.el.classList.toggle('wall', on);
      }
    }
  }

  // ------------------------------------------------------------------ cats
  function screenDir(dir) {
    var want = ((DIR_ANGLE[dir] + view.spin) % 360 + 360) % 360;
    var best = dir, bestD = 1e9;
    for (var k = 0; k < DIR_ANGLE.length; k++) {
      var d = Math.abs(((DIR_ANGLE[k] - want) % 360 + 540) % 360 - 180);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  function frameFor(dir, n) {
    var d = art.dirs[screenDir(dir)] || art.dirs[0];
    return { f: art.frames[d.name + '_' + n], flip: d.flip };
  }

  function sizeCat(v) {
    v.k = CAT_SCALE * r / 20;
    v.shadow.style.width = (2.1 * r) + 'px';
    v.shadow.style.height = (2.1 * r * 0.52) + 'px';
    v.frame = -1;   // force a repaint of the art box
  }

  function makeView(rec) {
    var el = doc.createElement('div');
    el.className = 'cat';
    var img = doc.createElement('img');
    img.className = 'art';
    img.alt = '';
    img.draggable = false;
    var tag = doc.createElement('span');
    tag.className = 'tag';
    el.appendChild(img);
    el.appendChild(tag);
    var shadow = doc.createElement('div');
    shadow.className = 'catshadow';
    catsEl.appendChild(shadow);
    catsEl.appendChild(el);
    var v = {
      id: rec.id, el: el, img: img, tag: tag, shadow: shadow,
      i: rec.i, j: rec.j, dir: rec.dir, x: 0, y: 0,
      queue: [], t0: 0, dur: 0, from: null, to: null,
      frame: -1, flip: null, state: rec.state, counter: '', k: 1
    };
    var p = px(rec.i, rec.j);
    v.x = p.x; v.y = p.y;
    sizeCat(v);
    views[rec.id] = v;
    order.push(rec.id);
    return v;
  }

  function dropView(id) {
    var v = views[id];
    if (!v) return;
    v.el.remove(); v.shadow.remove();
    delete views[id];
    order = order.filter(function (x) { return x !== id; });
  }

  function adjacent(a, b) {
    var n = GifCat.engine.neighbours(a.i, a.j);
    for (var d = 0; d < n.length; d++) if (n[d].i === b.i && n[d].j === b.j) return d;
    return -1;
  }

  // The list rules.js hands over is the TRUTH about where each cat is. This
  // turns a change into a walk: one hex is a stride, several hexes is a run,
  // and anything that is not a neighbouring hex (a reset, an undo across a
  // teleport) is a cut.
  function setCats(list) {
    var seen = {};
    list.forEach(function (rec) {
      seen[rec.id] = 1;
      var v = views[rec.id];
      if (!v) { v = makeView(rec); paintCat(v); }
      v.name = rec.name; v.mine = rec.mine; v.tone = rec.tone;
      v.el.classList.toggle('mine', !!rec.mine);
      v.el.style.setProperty('--tone', rec.tone || '#e8b05a');
      v.tag.textContent = rec.tag || '';
      v.el.classList.toggle('tagged', !!rec.tag);
      if (v.state !== rec.state) {
        v.state = rec.state;
        v.el.classList.toggle('caught', rec.state === 'caught');
        v.el.classList.toggle('gone', rec.state === 'gone');
        if (rec.state !== 'gone') v.ranOff = false;
      }
      var head = v.queue.length ? v.queue[v.queue.length - 1] : (v.to || { i: v.i, j: v.j });
      if (head.i === rec.i && head.j === rec.j) {
        if (!v.queue.length && !v.to && typeof rec.dir === 'number' && rec.dir !== v.dir) {
          v.dir = rec.dir; v.frame = -1; paintCat(v);
        }
        return;
      }
      var d = adjacent(head, rec);
      if (d < 0) {                       // not a step — a cut
        v.queue.length = 0; v.to = null; v.from = null;
        v.i = rec.i; v.j = rec.j;
        if (typeof rec.dir === 'number') v.dir = rec.dir;
        var p = px(rec.i, rec.j);
        v.x = p.x; v.y = p.y; v.frame = -1;
        paintCat(v);
        return;
      }
      v.queue.push({ i: rec.i, j: rec.j, dir: d });
      runOff(v, rec);
    });
    Object.keys(views).forEach(function (id) { if (!seen[id]) dropView(id); });
    kick();
  }

  // A cat that reached the rim does not stop dead on it — it keeps going,
  // off the table and out of the room. Upstream did the same (a four-hex run
  // on 'escaped'); this is that, in the queue the walk already uses, so the
  // last hex of the board is not a wall the animation bounces off.
  function runOff(v, rec) {
    if (rec.state !== 'gone' || v.ranOff) return;
    v.ranOff = true;
    var last = v.queue.length ? v.queue[v.queue.length - 1] : { i: rec.i, j: rec.j, dir: v.dir };
    var dir = last.dir;
    for (var n = 0; n < 3; n++) {
      var nb = GifCat.engine.neighbours(last.i, last.j)[dir];
      last = { i: nb.i, j: nb.j, dir: dir };
      v.queue.push(last);
    }
  }

  function idle() {
    for (var id in views) if (views[id].queue.length || views[id].to) return false;
    return true;
  }

  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  function tick(now) {
    raf = 0;
    var busy = false;
    for (var id in views) {
      var v = views[id];
      if (!v.to && v.queue.length) {
        var next = v.queue.shift();
        v.from = { x: v.x, y: v.y };
        v.to = next;
        v.dir = next.dir;
        v.t0 = now;
        // The stride shortens as the queue grows: the cat runs rather than
        // teleports. Never below RUN_MIN_MS, or the frames stop reading.
        v.dur = Math.max(RUN_MIN_MS, WALK_MS / (1 + 0.85 * v.queue.length));
        if (reduce) v.dur = Math.max(RUN_MIN_MS, v.dur * 0.55);
      }
      if (!v.to) { paintCat(v); continue; }
      busy = true;
      var p = clamp((now - v.t0) / v.dur, 0, 1);
      var dest = px(v.to.i, v.to.j);
      var e = ease(p);
      v.x = v.from.x + (dest.x - v.from.x) * e;
      v.y = v.from.y + (dest.y - v.from.y) * e;
      v.hop = Math.sin(p * Math.PI) * r * 0.26;
      // Five stride frames across the hex, landing back on the standing pose.
      v.step = p >= 1 ? 1 : 1 + Math.min(4, Math.floor(p * 5));
      if (p >= 1) {
        v.i = v.to.i; v.j = v.to.j;
        v.x = dest.x; v.y = dest.y; v.hop = 0; v.to = null;
      }
      paintCat(v);
    }
    if (busy) kick();
    else if (settledCb) { var cb = settledCb; settledCb = null; cb(); }
  }

  var settledCb = null;
  function onSettled(cb) {
    if (idle()) { cb(); return; }
    settledCb = cb;
    kick();
  }

  function kick() { if (!raf) raf = root.requestAnimationFrame(tick); }

  function paintCat(v) {
    var n = v.to ? (v.step || 1) : 1;
    var got = frameFor(v.dir, n);
    var f = got.f;
    if (!f) return;
    if (v.frame !== n || v.flip !== got.flip || v.fname !== f.key) {
      v.frame = n; v.flip = got.flip; v.fname = f.key;
      var k = v.k;
      var cx = (f.ink.x0 + f.ink.x1) / 2;
      if (got.flip) cx = f.w - cx;
      v.img.src = f.url;
      v.img.style.width = (f.w * k) + 'px';
      v.img.style.height = (f.h * k) + 'px';
      v.img.style.left = (-cx * k) + 'px';
      v.img.style.top = (-f.ink.y1 * k) + 'px';
      v.img.style.transform = got.flip ? 'scaleX(-1)' : '';
    }
    var lift = v.hop || 0;
    v.el.style.transform = 'translate3d(' + v.x.toFixed(2) + 'px,' + v.y.toFixed(2) + 'px,0)' +
      v.counter + (lift ? ' translateY(' + (-lift).toFixed(2) + 'px)' : '');
    v.shadow.style.transform = 'translate3d(' + v.x.toFixed(2) + 'px,' + v.y.toFixed(2) + 'px,0) translate(-50%,-50%)';
    v.shadow.style.opacity = lift ? (0.38 - lift / (r * 8)).toFixed(3) : '0.38';
  }

  // -------------------------------------------------------------- gestures
  //
  // One finger: a tap plays, a drag turns the table. Two fingers: pinch to
  // dolly, twist to spin, and both together to shove the board around. The tap
  // is decided on RELEASE — anything that travelled more than SLOP is a
  // gesture, not a move, so a shaky thumb never walls a hex you did not mean.
  //
  // WHICH HALF YOUR FINGER IS ON DECIDES WHICH WAY THE BOARD TURNS, and that is
  // the whole of it. The board is a table tilted away from you, so its two
  // halves move OPPOSITE ways under any turn — measured on the shipped
  // transform at tilt 34: a +20deg spin carries the near edge 100px LEFT and
  // the far edge 80px right; a +21deg tilt carries the near edge 63px UP and
  // the far edge 65px down. A fixed sign is therefore right for one half of the
  // board and backwards for the other, and it was fixed to the far half — so a
  // finger on the near half, which is the big close part you actually reach
  // for, pushed the board the opposite way to itself.
  //
  // So the sign comes from the grab: `near` is +1 for a finger below the
  // board's projected centre and -1 above it, and both axes are multiplied by
  // it. Push the near edge right and it goes right; pull the far edge down and
  // it comes down. It is decided once, at pointerdown, so it cannot flip
  // underneath a drag in progress.
  var SLOP = 9;
  var pts = {};
  var gest = null;

  function pointers() { return Object.keys(pts).map(function (k) { return pts[k]; }); }

  // The plate's centre, in screen coordinates. Not its bounding box's centre:
  // under a tilt the near half is magnified, so the box is biased toward the
  // viewer and would call a genuinely far grab near. The plate's transform
  // origin IS its layout centre, which is the scene's centre, and the transform
  // carries the origin to (panX, panY) at depth dz — so the projection is exact
  // arithmetic, and needs one rect read rather than a probe element.
  function plateCentre() {
    var sc = scene.getBoundingClientRect();
    var dz = PERSPECTIVE * (1 - 1 / view.zoom);
    var w = 1 - dz / PERSPECTIVE;
    return {
      x: sc.left + sc.width / 2 + view.panX / w,
      y: sc.top + sc.height / 2 + view.panY / w
    };
  }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // The view buttons live over the stage. preventDefault() on pointerdown is
    // what suppresses the compatibility mouse events, so capturing here would
    // silently stop them ever being clicked.
    if (e.target && e.target.closest && e.target.closest('#viewbar')) return;
    stage.setPointerCapture(e.pointerId);
    var hit = e.target && e.target.classList && e.target.classList.contains('hit') ? e.target : null;
    pts[e.pointerId] = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, hit: hit, moved: 0 };
    var list = pointers();
    if (list.length === 2) {
      gest = { two: true, base: pinch(list), view: { tilt: view.tilt, spin: view.spin, zoom: view.zoom, panX: view.panX, panY: view.panY } };
      list.forEach(function (p) { p.moved = SLOP + 1; });   // a second finger is never a tap
    } else if (list.length === 1) {
      gest = {
        two: false, near: e.clientY >= plateCentre().y ? 1 : -1,
        view: { tilt: view.tilt, spin: view.spin, zoom: view.zoom, panX: view.panX, panY: view.panY }
      };
    }
    e.preventDefault();
  }

  function pinch(list) {
    var dx = list[1].x - list[0].x, dy = list[1].y - list[0].y;
    return {
      dist: Math.max(1, Math.hypot(dx, dy)),
      ang: Math.atan2(dy, dx) * 180 / Math.PI,
      cx: (list[0].x + list[1].x) / 2,
      cy: (list[0].y + list[1].y) / 2
    };
  }

  function move(e) {
    var p = pts[e.pointerId];
    if (!p) return;
    p.moved = Math.max(p.moved, Math.hypot(e.clientX - p.x0, e.clientY - p.y0));
    p.x = e.clientX; p.y = e.clientY;
    var list = pointers();
    if (!gest) return;
    if (gest.two && list.length === 2) {
      var now = pinch(list), b = gest.base, v = gest.view;
      setView({
        tilt: v.tilt,
        spin: v.spin + (now.ang - b.ang),
        zoom: v.zoom * (now.dist / b.dist),
        panX: v.panX + (now.cx - b.cx),
        panY: v.panY + (now.cy - b.cy)
      }, false);
    } else if (!gest.two && list.length === 1 && p.moved > SLOP) {
      var v1 = gest.view, side = gest.near || 1;
      setView({
        tilt: v1.tilt - (p.y - p.y0) * 0.35 * side,
        spin: v1.spin - (p.x - p.x0) * 0.42 * side,
        zoom: v1.zoom, panX: v1.panX, panY: v1.panY
      }, false);
    }
    e.preventDefault();
  }

  function up(e) {
    var p = pts[e.pointerId];
    delete pts[e.pointerId];
    try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
    if (!p) return;
    if (!pointers().length) gest = null;
    else {
      var left = pointers()[0];
      gest = {
        two: false, near: left && left.y >= plateCentre().y ? 1 : -1,
        view: { tilt: view.tilt, spin: view.spin, zoom: view.zoom, panX: view.panX, panY: view.panY }
      };
      if (left) { left.x0 = left.x; left.y0 = left.y; }
    }
    if (p.hit && p.moved <= SLOP && e.type === 'pointerup' && tapCb) {
      tapCb(Number(p.hit.dataset.i), Number(p.hit.dataset.j));
    }
  }

  function wheel(e) {
    e.preventDefault();
    var k = Math.pow(1.0016, -e.deltaY);
    setView({ tilt: view.tilt, spin: view.spin, zoom: view.zoom * k, panX: view.panX, panY: view.panY }, false);
  }

  // ------------------------------------------------------------------ mount
  function mount(opts) {
    stage = opts.stage;
    scene = opts.scene;
    plate = opts.plate;
    cellsEl = opts.cells;
    catsEl = opts.cats;
    art = GifCat.engine.art();
    W = GifCat.engine.w; H = GifCat.engine.h;
    reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    scene.style.perspective = PERSPECTIVE + 'px';
    view.tilt = reduce ? 0 : TILT_DEF;
    layout();
    view.spin = homeSpin;
    apply();
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  GifCat.view = {
    mount: mount,
    layout: layout,
    setWalls: setWalls,
    setCats: setCats,
    resetView: resetView,
    flatten: flatten,
    idle: idle,
    onSettled: onSettled,
    state: function () { return { tilt: view.tilt, spin: view.spin, zoom: view.zoom }; },
    onTap: function (cb) { tapCb = cb; },
    WALK_MS: WALK_MS
  };
})(window);
