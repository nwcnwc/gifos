/*
 * World renderer. Floor, patches, belts, machines, items, hub, ghosts.
 */
(function (root) {
  'use strict';

  var TILE, DX, DY, isHub, SZ;

  var FLOOR = '#d5d9e2';
  var FLOOR2 = '#cfd4de';
  var GRID = 'rgba(80,90,110,0.18)';
  var HUB_A = '#2f6f93';
  var HUB_B = '#3d8bb3';

  var BLDG = {
    belt: { fill: '#8ea0b8', ink: '#445366' },
    miner: { fill: '#e6c14a', ink: '#7a5a12' },
    cutter: { fill: '#e08a3c', ink: '#7a3e10' },
    rotator: { fill: '#6fcf7a', ink: '#2a6a34' },
    painter: { fill: '#e06ab0', ink: '#7a2458' },
    trash: { fill: '#4a5160', ink: '#1e222c' }
  };

  function bind() {
    TILE = root.SZConst.TILE;
    DX = root.SZConst.DX;
    DY = root.SZConst.DY;
    isHub = root.SZConst.isHub;
    SZ = root.SZ;
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function tileCenter(g, x, y, cw, ch) {
    var z = g.zoom * TILE;
    return {
      x: (x + 0.5 - g.camX) * z + cw / 2,
      y: (y + 0.5 - g.camY) * z + ch / 2,
      z: z
    };
  }

  function incomingDirs(g, x, y, outDir) {
    var d, nx, ny, c, list = [];
    for (d = 0; d < 4; d++) {
      if (d === outDir) continue;
      nx = x - DX[d];
      ny = y - DY[d];
      c = g.cell(nx, ny);
      if (c && c.k === 'belt' && c.r === d) list.push(d);
      if (c && (c.k === 'miner' || c.k === 'rotator' || c.k === 'painter') && c.r === d) list.push(d);
      if (c && c.k === 'cutter') {
        if (root.SZGame.prototype._leftDir(c.r) === d || root.SZGame.prototype._rightDir(c.r) === d) list.push(d);
      }
    }
    return list;
  }

  function drawFloor(ctx, g, cw, ch) {
    var z = g.zoom * TILE;
    var x0 = Math.floor(g.camX - cw / (2 * z)) - 1;
    var y0 = Math.floor(g.camY - ch / (2 * z)) - 1;
    var x1 = Math.ceil(g.camX + cw / (2 * z)) + 1;
    var y1 = Math.ceil(g.camY + ch / (2 * z)) + 1;
    var x, y, p, col, t;
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 0, cw, ch);
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        t = tileCenter(g, x, y, cw, ch);
        if ((x + y) & 1) {
          ctx.fillStyle = FLOOR2;
          ctx.fillRect(t.x - t.z / 2, t.y - t.z / 2, t.z, t.z);
        }
        p = g.resourceAt(x, y);
        if (p) {
          if (p === 'r' || p === 'g' || p === 'b') {
            ctx.globalAlpha = 0.22;
            SZ.drawColorBlob(ctx, p, t.x, t.y, t.z * 0.85);
            ctx.globalAlpha = 1;
          } else {
            ctx.globalAlpha = 0.28;
            SZ.drawShape(ctx, SZ.fullUncolored(p), t.x, t.y, t.z * 0.78);
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (x = x0; x <= x1 + 1; x++) {
      t = tileCenter(g, x, y0, cw, ch);
      ctx.moveTo(t.x - t.z / 2, 0);
      ctx.lineTo(t.x - t.z / 2, ch);
    }
    for (y = y0; y <= y1 + 1; y++) {
      t = tileCenter(g, x0, y, cw, ch);
      ctx.moveTo(0, t.y - t.z / 2);
      ctx.lineTo(cw, t.y - t.z / 2);
    }
    ctx.stroke();
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  function drawHub(ctx, g, cw, ch) {
    var z = g.zoom * TILE;
    var t = tileCenter(g, 0, 0, cw, ch);
    var s = z * 3;
    ctx.save();
    ctx.translate(t.x, t.y);
    roundRect(ctx, -s / 2, -s / 2, s, s, z * 0.18);
    var grd = ctx.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    grd.addColorStop(0, HUB_A);
    grd.addColorStop(1, HUB_B);
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = '#1c4a66';
    ctx.lineWidth = Math.max(2, z * 0.06);
    ctx.stroke();
    roundRect(ctx, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, z * 0.1);
    ctx.fillStyle = 'rgba(10, 24, 36, 0.45)';
    ctx.fill();
    var goal = g.goal();
    if (goal) SZ.drawShape(ctx, goal.goal, 0, -z * 0.08, z * 1.35);
    ctx.fillStyle = '#e8f6ff';
    ctx.font = 'bold ' + Math.max(10, z * 0.28) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var need = goal ? goal.need : 0;
    ctx.fillText(g.delivered + ' / ' + need, 0, z * 0.72);
    ctx.restore();
  }

  function drawChevron(ctx, x, y, dir, z, t) {
    var ang = dir * Math.PI / 2;
    var off = ((t * 0.9) % 1) - 0.5;
    ctx.save();
    ctx.translate(x + Math.cos(ang) * off * z * 0.55, y + Math.sin(ang) * off * z * 0.55);
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.2, z * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-z * 0.12, -z * 0.12);
    ctx.lineTo(z * 0.12, 0);
    ctx.lineTo(-z * 0.12, z * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  function drawBelt(ctx, g, x, y, c, cw, ch) {
    var t = tileCenter(g, x, y, cw, ch);
    var z = t.z;
    var col = BLDG.belt;
    ctx.save();
    roundRect(ctx, t.x - z * 0.46, t.y - z * 0.46, z * 0.92, z * 0.92, z * 0.12);
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.ink;
    ctx.lineWidth = Math.max(1, z * 0.04);
    ctx.stroke();
    var lane = z * 0.28;
    ctx.fillStyle = '#6b7c94';
    var d = c.r;
    var ins = incomingDirs(g, x, y, d);
    ctx.save();
    ctx.translate(t.x, t.y);
    if (ins.length === 1 && ((ins[0] + 2) & 3) !== d && ins[0] !== d) {
      ctx.rotate(ins[0] * Math.PI / 2);
      roundRect(ctx, -lane / 2, -lane / 2, z * 0.46 + lane / 2, lane, lane / 2);
      ctx.fill();
      ctx.rotate(-ins[0] * Math.PI / 2 + d * Math.PI / 2);
      roundRect(ctx, -lane / 2, -lane / 2, z * 0.46 + lane / 2, lane, lane / 2);
      ctx.fill();
    } else {
      ctx.rotate(d * Math.PI / 2);
      roundRect(ctx, -z * 0.46, -lane / 2, z * 0.92, lane, lane / 2);
      ctx.fill();
    }
    ctx.restore();
    drawChevron(ctx, t.x, t.y, d, z, g.time + x * 0.17 + y * 0.13);
    ctx.restore();
  }

  function ioArrow(ctx, t, dir, color, inset) {
    var z = t.z;
    var ang = dir * Math.PI / 2;
    var x = t.x + Math.cos(ang) * z * (inset || 0.42);
    var y = t.y + Math.sin(ang) * z * (inset || 0.42);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(z * 0.1, 0);
    ctx.lineTo(-z * 0.08, -z * 0.1);
    ctx.lineTo(-z * 0.08, z * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMachine(ctx, g, x, y, c, cw, ch) {
    var t = tileCenter(g, x, y, cw, ch);
    var z = t.z;
    var col = BLDG[c.k] || BLDG.miner;
    var m = g.mach[x + ',' + y];
    ctx.save();
    roundRect(ctx, t.x - z * 0.44, t.y - z * 0.44, z * 0.88, z * 0.88, z * 0.14);
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.ink;
    ctx.lineWidth = Math.max(1.4, z * 0.05);
    ctx.stroke();
    ctx.translate(t.x, t.y);

    if (c.k === 'miner') {
      ctx.rotate(g.time * 3);
      ctx.strokeStyle = col.ink;
      ctx.lineWidth = Math.max(1.5, z * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.18, 0, Math.PI * 1.4);
      ctx.stroke();
      ctx.rotate(-g.time * 3);
      ctx.fillStyle = col.ink;
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.07, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.k === 'cutter') {
      ctx.strokeStyle = '#fff3e6';
      ctx.lineWidth = Math.max(1.2, z * 0.05);
      ctx.beginPath();
      ctx.moveTo(0, -z * 0.22);
      ctx.lineTo(0, z * 0.22);
      ctx.stroke();
      ctx.fillStyle = '#fff3e6';
      ctx.beginPath();
      ctx.moveTo(-z * 0.04, 0);
      ctx.lineTo(-z * 0.2, -z * 0.1);
      ctx.lineTo(-z * 0.2, z * 0.1);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(z * 0.04, 0);
      ctx.lineTo(z * 0.2, -z * 0.1);
      ctx.lineTo(z * 0.2, z * 0.1);
      ctx.fill();
    } else if (c.k === 'rotator') {
      ctx.strokeStyle = '#e8ffe8';
      ctx.lineWidth = Math.max(1.5, z * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.2, -0.4, Math.PI * 1.4);
      ctx.stroke();
      ctx.fillStyle = '#e8ffe8';
      ctx.beginPath();
      ctx.moveTo(z * 0.2, 0);
      ctx.lineTo(z * 0.08, -z * 0.14);
      ctx.lineTo(z * 0.32, -z * 0.08);
      ctx.fill();
    } else if (c.k === 'painter') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-z * 0.08, z * 0.04, z * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a2458';
      ctx.fillRect(z * 0.0, -z * 0.22, z * 0.08, z * 0.28);
      ctx.beginPath();
      ctx.moveTo(z * 0.04, -z * 0.22);
      ctx.lineTo(z * 0.2, -z * 0.08);
      ctx.lineTo(-z * 0.12, -z * 0.08);
      ctx.closePath();
      ctx.fill();
    } else if (c.k === 'trash') {
      ctx.fillStyle = '#1a1d24';
      ctx.beginPath();
      ctx.arc(0, 0, z * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a909c';
      ctx.lineWidth = Math.max(1.2, z * 0.05);
      ctx.stroke();
    }
    ctx.restore();

    if (c.k === 'miner' || c.k === 'rotator') {
      ioArrow(ctx, t, c.r, '#fff', 0.44);
    } else if (c.k === 'cutter') {
      ioArrow(ctx, t, (c.r + 2) & 3, 'rgba(255,255,255,0.9)', 0.44);
      ioArrow(ctx, t, (c.r + 3) & 3, '#fff3c0', 0.44);
      ioArrow(ctx, t, (c.r + 1) & 3, '#fff3c0', 0.44);
    } else if (c.k === 'painter') {
      ioArrow(ctx, t, (c.r + 2) & 3, '#fff', 0.44);
      ioArrow(ctx, t, (c.r + 1) & 3, SZ.hexOf('r'), 0.44);
      ioArrow(ctx, t, c.r, '#fff', 0.44);
    }

    if (m && (c.k === 'cutter' || c.k === 'rotator' || c.k === 'painter') && m.busy) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, z * 0.4, -Math.PI / 2, -Math.PI / 2 + (m.work || 0) * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function itemPos(g, it, cw, ch) {
    var t = tileCenter(g, it.x, it.y, cw, ch);
    var z = t.z;
    var c = g.cell(it.x, it.y);
    var dir = (c && c.r != null) ? c.r : (it.dir || 0);
    var p = it.p - 0.5;
    return {
      x: t.x + DX[dir] * p * z,
      y: t.y + DY[dir] * p * z,
      z: z
    };
  }

  function drawItems(ctx, g, cw, ch) {
    var i, it, p;
    for (i = 0; i < g.items.length; i++) {
      it = g.items[i];
      p = itemPos(g, it, cw, ch);
      SZ.drawItem(ctx, it.item, p.x, p.y, p.z * 0.62);
    }
  }

  function drawGhost(ctx, g, hx, hy, kind, rot, cw, ch) {
    if (kind === 'hand' || kind === 'erase') {
      var t0 = tileCenter(g, hx, hy, cw, ch);
      ctx.save();
      ctx.strokeStyle = kind === 'erase' ? 'rgba(200,40,40,0.85)' : 'rgba(40,80,140,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(t0.x - t0.z / 2 + 1, t0.y - t0.z / 2 + 1, t0.z - 2, t0.z - 2);
      ctx.restore();
      return;
    }
    var ok = g.canPlace(hx, hy, kind) && !g.cell(hx, hy);
    if (kind === 'erase') ok = !!g.cell(hx, hy);
    var t = tileCenter(g, hx, hy, cw, ch);
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (kind === 'belt') drawBelt(ctx, { zoom: g.zoom, camX: g.camX, camY: g.camY, time: g.time, cell: g.cell.bind(g) }, hx, hy, { k: 'belt', r: rot }, cw, ch);
    else drawMachine(ctx, g, hx, hy, { k: kind, r: rot }, cw, ch);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? 'rgba(40,160,80,0.9)' : 'rgba(200,40,40,0.95)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(t.x - t.z / 2 + 1.5, t.y - t.z / 2 + 1.5, t.z - 3, t.z - 3);
    ctx.restore();
  }

  function drawCursors(ctx, g, cursors, meId, cw, ch) {
    var i, c, t;
    if (!cursors) return;
    for (i = 0; i < cursors.length; i++) {
      c = cursors[i];
      if (!c || c.id === meId) continue;
      t = tileCenter(g, c.x, c.y, cw, ch);
      ctx.save();
      ctx.strokeStyle = c.color || '#5ad';
      ctx.fillStyle = c.color || '#5ad';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - t.z / 2, t.y - t.z / 2, t.z, t.z);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(c.name || 'friend', t.x, t.y - t.z / 2 - 3);
      ctx.restore();
    }
  }

  function drawParticles(ctx, g, cw, ch) {
    var i, p, t, a;
    t = tileCenter(g, 0, 0, cw, ch);
    for (i = 0; i < g.particles.length; i++) {
      p = g.particles[i];
      a = Math.max(0, p.life / 0.45);
      ctx.globalAlpha = a;
      SZ.drawItem(ctx, p.item, t.x + p.x * t.z * 0.04, t.y + p.y * t.z * 0.04, t.z * 0.4 * a);
      ctx.globalAlpha = 1;
    }
  }

  function render(ctx, g, cw, ch, opts) {
    bind();
    opts = opts || {};
    ctx.clearRect(0, 0, cw, ch);
    var vis = drawFloor(ctx, g, cw, ch);
    var x, y, c;
    for (y = vis.y0; y <= vis.y1; y++) {
      for (x = vis.x0; x <= vis.x1; x++) {
        if (isHub(x, y)) continue;
        c = g.cell(x, y);
        if (!c) continue;
        if (c.k === 'belt') drawBelt(ctx, g, x, y, c, cw, ch);
        else drawMachine(ctx, g, x, y, c, cw, ch);
      }
    }
    drawHub(ctx, g, cw, ch);
    drawItems(ctx, g, cw, ch);
    drawParticles(ctx, g, cw, ch);
    if (opts.hover) drawGhost(ctx, g, opts.hover.x, opts.hover.y, opts.tool, opts.rot, cw, ch);
    drawCursors(ctx, g, opts.cursors, opts.meId, cw, ch);
  }

  function drawToolbarIcon(ctx, kind, w, locked) {
    ctx.clearRect(0, 0, w, w);
    ctx.save();
    ctx.translate(w / 2, w / 2);
    var z = w * 0.85;
    var fakeG = { zoom: z / TILE, camX: 0.5, camY: 0.5, time: 0.4, mach: {}, cell: function () { return null; } };
    ctx.restore();
    if (kind === 'hand') {
      ctx.fillStyle = locked ? '#889' : '#2a3344';
      ctx.font = (w * 0.55) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✚', w / 2, w / 2 + 1);
      return;
    }
    if (kind === 'erase') {
      ctx.fillStyle = locked ? '#889' : '#a33';
      ctx.font = (w * 0.5) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⌫', w / 2, w / 2);
      return;
    }
    var g = {
      zoom: (w * 0.92) / TILE,
      camX: 0.5,
      camY: 0.5,
      time: 0.35,
      mach: {},
      cell: function () { return null; },
      resourceAt: function () { return null; }
    };
    ctx.save();
    if (locked) ctx.globalAlpha = 0.35;
    if (kind === 'belt') drawBelt(ctx, g, 0, 0, { k: 'belt', r: 0 }, w, w);
    else drawMachine(ctx, g, 0, 0, { k: kind, r: 0 }, w, w);
    ctx.restore();
  }

  root.SZDraw = {
    render: render,
    drawToolbarIcon: drawToolbarIcon,
    tileCenter: tileCenter,
    BLDG: BLDG
  };
})(window);
