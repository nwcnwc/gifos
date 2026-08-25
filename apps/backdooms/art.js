/*
 * Backdooms — every picture in the game, COMPUTED.
 *
 * There is not one image file in this app and there is nothing to fetch: the
 * wallpaper, the carpet, the ceiling tiles, the figures and the shotgun are
 * all rasterised here at start into flat typed arrays that render.js samples
 * by integer index. That is not a stunt — it is the sandbox law (every asset
 * inside the GIF, no CDN, no remote anything at load) met the cheapest way
 * there is, and it keeps the whole app under a couple of hundred KB.
 *
 * Textures are TEX x TEX RGB (3 bytes/texel). Sprites are RGBA (4), because a
 * figure has to be cut out of its own bounding box.
 *
 * The lighting model lives in render.js; everything here is unlit albedo,
 * EXCEPT the ceiling's light panels, which carry their own emission channel.
 */
(function (root) {
  'use strict';

  var TEX = 64;

  /* ---- small tools -------------------------------------------------- */

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function b255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

  /* A wrapping value-noise field, sampled bilinearly. Low frequencies are the
     stains and the damp; the raw per-texel field is the grain. */
  function field(n, seed) {
    var f = new Float32Array(n * n), r = rng(seed), i;
    for (i = 0; i < f.length; i++) f[i] = r();
    return f;
  }
  function sampleField(f, n, u, v) {
    var x = u * n, y = v * n;
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = x - x0, fy = y - y0;
    var x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    x0 = ((x0 % n) + n) % n; y0 = ((y0 % n) + n) % n;
    x1 = ((x1 % n) + n) % n; y1 = ((y1 % n) + n) % n;
    var a = f[y0 * n + x0], b = f[y0 * n + x1];
    var c = f[y1 * n + x0], d = f[y1 * n + x1];
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  /* Two octaves is all a 64px texture can show. */
  function fbm(f8, f16, u, v) {
    return sampleField(f8, 8, u, v) * 0.65 + sampleField(f16, 16, u, v) * 0.35;
  }

  /* ---- the wall: Backrooms wallpaper, a chair rail, a baseboard ------ */
  /*
   * The horizontal bands are the whole point. A corridor reads as a corridor
   * because the rail and the baseboard converge on the vanishing point; flat
   * colour has nothing to converge. Upstream had no texture at all, so its
   * only depth cue was brightness — and our port then spent that cue on a
   * floor the same colour as the wall.
   */
  var W_PERIOD = 16;
  function makeWall(seed, hue) {
    var t = new Uint8Array(TEX * TEX * 3);
    var grain = field(TEX, 0x51A2 ^ seed), f8 = field(8, 0x9E11 ^ seed), f16 = field(16, 0x3C77 ^ seed);
    hue = hue || 1;
    /* The baseboard is the load-bearing detail. A 3-texel chair rail is
       sub-pixel by four metres and stops paying; a 14-texel dark skirting
       survives to the end of the hall, and it is the line that actually draws
       the perspective on the walls. */
    var RAIL = 40, BASE = 50;
    for (var v = 0; v < TEX; v++) {
      for (var u = 0; u < TEX; u++) {
        var uu = u / TEX, vv = v / TEX;
        var damp = fbm(f8, f16, uu, vv);
        var r, g, b;

        if (v >= BASE) {
          /* baseboard — scuffed olive-brown, with a lit lip along its top */
          var bt = (v - BASE) / (TEX - BASE);
          var k = 0.78 - 0.26 * bt;
          if (v === BASE) k = 1.55;
          if (v === BASE + 1) k = 1.05;
          r = 74 * k; g = 60 * k; b = 26 * k;
          r -= damp * 20; g -= damp * 18; b -= damp * 9;
        } else if (v >= RAIL && v < RAIL + 3) {
          /* chair rail — a lit lip, then its own shadow under it */
          var lit = v === RAIL ? 1.52 : v === RAIL + 1 ? 1.10 : 0.48;
          r = 190 * lit; g = 160 * lit; b = 68 * lit;
        } else {
          /* Wallpaper field. The seams used to be single texels at 0.83 and
             1.06 — a hard dark notch and a hard hot stripe — and at a wall
             CORNER, where the texture wraps, the two landed next to each other
             and read as a strip of lit trim that does not exist. Soft, wider,
             and never brighter than the paper. */
          var su = u % W_PERIOD;
          var stripe = 1 - 0.055 * Math.abs(Math.cos(su / W_PERIOD * Math.PI * 2));
          if (su < 2) stripe *= 0.94 + 0.03 * su;
          /* Lit from ABOVE, because that is where the fluorescents are. The
             first cut had this backwards — the top of the wall darker than the
             bottom — and it made every wall meet the ceiling in a muddy join
             instead of a bright one. */
          var band = v < RAIL ? (1.12 - 0.22 * (v / RAIL)) : 0.84;
          var kk = stripe * band;
          r = 201 * kk * hue; g = 172 * kk; b = 68 * kk / hue;
          /* damp bleeding up from the skirting and down from the ceiling */
          var bleed = Math.max(0, (v - 30) / 22) * 0.55 + Math.max(0, (5 - v) / 5) * 0.4;
          var stain = clamp(damp * 1.5 - 0.55, 0, 1) * (0.35 + bleed);
          r -= stain * 96; g -= stain * 88; b -= stain * 34;
        }
        var gr = (grain[v * TEX + u] - 0.5) * 13;
        var o = (v * TEX + u) * 3;
        t[o] = b255(r + gr); t[o + 1] = b255(g + gr); t[o + 2] = b255(b + gr * 0.6);
      }
    }
    return t;
  }

  /* ---- the floor: damp hotel carpet --------------------------------- */
  function makeCarpet() {
    var t = new Uint8Array(TEX * TEX * 3);
    var grain = field(TEX, 0xB33F), f8 = field(8, 0x7711), f16 = field(16, 0x22A5);
    for (var v = 0; v < TEX; v++) {
      for (var u = 0; u < TEX; u++) {
        var damp = fbm(f8, f16, u / TEX, v / TEX);
        /* the weave: a coarse over-under, which is what makes carpet read as
           carpet and not as brown paint */
        var weave = (((u >> 1) + (v >> 1)) & 1) ? 1.06 : 0.94;
        weave *= ((u & 1) === (v & 1)) ? 1.03 : 0.97;
        var k = weave * (0.78 + damp * 0.44);
        var r = 134 * k, g = 113 * k, b = 50 * k;
        /* stains, and the border strip every half-cell */
        var stain = clamp(damp * 1.7 - 0.85, 0, 1);
        r -= stain * 70; g -= stain * 64; b -= stain * 26;
        /* NO grid line here. Carpet is laid in broadloom, not tiles, and a
           dark texel at u=0 became a hard black line down the exact centre of
           the screen whenever the player faced along an axis — the ceiling's
           T-bar does converge on the vanishing point, and it should, but the
           floor joining in read as a rendering seam. */
        var gr = (grain[v * TEX + u] - 0.5) * 30;
        var o = (v * TEX + u) * 3;
        t[o] = b255(r + gr); t[o + 1] = b255(g + gr); t[o + 2] = b255(b + gr * 0.7);
      }
    }
    return t;
  }

  /* ---- the ceiling: acoustic tiles, four to a cell ------------------- */
  /*
   * TILES ONLY. The fixtures are NOT in here, and the first cut of this file
   * getting that wrong is instructive: a lamp baked into the texture is a lamp
   * in EVERY cell, because the texture tiles once per cell. The ceiling came
   * out as a repeating field of grey lozenges with no rhythm to it, and no
   * amount of tuning the brightness was going to fix a fixture that is
   * everywhere. Where a light hangs is a fact about the LEVEL, so the level
   * answers it (game.js `light()`) and render.js draws the panel.
   *
   * Kept dimmer and warmer than it wants to be, too. Mineral fibre is pale,
   * but on screen the ceiling is a third of the frame and the monsters are not
   * in it — if it is the brightest surface in the room the eye goes up.
   */
  function makeCeiling() {
    var t = new Uint8Array(TEX * TEX * 3);
    var grain = field(TEX, 0x1D4E), f8 = field(8, 0x5AB3), f16 = field(16, 0x6C21);
    var Q = TEX / 2; /* two tiles across a world cell */
    for (var v = 0; v < TEX; v++) {
      for (var u = 0; u < TEX; u++) {
        var tu = u % Q, tv = v % Q;
        var damp = fbm(f8, f16, u / TEX, v / TEX);
        var r, g, b;
        var edge = (tu === 0 || tv === 0 || tu === Q - 1 || tv === Q - 1);
        if (edge) {
          /* the T-bar grid, which is the only strong line up there and so is
             what actually draws the perspective on the ceiling */
          var lip = (tu === 0 || tv === 0);
          var k = lip ? 0.60 : 0.84;
          r = 132 * k; g = 126 * k; b = 106 * k;
        } else {
          var pit = grain[v * TEX + u];
          var k2 = 0.90 + damp * 0.14 - (pit > 0.93 ? 0.11 : 0);
          r = 146 * k2; g = 141 * k2; b = 120 * k2;
          /* the brown bloom of a leak */
          var leak = clamp(damp * 1.8 - 1.14, 0, 1);
          r -= leak * 26; g -= leak * 42; b -= leak * 58;
        }
        var gr = (grain[v * TEX + u] - 0.5) * 6;
        var o = (v * TEX + u) * 3;
        t[o] = b255(r + gr); t[o + 1] = b255(g + gr); t[o + 2] = b255(b + gr);
      }
    }
    return t;
  }

  /* ---- sprite kit ---------------------------------------------------- */

  function sprite(w, h) {
    return { w: w, h: h, px: new Uint8ClampedArray(w * h * 4) };
  }
  function put(s, x, y, r, g, b, a) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
    var o = (y * s.w + x) * 4;
    if (a >= 250) { s.px[o] = r; s.px[o + 1] = g; s.px[o + 2] = b; s.px[o + 3] = 255; return; }
    var da = s.px[o + 3] / 255, sa = a / 255, out = sa + da * (1 - sa);
    if (out <= 0) return;
    s.px[o] = (r * sa + s.px[o] * da * (1 - sa)) / out;
    s.px[o + 1] = (g * sa + s.px[o + 1] * da * (1 - sa)) / out;
    s.px[o + 2] = (b * sa + s.px[o + 2] * da * (1 - sa)) / out;
    s.px[o + 3] = out * 255;
  }

  /*
   * A tapered capsule with a cylinder's shading — one primitive builds a whole
   * body. The key light is up and to the LEFT for every sprite in the game, so
   * the figures agree with the corridor they stand in.
   */
  function capsule(s, x0, y0, x1, y1, r0, r1, col, opt) {
    opt = opt || {};
    var lo = opt.shade == null ? 0.46 : opt.shade;
    var rim = opt.rim == null ? 0.30 : opt.rim;
    var dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
    var maxR = Math.max(r0, r1) + 1;
    var bx0 = Math.floor(Math.min(x0, x1) - maxR), bx1 = Math.ceil(Math.max(x0, x1) + maxR);
    var by0 = Math.floor(Math.min(y0, y1) - maxR), by1 = Math.ceil(Math.max(y0, y1) + maxR);
    for (var y = by0; y <= by1; y++) {
      for (var x = bx0; x <= bx1; x++) {
        var t = ((x - x0) * dx + (y - y0) * dy) / len2;
        t = clamp(t, 0, 1);
        var cx = x0 + dx * t, cy = y0 + dy * t;
        var r = r0 + (r1 - r0) * t;
        var d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        /* n across the limb, -1 on the lit side */
        var nx = r > 0.01 ? (x - cx) / r : 0;
        var round = Math.sqrt(Math.max(0, 1 - nx * nx));
        var k = lo + (1 - lo) * round - nx * rim;
        /* a hot edge on the lit rim, and the far edge falls into the dark */
        if (nx < -0.72) k += 0.22;
        var a = d > r - 0.9 ? clamp((r - d) / 0.9, 0, 1) * 255 : 255;
        put(s, x, y, col[0] * k, col[1] * k, col[2] * k, a);
      }
    }
  }
  function blob(s, cx, cy, rx, ry, col, opt) {
    opt = opt || {};
    var lo = opt.shade == null ? 0.44 : opt.shade;
    for (var y = Math.floor(cy - ry) - 1; y <= cy + ry + 1; y++) {
      for (var x = Math.floor(cx - rx) - 1; x <= cx + rx + 1; x++) {
        var nx = (x - cx) / rx, ny = (y - cy) / ry;
        var d = nx * nx + ny * ny;
        if (d > 1) continue;
        var round = Math.sqrt(Math.max(0, 1 - d));
        var k = lo + (1 - lo) * round - nx * 0.26 - ny * 0.16;
        var a = d > 0.86 ? clamp((1 - d) / 0.14, 0, 1) * 255 : 255;
        put(s, x, y, col[0] * k, col[1] * k, col[2] * k, a);
      }
    }
  }
  function glow(s, cx, cy, r, col, power) {
    for (var y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++) {
      for (var x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
        var d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        var f = Math.pow(1 - d, 2) * power;
        var o = (((y | 0) * s.w + (x | 0)) * 4);
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        if (!s.px[o + 3]) continue; /* a glow does not create silhouette */
        s.px[o] = b255(s.px[o] + col[0] * f);
        s.px[o + 1] = b255(s.px[o + 1] + col[1] * f);
        s.px[o + 2] = b255(s.px[o + 2] + col[2] * f);
      }
    }
  }

  /* ---- the things that walk toward you ------------------------------- */
  /*
   * Upstream drew a filled rectangle with two smaller rectangles for eyes, and
   * so did our port. At three metres that is a maroon wall with red dots on
   * it — the screenshot in this repo's own store listing was exactly that. A
   * monster has to have a SILHOUETTE: something that is unmistakably a body
   * even as eight dark pixels at the end of a hall. Hence the long arms and
   * the low, forward head — the outline reads before any detail does.
   */
  var FW = 42, FH = 74;

  function figure(pal, phase, opt) {
    opt = opt || {};
    var s = sprite(FW, FH);
    var sw = Math.sin(phase), cw = Math.cos(phase * 2);
    var bob = cw * 1.3;
    var cx = FW / 2;
    var lean = opt.lean == null ? 2.6 : opt.lean;
    var hipY = 44 + bob, shY = 22 + bob, headY = 16 + bob;
    var body = pal.body, dark = pal.dark, skin = pal.skin;
    var FAR_ = { shade: 0.24, rim: 0.10 };   /* the far limb is nearly a shadow */
    var NEAR = { shade: 0.34, rim: 0.40 };

    /* ---- far leg, far arm: behind the torso, and DARK. The gap of
       background between a far limb and the body is what makes a walking
       silhouette read at eight pixels tall. ---- */
    legs(s, cx - 3.2, hipY, -sw, dark, FAR_, 0.86);
    arm(s, cx - 7 + lean, shY + 3, -sw, dark, FAR_, 0.88);

    /* ---- legs: digitigrade, so it is plainly not a person ---- */
    legs(s, cx + 3.2, hipY, sw, body, NEAR, 1);

    /* ---- torso: narrow waist, shoulder blades hunched up past the head ---- */
    capsule(s, cx - lean * 0.5, hipY - 2, cx + lean * 0.8, shY + 4, 5.6, 8.2, body, NEAR);
    for (var i = 0; i < 4; i++) {
      capsule(s, cx - 4.6 + lean, shY + 8 + i * 4.2, cx + 4.6 + lean, shY + 9.2 + i * 4.2,
        0.85, 0.85, dark, { shade: 0.86, rim: 0 });
    }
    /* the blades, standing proud on either side of the sunken head */
    capsule(s, cx - 7.5 + lean, shY + 5, cx - 5.5 + lean, shY - 3.5, 3.6, 2.6, body, { shade: 0.30, rim: 0.5 });
    capsule(s, cx + 7.5 + lean, shY + 5, cx + 5.5 + lean, shY - 3.5, 3.6, 2.6, body, { shade: 0.30, rim: 0.2 });

    /* ---- head: no neck, pushed forward and DOWN between the blades.
       Two masses, not one blob: a low narrow cranium and a snout that juts
       forward off it. A round head with two dots on it is a pumpkin, and the
       first cut of this sprite was exactly that — the eye glow washed the
       whole skull orange and the brow bar across it finished the job by
       reading as a welding visor. ---- */
    capsule(s, cx + lean, shY + 1, cx + lean + 1.6, headY + 4, 3.0, 2.6, dark, { shade: 0.5, rim: 0.2 });
    capsule(s, cx + lean - 2.6, headY - 0.6, cx + lean + 3.4, headY + 0.4, 4.6, 4.0, skin, { shade: 0.26, rim: 0.44 });
    capsule(s, cx + lean + 3.0, headY + 1.0, cx + lean + 7.4, headY + 3.0, 3.2, 1.9, skin, { shade: 0.24, rim: 0.40 });
    /* the socket the eye sits in, so it is set INTO the head */
    capsule(s, cx + lean - 1.6, headY - 0.4, cx + lean + 3.6, headY + 0.6, 2.0, 1.7, dark, { shade: 0.62, rim: 0 });

    /* ---- near arm: long enough to reach the ankle ---- */
    arm(s, cx + 7.5 + lean, shY + 3, sw, body, NEAR, 1);

    /* ---- eyes: two embers, and a halo small enough to stay a halo ---- */
    var ec = pal.eye, ex = cx + lean + 1.2;
    blob(s, ex - 1.5, headY - 0.2, 1.15, 1.0, ec, { shade: 1 });
    blob(s, ex + 2.6, headY + 0.2, 1.15, 1.0, ec, { shade: 1 });
    glow(s, ex - 1.5, headY - 0.2, 3.2, ec, 0.42);
    glow(s, ex + 2.6, headY + 0.2, 3.2, ec, 0.42);
    put(s, ex - 1.5, headY - 0.4, 255, 244, 226, 255);
    put(s, ex + 2.6, headY, 255, 244, 226, 255);

    /* ---- what it stands in: without a shadow a sprite hovers ---- */
    for (var gx = -11; gx <= 11; gx++) {
      var gw = Math.sqrt(Math.max(0, 121 - gx * gx)) * 0.26;
      for (var gy = -gw; gy <= gw; gy++) {
        put(s, cx + gx, FH - 3 + gy, 12, 8, 5, 130 * (1 - Math.abs(gx) / 13));
      }
    }
    return s;
  }

  /* thigh forward, shin back, then a long flat foot — a dog's leg on a body
     the size of a man's, which the eye reads as WRONG before it reads as
     anything else */
  function legs(s, hx, hy, swing, col, opt, k) {
    var kneeX = hx + swing * 4.5, kneeY = hy + 12;
    var ankX = hx + swing * 1.2 - 1.6, ankY = FH - 8;
    capsule(s, hx, hy, kneeX, kneeY, 4.6 * k, 3.0 * k, col, opt);
    capsule(s, kneeX, kneeY, ankX, ankY, 3.0 * k, 2.0 * k, col, opt);
    capsule(s, ankX, ankY, ankX + 4.2 + swing * 2, FH - 4, 2.4 * k, 1.7 * k, col,
      { shade: (opt.shade || 0.34) * 0.85, rim: 0 });
  }

  /* shoulder to elbow to a splayed hand, hanging past the knee */
  function arm(s, sx, sy, swing, col, opt, k) {
    var ex = sx + swing * 3.4, ey = sy + 15;
    var hx = sx + swing * 6.5 + 1.2, hy = sy + 30;
    capsule(s, sx, sy, ex, ey, 3.4 * k, 2.5 * k, col, opt);
    capsule(s, ex, ey, hx, hy, 2.5 * k, 1.9 * k, col, opt);
    for (var c = -1; c <= 1; c++) {
      capsule(s, hx, hy, hx + c * 2.6, hy + 5.0, 1.15 * k, 0.5, col,
        { shade: (opt.shade || 0.34) * 0.8, rim: 0 });
    }
  }

  /*
   * Death: it FALLS OVER. The first cut squashed the standing billboard
   * vertically, which meant the middle of the animation was an upright,
   * headless maroon column — a critic called it a missing-texture
   * placeholder and that is exactly what it looked like. A body pivots at the
   * feet, so this does too: one axis from the feet to the head, swinging from
   * vertical to almost flat, with the head riding the end of it. The last
   * frame is what the corpse looks like for the next half a minute, so it has
   * to be a body lying on the carpet and not just a stain.
   */
  function figureDie(pal, t) {
    var s = sprite(FW, FH);
    var cx = FW / 2;
    var body = pal.body, dark = pal.dark, skin = pal.skin;
    var th = t * 1.42;                       /* radians off vertical */
    var L = 34 * (1 - t * 0.12);
    var footY = FH - 5;
    var hx = cx + Math.sin(th) * L * 0.54;
    var hy = footY - Math.cos(th) * L;

    /* the stain first, so the body lands on it */
    var stain = [56, 15, 12];
    for (var x = -16; x <= 16; x++) {
      var hw = Math.sqrt(Math.max(0, 256 - x * x)) * 0.22 * t;
      for (var yy = -hw; yy <= hw; yy++) put(s, cx + x, FH - 3 + yy, stain[0], stain[1], stain[2], 205 * t);
    }

    /* legs stay where it was standing and fold under it */
    capsule(s, cx - 3, footY - 8 * (1 - t), cx - 5 - t * 6, footY, 4.4 - t, 3.0, dark, { shade: 0.26 });
    capsule(s, cx + 3, footY - 8 * (1 - t), cx + 6 + t * 7, footY, 4.6 - t, 3.0, body, { shade: 0.30 });

    /* the trunk, pivoting at the feet */
    capsule(s, cx, footY, hx, hy + 9, 6.2 - t * 1.4, 5.0 - t * 0.9, body, { shade: 0.28, rim: 0.36 });
    /* the arm thrown out ahead of it */
    capsule(s, hx * 0.5 + cx * 0.5, (hy + footY) / 2, hx + 5 + t * 5, hy + 12 + t * 6,
      3.0, 2.0, dark, { shade: 0.28 });
    /* and the head at the end of it */
    blob(s, hx, hy, 5.9 - t * 0.9, 5.1 - t * 1.1, skin, { shade: 0.26 });
    var f = Math.max(0, 1 - t * 1.6);
    if (f > 0.02) {
      var dim = [pal.eye[0] * f, pal.eye[1] * f, pal.eye[2] * f];
      blob(s, hx - 1.6, hy - 0.2, 1.4, 1.2, dim, { shade: 1 });
      blob(s, hx + 2.4, hy + 0.2, 1.4, 1.2, dim, { shade: 1 });
    }
    return s;
  }

  var PAL_THING = {
    body: [96, 33, 26], dark: [34, 11, 9], skin: [124, 48, 36], eye: [255, 104, 30]
  };
  /* Another player is UNMISTAKABLY not a monster: cold instead of warm, lit
     instead of sunk, and its eyes do not burn. You must never shoot a friend
     because you could not tell. */
  var PAL_PALE = {
    body: [168, 180, 202], dark: [72, 84, 106], skin: [214, 224, 238], eye: [120, 214, 255]
  };

  /* ---- the shotgun --------------------------------------------------- */
  /*
   * Two layers, because the pump has to move: BODY is barrel, receiver, stock
   * and the trigger hand; PUMP is the forestock and the hand riding it. The
   * whole reason DOOM's shotgun feels good is that you SEE the action cycle.
   */
  var GW = 160, GH = 128;

  /*
   * MOSTLY GUN, and OUTLINED.
   *
   * Two rewrites got this here. The first drew a long thin tube running up the
   * frame — not a gun you are aiming, a gun you are holding up to look at,
   * pointed at the ceiling. DOOM's shotgun is seen almost directly from
   * BEHIND: receiver and pump near the eye taking most of the sprite, barrel
   * receding so it is SHORT on screen and TAPERS, muzzle a small dark ellipse
   * below the crosshair rather than a pipe pointing at it.
   *
   * The second drew the hands as long horizontal capsules for fingers, which
   * at this size is not a hand, it is a striped mitten. Fingers wrapped round
   * a forestock are seen END-ON — they are knuckles, so they are blobs. And
   * you see far LESS hand than you think: the arms are cropped by the bottom
   * and left edges, and what is left is three knuckles over the wood.
   *
   * Everything then gets a one-pixel dark outline. Over a busy mustard
   * corridor that outline is the difference between a weapon and a smudge; it
   * is why every sprite in DOOM has dark edge pixels.
   */
  function knuckles(s, x0, y0, dx, dy, n, r, col) {
    for (var i = 0; i < n; i++) {
      blob(s, x0 + dx * i, y0 + dy * i, r, r * 0.86, col, { shade: 0.40 });
    }
  }

  /* A dark rim on every transparent pixel touching an opaque one. */
  function outline(s, col, a) {
    var w = s.w, h = s.h, src = new Uint8ClampedArray(s.px);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var o = (y * w + x) * 4;
        /* ONE threshold for both tests. Using two (transparent < 40, solid >
           120) leaves the anti-aliased ring in between belonging to neither,
           so the outline came out DOTTED — it read as dithered noise around
           the hand rather than an edge. */
        if (src[o + 3] >= 128) continue;
        var near = 0;
        if (x > 0 && src[o - 4 + 3] >= 128) near = 1;
        else if (x < w - 1 && src[o + 4 + 3] >= 128) near = 1;
        else if (y > 0 && src[o - w * 4 + 3] >= 128) near = 1;
        else if (y < h - 1 && src[o + w * 4 + 3] >= 128) near = 1;
        if (!near) continue;
        s.px[o] = col[0]; s.px[o + 1] = col[1]; s.px[o + 2] = col[2]; s.px[o + 3] = a;
      }
    }
  }

  var GUN_EDGE = [15, 12, 10];

  function gunBody() {
    var s = sprite(GW, GH);
    var steel = [76, 79, 88], dsteel = [41, 43, 50], wood = [88, 52, 24];
    var glove = [70, 50, 33], gloveHi = [104, 78, 52];

    /* magazine tube under the barrel */
    capsule(s, 64, 26, 73, 70, 4.6, 7.0, dsteel, { shade: 0.28, rim: 0.42 });
    /* the barrel — widening toward the eye. That taper IS the perspective. */
    capsule(s, 68, 10, 78, 74, 7.0, 11.0, steel, { shade: 0.18, rim: 0.80 });
    blob(s, 68, 10, 7.0, 3.4, [108, 112, 122], { shade: 0.60 });   /* muzzle ring */
    blob(s, 68, 10.2, 3.7, 1.7, [13, 13, 15], { shade: 1 });        /* the hole */
    blob(s, 67, 13, 1.2, 1.0, [180, 182, 190], { shade: 0.82 });    /* bead sight */

    /* receiver: nearest, biggest, with a lit top edge to cut it from the wood */
    capsule(s, 82, 84, 92, 106, 13.4, 12.8, dsteel, { shade: 0.28, rim: 0.46 });
    capsule(s, 78, 81, 97, 86, 3.0, 3.0, [128, 132, 142], { shade: 0.76, rim: 0.18 });
    capsule(s, 91, 88, 100, 95, 3.2, 3.0, [19, 19, 21], { shade: 0.92, rim: 0 });
    capsule(s, 85, 104, 97, 110, 1.9, 1.9, dsteel, { shade: 0.52 });

    /*
     * The stock leaves the frame almost at once, and it is DARK. Drawn long
     * and warm it was a thick brown diagonal running to the corner — which,
     * beside the support arm on the other side, made a V of two bare forearms
     * with a small object between them. In DOOM the stock is against your
     * shoulder and you barely see it. Neither should you.
     */
    capsule(s, 95, 108, 118, 128, 10.0, 13.0, wood, { shade: 0.22, rim: 0.34 });

    /* trigger hand: a wrist and three knuckles, the rest below the frame */
    capsule(s, 100, 128, 93, 110, 8.0, 7.0, glove, { shade: 0.26, rim: 0.32 });
    knuckles(s, 86, 110, 1.0, 4.6, 3, 2.6, gloveHi);

    outline(s, GUN_EDGE, 235);
    return s;
  }

  function gunPump() {
    var s = sprite(GW, GH);
    var wood = [112, 68, 32], glove = [72, 52, 34], gloveHi = [106, 80, 54];
    /* forestock: fat, close, unmistakably a pump */
    capsule(s, 72, 48, 80, 84, 11.0, 13.4, wood, { shade: 0.26, rim: 0.48 });
    for (var i = 0; i < 6; i++) {
      capsule(s, 61, 54 + i * 5, 91, 55.3 + i * 5, 1.2, 1.2, [48, 26, 10], { shade: 0.92, rim: 0 });
    }
    /* a wrist out of the bottom-left corner, and four knuckles over the wood.
       That is the whole hand — anything more and the arm competes with the
       gun for the middle of the screen. */
    capsule(s, 48, 128, 66, 88, 6.4, 7.6, glove, { shade: 0.24, rim: 0.36 });
    knuckles(s, 66, 58, 1.5, 5.6, 4, 3.1, gloveHi);
    outline(s, GUN_EDGE, 235);
    return s;
  }

  /* Muzzle flash: a hot core with irregular petals, so two shots never look
     like the same rubber stamp. */
  function flash(seed) {
    var FS = 96, s = sprite(FS, FS), r = rng(seed), c = FS / 2;
    var petals = 5 + (r() * 3 | 0), i, y, x;
    for (i = 0; i < petals; i++) {
      var ang = (i / petals) * 6.283 + r() * 0.6;
      var len = 14 + r() * 24;
      capsule(s, c, c, c + Math.cos(ang) * len, c + Math.sin(ang) * len,
        7 + r() * 4, 1.5, [255, 158, 46], { shade: 0.9, rim: 0 });
    }
    /* orange out, white in. A flash that is white all through desaturates
       whatever it lights and the target goes grey-mauve. */
    blob(s, c, c, 17, 16, [255, 190, 84], { shade: 0.95 });
    blob(s, c, c, 11, 10, [255, 232, 168], { shade: 0.98 });
    blob(s, c, c, 6, 5.5, [255, 252, 236], { shade: 1 });
    /* soften it into a real flare rather than a sticker */
    for (y = 0; y < FS; y++) for (x = 0; x < FS; x++) {
      var o = (y * FS + x) * 4;
      if (!s.px[o + 3]) continue;
      var d = Math.hypot(x - c, y - c) / (FS / 2);
      s.px[o + 3] = s.px[o + 3] * clamp(1.25 - d * 1.25, 0, 1);
    }
    return s;
  }

  /* The average colour of a texture. Sampling a 64x64 speckle at eight metres
     aliases into moving chevrons — a real renderer would mip; this one fades
     the texel toward this mean with distance, which costs one lerp per ROW. */
  function meanOf(t) {
    var r = 0, g = 0, b = 0, n = t.length / 3, i;
    for (i = 0; i < t.length; i += 3) { r += t[i]; g += t[i + 1]; b += t[i + 2]; }
    return [r / n, g / n, b / n];
  }

  /* ---- build once ---------------------------------------------------- */

  var built = null;
  function build() {
    if (built) return built;
    var walk = [], die = [], pale = [], i;
    for (i = 0; i < 8; i++) walk.push(figure(PAL_THING, (i / 8) * 6.283));
    for (i = 0; i < 8; i++) die.push(figureDie(PAL_THING, i / 7));
    for (i = 0; i < 8; i++) pale.push(figure(PAL_PALE, (i / 8) * 6.283, { lean: 1.0 }));
    built = {
      TEX: TEX,
      walls: [makeWall(0, 1), makeWall(0x5C3A, 1.06), makeWall(0x9911, 0.95)],
      carpet: makeCarpet(),
      ceil: makeCeiling(),
      walk: walk,
      die: die,
      pale: pale,
      figW: FW, figH: FH,
      gunBody: gunBody(),
      gunPump: gunPump(),
      gunW: GW, gunH: GH,
      flashes: [flash(0x11), flash(0x57), flash(0xA3)]
    };
    built.carpetAvg = meanOf(built.carpet);
    built.ceilAvg = meanOf(built.ceil);
    return built;
  }

  root.Art = { build: build, TEX: TEX };
})(window);
