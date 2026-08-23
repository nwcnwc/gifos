// Backgammon — a table of checkers and dice. Computer uses the same legal
// moves. A friend sits the other colour. Invite is OS chrome.
(function () {
  'use strict';
  var B = window.Backgammon;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', color: 'white',
    g: null, over: false, thinking: false,
    sel: null, dieSteps: 0
  };
  var db = null;
  try { if (window.gifos) db = gifos.db('save'); } catch (e) {}

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'turnpill' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }
  function setScore(el, g) {
    if (!el || !g) return;
    var w = g.state.whiteOutside.length, b = g.state.blackOutside.length;
    var turn = g.isOver ? '' : B.colorName(g.turnPlayer.currentPieceType);
    el.innerHTML = '<span class="wht' + (turn === 'white' ? ' on' : '') + '">White ' + w + ' off</span>' +
      '<span class="blk' + (turn === 'black' ? ' on' : '') + '">Black ' + b + ' off</span>';
  }

  $('modeSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    state.mode = btn.getAttribute('data-mode');
    var cpu = state.mode === 'cpu';
    $('cpuOpts').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });
  $('colorSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    state.color = btn.getAttribute('data-color');
    $('cpuNote').textContent = state.color === 'white'
      ? 'You play white and go first. The computer plays black. It thinks on this device.'
      : 'You play black. The computer plays white, and goes first.';
  });

  var WOOD = '#5c2e1a', FRAME = '#3a1c10', FELT = '#4a2418';
  var LIGHT = '#d4b896', DARK = '#8b3a2a';
  var IVORY = '#f3ead8', INK = '#1a1210';
  var BARC = '#2a140e', GOLD = '#e8b440', GOLD2 = '#ffe08a';

  function geom(W, H) {
    var frame = Math.min(W, H) * 0.04;
    var bear = Math.max(28, W * 0.07);
    var x0 = frame, x1 = W - frame - bear, y0 = frame, y1 = H - frame;
    var barW = Math.max(26, (x1 - x0) * 0.08);
    var play = x1 - x0 - barW;
    var quad = play / 2;
    var pw = quad / 6;
    var ph = (y1 - y0) * 0.48;
    return { W: W, H: H, frame: frame, bear: bear, x0: x0, x1: x1, y0: y0, y1: y1,
      barW: barW, quad: quad, pw: pw, ph: ph, barX: x0 + quad, bearX: x1, mid: (y0 + y1) / 2 };
  }
  function pointBox(g, pos) {
    var col, top, left;
    if (pos >= 12 && pos <= 17) { col = pos - 12; top = true; left = true; }
    else if (pos >= 18) { col = pos - 18; top = true; left = false; }
    else if (pos >= 6) { col = 11 - pos; top = false; left = true; }
    else { col = 5 - pos; top = false; left = false; }
    var x = g.x0 + (left ? 0 : g.quad + g.barW) + col * g.pw;
    var y = top ? g.y0 : g.y1 - g.ph;
    return { x: x, y: y, w: g.pw, h: g.ph, top: top };
  }
  function resizeCanvas(canvas) {
    var cssW = canvas.clientWidth || 520;
    var cssH = canvas.clientHeight || Math.round(cssW * 0.86);
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { cssW: cssW, cssH: cssH };
  }
  function checker(ctx, x, y, r, type) {
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    if (type === B.WHITE) { g.addColorStop(0, '#fff8ee'); g.addColorStop(1, '#c8b498'); }
    else { g.addColorStop(0, '#4a3a34'); g.addColorStop(1, INK); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
  }
  function ringAt(ctx, x, y, r, color, w) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }
  function stackLayout(box, n) {
    var r = Math.min(box.w * 0.46, box.h / 5.8);
    var show = Math.min(n, 5);
    var gap = show <= 1 ? 0 : Math.min(r * 1.82, (box.h - 2 * r) / Math.max(1, show - 1));
    return { r: r, show: show, gap: gap };
  }
  function stackY(box, lay, i) {
    return box.top ? (box.y + lay.r + 2 + i * lay.gap) : (box.y + box.h - lay.r - 2 - i * lay.gap);
  }
  function stackCheckers(ctx, box, pieces, opts) {
    opts = opts || {};
    var n = pieces.length, lay = stackLayout(box, n), i, y, sel;
    for (i = 0; i < lay.show; i++) {
      y = stackY(box, lay, i);
      checker(ctx, box.x + box.w / 2, y, lay.r, pieces[i].type);
      sel = opts.selId != null && pieces[i].id === opts.selId;
      if (sel) ringAt(ctx, box.x + box.w / 2, y, lay.r + 3, GOLD2, 3);
      else if (opts.fromIds && opts.fromIds[pieces[i].id] && i === lay.show - 1) {
        ringAt(ctx, box.x + box.w / 2, y, lay.r + 2.5, GOLD, 1.5);
      }
    }
    if (n > 5) {
      y = stackY(box, lay, 4);
      ctx.fillStyle = pieces[lay.show - 1].type === B.WHITE ? INK : IVORY;
      ctx.font = 'bold ' + Math.round(lay.r * 0.9) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), box.x + box.w / 2, y);
    }
  }
  function destMark(ctx, geo, dest, steps) {
    var box, lay, y, cx, r, n;
    if (dest.kind === 'bear') {
      box = {
        x: geo.bearX, y: dest.type === B.BLACK ? geo.y0 : geo.y1 - geo.ph,
        w: geo.W - geo.frame - geo.bearX, h: geo.ph, top: dest.type === B.BLACK
      };
      ctx.save();
      ctx.strokeStyle = GOLD2; ctx.lineWidth = 3;
      ctx.strokeRect(box.x + 2, box.y + 2, box.w - 4, box.h - 4);
      ctx.restore();
      cx = box.x + box.w / 2; y = box.top ? box.y + 16 : box.y + box.h - 16;
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cx, y, 8, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (dest.kind !== 'point') return;
    box = pointBox(geo, dest.pos);
    n = 0;
    lay = stackLayout(box, 1);
    y = dest.top != null ? stackY(box, lay, 0) : (box.top ? box.y + lay.r + 8 : box.y + box.h - lay.r - 8);
    // land at the next slot — paint uses empty-ish center of the triangle
    cx = box.x + box.w / 2;
    y = box.top ? box.y + box.h * 0.58 : box.y + box.h * 0.42;
    r = Math.max(13, box.w * 0.38);
    ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2);
    if (dest.hit) {
      ctx.strokeStyle = '#ff7a6b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = GOLD; ctx.fill();
    } else {
      ctx.strokeStyle = GOLD2; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, r * 0.38, 0, Math.PI * 2);
      ctx.fillStyle = GOLD; ctx.fill();
    }
    if (steps) {
      ctx.fillStyle = INK;
      ctx.font = 'bold ' + Math.round(r * 0.7) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(steps), cx, y + 0.5);
    }
  }
  function paint(canvas, g, opts) {
    opts = opts || {};
    var sz = resizeCanvas(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    var W = sz.cssW, H = sz.cssH, geo = geom(W, H), pos, box, i;
    ctx.fillStyle = FRAME; ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (opts.flip) { ctx.translate(W, H); ctx.scale(-1, -1); }
    ctx.fillStyle = FELT; ctx.fillRect(geo.x0, geo.y0, geo.x1 - geo.x0, geo.y1 - geo.y0);
    ctx.fillStyle = BARC; ctx.fillRect(geo.barX, geo.y0, geo.barW, geo.y1 - geo.y0);
    ctx.fillStyle = WOOD; ctx.fillRect(geo.bearX, geo.y0, W - geo.frame - geo.bearX, geo.y1 - geo.y0);
    for (pos = 0; pos < 24; pos++) {
      box = pointBox(geo, pos);
      ctx.beginPath();
      if (box.top) {
        ctx.moveTo(box.x + 1, box.y);
        ctx.lineTo(box.x + box.w - 1, box.y);
        ctx.lineTo(box.x + box.w / 2, box.y + box.h);
      } else {
        ctx.moveTo(box.x + 1, box.y + box.h);
        ctx.lineTo(box.x + box.w - 1, box.y + box.h);
        ctx.lineTo(box.x + box.w / 2, box.y);
      }
      ctx.closePath();
      ctx.fillStyle = (pos % 2 === 0) ? LIGHT : DARK;
      ctx.fill();
    }
    var fromIds = {}, dests = opts.dests || [], selId = opts.selId;
    if (opts.froms) {
      for (i = 0; i < opts.froms.length; i++) fromIds[opts.froms[i].id] = 1;
    }
    if (g) {
      for (pos = 0; pos < 24; pos++) {
        stackCheckers(ctx, pointBox(geo, pos), g.state.points[pos], { selId: selId, fromIds: fromIds });
      }
      stackCheckers(ctx, {
        x: geo.barX, y: geo.y0, w: geo.barW, h: geo.ph, top: true
      }, g.state.bar[B.BLACK], { selId: selId, fromIds: fromIds });
      stackCheckers(ctx, {
        x: geo.barX, y: geo.y1 - geo.ph, w: geo.barW, h: geo.ph, top: false
      }, g.state.bar[B.WHITE], { selId: selId, fromIds: fromIds });
      stackCheckers(ctx, {
        x: geo.bearX, y: geo.y0, w: W - geo.frame - geo.bearX, h: geo.ph, top: true
      }, g.state.outside[B.BLACK], {});
      stackCheckers(ctx, {
        x: geo.bearX, y: geo.y1 - geo.ph, w: W - geo.frame - geo.bearX, h: geo.ph, top: false
      }, g.state.outside[B.WHITE], {});
      for (i = 0; i < dests.length; i++) destMark(ctx, geo, dests[i].dest, dests[i].steps);
    }
    ctx.restore();
  }
  function hit(canvas, ev, flip) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0]
          : (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
    var x = t.clientX - rect.left, y = t.clientY - rect.top;
    if (flip) { x = rect.width - x; y = rect.height - y; }
    var geo = geom(rect.width, rect.height), pos, box, mid = geo.mid;
    if (x >= geo.barX && x <= geo.barX + geo.barW && y >= geo.y0 && y <= geo.y1) {
      return { kind: 'bar', type: y < mid ? B.BLACK : B.WHITE };
    }
    if (x >= geo.bearX && x <= geo.W - geo.frame && y >= geo.y0 && y <= geo.y1) {
      return { kind: 'bear', type: y < mid ? B.BLACK : B.WHITE };
    }
    for (pos = 0; pos < 24; pos++) {
      box = pointBox(geo, pos);
      var y0 = box.top ? geo.y0 : mid;
      var y1 = box.top ? mid : geo.y1;
      if (x >= box.x && x <= box.x + box.w && y >= y0 && y <= y1) {
        return { kind: 'point', pos: pos };
      }
    }
    return null;
  }

  var PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };
  function pipsHTML(n) {
    var spots = PIPS[n] || PIPS[1], i, html = '';
    for (i = 0; i < 9; i++) html += '<span' + (spots.indexOf(i) >= 0 ? ' class="pip"' : '') + '></span>';
    return html;
  }
  function renderDice(el, g, pick, onPick) {
    if (!el) return;
    el.innerHTML = '';
    if (!g || !g.turnDice) { el.hidden = true; return; }
    var list = (g.turnDice.moves && g.turnDice.moves.length) ? g.turnDice.moves
             : (g.turnDice.values || []);
    if (!list.length) { el.hidden = true; return; }
    el.hidden = false;
    var left = (g.turnDice.movesLeft || []).slice();
    var i, n, on, btn, idx;
    for (i = 0; i < list.length; i++) {
      n = list[i];
      idx = left.indexOf(n);
      on = idx >= 0;
      if (on) left.splice(idx, 1);
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'die' + (on ? ' on' : ' spent') + (on && pick === n ? ' pick' : '');
      btn.setAttribute('aria-label', 'Die ' + n + (on ? '' : ' spent'));
      btn.innerHTML = pipsHTML(n);
      if (on && onPick) {
        (function (val) {
          btn.addEventListener('click', function () { onPick(val); });
        })(n);
      }
      el.appendChild(btn);
    }
  }

  function shouldFlip() {
    if (state.mode === 'cpu' && state.color === 'black') return true;
    return false;
  }
  function filterDests(dests, dieSteps) {
    if (!dieSteps) return dests;
    return dests.filter(function (d) { return d.steps === dieSteps; });
  }
  function pieceFromHit(g, h) {
    if (!g || !h) return null;
    if (h.kind === 'bar') return B.barTop(g, h.type);
    if (h.kind === 'point') return B.topAt(g, h.pos);
    return null;
  }
  function selPiece(g, sel) {
    if (!g || !sel) return null;
    if (sel.pieceId != null) return B.findPiece(g, sel.pieceId);
    return pieceFromHit(g, sel);
  }
  function paintHints(g, sel, dieSteps) {
    var dests = [], from = [], piece;
    if (!g || g.isOver || !g.turnDice) return { dests: dests, froms: from, selId: null };
    from = B.froms(g);
    piece = selPiece(g, sel);
    if (piece) dests = filterDests(B.destsFor(g, piece), dieSteps);
    return { dests: dests, froms: from, selId: piece ? piece.id : null };
  }

  function isHumanTurn() {
    if (!state.g || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return B.colorName(state.g.turnPlayer.currentPieceType) === state.color;
  }
  function turnCls(g, extra) {
    if (extra) return extra;
    if (!g || g.isOver) return '';
    return B.colorName(g.turnPlayer.currentPieceType);
  }
  function localStatus() {
    var g = state.g;
    if (!g) return;
    setScore($('scoreLine'), g);
    $('rollBtn').disabled = !isHumanTurn() || !B.canRoll(g);
    $('undoBtn').disabled = !isHumanTurn() || !B.canUndo(g);
    $('confirmBtn').disabled = !isHumanTurn() || !B.canConfirm(g);
    $('rollBtn').classList.toggle('go', isHumanTurn() && B.canRoll(g));
    $('confirmBtn').classList.toggle('go', isHumanTurn() && B.canConfirm(g));
    if (g.isOver) {
      var you = state.mode === 'cpu' && g.winner === B[state.color.toUpperCase()];
      var who = B.colorName(g.winner);
      who = who.charAt(0).toUpperCase() + who.slice(1);
      var msg = state.mode === 'hotseat'
        ? (who + ' bears all fifteen.')
        : (you ? 'You bear all fifteen.' : 'The computer bears all fifteen.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', 'think'); return; }
    var turn = B.colorName(g.turnPlayer.currentPieceType);
    turn = turn.charAt(0).toUpperCase() + turn.slice(1);
    var mine = isHumanTurn();
    if (B.canRoll(g)) {
      setStatus($('statusLine'),
        (state.mode === 'hotseat' ? turn + ' to play. Roll.' : (mine ? 'Your turn. Roll.' : 'Computer to play.')),
        turnCls(g, mine || state.mode === 'hotseat' ? null : ''));
      return;
    }
    if (B.canConfirm(g) && !(g.turnDice.movesPlayed || []).length) {
      setStatus($('statusLine'), 'No move with this roll. Confirm.', turnCls(g));
      return;
    }
    if (B.canConfirm(g)) {
      setStatus($('statusLine'), 'No more moves. Confirm the turn.', turnCls(g));
      return;
    }
    if (!mine) { setStatus($('statusLine'), 'Computer to play.', 'think'); return; }
    if (B.onBar(g)) {
      setStatus($('statusLine'), (state.mode === 'hotseat' ? turn + ' is on the bar. Tap a point to enter.' : 'You are on the bar. Tap a point to enter.'), turnCls(g));
      return;
    }
    if (state.sel) {
      setStatus($('statusLine'), 'Tap where it goes — or tap another checker.', turnCls(g));
      return;
    }
    setStatus($('statusLine'),
      (state.mode === 'hotseat' ? turn + ' to play. Tap a checker, then where it goes.' : 'Your turn. Tap a checker, then where it goes.'),
      turnCls(g));
  }
  function saveLocal() {
    if (!db || !state.g) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      snap: B.snapshot(state.g), over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function autoSel(g) {
    var p;
    if (!g || !g.turnDice || g.isOver) return null;
    if (!B.onBar(g)) return null;
    p = B.barTop(g, g.turnPlayer.currentPieceType);
    if (!p || !B.destsFor(g, p).length) return null;
    return { kind: 'bar', type: p.type, pieceId: p.id };
  }
  function paintLocal() {
    var hints;
    if (isHumanTurn() && state.g && !state.sel) state.sel = autoSel(state.g);
    hints = paintHints(state.g, isHumanTurn() ? state.sel : null, state.dieSteps);
    paint($('board'), state.g, {
      flip: shouldFlip(), dests: hints.dests, froms: isHumanTurn() ? hints.froms : [], selId: hints.selId
    });
    renderDice($('diceRow'), state.g, state.dieSteps, isHumanTurn() ? onDiePick : null);
    localStatus();
  }
  function onDiePick(n) {
    if (!isHumanTurn()) return;
    state.dieSteps = state.dieSteps === n ? 0 : n;
    paintLocal();
  }
  function afterHuman() {
    if (state.g && B.canConfirm(state.g) && !(state.g.turnDice.movesPlayed || []).length) {
      // blocked roll — leave confirm in the player's hands, but say so
    }
    if (!B.canUndo(state.g)) state.sel = autoSel(state.g);
    else state.sel = autoSel(state.g);
    paintLocal();
    saveLocal();
  }
  function maybeCpu() {
    if (!state.g || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (B.colorName(state.g.turnPlayer.currentPieceType) === state.color) return;
    cpuTurn();
  }
  function cpuTurn() {
    if (!state.g || state.over) return;
    state.thinking = true;
    state.sel = null;
    setChip('thinking', 'Thinking…');
    paintLocal();
    setTimeout(function () {
      if (!state.g || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      if (B.canRoll(state.g)) B.roll(state.g);
      paintLocal();
      setTimeout(function () {
        if (!state.g || state.over) { state.thinking = false; return; }
        var seq = B.aiChoose(state.g) || [];
        var i = 0;
        function step() {
          if (!state.g || state.over) { state.thinking = false; return; }
          if (i >= seq.length) {
            B.confirm(state.g);
            if (state.g.isOver) state.over = true;
            state.thinking = false;
            state.dieSteps = 0;
            setChip('ready', 'Ready');
            paintLocal();
            saveLocal();
            if (!state.over) maybeCpu();
            return;
          }
          B.applyMove(state.g, seq[i].pieceId, seq[i].steps);
          i++;
          paintLocal();
          setTimeout(step, 240);
        }
        step();
      }, 220);
    }, 160);
  }
  function playHit(h) {
    var g = state.g, piece, dests, i, match;
    if (!g || !isHumanTurn() || !h) return;
    if (B.canRoll(g)) { B.roll(g); state.sel = autoSel(g); state.dieSteps = 0; afterHuman(); maybeCpu(); return; }
    piece = selPiece(g, state.sel);
    if (piece) {
      dests = filterDests(B.destsFor(g, piece), state.dieSteps);
      for (i = 0; i < dests.length; i++) {
        if (B.destMatches(dests[i].dest, h, piece.type)) { match = dests[i]; break; }
      }
      if (match && B.tryMove(g, piece.id, match.steps)) {
        state.sel = null; state.dieSteps = 0;
        afterHuman();
        return;
      }
    }
    piece = pieceFromHit(g, h);
    if (piece && piece.type === g.turnPlayer.currentPieceType && B.destsFor(g, piece).length) {
      state.sel = { kind: h.kind, pos: h.pos, type: h.type, pieceId: piece.id };
      paintLocal();
      return;
    }
    state.sel = autoSel(g);
    paintLocal();
  }
  function newLocal() {
    state.g = B.fresh(); state.over = false; state.thinking = false; state.sel = null; state.dieSteps = 0;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paintLocal();
    saveLocal();
    maybeCpu();
  }

  $('board').addEventListener('click', function (e) { playHit(hit(this, e, shouldFlip())); });
  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('rollBtn').onclick = function () {
    if (!isHumanTurn() || !state.g || !B.canRoll(state.g)) return;
    B.roll(state.g); state.sel = autoSel(state.g); state.dieSteps = 0; afterHuman(); maybeCpu();
  };
  $('undoBtn').onclick = function () {
    if (!isHumanTurn() || !state.g) return;
    B.undo(state.g); state.sel = autoSel(state.g); state.dieSteps = 0; afterHuman();
  };
  $('confirmBtn').onclick = function () {
    if (!isHumanTurn() || !state.g || !B.canConfirm(state.g)) return;
    B.confirm(state.g);
    if (state.g.isOver) state.over = true;
    state.sel = null; state.dieSteps = 0;
    afterHuman();
    maybeCpu();
  };
  window.addEventListener('resize', function () {
    if (!$('game').hidden) paintLocal();
    if (!$('friend').hidden) mpRender(true);
  });

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, sel: null, dieSteps: 0 };
  var _items = [];
  var _mpSeqPaint = -1;

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
  function gameOf(b) {
    return B.restore(b && b.snap);
  }
  function packBoard(hostId, seats, names, game, extra) {
    extra = extra || {};
    return {
      id: 'board', host: hostId, seats: seats, names: names || {},
      snap: B.snapshot(game), seq: extra.seq || 0,
      turn: B.colorName(game.turnPlayer.currentPieceType),
      winner: game.isOver ? B.colorName(game.winner) : null,
      result: extra.result || '', last: extra.last || null,
      startedAt: extra.startedAt || nowMs(), endedAt: extra.endedAt || 0
    };
  }
  function freshBoard(hostId) {
    return packBoard(hostId, { white: null, black: null }, {}, B.fresh(), { seq: 0 });
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
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.sel = null; mp.dieSteps = 0;
      _mpSeqPaint = -1;
      $('setup').hidden = true; $('game').hidden = true; $('friend').hidden = false;
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender(true);
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
      mpRender(true);
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (mp.row && mp.row.intent && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender(false);
  }

  function mpReconcile(Brow, people) {
    var b = JSON.parse(JSON.stringify(Brow));
    var ch = false;
    var ids = {};
    var game = gameOf(b);
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['white', 'black'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.white || !b.seats.black) && (game.turnNumber > 1 || (game.turnDice && (game.turnDice.movesPlayed || []).length)) && !game.isOver) {
      game.isOver = true;
      game.winner = b.seats.white ? B.WHITE : (b.seats.black ? B.BLACK : B.WHITE);
      b.winner = B.colorName(game.winner);
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      b.snap = B.snapshot(game);
      ch = true;
    }
    var seated = {};
    seated[b.seats.white] = 1; seated[b.seats.black] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.white && queue.length) { b.seats.white = queue.shift(); ch = true; }
    if (!b.seats.black && queue.length) { b.seats.black = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      game = B.fresh();
      b.snap = B.snapshot(game);
      b.turn = 'white'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.white === p.id ? 'white' : (b.seats.black === p.id ? 'black' : null);
      if (!seat || game.isOver) return;
      var turnName = B.colorName(game.turnPlayer.currentPieceType);
      if (intent.kind === 'roll') {
        if (turnName !== seat || game.turnDice) return;
        B.roll(game);
        b.last = { kind: 'roll' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        b.turn = B.colorName(game.turnPlayer.currentPieceType);
        ch = true;
      } else if (intent.kind === 'move') {
        if (turnName !== seat || !game.turnDice) return;
        if (typeof intent.pieceId !== 'number' || typeof intent.steps !== 'number') return;
        if (!B.tryMove(game, intent.pieceId, intent.steps)) return;
        b.last = { kind: 'move', pieceId: intent.pieceId, steps: intent.steps };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      } else if (intent.kind === 'confirm') {
        if (turnName !== seat || !B.canConfirm(game)) return;
        B.confirm(game);
        if (game.isOver) {
          b.winner = B.colorName(game.winner);
          b.result = 'All fifteen off';
          b.endedAt = nowMs();
        }
        b.last = { kind: 'confirm' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        b.turn = B.colorName(game.turnPlayer.currentPieceType);
        ch = true;
      } else if (intent.kind === 'undo') {
        if (turnName !== seat || !B.canUndo(game)) return;
        B.undo(game);
        b.last = { kind: 'undo' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      } else if (intent.kind === 'resign') {
        game.isOver = true;
        game.winner = seat === 'white' ? B.BLACK : B.WHITE;
        b.winner = B.colorName(game.winner);
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpIntent(intent) {
    var b = mp.board;
    if (!b) return;
    intent.seq = b.seq;
    putMe({ intent: intent });
  }
  function mpMyTurn() {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return false;
    var g = gameOf(b);
    return B.colorName(g.turnPlayer.currentPieceType) === seat;
  }
  function mpFlip() { return mySeat(mp.board) === 'black'; }
  $('fRoll').onclick = function () {
    if (!mpMyTurn()) return;
    var g = gameOf(mp.board);
    if (!B.canRoll(g)) return;
    mpIntent({ kind: 'roll' });
  };
  $('fUndo').onclick = function () {
    if (!mpMyTurn()) return;
    mpIntent({ kind: 'undo' });
  };
  $('fConfirm').onclick = function () {
    if (!mpMyTurn()) return;
    mpIntent({ kind: 'confirm' });
  };
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    mpIntent({ kind: 'resign' });
  };
  $('fBoard').addEventListener('click', function (e) {
    var b = mp.board, h, g, piece, dests, i, match;
    if (!mpMyTurn()) return;
    g = gameOf(b);
    h = hit(this, e, mpFlip());
    if (B.canRoll(g)) { mpIntent({ kind: 'roll' }); return; }
    piece = selPiece(g, mp.sel);
    if (piece) {
      dests = filterDests(B.destsFor(g, piece), mp.dieSteps);
      for (i = 0; i < dests.length; i++) {
        if (B.destMatches(dests[i].dest, h, piece.type)) { match = dests[i]; break; }
      }
      if (match && B.tryMove(B.restore(b.snap), piece.id, match.steps)) {
        mp.sel = null; mp.dieSteps = 0;
        mpIntent({ kind: 'move', pieceId: piece.id, steps: match.steps });
        return;
      }
    }
    piece = pieceFromHit(g, h);
    if (piece && piece.type === g.turnPlayer.currentPieceType && B.destsFor(g, piece).length) {
      mp.sel = { kind: h.kind, pos: h.pos, type: h.type, pieceId: piece.id };
      mpRender(true);
      return;
    }
    mp.sel = autoSel(g);
    mpRender(true);
  });

  function mpRender(force) {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var g = gameOf(b);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">White · ' + nameOf(b.seats.white) + '</div>' +
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">Black · ' + nameOf(b.seats.black) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.white && p.id !== b.seats.black; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    setScore($('fScore'), g);
    var both = b.seats.white && b.seats.black;
    var mine = mpMyTurn();
    $('fRoll').disabled = !(mine && B.canRoll(g));
    $('fUndo').disabled = !(mine && B.canUndo(g));
    $('fConfirm').disabled = !(mine && B.canConfirm(g));
    $('fRoll').classList.toggle('go', mine && B.canRoll(g));
    $('fConfirm').classList.toggle('go', mine && B.canConfirm(g));
    if ((b.seq || 0) !== _mpSeqPaint) { mp.sel = mine ? autoSel(g) : null; mp.dieSteps = 0; }
    if (!both) {
      status.className = 'turnpill';
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = nameOf(b.winner === 'white' ? b.seats.white : b.seats.black);
      status.className = 'turnpill good';
      status.innerHTML = (esc(b.result || 'All fifteen off') + ' — ') + wname + ' wins. Next game starting…';
    } else if (!seat) {
      setStatus(status, 'Spectating.', '');
    } else if (mine) {
      if (B.canRoll(g)) setStatus(status, 'Your turn. Roll.', turnCls(g));
      else if (B.canConfirm(g) && !(g.turnDice.movesPlayed || []).length) setStatus(status, 'No move with this roll. Confirm.', turnCls(g));
      else if (B.canConfirm(g)) setStatus(status, 'No more moves. Confirm the turn.', turnCls(g));
      else if (B.onBar(g)) setStatus(status, 'You are on the bar. Tap a point to enter.', turnCls(g));
      else if (mp.sel) setStatus(status, 'Tap where it goes — or tap another checker.', turnCls(g));
      else setStatus(status, 'Your turn. Tap a checker, then where it goes.', turnCls(g));
    } else {
      setStatus(status, 'Waiting for ' + b.turn + '…', b.turn);
    }
    var hints = paintHints(g, mine ? mp.sel : null, mp.dieSteps);
    paint($('fBoard'), g, {
      flip: mpFlip(), dests: hints.dests, froms: mine ? hints.froms : [], selId: hints.selId
    });
    renderDice($('fDice'), g, mp.dieSteps, mine ? function (n) {
      mp.dieSteps = mp.dieSteps === n ? 0 : n; mpRender(true);
    } : null);
    _mpSeqPaint = b.seq || 0;
    $('fResign').hidden = !(seat && g.turnNumber > 1 && !b.winner);
  }

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (row) {
      if (!row || !row.snap || row.over) return;
      state.mode = row.mode || 'cpu';
      state.color = row.color || 'white';
      state.g = B.restore(row.snap);
      state.over = !!state.g.isOver;
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
      paintLocal();
      maybeCpu();
    }).catch(function () {});
  }
})();
