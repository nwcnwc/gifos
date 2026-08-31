/*
 * Shape codes match shapez.io: four quadrants TR, BR, BL, TL.
 * Each quadrant is a type letter (C circle, R rectangle, S star, W windmill)
 * plus a colour letter (u uncolored, r g b y p c w), or "--" if empty.
 * "CuCuCuCu" is a full uncolored circle. "----CuCu" is the left half.
 *
 * Colours are the published shapez hex codes (src/js/game/colors.js).
 */
(function (root) {
  'use strict';

  var TYPES = { C: 1, R: 1, S: 1, W: 1 };
  var COL = {
    u: '#aaaaaa',
    r: '#ff666a',
    g: '#78ff66',
    b: '#66a7ff',
    y: '#fcf52a',
    p: '#dd66ff',
    c: '#00fcff',
    w: '#ffffff'
  };
  var COL_INK = {
    u: '#6e6e78',
    r: '#a83338',
    g: '#2d8a38',
    b: '#2d5a9a',
    y: '#8a7a10',
    p: '#7a308a',
    c: '#1a7a80',
    w: '#6a6a72'
  };

  function parse(code) {
    if (!code) return [null, null, null, null];
    var q = [null, null, null, null];
    var i, a, b;
    for (i = 0; i < 4; i++) {
      a = code.charAt(i * 2);
      b = code.charAt(i * 2 + 1);
      if (!a || a === '-') continue;
      if (!TYPES[a]) continue;
      q[i] = { k: a, c: COL[b] ? b : 'u' };
    }
    return q;
  }

  function serialize(q) {
    var s = '', i, p;
    for (i = 0; i < 4; i++) {
      p = q[i];
      s += p && p.k ? (p.k + (p.c || 'u')) : '--';
    }
    return s === '--------' ? '' : s;
  }

  function empty(code) {
    return !code || code === '--------';
  }

  function cut(code) {
    var q = parse(code);
    return {
      left: serialize([null, null, q[2], q[3]]),
      right: serialize([q[0], q[1], null, null])
    };
  }

  function rotateCW(code) {
    var q = parse(code);
    return serialize([q[3], q[0], q[1], q[2]]);
  }

  function rotateCCW(code) {
    var q = parse(code);
    return serialize([q[1], q[2], q[3], q[0]]);
  }

  function paint(code, color) {
    if (!COL[color] || color === 'u') return code;
    var q = parse(code), i;
    for (i = 0; i < 4; i++) {
      if (q[i]) q[i].c = color;
    }
    return serialize(q);
  }

  function mixColor(a, b) {
    var bit = { r: 1, g: 2, y: 3, b: 4, p: 5, c: 6, w: 7, u: 0 };
    var inv = ['u', 'r', 'g', 'y', 'b', 'p', 'c', 'w'];
    return inv[(bit[a] || 0) | (bit[b] || 0)] || 'u';
  }

  function hexOf(c) { return COL[c] || COL.u; }
  function inkOf(c) { return COL_INK[c] || COL_INK.u; }

  function drawKind(ctx, piece, r) {
    var k = piece.k;
    ctx.fillStyle = hexOf(piece.c);
    ctx.strokeStyle = inkOf(piece.c);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (k === 'C') {
      ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    } else if (k === 'R') {
      var s = r * 0.86;
      ctx.rect(-s, -s, s * 2, s * 2);
    } else if (k === 'S') {
      var i, a, rr;
      for (i = 0; i < 8; i++) {
        a = -Math.PI / 2 + i * Math.PI / 4;
        rr = (i % 2 === 0) ? r * 0.95 : r * 0.42;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r * 0.92, -Math.PI / 2, 0, false);
      ctx.lineTo(r * 0.28, 0);
      ctx.lineTo(0, -r * 0.28);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }

  function drawShape(ctx, code, x, y, size) {
    if (empty(code)) return;
    var q = parse(code);
    var r = size / 2;
    var boxes = [
      [0, -r, r, r],
      [0, 0, r, r],
      [-r, 0, r, r],
      [-r, -r, r, r]
    ];
    var i, b;
    ctx.save();
    ctx.translate(x, y);
    for (i = 0; i < 4; i++) {
      if (!q[i]) continue;
      ctx.save();
      ctx.beginPath();
      b = boxes[i];
      ctx.rect(b[0], b[1], b[2], b[3]);
      ctx.clip();
      drawKind(ctx, q[i], r);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(20,22,28,0.18)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.stroke();
    ctx.restore();
  }

  function drawColorBlob(ctx, color, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = hexOf(color);
    ctx.strokeStyle = inkOf(color);
    ctx.lineWidth = Math.max(1.2, size * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(-size * 0.12, -size * 0.12, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawItem(ctx, item, x, y, size) {
    if (!item) return;
    if (item.typ === 'c') drawColorBlob(ctx, item.c, x, y, size);
    else drawShape(ctx, item.code, x, y, size);
  }

  function itemKey(item) {
    if (!item) return '';
    return item.typ === 'c' ? ('*' + item.c) : item.code;
  }

  function fromKey(key) {
    if (!key) return null;
    if (key.charAt(0) === '*') return { typ: 'c', c: key.charAt(1) };
    return { typ: 's', code: key };
  }

  function fullUncolored(kind) {
    return kind + 'u' + kind + 'u' + kind + 'u' + kind + 'u';
  }

  root.SZ = {
    COL: COL,
    parse: parse,
    serialize: serialize,
    empty: empty,
    cut: cut,
    rotateCW: rotateCW,
    rotateCCW: rotateCCW,
    paint: paint,
    mixColor: mixColor,
    hexOf: hexOf,
    inkOf: inkOf,
    drawShape: drawShape,
    drawColorBlob: drawColorBlob,
    drawItem: drawItem,
    itemKey: itemKey,
    fromKey: fromKey,
    fullUncolored: fullUncolored
  };
})(window);
