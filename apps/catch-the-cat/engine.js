/*
 * Catch the Cat — the engine boundary.
 *
 * Upstream (vendor/game.js, a pinned port of ganlvtech/phaser-catch-the-cat)
 * is a Phaser.Game that both THINKS and DRAWS. From 1.2.0 we keep the thinking
 * and throw away the drawing: view.js paints the board and the cats as DOM in
 * a real 3D scene, which upstream's flat canvas cannot do, and rules.js owns
 * the modes. This file is the only place that touches Phaser.
 *
 * What we still take from upstream, and would not want to rewrite:
 *   - nearestAndMoreRoutesSolver — the cat's brain. It is reachable as
 *     scene.cat.solver, so every cat we mint gets the real one.
 *   - Cat.isCaught / isEscaped / getCurrentNeighbours and the hex neighbour
 *     table (MainScene.getNeighbours). The rules of the chase are theirs.
 *   - The fifteen cat SVGs. They are packed inside vendor/game.js as strings,
 *     handed to Phaser's loader by a RawSVGFile; we take a copy on the way
 *     past (see grabSvgs) so view.js can draw them at any size instead of at
 *     whatever pixel scale the canvas happened to want.
 *
 * What we DO throw away: the render loop. The canvas lives in a hidden div and
 * game.loop.stop() runs the moment the scene is up. Nothing upstream draws is
 * ever seen, so leaving it spinning would be pure heat.
 *
 * THE SKIP BUG, and why stepping is instant here. Upstream's Cat.stepForward()
 * plays a five-frame animation and moves the cat on 'animationcomplete'. But
 * MainScene.playerClick() begins with `if (cat.anims.isPlaying) cat.anims.stop()`
 * and Phaser 3.16's stop() EMITS 'animationcomplete' — so a tap inside the
 * ~380 ms stride fired the queued move at once and the cat jumped a hex without
 * a single frame of walking. Tap faster than the stride and it never walked at
 * all; it sat on one dot, blinked, sat on the next. Here the logical step is
 * instant and unconditional (step() below), and the WALK is view.js's business
 * entirely: it eases the cat across the hex over ~600 ms and, if taps are
 * arriving faster than that, shortens the stride instead of skipping it. The
 * animation can no longer be interrupted by a tap, because the animation is no
 * longer what decides where the cat is.
 */
(function (root) {
  'use strict';

  var GifCat = root.GifCat = root.GifCat || {};

  // The cat SVGs, keyed as upstream keys them (left_1 … bottom_left_5).
  // RawSVGFile keeps the source text on the file object; SVGFile.prototype
  // .onProcess is the last moment it is still there, and it is inherited, so
  // one wrap catches all fifteen. Must be installed BEFORE the game is built.
  var RAW = {};
  (function grabSvgs() {
    try {
      var F = root.Phaser.Loader.FileTypes.SVGFile;
      if (typeof F.prototype.onProcess !== 'function') return;
      var orig = F.prototype.onProcess;
      F.prototype.onProcess = function () {
        if (typeof this.rawData === 'string') RAW[this.key] = this.rawData;
        return orig.apply(this, arguments);
      };
    } catch (e) { /* fall back to the loaded texture below */ }
  })();

  var DIRS = [
    { name: 'left', flip: false },        // 0  left
    { name: 'top_left', flip: false },    // 1  top-left
    { name: 'top_left', flip: true },     // 2  top-right
    { name: 'left', flip: true },         // 3  right
    { name: 'bottom_left', flip: true },  // 4  bottom-right
    { name: 'bottom_left', flip: false }  // 5  bottom-left
  ];
  var FRAMES = 5;
  var NAMES = ['left', 'top_left', 'bottom_left'];

  var game = null, scene = null, art = null;

  function dataUrl(svg) {
    return 'data:image/svg+xml;base64,' + root.btoa(unescape(encodeURIComponent(svg)));
  }

  // Where the ink actually is inside the frame. Upstream drew the stride INTO
  // the frames — over left_1…left_5 the cat slides most of a hex across its own
  // canvas — which is exactly right for a sprite pinned to a hex and wrong for
  // one we are going to carry across the hex ourselves. Measuring each frame's
  // ink box lets view.js pin every frame to the same spot, so the legs cycle in
  // place and the TRAVEL is ours. Two strides would otherwise land the cat two
  // hexes away from where the rules think it is.
  function measure(url, w, h) {
    return new Promise(function (resolve) {
      var img = new root.Image();
      img.onload = function () {
        var s = Math.min(1, 96 / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
        var box = { x0: 0, y0: 0, x1: w, y1: h };
        try {
          var c = root.document.createElement('canvas');
          c.width = cw; c.height = ch;
          var g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, cw, ch);
          var d = g.getImageData(0, 0, cw, ch).data;
          var x0 = cw, y0 = ch, x1 = -1, y1 = -1;
          for (var y = 0; y < ch; y++) {
            for (var x = 0; x < cw; x++) {
              if (d[(y * cw + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
          if (x1 >= x0 && y1 >= y0) {
            box = { x0: x0 / s, y0: y0 / s, x1: (x1 + 1) / s, y1: (y1 + 1) / s };
          }
        } catch (e) { /* tainted or no 2d — the whole frame is the box */ }
        resolve({ url: url, w: w, h: h, ink: box });
      };
      img.onerror = function () { resolve({ url: url, w: w, h: h, ink: { x0: 0, y0: 0, x1: w, y1: h } }); };
      img.src = url;
    });
  }

  function svgSize(svg) {
    var wm = /width="([\d.]+)(?:px)?"/.exec(svg);
    var hm = /height="([\d.]+)(?:px)?"/.exec(svg);
    return { w: wm ? Number(wm[1]) : 0, h: hm ? Number(hm[1]) : 0 };
  }

  function collectArt() {
    var keys = [], n, f;
    for (n = 0; n < NAMES.length; n++) {
      for (f = 1; f <= FRAMES; f++) keys.push(NAMES[n] + '_' + f);
    }
    var jobs = keys.map(function (k) {
      var svg = RAW[k];
      if (svg) {
        var sz = svgSize(svg);
        if (sz.w > 0 && sz.h > 0) {
          return measure(dataUrl(svg), sz.w, sz.h).then(function (m) { m.key = k; return m; });
        }
      }
      // Fallback: Phaser already turned the SVG into an <img>. Lower
      // resolution than the source, but never a missing cat.
      var img = null;
      try { img = scene.textures.get(k).getSourceImage(); } catch (e) {}
      if (!img || !img.src) return Promise.resolve(null);
      return measure(img.src, img.naturalWidth || img.width, img.naturalHeight || img.height)
        .then(function (m) { m.key = k; return m; });
    });
    return Promise.all(jobs).then(function (list) {
      var frames = {};
      list.forEach(function (m) { if (m) frames[m.key] = m; });
      return { frames: frames, dirs: DIRS, steps: FRAMES };
    });
  }

  // ---------------------------------------------------------------- booting
  //
  // The board size handed to Phaser is arbitrary — nothing upstream draws is
  // shown — but the hex neighbour rules depend on w and h, and isEscaped() is
  // "on the outer ring", so these ARE the rules and not a layout choice.
  var W = 11, H = 11, R = 20;

  function boot() {
    if (boot.p) return boot.p;
    boot.p = new Promise(function (resolve, reject) {
      var Ctor = root.CatchTheCatGame;
      if (!root.Phaser || !Ctor) { reject(new Error('vendor/game.js did not load')); return; }
      var host = root.document.createElement('div');
      host.id = 'engine-canvas';
      host.setAttribute('aria-hidden', 'true');
      root.document.body.appendChild(host);
      game = new Ctor({
        w: W, h: H, r: R,
        initialWallCount: 0,          // rules.js seeds the walls, for every mode
        backgroundColor: 0x0b1020,
        parent: host, seed: 1, hideChrome: true, credit: ''
      });
      // create() ends in reset(), which emits this. First one means the scene,
      // the blocks, the cat and the textures all exist.
      game.events.once('ctc-reset', function () {
        scene = game.mainScene;
        collectArt().then(function (a) {
          art = a;
          // Nothing upstream draws is ever seen. Stop the loop AFTER the
          // textures are measured — the loader rides it.
          try { game.loop.stop(); } catch (e) {}
          try { host.style.display = 'none'; } catch (e) {}
          resolve(api);
        }, reject);
      });
    });
    return boot.p;
  }

  // ------------------------------------------------------------------- cats
  //
  // A cat is upstream's Cat: our own solver-free copy would be a different
  // game. The class is not exported, but the scene has one, and its
  // constructor is right there on the prototype chain.
  function makeCat() {
    var Cat = scene.cat.constructor;
    var c = new Cat(scene);
    c.solver = scene.cat.solver;
    return c;
  }

  // One hex, now. Upstream deferred this to 'animationcomplete'; see the note
  // at the top of the file for why that is the bug and not the animation.
  // Returns 'moved' or 'caught' — 'gone' is asked for separately, because a
  // cat that has just stepped onto the rim has moved AND escaped.
  function step(cat) {
    var d = cat.solver.call(cat, scene.blocksData, cat.i, cat.j);
    if (d < 0 || d > 5) return 'caught';
    cat.direction = d;                       // setter fixes texture/origin
    var nb = cat.getCurrentNeighbours()[d];
    var block = scene.getBlock(nb.i, nb.j);
    if (!block || block.isWall) return 'caught';
    cat.i = nb.i; cat.j = nb.j;
    return 'moved';
  }

  function place(cat, i, j, dir) {
    cat.i = i; cat.j = j;
    if (typeof dir === 'number') cat.direction = dir;
  }

  var api = {
    w: W, h: H,
    art: function () { return art; },
    neighbours: function (i, j) { return scene.constructor.getNeighbours(i, j); },
    inside: function (i, j) { return i >= 0 && i < W && j >= 0 && j < H; },
    onRim: function (i, j) { return i <= 0 || i >= W - 1 || j <= 0 || j >= H - 1; },
    isWall: function (i, j) { var b = scene.getBlock(i, j); return !!(b && b.isWall); },
    setWall: function (i, j, on) { var b = scene.getBlock(i, j); if (b) b.isWall = !!on; },
    clearWalls: function () {
      for (var i = 0; i < W; i++) for (var j = 0; j < H; j++) scene.blocks[i][j].isWall = false;
    },
    makeCat: makeCat,
    place: place,
    step: step,
    isCaught: function (cat) { return cat.isCaught(); },
    isEscaped: function (cat) { return cat.isEscaped(); }
  };

  GifCat.engine = { boot: boot, DIRS: DIRS, FRAMES: FRAMES };
  Object.keys(api).forEach(function (k) { GifCat.engine[k] = api[k]; });
})(window);
