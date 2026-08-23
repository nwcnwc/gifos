// Hex Chess — Gliński board. Computer thinks here. A friend sits the other colour.
// Invite is OS chrome. Host writes the board; a player publishes an intended move.
(function () {
  'use strict';
  var C = window.HEX;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var HEX_FILL = ['#f3d5a0', '#d18a32', '#7a4316'];
  var HEX_HI = ['#fbe7c2', '#e0a04a', '#8e5220'];
  var HEX_STROKE = 'rgba(40, 18, 6, .55)';
  var state = {
    mode: 'cpu', color: 'white',
    s: null, hist: [], over: false, thinking: false, sel: null, flip: false,
    lastSan: ''
  };
  var db = null;
  try { if (window.gifos) db = gifos.db('save'); } catch (e) {}

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'statusline' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    state.mode = b.getAttribute('data-mode');
    var cpu = state.mode === 'cpu';
    $('cpuOpts').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });
  $('colorSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    state.color = b.getAttribute('data-color');
    $('cpuNote').textContent = state.color === 'white'
      ? 'You play white and go first. The computer plays black. It thinks on this device.'
      : 'You play black. The computer plays white, and goes first.';
  });

  function layout(cssW, cssH) {
    var halfW = 1.5 * C.N + 1.55;
    var halfH = Math.sqrt(3) * (C.N + 1.05);
    var pad = Math.max(8, Math.min(cssW, cssH) * 0.02);
    var size = Math.min((cssW - 2 * pad) / (2 * halfW),
                        (cssH - 2 * pad) / (2 * halfH));
    return { size: size, cx: cssW / 2, cy: cssH / 2 };
  }
  function screenOf(g, q, r, flip) {
    if (flip) { q = -q; r = -r; }
    var p = C.pixel(q, r, g.size);
    return { x: g.cx + p.x, y: g.cy - p.y };
  }
  function hexPath(ctx, x, y, size) {
    var i, a;
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      a = Math.PI / 3 * i;
      if (i === 0) ctx.moveTo(x + size * Math.cos(a), y + size * Math.sin(a));
      else ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a));
    }
    ctx.closePath();
  }
  function resizeCanvas(canvas) {
    var cssW = canvas.clientWidth || 448;
    var cssH = canvas.clientHeight || Math.round(cssW * 700 / 640);
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { cssW: cssW, cssH: cssH };
  }
  function hitHex(canvas, ev, flip) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0]
          : (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
    var x = t.clientX - rect.left, y = t.clientY - rect.top;
    var g = layout(rect.width, rect.height);
    var lx = x - g.cx, ly = g.cy - y;
    var h = C.atPixel(lx, ly, g.size);
    if (!h) return null;
    if (flip) return { q: -h.q, r: -h.r };
    return h;
  }

  function piecePath(ctx, t) {
    ctx.beginPath();
    if (t === C.P) {
      ctx.moveTo(-6.2, 8.6); ctx.lineTo(6.2, 8.6); ctx.lineTo(5.2, 6.6);
      ctx.quadraticCurveTo(3.2, 5.2, 3.0, 2.4);
      ctx.quadraticCurveTo(5.2, 0.6, 3.4, -1.2);
      ctx.quadraticCurveTo(2.2, -4.8, 0, -5.4);
      ctx.quadraticCurveTo(-2.2, -4.8, -3.4, -1.2);
      ctx.quadraticCurveTo(-5.2, 0.6, -3.0, 2.4);
      ctx.quadraticCurveTo(-3.2, 5.2, -5.2, 6.6);
      ctx.closePath();
    } else if (t === C.ROOK) {
      ctx.moveTo(-7.2, 8.8); ctx.lineTo(7.2, 8.8); ctx.lineTo(6.0, 6.4);
      ctx.lineTo(6.0, 1.6); ctx.lineTo(7.4, 1.6); ctx.lineTo(7.4, -5.8);
      ctx.lineTo(4.6, -5.8); ctx.lineTo(4.6, -3.6); ctx.lineTo(1.6, -3.6);
      ctx.lineTo(1.6, -5.8); ctx.lineTo(-1.6, -5.8); ctx.lineTo(-1.6, -3.6);
      ctx.lineTo(-4.6, -3.6); ctx.lineTo(-4.6, -5.8); ctx.lineTo(-7.4, -5.8);
      ctx.lineTo(-7.4, 1.6); ctx.lineTo(-6.0, 1.6); ctx.lineTo(-6.0, 6.4);
      ctx.closePath();
    } else if (t === C.NIGHT) {
      ctx.moveTo(-6.8, 8.8); ctx.lineTo(6.2, 8.8); ctx.lineTo(5.0, 6.6);
      ctx.lineTo(3.2, 4.4); ctx.lineTo(3.4, 1.0);
      ctx.lineTo(7.6, -0.8); ctx.lineTo(8.6, -3.0); ctx.lineTo(6.2, -2.6);
      ctx.lineTo(5.0, -5.2); ctx.lineTo(3.0, -9.0); ctx.lineTo(0.6, -8.4);
      ctx.lineTo(1.4, -5.6); ctx.lineTo(-1.6, -6.2);
      ctx.lineTo(-4.2, -3.0); ctx.lineTo(-6.2, 0.2);
      ctx.lineTo(-6.8, 3.4); ctx.lineTo(-5.4, 6.4);
      ctx.closePath();
    } else if (t === C.BISHOP) {
      ctx.moveTo(-6.2, 8.8); ctx.lineTo(6.2, 8.8); ctx.lineTo(5.0, 6.8);
      ctx.lineTo(3.4, 6.8); ctx.quadraticCurveTo(3.6, 3.2, 3.0, 0.6);
      ctx.quadraticCurveTo(5.4, -2.8, 2.2, -6.6);
      ctx.arc(0, -7.6, 2.4, 0.9, Math.PI - 0.9, true);
      ctx.quadraticCurveTo(-5.4, -2.8, -3.0, 0.6);
      ctx.quadraticCurveTo(-3.6, 3.2, -3.4, 6.8);
      ctx.lineTo(-5.0, 6.8);
      ctx.closePath();
    } else if (t === C.QUEEN) {
      ctx.moveTo(-7.0, 8.8); ctx.lineTo(7.0, 8.8); ctx.lineTo(5.6, 6.4);
      ctx.lineTo(6.2, 2.2);
      ctx.lineTo(8.2, -4.6); ctx.lineTo(4.4, -1.8);
      ctx.lineTo(2.6, -7.6); ctx.lineTo(0, -2.4);
      ctx.lineTo(-2.6, -7.6); ctx.lineTo(-4.4, -1.8);
      ctx.lineTo(-8.2, -4.6); ctx.lineTo(-6.2, 2.2);
      ctx.lineTo(-5.6, 6.4); ctx.closePath();
    } else {
      ctx.moveTo(-7.0, 8.8); ctx.lineTo(7.0, 8.8); ctx.lineTo(5.6, 6.4);
      ctx.lineTo(5.4, 2.8); ctx.lineTo(7.2, 2.8); ctx.lineTo(7.2, 0.6);
      ctx.lineTo(5.4, 0.6); ctx.lineTo(5.4, -1.4); ctx.lineTo(2.2, -1.4);
      ctx.lineTo(2.2, -4.6); ctx.lineTo(4.0, -4.6); ctx.lineTo(4.0, -6.6);
      ctx.lineTo(2.2, -6.6); ctx.lineTo(2.2, -8.6); ctx.lineTo(-2.2, -8.6);
      ctx.lineTo(-2.2, -6.6); ctx.lineTo(-4.0, -6.6); ctx.lineTo(-4.0, -4.6);
      ctx.lineTo(-2.2, -4.6); ctx.lineTo(-2.2, -1.4); ctx.lineTo(-5.4, -1.4);
      ctx.lineTo(-5.4, 0.6); ctx.lineTo(-7.2, 0.6); ctx.lineTo(-7.2, 2.8);
      ctx.lineTo(-5.4, 2.8); ctx.lineTo(-5.6, 6.4); ctx.closePath();
    }
  }
  function drawPiece(ctx, x, y, piece, hexR) {
    var t = C.ptype(piece), w = piece > 0, s = hexR * 0.95;
    ctx.save();
    ctx.translate(x, y + hexR * 0.08);
    ctx.scale(s / 20, s / 20);
    piecePath(ctx, t);
    ctx.fillStyle = w ? '#f7f1e2' : '#16161c';
    ctx.strokeStyle = w ? 'rgba(48, 28, 10, .82)' : 'rgba(236, 220, 190, .92)';
    ctx.lineWidth = w ? 1.2 : 1.45;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fill();
    ctx.stroke();
    if (t === C.BISHOP) {
      ctx.beginPath();
      ctx.moveTo(-1.1, -1.2); ctx.lineTo(1.1, -4.8);
      ctx.moveTo(-1.6, -3.4); ctx.lineTo(1.8, -2.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paint(canvas, s, opts) {
    opts = opts || {};
    var sz = resizeCanvas(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    var W = sz.cssW, H = sz.cssH, flip = !!opts.flip;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, W, H);
    var g = layout(W, H);
    var hexR = g.size * 0.98;
    var legal = {}, caps = {}, i, m, k, h, p, piece, last, sel, col, pt, grd;
    if (opts.hints && s && !s.winner && opts.selected) {
      m = C.legalMoves(s);
      for (i = 0; i < m.length; i++) {
        if (m[i].fq === opts.selected.q && m[i].fr === opts.selected.r) {
          legal[C.key(m[i].tq, m[i].tr)] = 1;
          if (m[i].cap || m[i].ep) caps[C.key(m[i].tq, m[i].tr)] = 1;
        }
      }
    }
    for (i = 0; i < C.HEXES.length; i++) {
      h = C.HEXES[i];
      pt = screenOf(g, h.q, h.r, flip);
      col = C.hexColor(h.q, h.r);
      hexPath(ctx, pt.x, pt.y, hexR);
      grd = ctx.createLinearGradient(pt.x, pt.y - hexR, pt.x, pt.y + hexR);
      grd.addColorStop(0, HEX_HI[col]);
      grd.addColorStop(1, HEX_FILL[col]);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = HEX_STROKE;
      ctx.lineWidth = Math.max(0.7, g.size * 0.035);
      ctx.stroke();
    }
    if (s && s.last) {
      last = s.last;
      [[last.fq, last.fr], [last.tq, last.tr]].forEach(function (pr) {
        pt = screenOf(g, pr[0], pr[1], flip);
        hexPath(ctx, pt.x, pt.y, hexR * 0.94);
        ctx.fillStyle = 'rgba(232, 197, 71, .42)';
        ctx.fill();
      });
    }
    // file letters along the viewer's near edge; ranks on the left rim
    ctx.font = '600 ' + Math.max(9, Math.round(g.size * 0.32)) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(240, 228, 200, .72)';
    var leftFile = flip ? C.N : -C.N;
    for (i = 0; i < C.HEXES.length; i++) {
      h = C.HEXES[i];
      var south = !C.inBoard(h.q, h.r + (flip ? 1 : -1));
      pt = screenOf(g, h.q, h.r, flip);
      if (south) ctx.fillText(C.FILES[h.q + C.N], pt.x, pt.y + hexR * 1.32);
      if (h.q === leftFile) ctx.fillText(String(C.rankOf(h.q, h.r)), pt.x - hexR * 1.22, pt.y);
      else if ((!flip && h.r === C.N && h.q < 0) || (flip && h.r === -C.N && h.q > 0)) {
        ctx.fillText(String(C.rankOf(h.q, h.r)), pt.x - hexR * 1.18, pt.y);
      }
    }
    for (k in legal) {
      if (!Object.prototype.hasOwnProperty.call(legal, k)) continue;
      p = k.split(',');
      pt = screenOf(g, +p[0], +p[1], flip);
      if (caps[k]) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, hexR * 0.72, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 236, 170, .95)';
        ctx.lineWidth = Math.max(2.4, g.size * 0.09);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(6.5, hexR * 0.30), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 226, 140, .92)';
        ctx.fill();
      }
    }
    sel = opts.selected;
    if (s) {
      for (k in s.pieces) {
        piece = s.pieces[k];
        if (!piece) continue;
        p = k.split(',');
        pt = screenOf(g, +p[0], +p[1], flip);
        if (sel && sel.q === +p[0] && sel.r === +p[1]) {
          hexPath(ctx, pt.x, pt.y, hexR * 0.96);
          ctx.strokeStyle = '#1ccdd3';
          ctx.lineWidth = Math.max(2.4, g.size * 0.09);
          ctx.stroke();
        }
        drawPiece(ctx, pt.x, pt.y, piece, hexR);
      }
    }
    if (s && (s.check || s.result === 'checkmate')) {
      var kingSide = s.result === 'checkmate'
        ? (s.winner === C.WHITE ? C.BLACK : C.WHITE)
        : s.turn;
      var king = C.findKing(s.pieces, kingSide);
      if (king) {
        pt = screenOf(g, king.q, king.r, flip);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, hexR * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 72, 64, .96)';
        ctx.lineWidth = Math.max(3, g.size * 0.12);
        ctx.stroke();
      }
    }
  }

  function paintCaps(el, s) {
    if (!el || !s) return;
    var miss = C.missingGlyphs(s.pieces), html = '', i, ch, n;
    html += '<span class="capw">';
    for (i = 0; i < miss.w.length; i++) {
      ch = miss.w.charAt(i);
      n = ({ P: C.P, N: C.NIGHT, B: C.BISHOP, R: C.ROOK, Q: C.QUEEN })[ch];
      html += C.pieceGlyph(C.pack(C.BLACK, n));
    }
    html += '</span><span class="capb">';
    for (i = 0; i < miss.b.length; i++) {
      ch = miss.b.charAt(i);
      n = ({ P: C.P, N: C.NIGHT, B: C.BISHOP, R: C.ROOK, Q: C.QUEEN })[ch];
      html += C.pieceGlyph(C.pack(C.WHITE, n));
    }
    html += '</span>';
    el.innerHTML = html;
  }
  function paintTurn(s, mode, youColor, thinking) {
    var w = $('whoWhite'), b = $('whoBlack');
    if (!w || !b) return;
    var wName = mode === 'cpu' ? (youColor === 'white' ? 'You' : 'Computer') : 'White';
    var bName = mode === 'cpu' ? (youColor === 'black' ? 'You' : 'Computer') : 'Black';
    w.textContent = '♔ ' + wName;
    b.textContent = '♚ ' + bName;
    var turn = s && !s.winner && !thinking ? C.colorName(s.turn) : '';
    w.className = 'who' + (turn === 'white' ? ' on' : '');
    b.className = 'who' + (turn === 'black' ? ' on' : '');
  }
  function paintBanner(s, mode, youColor) {
    var el = $('banner');
    if (!el) return;
    if (!s) { el.hidden = true; return; }
    if (s.result === 'checkmate') {
      var you = mode === 'cpu' && s.winner === C.colorNum(youColor);
      el.hidden = false;
      el.className = 'banner ' + (you ? 'good' : 'bad');
      el.textContent = you ? 'Checkmate — you win' : (mode === 'hotseat'
        ? (C.colorName(s.winner) === 'white' ? 'Checkmate — White wins' : 'Checkmate — Black wins')
        : 'Checkmate — the computer wins');
      return;
    }
    if (s.result === 'stalemate') {
      el.hidden = false;
      el.className = 'banner';
      el.textContent = resultText(s, mode, youColor);
      return;
    }
    if (s.check) {
      el.hidden = false;
      el.className = 'banner check';
      el.textContent = 'Check';
      return;
    }
    el.hidden = true;
  }

  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return C.colorName(state.s.turn) === state.color;
  }
  function resultText(s, mode, youColor) {
    if (!s.winner) return '';
    var side = C.colorName(s.winner);
    var name = side.charAt(0).toUpperCase() + side.slice(1);
    if (s.result === 'stalemate') {
      return mode === 'hotseat'
        ? ('Stalemate — ' + name + ' scores.')
        : (s.winner === C.colorNum(youColor) ? 'Stalemate — you score.' : 'Stalemate — the computer scores.');
    }
    if (mode === 'hotseat') return 'Checkmate — ' + name + ' wins.';
    return s.winner === C.colorNum(youColor) ? 'Checkmate — you win.' : 'Checkmate — the computer wins.';
  }
  function localStatus() {
    if (!state.s) return;
    paintTurn(state.s, state.mode, state.color, state.thinking);
    paintBanner(state.s, state.mode, state.color);
    paintCaps($('caps'), state.s);
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === C.colorNum(state.color);
      setStatus($('statusLine'), resultText(state.s, state.mode, state.color), you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    var who, last = state.lastSan ? state.lastSan + '. ' : '';
    if (state.mode === 'hotseat') {
      who = C.colorName(state.s.turn);
      who = who.charAt(0).toUpperCase() + who.slice(1);
      setStatus($('statusLine'), last + who + ' to play.', '');
    } else if (C.colorName(state.s.turn) === state.color) {
      setStatus($('statusLine'), last + 'Your turn.', '');
    } else {
      setStatus($('statusLine'), last + 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      moves: state.hist.map(function (m) {
        return { fq: m.fq, fr: m.fr, tq: m.tq, tr: m.tr, promo: m.promo || 0 };
      }),
      lastSan: state.lastSan || '',
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function afterLocal() {
    paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel, flip: state.flip });
    localStatus();
    saveLocal();
    if (!state.over && !state.thinking && state.mode === 'cpu' && C.colorName(state.s.turn) !== state.color) aiMove();
  }
  function applyLocal(fq, fr, tq, tr, promo) {
    if (!state.s || state.over) return false;
    var m = { fq: fq, fr: fr, tq: tq, tr: tr, promo: promo || 0 };
    var ns = C.play(state.s, fq, fr, tq, tr, promo || 0);
    if (!ns) return false;
    state.lastSan = C.san(state.s, m);
    state.hist.push({ fq: fq, fr: fr, tq: tq, tr: tr, promo: promo || 0, color: state.s.turn });
    state.s = ns;
    state.sel = null;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    return true;
  }

  var pendingPromo = null;
  function askPromo(color, done) {
    var box = $('promo'), row = $('promoRow');
    var types = [C.QUEEN, C.ROOK, C.BISHOP, C.NIGHT];
    row.innerHTML = '';
    types.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = C.pieceGlyph(C.pack(color, t));
      b.onclick = function () { box.hidden = true; done(t); };
      row.appendChild(b);
    });
    box.hidden = false;
  }
  function playLocal(fq, fr, tq, tr) {
    if (!state.s || state.over) return false;
    if (state.mode === 'cpu' && state.thinking && C.colorName(state.s.turn) === state.color) return false;
    var legal = C.legalMoves(state.s), i, m, needs = false, opts = [];
    for (i = 0; i < legal.length; i++) {
      m = legal[i];
      if (m.fq === fq && m.fr === fr && m.tq === tq && m.tr === tr) {
        opts.push(m);
        if (m.promo) needs = true;
      }
    }
    if (!opts.length) return false;
    if (needs) {
      pendingPromo = { fq: fq, fr: fr, tq: tq, tr: tr };
      askPromo(state.s.turn, function (t) {
        pendingPromo = null;
        if (applyLocal(fq, fr, tq, tr, t)) afterLocal();
      });
      return true;
    }
    if (!applyLocal(fq, fr, tq, tr, 0)) return false;
    afterLocal();
    return true;
  }
  function tapLocal(h) {
    if (!h || !isHumanTurn()) return;
    var s = state.s, k;
    if (state.sel && (state.sel.q !== h.q || state.sel.r !== h.r)) {
      if (playLocal(state.sel.q, state.sel.r, h.q, h.r)) return;
    }
    k = s.pieces[C.key(h.q, h.r)];
    if (k && C.owner(k) === s.turn) {
      var has = C.legalMoves(s).some(function (m) { return m.fq === h.q && m.fr === h.r; });
      if (has) {
        state.sel = (state.sel && state.sel.q === h.q && state.sel.r === h.r) ? null : { q: h.q, r: h.r };
        paint($('board'), s, { hints: true, selected: state.sel, flip: state.flip });
      }
    }
  }
  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (C.colorName(state.s.turn) === state.color) return;
    state.thinking = true;
    state.sel = null;
    setChip('thinking', 'Thinking…');
    localStatus();
    paint($('board'), state.s, { hints: false, flip: state.flip });
    var startAt = nowMs();
    var snapshot = state.s;
    setTimeout(function () {
      if (!state.s || state.s !== snapshot || state.over || state.mode !== 'cpu') {
        state.thinking = false; return;
      }
      if (C.colorName(state.s.turn) === state.color) {
        state.thinking = false; setChip('ready', 'Ready'); afterLocal(); return;
      }
      var move = C.aiMove(state.s, 120);
      var wait = Math.max(0, 320 - (nowMs() - startAt));
      setTimeout(function () {
        if (!state.s || state.s !== snapshot || state.over || state.mode !== 'cpu') {
          state.thinking = false; return;
        }
        state.thinking = false;
        setChip('ready', 'Ready');
        if (!move || !applyLocal(move.fq, move.fr, move.tq, move.tr, move.promo || 0)) {
          localStatus(); paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel, flip: state.flip });
          return;
        }
        afterLocal();
      }, wait);
    }, 40);
  }
  function undoLocal() {
    if (!state.hist.length || state.thinking) return;
    state.hist.pop();
    if (state.mode === 'cpu' && state.hist.length) state.hist.pop();
    state.s = C.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    state.sel = null;
    state.lastSan = state.s.last ? C.san(C.replay(state.hist.slice(0, -1)), {
      fq: state.s.last.fq, fr: state.s.last.fr, tq: state.s.last.tq, tr: state.s.last.tr,
      promo: state.s.last.promo, cap: state.s.last.cap, ep: state.s.last.ep
    }) : '';
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    afterLocal();
  }
  function newLocal() {
    state.s = C.fresh(); state.hist = []; state.over = false;
    state.thinking = false; state.sel = null; state.lastSan = '';
    state.flip = state.mode === 'cpu' && state.color === 'black';
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    afterLocal();
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
    if ($('banner')) $('banner').hidden = true;
  };
  $('undoBtn').onclick = undoLocal;
  $('board').addEventListener('click', function (e) {
    tapLocal(hitHex(this, e, state.flip));
  });

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, sel: null };
  var _items = [];

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.white === mp.id) return 'white';
    if (b.seats.black === mp.id) return 'black';
    return null;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshBoard(hostId) {
    return {
      id: 'board', host: hostId, seats: { white: null, black: null }, names: {},
      moves: [], turn: 'white', winner: null, result: '', last: null, seq: 0,
      startedAt: nowMs()
    };
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putBoard(b) { mp.board = b; mpDb.put(b).catch(function () {}); }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!mpDb) { setStatus($('statusLine'), 'Play a friend needs storage.', 'warn'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.sel = null;
      $('setup').hidden = true; $('game').hidden = true; $('friend').hidden = false;
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender();
    });
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    $('friend').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  }
  $('fLeave').onclick = mpLeave;

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], board = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'board') { board = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    mp.people = people;
    mp.board = board;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!board) {
      if (isHost(people)) putBoard(freshBoard(mp.id));
      mpRender();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (mp.row && mp.row.intent && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender();
  }

  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {};
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['white', 'black'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.white || !b.seats.black) && (b.moves || []).length && !b.winner) {
      b.winner = b.seats.white ? 'white' : (b.seats.black ? 'black' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.white] = 1; seated[b.seats.black] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.white && queue.length) { b.seats.white = queue.shift(); ch = true; }
    if (!b.seats.black && queue.length) { b.seats.black = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.moves = []; b.turn = 'white'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.white === p.id ? 'white' : (b.seats.black === p.id ? 'black' : null);
      if (intent.kind === 'move') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.fq !== 'number' || typeof intent.fr !== 'number') return;
        if (typeof intent.tq !== 'number' || typeof intent.tr !== 'number') return;
        var s = C.replay(b.moves || []);
        var ns = C.play(s, intent.fq, intent.fr, intent.tq, intent.tr, intent.promo || 0);
        if (!ns) return;
        b.moves = (b.moves || []).concat([{
          fq: intent.fq, fr: intent.fr, tq: intent.tq, tr: intent.tr, promo: intent.promo || 0
        }]);
        b.last = { fq: intent.fq, fr: intent.fr, tq: intent.tq, tr: intent.tr };
        b.seq = (b.seq || 0) + 1;
        if (ns.winner) {
          b.winner = C.colorName(ns.winner);
          b.result = ns.result === 'stalemate' ? 'Stalemate' : 'Checkmate';
          b.endedAt = nowMs();
        } else b.turn = C.colorName(ns.turn);
        ch = true;
      } else if (intent.kind === 'resign') {
        if (!seat || b.winner) return;
        b.winner = seat === 'white' ? 'black' : 'white';
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpPlay(fq, fr, tq, tr, promo) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = C.replay(b.moves || []);
    if (!C.play(s, fq, fr, tq, tr, promo || 0)) return false;
    putMe({ intent: { kind: 'move', fq: fq, fr: fr, tq: tq, tr: tr, promo: promo || 0, seq: b.seq } });
    return true;
  }
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpTry(fq, fr, tq, tr) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat) return false;
    var s = C.replay(b.moves || []);
    var legal = C.legalMoves(s), i, m, needs = false, opts = [];
    for (i = 0; i < legal.length; i++) {
      m = legal[i];
      if (m.fq === fq && m.fr === fr && m.tq === tq && m.tr === tr) {
        opts.push(m);
        if (m.promo) needs = true;
      }
    }
    if (!opts.length) return false;
    if (needs) {
      askPromo(s.turn, function (t) { mpPlay(fq, fr, tq, tr, t); });
      return true;
    }
    return mpPlay(fq, fr, tq, tr, 0);
  }

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = C.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">♔ ' + nameOf(b.seats.white) + '</div>' +
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">♚ ' + nameOf(b.seats.black) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.white && p.id !== b.seats.black; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    var both = b.seats.white && b.seats.black;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'white' ? b.seats.white : b.seats.black);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Checkmate') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = (s.check ? 'Check. ' : '') + 'Your turn.';
    } else {
      status.textContent = (s.check ? 'Check. ' : '') + 'Waiting for ' + b.turn + '…';
    }
    var hints = !!(seat && b.turn === seat && !b.winner);
    var flip = seat === 'black';
    paint($('fBoard'), s, { hints: hints, selected: mp.sel, flip: flip });
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  $('fBoard').addEventListener('click', function (e) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var h = hitHex(this, e, seat === 'black');
    if (!h) return;
    var s = C.replay(b.moves || []);
    if (mp.sel && (mp.sel.q !== h.q || mp.sel.r !== h.r)) {
      if (mpTry(mp.sel.q, mp.sel.r, h.q, h.r)) { mp.sel = null; return; }
    }
    var piece = s.pieces[C.key(h.q, h.r)];
    if (piece && C.owner(piece) === s.turn) {
      var has = C.legalMoves(s).some(function (m) { return m.fq === h.q && m.fr === h.r; });
      if (has) {
        mp.sel = (mp.sel && mp.sel.q === h.q && mp.sel.r === h.r) ? null : { q: h.q, r: h.r };
        mpRender();
      }
    }
  });

  window.addEventListener('resize', function () {
    if (!$('game').hidden && state.s) paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel, flip: state.flip });
    if (!$('friend').hidden && mp.board) mpRender();
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('promo').hidden) { $('promo').hidden = true; return; }
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.moves || !g.moves.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'white';
      state.hist = g.moves.slice();
      state.s = C.replay(state.hist);
      state.over = !!state.s.winner;
      state.lastSan = g.lastSan || '';
      state.flip = state.mode === 'cpu' && state.color === 'black';
      if (state.mode === 'hotseat') {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
        setChip('ready', 'Two players');
      } else {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('colorSeg').children, function (c) {
          c.classList.toggle('on', c.getAttribute('data-color') === state.color);
        });
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      afterLocal();
    }).catch(function () {});
  }
})();
