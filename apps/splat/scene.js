/*
 * Tiny demo scene packed in the GIF. Builds a .splat buffer (32 bytes per
 * speck) of a ring, three balls, and a patch of ground. Nothing is fetched.
 *
 * Format (antimatter15/splat): xyz f32, scale f32×3, rgba u8, quat u8×4.
 */
(function (root) {
  'use strict';

  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hsv(h, s, v) {
    h = (h % 1 + 1) % 1;
    var i = h * 6 | 0, f = h * 6 - i;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q; break;
    }
    return [r * 255, g * 255, b * 255];
  }

  var list = [];

  function splat(x, y, z, sx, sy, sz, r, g, b, a) {
    list.push(x, y, z, sx, sy, sz, r, g, b, a);
  }

  function fibSphere(n, fn) {
    var ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (i / Math.max(1, n - 1)) * 2;
      var rad = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      fn(Math.cos(th) * rad, y, Math.sin(th) * rad, i / n);
    }
  }

  function build() {
    list = [];
    var rnd = mulberry(0x5a1a7);

    // Ground disc of flattened specks.
    var gi, gj;
    for (gi = 0; gi < 26; gi++) for (gj = 0; gj < 26; gj++) {
      var gx = (gi / 25 - 0.5) * 5.4 + (rnd() - 0.5) * 0.08;
      var gz = (gj / 25 - 0.5) * 5.4 + (rnd() - 0.5) * 0.08;
      var gd = Math.hypot(gx, gz);
      if (gd > 2.7) continue;
      var moss = hsv(0.28 + rnd() * 0.06, 0.45 + rnd() * 0.25, 0.28 + rnd() * 0.22);
      if (rnd() < 0.18) moss = hsv(0.08, 0.35, 0.32 + rnd() * 0.15);
      var gs = 0.09 + rnd() * 0.05;
      splat(gx, 0.01 + rnd() * 0.02, gz, gs, 0.018, gs, moss[0], moss[1], moss[2], 210);
    }

    // Rainbow ring sitting on the ground.
    var tu, tv, R = 1.35, rr = 0.28;
    for (tu = 0; tu < 48; tu++) for (tv = 0; tv < 16; tv++) {
      var u = (tu + rnd() * 0.4) / 48 * Math.PI * 2;
      var v = (tv + rnd() * 0.4) / 16 * Math.PI * 2;
      var cx = (R + rr * Math.cos(v)) * Math.cos(u);
      var cy = rr * Math.sin(v) + rr + 0.02;
      var cz = (R + rr * Math.cos(v)) * Math.sin(u);
      var col = hsv(tu / 48, 0.75, 0.92);
      var s = 0.055 + rnd() * 0.02;
      splat(cx, cy, cz, s, s, s, col[0], col[1], col[2], 230);
    }

    // Three glossy balls.
    var balls = [
      { x: -1.15, y: 0.38, z: 0.85, r: 0.38, h: 0.00, n: 220 },
      { x:  1.20, y: 0.34, z: 0.70, r: 0.34, h: 0.52, n: 200 },
      { x:  0.15, y: 0.32, z: -1.25, r: 0.32, h: 0.13, n: 190 }
    ];
    var bi;
    for (bi = 0; bi < balls.length; bi++) {
      (function (ball) {
        fibSphere(ball.n, function (x, y, z) {
          var px = ball.x + x * ball.r;
          var py = ball.y + y * ball.r;
          var pz = ball.z + z * ball.r;
          var lit = 0.55 + 0.45 * Math.max(0, y * 0.6 + x * 0.35 + 0.2);
          var c = hsv(ball.h, 0.72, Math.min(1, lit));
          var s = ball.r * 0.16;
          splat(px, py, pz, s, s, s, c[0], c[1], c[2], 240);
        });
      })(balls[bi]);
    }

    // A little green bush.
    fibSphere(160, function (x, y, z) {
      if (y < -0.15) return;
      var px = 1.55 + x * 0.42;
      var py = 0.55 + y * 0.55;
      var pz = -0.35 + z * 0.42;
      var c = hsv(0.33 + rnd() * 0.05, 0.7, 0.45 + y * 0.25);
      var s = 0.08 + rnd() * 0.04;
      splat(px, py, pz, s, s, s, c[0], c[1], c[2], 200);
    });
    var ti;
    for (ti = 0; ti < 18; ti++) {
      var ty = ti / 18 * 0.5;
      splat(1.55 + (rnd() - 0.5) * 0.06, ty, -0.35 + (rnd() - 0.5) * 0.06,
            0.07, 0.05, 0.07, 90, 58, 32, 220);
    }

    // Air sparkles.
    var k;
    for (k = 0; k < 140; k++) {
      var a = rnd() * Math.PI * 2;
      var rad = 0.4 + rnd() * 2.2;
      var y = 0.3 + rnd() * 2.0;
      var c = hsv(rnd(), 0.35 + rnd() * 0.4, 0.85);
      var s = 0.03 + rnd() * 0.04;
      splat(Math.cos(a) * rad, y, Math.sin(a) * rad, s, s, s, c[0], c[1], c[2], 90 + rnd() * 70);
    }

    var n = list.length / 10;
    var buf = new ArrayBuffer(n * 32);
    var f32 = new Float32Array(buf);
    var u8 = new Uint8Array(buf);
    var i, o, fo;
    for (i = 0; i < n; i++) {
      o = i * 10;
      fo = i * 8;
      f32[fo + 0] = list[o];
      f32[fo + 1] = list[o + 1];
      f32[fo + 2] = list[o + 2];
      f32[fo + 3] = list[o + 3];
      f32[fo + 4] = list[o + 4];
      f32[fo + 5] = list[o + 5];
      u8[i * 32 + 24] = list[o + 6] | 0;
      u8[i * 32 + 25] = list[o + 7] | 0;
      u8[i * 32 + 26] = list[o + 8] | 0;
      u8[i * 32 + 27] = list[o + 9] | 0;
      // Identity quaternion (w,x,y,z) mapped to 0..255.
      u8[i * 32 + 28] = 255;
      u8[i * 32 + 29] = 128;
      u8[i * 32 + 30] = 128;
      u8[i * 32 + 31] = 128;
    }
    return u8;
  }

  root.SPLAT_SCENE = build();
  root.SPLAT_BUILD = build;
})(this);
