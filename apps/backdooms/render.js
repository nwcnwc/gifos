/*
 * Backdooms — the view.
 *
 * WHAT WAS WRONG. Upstream drew walls as rgb(g,g,g) on pure black and never
 * drew a floor or a ceiling at all. Crude, but it READ: against black, the
 * only signal on screen was distance, so you always knew where the corridor
 * went. This port then painted a mustard wall on a mustard floor under a
 * mustard ceiling — and faked floor and ceiling as a vertical gradient keyed
 * off the WALL's distance, which is where the giant flat wedges came from.
 * Yellow on yellow on yellow, no contrast, no geometry. We made a legible
 * thing illegible.
 *
 * WHAT THIS IS. The bar is DOOM (1993), which is also what upstream's README
 * says it is aiming at, so the five things DOOM actually did are the spec:
 *
 *   1. TEXTURED walls. A corridor reads because the chair rail and the
 *      baseboard converge on the vanishing point. Flat colour has nothing to
 *      converge, which is the whole disease.
 *   2. A REAL floor and ceiling, cast in perspective per pixel — carpet you
 *      can see the weave of and ceiling tiles you can count.
 *   3. FAKE CONTRAST: north/south walls shaded darker than east/west, so
 *      corners exist even when both faces are the same texture.
 *   4. LIGHT DIMINISHING to black with distance, plus per-cell sector light.
 *      DOOM had no point lights; neither do we. What it had was this.
 *   5. Sprites and a weapon, z-clipped against the wall depth buffer.
 *
 * The one thing we add on top is the fluorescent panel in the ceiling, drawn
 * where the level says a fixture is. A line of them running away down a hall
 * is the strongest depth cue in the game, and it is the Backrooms' own image.
 *
 * PERFORMANCE. One ImageData, written through a Uint32Array. Walls first (they
 * fill the depth buffer and the span table), then floor and ceiling only for
 * the spans the walls did not cover, then sprites, then the gun. The buffer is
 * sized to a fixed PIXEL BUDGET at the viewport's real aspect ratio, so a
 * phone and a 27" monitor cost the same and neither is stretched — the old
 * build hard-coded 320x240 and let `object-fit: fill` squash it.
 */
(function (root) {
  'use strict';

  var A = null;
  var canvas, ctx, img, buf32, buf8;
  var W = 0, H = 0, TEX = 64, TMASK = 63;
  var zbuf, spanTop, spanBot;
  var vigX, vigY;
  var PIXELS = 118000;     /* the budget; auto-degrades under load */
  var MINH = 176, MAXH = 340;
  /*
   * The room, in cell widths. Upstream's implicit room was one unit tall with
   * the eye dead centre, which is a two-metre ceiling in a two-metre corridor
   * and reads as a crawlspace. A Backrooms hall is TALL. The eye also sits
   * above the middle, so you see more carpet than ceiling — the ceiling was
   * eating half the frame and it is not the half with the monsters in it.
   */
  var WH = 1.32;           /* floor to ceiling */
  var EH = 0.72;           /* floor to eye */
  var CH = WH - EH;        /* eye to ceiling */
  var FIGH = 1.12;         /* how tall a thing stands */
  var FAR = 30;            /* nothing is drawn past this; fog reaches black */

  /* the level asks these; cached because the floor cast hits the same cell
     for a long run of pixels and a call per pixel is a call too many */
  var lightFn = null, cacheCi = 1e9, cacheCj = 1e9, cacheLit = 0;

  function mod(n, m) { return ((n % m) + m) % m; }

  /* ---- sizing --------------------------------------------------------- */

  function resize() {
    if (!canvas) return;
    var cw = canvas.clientWidth || 320, ch = canvas.clientHeight || 240;
    var aspect = cw / Math.max(1, ch);
    var h = Math.round(Math.sqrt(PIXELS / Math.max(0.28, aspect)));
    h = Math.max(MINH, Math.min(MAXH, h));
    var w = Math.max(160, Math.min(900, Math.round(h * aspect)));
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    img = ctx.createImageData(W, H);
    buf8 = img.data;
    buf32 = new Uint32Array(buf8.buffer);
    zbuf = new Float32Array(W);
    spanTop = new Int32Array(W);
    spanBot = new Int32Array(W);
    /* separable vignette — two lookups and a multiply, not a per-pixel hypot */
    vigX = new Float32Array(W);
    vigY = new Float32Array(H);
    for (var i = 0; i < W; i++) {
      var nx = (i / (W - 1)) * 2 - 1;
      vigX[i] = 1 - 0.22 * nx * nx * nx * nx;
    }
    for (var y = 0; y < H; y++) {
      var ny = (y / (H - 1)) * 2 - 1;
      vigY[y] = 1 - 0.18 * ny * ny * ny * ny;
    }
  }

  function init() {
    canvas = root.document && root.document.getElementById('c');
    if (!canvas) return false;
    ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = false;
    A = root.Art.build();
    TEX = A.TEX; TMASK = TEX - 1;
    resize();
    root.addEventListener('resize', resize);
    if (root.screen && root.screen.orientation && root.screen.orientation.addEventListener) {
      root.screen.orientation.addEventListener('change', function () { setTimeout(resize, 120); });
    }
    return true;
  }

  /* ---- lighting -------------------------------------------------------- */
  /*
   * DOOM's model exactly: a per-sector light level times a diminishing curve.
   * `sector` is a hash so neighbouring cells differ slightly and the halls
   * are not one flat wash; `fog` is the curve, and it reaches real black,
   * which is the contrast the original got for free by drawing on #000.
   */
  function sector(ci, cj) {
    var h = (Math.imul(ci | 0, 374761393) ^ Math.imul(cj | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return 0.80 + 0.26 * ((h >>> 8) & 255) / 255;
  }
  /*
   * Tuned twice. The first curve was DOOM's, and DOOM's dungeons are dark; the
   * Backrooms is the opposite failure mode — it is over-lit, endlessly, with
   * nowhere to hide, and that is the whole reason the place is unpleasant. A
   * corridor that fell to black at ten metres read as a horror game with the
   * lights off instead of an office with no way out. So: a slow falloff that
   * keeps mustard on the wall out to twenty-odd metres, and only THEN an ease
   * to true zero so the far end of a hall still has a bottom to it.
   */
  function fog(d) {
    if (d >= FAR) return 0;
    var f = 1 / (1 + d * 0.060 + d * d * 0.0055);
    if (d > FAR - 13) { var t = (FAR - d) / 13; f *= t * t; }
    return f;
  }

  function litCell(ci, cj) {
    if (ci === cacheCi && cj === cacheCj) return cacheLit;
    cacheCi = ci; cacheCj = cj;
    cacheLit = lightFn ? (lightFn(ci, cj) ? 1 : 0) : 0;
    return cacheLit;
  }

  /* ---- the frame ------------------------------------------------------- */

  var lastCost = 0, slowFrames = 0;

  function frame(s) {
    if (!ctx) return;
    var t0 = (root.performance && root.performance.now) ? root.performance.now() : 0;

    var posX = s.x, posY = s.y, ang = s.a;
    var dirX = Math.cos(ang), dirY = Math.sin(ang);
    /* Horizontal FOV follows the screen's real shape, capped near 100 deg so a
       very wide window does not smear the edges into taffy. */
    var P = Math.min(1.19, (W / H) * 0.75);
    var planeX = -dirY * P, planeY = dirX * P;
    var horizon = (H * 0.5 + s.pitch * H) | 0;
    var flashAmt = s.flash;
    var wallTex = A.wall, floorTex = A.carpet, ceilTex = A.ceil;
    var cellFn = s.cell;
    lightFn = s.light;
    cacheCi = 1e9; cacheCj = 1e9;

    /* ---- walls: DDA, one column at a time --------------------------- */
    var i, y;
    for (i = 0; i < W; i++) {
      var camX = 2 * i / W - 1;
      var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
      var mapX = Math.floor(posX), mapY = Math.floor(posY);
      var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      var ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (posX - mapX) * ddx; }
      else { stepX = 1; sdx = (mapX + 1 - posX) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (posY - mapY) * ddy; }
      else { stepY = 1; sdy = (mapY + 1 - posY) * ddy; }
      var side = 0, hit = 0, guard = 0;
      while (!hit && guard++ < 64) {
        if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; }
        else { sdy += ddy; mapY += stepY; side = 1; }
        if (cellFn(mapX, mapY) === '1') hit = 1;
      }
      var perp = hit ? (side === 0 ? sdx - ddx : sdy - ddy) : 1e9;
      if (perp < 0.0001) perp = 0.0001;
      zbuf[i] = perp;

      if (!hit || perp >= FAR) { spanTop[i] = horizon; spanBot[i] = horizon - 1; continue; }

      var dStart = Math.round(horizon - H * CH / perp);
      var dEnd = Math.round(horizon + H * EH / perp);
      var lineH = dEnd - dStart;
      var y0 = dStart < 0 ? 0 : dStart;
      var y1 = dEnd > H ? H : dEnd;
      spanTop[i] = y0; spanBot[i] = y1 - 1;
      if (y1 <= y0) continue;

      /* where on the wall face the ray landed */
      var wallX = side === 0 ? posY + perp * rdy : posX + perp * rdx;
      wallX -= Math.floor(wallX);
      var texX = (wallX * TEX) | 0;
      if (side === 0 ? rdx > 0 : rdy < 0) texX = TMASK - texX;
      texX &= TMASK;

      /* DOOM's fake contrast, then sector light, then diminishing */
      var shade = (side === 1 ? 0.655 : 1) * sector(mapX, mapY) * fog(perp);
      if (flashAmt > 0) shade += flashAmt * 1.5 * fog(perp * 1.5);
      if (shade <= 0.004) {
        for (y = y0; y < y1; y++) buf32[y * W + i] = 0xff000000;
        continue;
      }
      var step = TEX / lineH;
      var texPos = (y0 - dStart) * step;
      var vx = vigX[i];
      var col = texX * 3;
      for (y = y0; y < y1; y++) {
        var texY = texPos & TMASK;
        texPos += step;
        var o = (texY * TEX) * 3 + col;
        var k = shade * vx * vigY[y];
        var r = wallTex[o] * k, g = wallTex[o + 1] * k, b = wallTex[o + 2] * k;
        buf32[y * W + i] = 0xff000000 |
          ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      }
    }

    /* ---- floor and ceiling: per row, in perspective ------------------- */
    var rdx0 = dirX - planeX, rdy0 = dirY - planeY;
    var rdx1 = dirX + planeX, rdy1 = dirY + planeY;
    var dRayX = (rdx1 - rdx0) / W, dRayY = (rdy1 - rdy0) / W;

    for (y = 0; y < H; y++) {
      var p = y - horizon;
      var isFloor = p > 0;
      var pp = isFloor ? p : -p;
      var rowOff0 = y * W;
      /*
       * EVERY non-wall pixel must be WRITTEN, even when the answer is black.
       * The buffer is reused between frames, so a row that is merely SKIPPED
       * keeps last frame's pixels — and the rows nearest the horizon are
       * exactly the rows that are always too far to light. That left a band
       * of stale smear across the middle of the screen, which caught a
       * monster's white hit-flash and held it there like a scar.
       */
      var rowDist = pp < 1 ? 1e9 : (isFloor ? EH : CH) * H / pp;
      var base = rowDist >= FAR ? 0 : fog(rowDist);
      if (flashAmt > 0 && rowDist < FAR) base += flashAmt * 1.5 * fog(rowDist * 1.5);
      if (base <= 0.004) {
        for (i = 0; i < W; i++) {
          if (y < spanTop[i] || y > spanBot[i]) buf32[rowOff0 + i] = 0xff000000;
        }
        continue;
      }
      var fx = posX + rowDist * rdx0, fy = posY + rowDist * rdy0;
      var sx = rowDist * dRayX, sy = rowDist * dRayY;
      var vy = vigY[y];
      var tex = isFloor ? floorTex : ceilTex;
      var rowOff = y * W;

      for (i = 0; i < W; i++) {
        if (y >= spanTop[i] && y <= spanBot[i]) { fx += sx; fy += sy; continue; }
        var ci = Math.floor(fx), cj = Math.floor(fy);
        var u = fx - ci, v = fy - cj;
        var k2 = base * sector(ci, cj) * vigX[i] * vy;
        var r2, g2, b2;

        if (!isFloor && litCell(ci, cj) && u > 0.16 && u < 0.84 && v > 0.24 && v < 0.76) {
          /* the fixture. It is the brightest thing in the game on purpose:
             a line of these running away down a hall is what tells you the
             hall is long. Only lightly dimmed by distance so it survives to
             the vanishing point. */
          var across = 1 - Math.abs((u - 0.5) / 0.34);
          if (across < 0) across = 0;
          var alongT = (v - 0.24) / 0.52;
          var tube = alongT < 0.40 ? alongT / 0.40 : alongT > 0.60 ? (1 - alongT) / 0.40 : 0.10;
          if (tube > 1) tube = 1;
          /* blown out in the middle, warm at the edges of the diffuser */
          var lum = 96 + 248 * tube * across;
          var lk = (0.46 + 0.54 * base) * vigX[i] * vy;
          r2 = lum * lk + 34 * base; g2 = lum * lk * 0.97 + 31 * base; b2 = lum * lk * 0.83 + 20 * base;
        } else {
          var tx = (u * TEX) & TMASK, ty = (v * TEX) & TMASK;
          var o2 = (ty * TEX + tx) * 3;
          var kk = k2;
          if (litCell(ci, cj)) {
            /* the pool the fixture throws — on the carpet below it, and as
               spill across the tile it is set into */
            var du = u - 0.5, dv = v - 0.5;
            var pool = Math.max(0, 1 - (du * du + dv * dv) * 3.2);
            kk += base * (isFloor ? 0.70 : 0.42) * pool;
          }
          r2 = tex[o2] * kk; g2 = tex[o2 + 1] * kk; b2 = tex[o2 + 2] * kk;
        }
        buf32[rowOff + i] = 0xff000000 |
          ((b2 > 255 ? 255 : b2) << 16) | ((g2 > 255 ? 255 : g2) << 8) | (r2 > 255 ? 255 : r2);
        fx += sx; fy += sy;
      }
    }

    /* ---- sprites ------------------------------------------------------ */
    drawSprites(s, posX, posY, dirX, dirY, planeX, planeY, horizon, flashAmt);

    /* ---- damage ------------------------------------------------------- */
    if (s.pain > 0) tint(Math.min(0.5, s.pain), 190, 24, 18);

    ctx.putImageData(img, 0, 0);

    /* ---- the gun, over everything ------------------------------------- */
    drawGun(s);

    /* Hold the budget: three slow frames in a row and the buffer shrinks,
       rather than the game quietly turning into a slideshow on a phone. */
    if (t0) {
      var cost = root.performance.now() - t0;
      lastCost = lastCost * 0.85 + cost * 0.15;
      if (lastCost > 13 && PIXELS > 42000) {
        if (++slowFrames > 45) { PIXELS = Math.round(PIXELS * 0.72); slowFrames = 0; W = 0; resize(); }
      } else slowFrames = 0;
    }
  }

  function tint(a, r, g, b) {
    var n = W * H, ia = 1 - a, i;
    for (i = 0; i < n; i++) {
      var o = i * 4;
      buf8[o] = buf8[o] * ia + r * a;
      buf8[o + 1] = buf8[o + 1] * ia + g * a;
      buf8[o + 2] = buf8[o + 2] * ia + b * a;
    }
  }

  /* ---- sprites --------------------------------------------------------- */

  var order = [];

  function drawSprites(s, posX, posY, dirX, dirY, planeX, planeY, horizon, flashAmt) {
    var list = s.sprites;
    if (!list || !list.length) return;
    order.length = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      var o = list[i];
      var dx = o.x - posX, dy = o.y - posY;
      order.push({ o: o, d: dx * dx + dy * dy });
    }
    order.sort(function (a, b) { return b.d - a.d; });

    var invDet = 1 / (planeX * dirY - dirX * planeY);
    for (i = 0; i < order.length; i++) {
      var e = order[i].o;
      var sx = e.x - posX, sy = e.y - posY;
      var tX = invDet * (dirY * sx - dirX * sy);
      var tY = invDet * (-planeY * sx + planeX * sy);
      if (tY < 0.16) continue;
      var f = fog(tY);
      if (f <= 0.006) continue;

      var frames = e.pale ? A.pale : (e.dying != null ? A.die : A.walk);
      var fi = e.dying != null
        ? Math.min(A.die.length - 1, (e.dying * A.die.length) | 0)
        : (e.phase | 0) % frames.length;
      var spr = frames[fi];
      var sw = A.figW, sh = A.figH;

      var screenX = ((W / 2) * (1 + tX / tY)) | 0;
      /* a figure is 1.15 world units tall and stands ON the carpet, so its
         feet land where the floor is at that distance — not floating at the
         screen's centre line, which is what the old rectangle did */
      var hgt = Math.abs(H / tY) * FIGH;
      var wid = hgt * (sw / sh);
      var bottom = (horizon + (EH * H) / tY) | 0;
      var top = bottom - hgt;
      var x0 = Math.floor(screenX - wid / 2), x1 = Math.ceil(screenX + wid / 2);
      if (x1 < 0 || x0 >= W) continue;
      var y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H, Math.ceil(bottom));
      if (y1 <= y0) continue;

      var shade = sector(Math.floor(e.x), Math.floor(e.y)) * f;
      if (flashAmt > 0) shade += flashAmt * 1.7 * fog(tY * 1.4);
      /* hit feedback: it goes WHITE for a beat, the way DOOM's did */
      var hurtK = e.hurt > 0 ? Math.min(1, e.hurt) : 0;
      if (shade > 2.2) shade = 2.2;

      for (var x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        if (tY >= zbuf[x]) continue;
        var tx = (((x - x0) * sw / (x1 - x0)) | 0);
        if (tx < 0 || tx >= sw) continue;
        var vx = vigX[x];
        for (var y = y0; y < y1; y++) {
          var ty = (((y - top) * sh / hgt) | 0);
          if (ty < 0 || ty >= sh) continue;
          var so = (ty * sw + tx) * 4;
          var al = spr.px[so + 3];
          if (al < 24) continue;
          var k = shade * vx * vigY[y];
          var r = spr.px[so] * k, g = spr.px[so + 1] * k, b = spr.px[so + 2] * k;
          if (hurtK) {
            r += (255 - r) * hurtK; g += (200 - g) * hurtK * 0.8; b += (190 - b) * hurtK * 0.8;
          }
          var d = (y * W + x) * 4;
          if (al > 235) {
            buf8[d] = r > 255 ? 255 : r;
            buf8[d + 1] = g > 255 ? 255 : g;
            buf8[d + 2] = b > 255 ? 255 : b;
          } else {
            var a = al / 255, ia = 1 - a;
            buf8[d] = buf8[d] * ia + (r > 255 ? 255 : r) * a;
            buf8[d + 1] = buf8[d + 1] * ia + (g > 255 ? 255 : g) * a;
            buf8[d + 2] = buf8[d + 2] * ia + (b > 255 ? 255 : b) * a;
          }
        }
      }
    }
  }

  /* ---- the gun --------------------------------------------------------- */

  var gunCan = null, gunCtx = null, pumpCan = null, pumpCtx = null;
  var flashCan = [];

  function toCanvas(spr) {
    var c = root.document.createElement('canvas');
    c.width = spr.w; c.height = spr.h;
    var cx = c.getContext('2d');
    var im = cx.createImageData(spr.w, spr.h);
    im.data.set(spr.px);
    cx.putImageData(im, 0, 0);
    return c;
  }

  function drawGun(s) {
    if (!gunCan) {
      gunCan = toCanvas(A.gunBody);
      pumpCan = toCanvas(A.gunPump);
      for (var i = 0; i < A.flashes.length; i++) flashCan.push(toCanvas(A.flashes[i]));
    }
    /* Sized off the HEIGHT, not the width: a wide monitor must not grow the
       gun until it eats the room, and the muzzle has to sit BELOW the
       crosshair or the thing you are aiming at is behind your own barrel. */
    var gh = H * 0.46, gw = gh * (A.gunW / A.gunH);
    var bobX = Math.sin(s.bob) * W * 0.012;
    var bobY = Math.abs(Math.cos(s.bob)) * H * 0.015;
    var gx = W * 0.555 - gw * (79 / A.gunW) + bobX;
    var gy = H - gh + bobY + s.kick * H * 0.085;

    ctx.imageSmoothingEnabled = false;
    /* the pump rides forward and back along the barrel */
    ctx.drawImage(gunCan, gx, gy, gw, gh);
    var slide = s.pump * gh * 0.11;
    ctx.drawImage(pumpCan, gx, gy + slide, gw, gh);

    if (s.flash > 0.02) {
      var fc = flashCan[s.flashId % flashCan.length];
      var fs = gw * (0.30 + 0.16 * s.flash);
      var mx = gx + gw * (76 / A.gunW), my = gy + gh * (4 / A.gunH);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, s.flash * 1.5);
      ctx.drawImage(fc, mx - fs / 2, my - fs / 2, fs, fs);
      ctx.restore();
    }
  }

  root.Render = {
    init: init,
    frame: frame,
    resize: resize,
    size: function () { return { w: W, h: H }; }
  };
})(window);
