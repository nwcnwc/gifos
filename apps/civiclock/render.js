// Civiclock isometric painter. Original geometry — no EA / Kenney tiles.
(function (root) {
  'use strict';
  var C = root.Civiclock;
  var T = C.T;
  var TW = 36, TH = 18; // 2:1 iso

  function mix(a, b, t) {
    return [
      (a[0] + (b[0] - a[0]) * t) | 0,
      (a[1] + (b[1] - a[1]) * t) | 0,
      (a[2] + (b[2] - a[2]) * t) | 0
    ];
  }
  function rgb(c, a) {
    return a == null ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
      : 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  var PAL = {
    grass: [32, 58, 42], grassHi: [48, 86, 58], grassNight: [14, 28, 22],
    dirt: [42, 40, 32],
    water: [28, 78, 118], waterHi: [70, 150, 190], waterNight: [12, 32, 58],
    road: [92, 96, 112], roadHi: [168, 172, 188], roadJam: [168, 92, 64], roadLine: [232, 210, 120],
    line: [210, 186, 70],
    plant: [120, 128, 138], plantHi: [168, 176, 186],
    pump: [70, 110, 150],
    park: [36, 110, 58], tree: [28, 86, 44], treeHi: [70, 160, 80],
    home: [52, 140, 88], homeSide: [32, 92, 60], homeTop: [86, 186, 120],
    shop: [56, 108, 196], shopSide: [36, 70, 140], shopTop: [110, 170, 230],
    work: [196, 132, 42], workSide: [140, 88, 24], workTop: [220, 170, 70],
    abandon: [78, 64, 54], abandonTop: [110, 96, 82],
    zoneH: [36, 90, 58], zoneS: [36, 64, 120], zoneW: [120, 86, 28],
    win: [255, 214, 110], winShop: [160, 210, 255],
    ink: [236, 236, 244], night: [6, 8, 16]
  };

  function iso(x, y) {
    return { sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) };
  }
  function worldSize() {
    return { w: C.N * TW, h: C.N * TH + 80 };
  }
  function pickTile(cam, mx, my) {
    // inverse iso given camera {x,y,s} and canvas mouse in world space
    var x = mx, y = my;
    var tx = (x / (TW / 2) + y / (TH / 2)) / 2;
    var ty = (y / (TH / 2) - x / (TW / 2)) / 2;
    return { x: Math.floor(tx), y: Math.floor(ty) };
  }

  function diamond(ctx, sx, sy, c, inset) {
    var w = TW / 2 - (inset || 0), h = TH / 2 - (inset || 0) * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx + w, sy);
    ctx.lineTo(sx, sy + h);
    ctx.lineTo(sx - w, sy);
    ctx.closePath();
    ctx.fillStyle = rgb(c);
    ctx.fill();
  }

  function box(ctx, sx, sy, h, top, left, right) {
    var w = TW / 2 - 2, d = TH / 2 - 1;
    // left face
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - w, sy + 0);
    ctx.lineTo(sx - w, sy - h);
    ctx.lineTo(sx, sy - h + 0);
    ctx.closePath();
    ctx.fillStyle = rgb(left);
    ctx.fill();
    // right face
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + w, sy);
    ctx.lineTo(sx + w, sy - h);
    ctx.lineTo(sx, sy - h);
    ctx.closePath();
    ctx.fillStyle = rgb(right);
    ctx.fill();
    // top
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx + w, sy - h);
    ctx.lineTo(sx, sy - h - d + 2);
    ctx.lineTo(sx - w, sy - h);
    ctx.closePath();
    ctx.fillStyle = rgb(top);
    ctx.fill();
    // ridge
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx, sy);
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function windows(ctx, sx, sy, h, n, lit, col, right) {
    if (h < 10) return;
    var i, wx, wy, ww = 2.4, wh = 3.2;
    ctx.fillStyle = lit ? rgb(col) : 'rgba(12,14,22,.7)';
    for (i = 0; i < n; i++) {
      wy = sy - 6 - (i % 4) * 5;
      if (wy < sy - h + 3) continue;
      wx = right ? sx + 5 + ((i / 4) | 0) * 5 : sx - 10 - ((i / 4) | 0) * 5;
      ctx.fillRect(wx, wy, ww, wh);
      if (lit) {
        ctx.fillStyle = 'rgba(255,240,180,.18)';
        ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
        ctx.fillStyle = rgb(col);
      }
    }
  }

  function roadMask(w, x, y) {
    var m = 0;
    if (C.inb(x, y - 1) && w.tiles[C.idx(x, y - 1)].t === T.ROAD) m |= 1;
    if (C.inb(x + 1, y) && w.tiles[C.idx(x + 1, y)].t === T.ROAD) m |= 2;
    if (C.inb(x, y + 1) && w.tiles[C.idx(x, y + 1)].t === T.ROAD) m |= 4;
    if (C.inb(x - 1, y) && w.tiles[C.idx(x - 1, y)].t === T.ROAD) m |= 8;
    return m;
  }

  function sky(ctx, W, H, dayT, night) {
    var top, bot;
    if (night) {
      top = [6, 8, 18]; bot = [12, 18, 32];
    } else if (dayT < 0.32 || dayT > 0.72) {
      top = [42, 28, 58]; bot = [90, 48, 40];
    } else {
      top = [28, 52, 78]; bot = [18, 36, 44];
    }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (night) {
      ctx.fillStyle = 'rgba(255,255,220,.55)';
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.12, 3, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.2, H * 0.08, 1.4, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(W * 0.35, H * 0.16, 1.1, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,110,.12)';
      ctx.beginPath(); ctx.arc(W * 0.82, H * 0.12, 18, 0, 6.3); ctx.fill();
    }
  }

  function drawTile(ctx, w, x, y, night, tnow, hover, cursors) {
    var tl = w.tiles[C.idx(x, y)];
    var p = iso(x, y);
    var sx = p.sx, sy = p.sy;
    var gnd;
    if (tl.t === T.WATER) {
      var sh = 0.5 + 0.5 * Math.sin(tnow / 420 + x * 0.7 + y * 0.5);
      gnd = mix(night ? PAL.waterNight : PAL.water, PAL.waterHi, sh * (night ? 0.25 : 0.45));
      diamond(ctx, sx, sy, gnd, 0);
      diamond(ctx, sx, sy, mix(gnd, [180, 220, 255], 0.18), 4);
      return;
    }
    if (tl.t === T.GRASS) {
      var hsh = C.hash(x, y, w.seed);
      gnd = mix(night ? PAL.grassNight : PAL.grass, PAL.grassHi, hsh * 0.45);
      diamond(ctx, sx, sy, gnd, 0);
      return;
    }
    // ground under buildings
    gnd = night ? mix(PAL.dirt, PAL.night, 0.35) : PAL.dirt;
    diamond(ctx, sx, sy, gnd, 0);

    if (tl.t === T.ROAD) {
      var jam = Math.min(1, (tl.k || 0) / 180);
      var rc = mix(PAL.road, PAL.roadJam, jam);
      if (night) rc = mix(rc, PAL.night, 0.18);
      diamond(ctx, sx, sy, mix(rc, [20, 20, 28], 0.25), 0);
      diamond(ctx, sx, sy, rc, 1);
      diamond(ctx, sx, sy, mix(rc, PAL.roadHi, 0.55), 4);
      var m = roadMask(w, x, y);
      ctx.strokeStyle = jam > 0.55 ? 'rgba(255,140,70,.8)' : rgb(PAL.roadLine);
      ctx.globalAlpha = night ? 0.45 : 0.7;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (m & 1) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - TH / 2 + 2); }
      if (m & 4) { ctx.moveTo(sx, sy); ctx.lineTo(sx, sy + TH / 2 - 2); }
      if (m & 2) { ctx.moveTo(sx, sy); ctx.lineTo(sx + TW / 2 - 2, sy); }
      if (m & 8) { ctx.moveTo(sx, sy); ctx.lineTo(sx - TW / 2 + 2, sy); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    if (tl.t === T.LINE) {
      diamond(ctx, sx, sy, night ? PAL.grassNight : PAL.grass, 0);
      ctx.strokeStyle = rgb(PAL.line);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx - 8, sy + 2);
      ctx.lineTo(sx + 8, sy - 6);
      ctx.stroke();
      ctx.fillStyle = rgb(PAL.line);
      ctx.fillRect(sx - 1.5, sy - 10, 3, 12);
      return;
    }
    if (tl.t === T.PARK) {
      diamond(ctx, sx, sy, mix(PAL.park, PAL.night, night ? 0.4 : 0), 0);
      tree(ctx, sx - 4, sy + 2, 7, night);
      tree(ctx, sx + 5, sy + 1, 9, night);
      tree(ctx, sx, sy - 2, 6, night);
      return;
    }
    if (tl.t === T.PLANT) {
      diamond(ctx, sx, sy, [50, 52, 58], 0);
      cooling(ctx, sx - 6, sy, 16, night, tnow);
      cooling(ctx, sx + 6, sy + 2, 13, night, tnow + 200);
      return;
    }
    if (tl.t === T.PUMP) {
      diamond(ctx, sx, sy, mix(PAL.pump, PAL.night, night ? 0.3 : 0), 0);
      box(ctx, sx, sy, 10, [90, 140, 180], [40, 70, 100], [60, 96, 130]);
      ctx.fillStyle = rgb([160, 200, 230]);
      ctx.beginPath(); ctx.arc(sx, sy - 16, 5, 0, 6.3); ctx.fill();
      return;
    }
    if (C.isZone(tl.t)) {
      var zc = tl.t === T.HOME ? PAL.zoneH : tl.t === T.SHOP ? PAL.zoneS : PAL.zoneW;
      diamond(ctx, sx, sy, mix(zc, PAL.night, night ? 0.45 : 0.05), 1);
      if (tl.s === 0 && !tl.a) {
        ctx.globalAlpha = 0.55;
        diamond(ctx, sx, sy, zc, 5);
        ctx.globalAlpha = 1;
        return;
      }
      var h = 11 + tl.s * 11 + (tl.t === T.WORK ? 6 : 0);
      var top, left, right, win;
      if (tl.a) {
        top = PAL.abandonTop; left = PAL.abandon; right = mix(PAL.abandon, [20, 16, 12], 0.3);
        win = [40, 36, 32];
      } else if (tl.t === T.HOME) {
        top = PAL.homeTop; left = PAL.homeSide; right = PAL.home; win = PAL.win;
      } else if (tl.t === T.SHOP) {
        top = PAL.shopTop; left = PAL.shopSide; right = PAL.shop; win = PAL.winShop;
      } else {
        top = PAL.workTop; left = PAL.workSide; right = PAL.work; win = PAL.win;
      }
      if (night && !tl.a) {
        top = mix(top, PAL.night, 0.2);
        left = mix(left, PAL.night, 0.35);
        right = mix(right, PAL.night, 0.25);
      }
      box(ctx, sx, sy, h, top, left, right);
      var lit = night && tl.p && !tl.a && tl.s > 0;
      windows(ctx, sx, sy, h, 2 + tl.s * 3, lit, win, true);
      windows(ctx, sx, sy, h, 1 + tl.s * 2, lit, win, false);
      if (lit) {
        ctx.fillStyle = 'rgba(255,210,100,' + (0.07 + tl.s * 0.03) + ')';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4, 14, 7, 0, 0, 6.3);
        ctx.fill();
      }
      if (!tl.p && tl.s > 0) {
        ctx.fillStyle = 'rgba(220,60,50,.85)';
        ctx.fillRect(sx - 2, sy - h - 8, 4, 4);
      }
      return;
    }
  }

  function tree(ctx, x, y, r, night) {
    ctx.fillStyle = rgb(mix(PAL.tree, PAL.night, night ? 0.4 : 0));
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 0.4, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = rgb(mix(PAL.treeHi, PAL.night, night ? 0.35 : 0));
    ctx.beginPath(); ctx.arc(x, y - r * 0.55, r * 0.7, 0, 6.3); ctx.fill();
  }
  function cooling(ctx, x, y, h, night, tnow) {
    var top = mix(PAL.plantHi, PAL.night, night ? 0.3 : 0);
    var side = mix(PAL.plant, PAL.night, night ? 0.35 : 0);
    ctx.fillStyle = rgb(side);
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x - 3, y - h);
    ctx.lineTo(x + 3, y - h);
    ctx.lineTo(x + 5, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgb(top);
    ctx.beginPath(); ctx.ellipse(x, y - h, 3.2, 1.6, 0, 0, 6.3); ctx.fill();
    var puff = ((tnow / 18) % 40);
    ctx.fillStyle = 'rgba(200,210,220,' + (0.22 - puff / 280) + ')';
    ctx.beginPath(); ctx.arc(x + Math.sin(tnow / 400) * 2, y - h - 6 - puff * 0.35, 3 + puff * 0.08, 0, 6.3); ctx.fill();
  }

  function drawPeople(ctx, agents, night) {
    var i, a, p, col;
    for (i = 0; i < agents.length; i++) {
      a = agents[i];
      p = iso(a.x, a.y);
      col = a.k === 'work' ? PAL.workTop : a.k === 'shop' ? PAL.shopTop : PAL.homeTop;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy + 3, 3.4, 1.6, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.sx, p.sy - 3.2, 3.1, 0, 6.3); ctx.fill();
      ctx.fillStyle = rgb(night ? mix(col, [255, 230, 160], 0.45) : col);
      ctx.beginPath(); ctx.arc(p.sx, p.sy - 3.2, 2.4, 0, 6.3); ctx.fill();
    }
  }

  function drawCursors(ctx, list, meId) {
    var i, c, p;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (!c || c.id === meId) continue;
      if (!C.inb(c.x, c.y)) continue;
      p = iso(c.x + 0.5, c.y + 0.5);
      ctx.strokeStyle = 'rgba(255,210,90,.95)';
      ctx.lineWidth = 1.6;
      diamondStroke(ctx, iso(c.x, c.y).sx, iso(c.x, c.y).sy);
      ctx.fillStyle = 'rgba(255,210,90,.95)';
      ctx.font = 'bold 11px system-ui,sans-serif';
      ctx.fillText(c.name || 'mayor', p.sx + 8, p.sy - 10);
    }
  }
  function diamondStroke(ctx, sx, sy) {
    var w = TW / 2, h = TH / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - h);
    ctx.lineTo(sx + w, sy);
    ctx.lineTo(sx, sy + h);
    ctx.lineTo(sx - w, sy);
    ctx.closePath();
    ctx.stroke();
  }

  function drawHover(ctx, x, y) {
    if (!C.inb(x, y)) return;
    var p = iso(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 1.4;
    diamondStroke(ctx, p.sx, p.sy);
  }

  function paint(ctx, w, cam, opts) {
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var dayT = opts.dayT;
    var night = dayT < 0.22 || dayT > 0.78;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    sky(ctx, W, H, dayT, night);
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.x, cam.y);
    var x, y;
    for (y = 0; y < C.N; y++) for (x = 0; x < C.N; x++) {
      drawTile(ctx, w, x, y, night, opts.now, opts.hover, opts.cursors);
    }
    if (opts.agents) drawPeople(ctx, opts.agents, night);
    if (opts.hover) drawHover(ctx, opts.hover.x, opts.hover.y);
    if (opts.cursors) drawCursors(ctx, opts.cursors, opts.meId);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function origin(canvas, s) {
    // center the map in the canvas
    var ws = worldSize();
    var cx = (0 - (C.N - 1)) * (TW / 2); // left-most
    // iso of (0,N-1) is leftmost, (N-1,0) rightmost
    var left = iso(0, C.N - 1).sx - TW;
    var top = iso(0, 0).sy - 40;
    return {
      x: canvas.width / 2 - iso(C.N / 2, C.N / 2).sx * s,
      y: canvas.height * 0.38 - iso(C.N / 2, C.N / 2).sy * s
    };
  }

  root.CiviclockRender = {
    TW: TW, TH: TH, iso: iso, pickTile: pickTile, paint: paint, origin: origin,
    worldSize: worldSize, PAL: PAL
  };
})(typeof window !== 'undefined' ? window : globalThis);
