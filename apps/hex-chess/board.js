// Gliński hexagonal chess. 91 hexes, three colours, no castling.
// Cube coords: q = file (a=-5 … l=+5, letter j skipped), r = north along the file.
// A hex is on the board when max(|q|, |r|, |q+r|) ≤ 5.
// Classic script — no import/export.
(function (root) {
  'use strict';
  var N = 5;
  var FILES = 'abcdefghikl';
  var EMPTY = 0, WHITE = 1, BLACK = 2;
  var P = 1, NIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var TYPE = 7;
  var VALUES = [0, 100, 320, 330, 500, 900, 0];
  var GLYPH = {
    1: { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔' },
    2: { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' }
  };

  // Orthogonal (rook): through edges. Index 0 is White's forward (north).
  var ORTHO = [
    [0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]
  ];
  // Diagonal (bishop): through vertices. Colour-bound.
  var DIAG = [
    [1, 1], [2, -1], [1, -2], [-1, -1], [-2, 1], [-1, 2]
  ];
  var KING_DIRS = ORTHO.concat(DIAG);
  var KNIGHT = [];
  (function buildKnight() {
    var i, d, t, a, b;
    for (i = 0; i < 6; i++) {
      d = ORTHO[i];
      a = ORTHO[(i + 5) % 6];
      b = ORTHO[(i + 1) % 6];
      KNIGHT.push([2 * d[0] + a[0], 2 * d[1] + a[1]]);
      KNIGHT.push([2 * d[0] + b[0], 2 * d[1] + b[1]]);
    }
  })();

  var WHITE_PAWN_START = 'b1 c2 d3 e4 f5 g4 h3 i2 k1'.split(' ');
  var BLACK_PAWN_START = 'b7 c7 d7 e7 f7 g7 h7 i7 k7'.split(' ');
  var START_WHITE = [
    'Kg1', 'Qe1', 'Rc1', 'Ri1', 'Nd1', 'Nh1', 'Bf1', 'Bf2', 'Bf3',
    'Pb1', 'Pc2', 'Pd3', 'Pe4', 'Pf5', 'Pg4', 'Ph3', 'Pi2', 'Pk1'
  ];
  var START_BLACK = [
    'Kg10', 'Qe10', 'Rc8', 'Ri8', 'Nd9', 'Nh9', 'Bf9', 'Bf10', 'Bf11',
    'Pb7', 'Pc7', 'Pd7', 'Pe7', 'Pf7', 'Pg7', 'Ph7', 'Pi7', 'Pk7'
  ];
  var PIECE_LETTER = { K: KING, Q: QUEEN, R: ROOK, N: NIGHT, B: BISHOP, P: P };

  function inBoard(q, r) {
    var s = -q - r;
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= N;
  }
  function rMin(q) { return Math.max(-N, -N - q); }
  function rMax(q) { return Math.min(N, N - q); }
  function rankOf(q, r) { return r - rMin(q) + 1; }
  function hexColor(q, r) { return ((q - r) % 3 + 3) % 3; }
  function key(q, r) { return q + ',' + r; }
  function owner(p) { return p ? (p > 0 ? WHITE : BLACK) : EMPTY; }
  function ptype(p) { return p < 0 ? -p : p; }
  function pack(color, t) { return color === WHITE ? t : -t; }
  function alg(q, r) { return FILES[q + N] + rankOf(q, r); }

  function parseAlg(s) {
    if (!s) return null;
    var file = s.charAt(0), qi = FILES.indexOf(file), rank, q, r;
    if (qi < 0) return null;
    rank = parseInt(s.slice(1), 10);
    if (!(rank > 0)) return null;
    q = qi - N;
    r = rMin(q) + rank - 1;
    if (!inBoard(q, r)) return null;
    return { q: q, r: r };
  }

  function allHexes() {
    var out = [], q, r;
    for (q = -N; q <= N; q++) {
      for (r = rMin(q); r <= rMax(q); r++) out.push({ q: q, r: r });
    }
    return out;
  }

  var HEXES = allHexes();
  var WHITE_START_SET = {}, BLACK_START_SET = {};
  (function fillStarts() {
    var i, h;
    for (i = 0; i < WHITE_PAWN_START.length; i++) {
      h = parseAlg(WHITE_PAWN_START[i]);
      WHITE_START_SET[key(h.q, h.r)] = 1;
    }
    for (i = 0; i < BLACK_PAWN_START.length; i++) {
      h = parseAlg(BLACK_PAWN_START[i]);
      BLACK_START_SET[key(h.q, h.r)] = 1;
    }
  })();

  function onPawnStart(color, q, r) {
    return color === WHITE ? !!WHITE_START_SET[key(q, r)] : !!BLACK_START_SET[key(q, r)];
  }

  function clonePieces(p) {
    var o = {}, k;
    for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
    return o;
  }

  function parsePlace(list, color, pieces) {
    var i, tok, t, h, letter;
    for (i = 0; i < list.length; i++) {
      tok = list[i];
      letter = tok.charAt(0);
      t = PIECE_LETTER[letter];
      h = parseAlg(tok.slice(1));
      pieces[key(h.q, h.r)] = pack(color, t);
    }
  }

  function countSide(pieces) {
    var w = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0, n: 0 };
    var b = { P: 0, N: 0, B: 0, R: 0, Q: 0, K: 0, n: 0 };
    var names = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
    var k, p, t, bag;
    for (k in pieces) {
      p = pieces[k];
      if (!p) continue;
      t = ptype(p);
      bag = p > 0 ? w : b;
      bag[names[t]]++;
      bag.n++;
    }
    return { w: w, b: b };
  }

  function findKing(pieces, color) {
    var want = pack(color, KING), k, parts;
    for (k in pieces) {
      if (pieces[k] === want) {
        parts = k.split(',');
        return { q: +parts[0], r: +parts[1] };
      }
    }
    return null;
  }

  function occupied(pieces, q, r) { return pieces[key(q, r)] || 0; }

  function rayHits(pieces, q, r, dq, dr, color) {
    var out = [], nq = q + dq, nr = r + dr, p;
    while (inBoard(nq, nr)) {
      p = occupied(pieces, nq, nr);
      if (!p) out.push({ q: nq, r: nr, cap: 0 });
      else {
        if (owner(p) !== color) out.push({ q: nq, r: nr, cap: p });
        break;
      }
      nq += dq; nr += dr;
    }
    return out;
  }

  function attacksSquare(pieces, color, tq, tr) {
    var k, p, q, r, t, i, d, nq, nr, parts;
    for (k in pieces) {
      p = pieces[k];
      if (!p || owner(p) !== color) continue;
      parts = k.split(',');
      q = +parts[0]; r = +parts[1];
      t = ptype(p);
      if (t === NIGHT) {
        for (i = 0; i < KNIGHT.length; i++) {
          if (q + KNIGHT[i][0] === tq && r + KNIGHT[i][1] === tr) return true;
        }
      } else if (t === KING) {
        for (i = 0; i < KING_DIRS.length; i++) {
          if (q + KING_DIRS[i][0] === tq && r + KING_DIRS[i][1] === tr) return true;
        }
      } else if (t === P) {
        if (color === WHITE) {
          if ((q + 1 === tq && r === tr) || (q - 1 === tq && r + 1 === tr)) return true;
        } else {
          if ((q + 1 === tq && r - 1 === tr) || (q - 1 === tq && r === tr)) return true;
        }
      } else {
        if (t === ROOK || t === QUEEN) {
          for (i = 0; i < ORTHO.length; i++) {
            d = ORTHO[i]; nq = q + d[0]; nr = r + d[1];
            while (inBoard(nq, nr)) {
              if (nq === tq && nr === tr) return true;
              if (occupied(pieces, nq, nr)) break;
              nq += d[0]; nr += d[1];
            }
          }
        }
        if (t === BISHOP || t === QUEEN) {
          for (i = 0; i < DIAG.length; i++) {
            d = DIAG[i]; nq = q + d[0]; nr = r + d[1];
            while (inBoard(nq, nr)) {
              if (nq === tq && nr === tr) return true;
              if (occupied(pieces, nq, nr)) break;
              nq += d[0]; nr += d[1];
            }
          }
        }
      }
    }
    return false;
  }

  function inCheck(pieces, color) {
    var k = findKing(pieces, color);
    if (!k) return false;
    return attacksSquare(pieces, color === WHITE ? BLACK : WHITE, k.q, k.r);
  }

  function isPromo(color, q, r) {
    return color === WHITE ? r === rMax(q) : r === rMin(q);
  }

  function pushMove(out, fq, fr, tq, tr, cap, promo, ep) {
    out.push({
      fq: fq, fr: fr, tq: tq, tr: tr,
      cap: cap || 0, promo: promo || 0, ep: !!ep, castle: false
    });
  }

  function pawnMoves(pieces, q, r, color, ep, out) {
    var fwd = color === WHITE ? [0, 1] : [0, -1];
    var caps = color === WHITE ? [[1, 0], [-1, 1]] : [[1, -1], [-1, 0]];
    var nq = q + fwd[0], nr = r + fwd[1], i, cq, cr, p, types, ti;
    function emit(tq, tr, cap, isEp) {
      if (isPromo(color, tq, tr)) {
        types = [QUEEN, ROOK, BISHOP, NIGHT];
        for (ti = 0; ti < types.length; ti++) pushMove(out, q, r, tq, tr, cap, types[ti], isEp);
      } else pushMove(out, q, r, tq, tr, cap, 0, isEp);
    }
    if (inBoard(nq, nr) && !occupied(pieces, nq, nr)) {
      emit(nq, nr, 0, false);
      if (onPawnStart(color, q, r)) {
        nq = q + 2 * fwd[0]; nr = r + 2 * fwd[1];
        if (inBoard(nq, nr) && !occupied(pieces, nq, nr) &&
            !occupied(pieces, q + fwd[0], r + fwd[1])) {
          emit(nq, nr, 0, false);
        }
      }
    }
    for (i = 0; i < caps.length; i++) {
      cq = q + caps[i][0]; cr = r + caps[i][1];
      if (!inBoard(cq, cr)) continue;
      p = occupied(pieces, cq, cr);
      if (p && owner(p) !== color) emit(cq, cr, p, false);
      else if (ep && ep.q === cq && ep.r === cr) {
        emit(cq, cr, pack(color === WHITE ? BLACK : WHITE, P), true);
      }
    }
  }

  function genPseudo(pieces, color, ep) {
    var out = [], k, p, q, r, t, i, d, hits, h, nq, nr, dest, parts;
    for (k in pieces) {
      p = pieces[k];
      if (!p || owner(p) !== color) continue;
      parts = k.split(',');
      q = +parts[0]; r = +parts[1];
      t = ptype(p);
      if (t === P) pawnMoves(pieces, q, r, color, ep, out);
      else if (t === NIGHT) {
        for (i = 0; i < KNIGHT.length; i++) {
          nq = q + KNIGHT[i][0]; nr = r + KNIGHT[i][1];
          if (!inBoard(nq, nr)) continue;
          dest = occupied(pieces, nq, nr);
          if (!dest || owner(dest) !== color) pushMove(out, q, r, nq, nr, dest, 0, false);
        }
      } else if (t === KING) {
        for (i = 0; i < KING_DIRS.length; i++) {
          nq = q + KING_DIRS[i][0]; nr = r + KING_DIRS[i][1];
          if (!inBoard(nq, nr)) continue;
          dest = occupied(pieces, nq, nr);
          if (!dest || owner(dest) !== color) pushMove(out, q, r, nq, nr, dest, 0, false);
        }
      } else {
        if (t === ROOK || t === QUEEN) {
          for (i = 0; i < ORTHO.length; i++) {
            d = ORTHO[i];
            hits = rayHits(pieces, q, r, d[0], d[1], color);
            for (h = 0; h < hits.length; h++) pushMove(out, q, r, hits[h].q, hits[h].r, hits[h].cap, 0, false);
          }
        }
        if (t === BISHOP || t === QUEEN) {
          for (i = 0; i < DIAG.length; i++) {
            d = DIAG[i];
            hits = rayHits(pieces, q, r, d[0], d[1], color);
            for (h = 0; h < hits.length; h++) pushMove(out, q, r, hits[h].q, hits[h].r, hits[h].cap, 0, false);
          }
        }
      }
    }
    return out;
  }

  function applyUnsafe(s, m) {
    var pieces = clonePieces(s.pieces);
    var mover = pieces[key(m.fq, m.fr)];
    var color = owner(mover);
    var fwd = color === WHITE ? [0, 1] : [0, -1];
    var placed = m.promo ? pack(color, m.promo) : mover;
    var ep = null, capQ, capR;
    delete pieces[key(m.fq, m.fr)];
    if (m.ep) {
      capQ = m.tq - fwd[0];
      capR = m.tr - fwd[1];
      delete pieces[key(capQ, capR)];
    }
    pieces[key(m.tq, m.tr)] = placed;
    if (ptype(mover) === P && m.tr === m.fr + 2 * fwd[1] && m.tq === m.fq) {
      ep = { q: m.fq + fwd[0], r: m.fr + fwd[1] };
    }
    return { pieces: pieces, ep: ep, color: color };
  }

  function sameMove(a, b) {
    return a.fq === b.fq && a.fr === b.fr && a.tq === b.tq && a.tr === b.tr &&
      (a.promo || 0) === (b.promo || 0);
  }

  function legalMoves(s) {
    if (!s || s.winner) return [];
    var raw = genPseudo(s.pieces, s.turn, s.ep);
    var out = [], i, u;
    for (i = 0; i < raw.length; i++) {
      u = applyUnsafe(s, raw[i]);
      if (!inCheck(u.pieces, s.turn)) out.push(raw[i]);
    }
    return out;
  }

  function outcome(pieces, turn) {
    var probe = { pieces: pieces, turn: turn, ep: null, winner: null };
    var ms = legalMoves(probe);
    var check = inCheck(pieces, turn);
    if (ms.length) return { winner: null, check: check, result: '' };
    if (check) {
      return {
        winner: turn === WHITE ? BLACK : WHITE,
        check: true,
        result: 'checkmate'
      };
    }
    return {
      winner: turn === WHITE ? BLACK : WHITE,
      check: false,
      result: 'stalemate'
    };
  }

  function fresh() {
    var pieces = {};
    parsePlace(START_WHITE, WHITE, pieces);
    parsePlace(START_BLACK, BLACK, pieces);
    return {
      pieces: pieces, turn: WHITE, ep: null, last: null,
      winner: null, result: '', check: false, n: 0
    };
  }

  function applyMove(s, m) {
    if (!s || s.winner || !m) return null;
    var legal = legalMoves(s), i, found = null;
    for (i = 0; i < legal.length; i++) {
      if (sameMove(legal[i], m)) { found = legal[i]; break; }
    }
    if (!found) return null;
    var u = applyUnsafe(s, found);
    var nextTurn = s.turn === WHITE ? BLACK : WHITE;
    var end = outcome(u.pieces, nextTurn);
    return {
      pieces: u.pieces,
      turn: end.winner ? s.turn : nextTurn,
      ep: u.ep,
      last: {
        fq: found.fq, fr: found.fr, tq: found.tq, tr: found.tr,
        cap: found.cap, promo: found.promo, ep: found.ep, color: s.turn
      },
      winner: end.winner,
      result: end.result,
      check: end.check,
      n: s.n + 1
    };
  }

  function play(s, fq, fr, tq, tr, promo) {
    return applyMove(s, { fq: fq, fr: fr, tq: tq, tr: tr, promo: promo || 0 });
  }

  function replay(moves) {
    var s = fresh(), i, m, ns;
    for (i = 0; i < (moves || []).length; i++) {
      m = moves[i];
      ns = play(s, m.fq, m.fr, m.tq, m.tr, m.promo || 0);
      if (!ns) break;
      s = ns;
    }
    return s;
  }

  function colorName(n) {
    if (n === WHITE) return 'white';
    if (n === BLACK) return 'black';
    return '';
  }
  function colorNum(name) {
    if (name === 'white' || name === 'w') return WHITE;
    if (name === 'black' || name === 'b') return BLACK;
    return EMPTY;
  }

  function cubeDist(q1, r1, q2, r2) {
    var z1 = -q1 - r1, z2 = -q2 - r2;
    return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(z1 - z2));
  }

  function pixel(q, r, size) {
    return {
      x: size * Math.sqrt(3) / 2 * q,
      y: -size * (r + q / 2)
    };
  }

  function cubeRound(x, y, z) {
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    var dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: ry };
  }

  function atPixel(px, py, size) {
    var q = (2 / Math.sqrt(3)) * px / size;
    var r = (-py / size) - q / 2;
    var z = -q - r;
    var h = cubeRound(q, r, z);
    if (!inBoard(h.q, h.r)) return null;
    return h;
  }

  function material(pieces) {
    var k, p, n = 0;
    for (k in pieces) {
      p = pieces[k];
      if (!p) continue;
      n += (p > 0 ? 1 : -1) * VALUES[ptype(p)];
    }
    return n;
  }

  function evaluate(s) {
    if (s.winner) {
      if (s.result === 'stalemate') return s.winner === WHITE ? 60000 : -60000;
      return s.winner === WHITE ? 100000 : -100000;
    }
    var sc = material(s.pieces);
    var k, p, parts, q, r, t, mob = 0;
    for (k in s.pieces) {
      p = s.pieces[k];
      if (!p) continue;
      parts = k.split(',');
      q = +parts[0]; r = +parts[1];
      t = ptype(p);
      sc += (p > 0 ? 1 : -1) * (6 - Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)));
      if (t === P) sc += (p > 0 ? 1 : -1) * r * 4;
    }
    if (s.check) sc += s.turn === WHITE ? -18 : 18;
    return sc;
  }

  function aiMove(s, budgetMs) {
    var moves = legalMoves(s);
    if (!moves.length) return null;
    var t0 = Date.now ? Date.now() : 0;
    var budget = budgetMs || 60;
    var i, ns, sc, best = -1e15, pool = [], m, reply, j, worst, rs, capBonus;
    var me = s.turn === WHITE ? 1 : -1;
    for (i = 0; i < moves.length; i++) {
      m = moves[i];
      ns = applyMove(s, m);
      if (!ns) continue;
      sc = me * evaluate(ns);
      capBonus = m.cap ? (20 + VALUES[ptype(m.cap)] / 10) : 0;
      sc += capBonus;
      if (m.promo) sc += 40;
      if (ns.result === 'checkmate') sc += 50000;
      else if (ns.result === 'stalemate') sc += 8000;
      else if (ns.check) sc += 12;
      if (ns && !ns.winner && (Date.now() - t0) < budget) {
        reply = legalMoves(ns);
        worst = 1e15;
        for (j = 0; j < reply.length && j < 24; j++) {
          if (Date.now() - t0 > budget) break;
          rs = applyMove(ns, reply[j]);
          if (!rs) continue;
          worst = Math.min(worst, me * evaluate(rs));
        }
        if (worst < 1e14) sc = sc * 0.35 + worst * 0.65;
      }
      if (sc > best + 8) { best = sc; pool = [m]; }
      else if (sc > best - 8) { if (sc > best) best = sc; pool.push(m); }
    }
    if (!pool.length) return moves[0];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pieceGlyph(p) {
    if (!p) return '';
    return GLYPH[owner(p)][ptype(p)];
  }

  function dump(s) {
    var k, o = {};
    for (k in s.pieces) o[k] = s.pieces[k];
    return o;
  }

  root.HEX = {
    N: N, FILES: FILES, HEXES: HEXES,
    EMPTY: EMPTY, WHITE: WHITE, BLACK: BLACK,
    P: P, NIGHT: NIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
    ORTHO: ORTHO, DIAG: DIAG, KNIGHT: KNIGHT, KING_DIRS: KING_DIRS,
    inBoard: inBoard, rMin: rMin, rMax: rMax, rankOf: rankOf,
    hexColor: hexColor, key: key, alg: alg, parseAlg: parseAlg,
    owner: owner, ptype: ptype, pack: pack, pieceGlyph: pieceGlyph,
    onPawnStart: onPawnStart, countSide: countSide, findKing: findKing,
    inCheck: inCheck, attacksSquare: attacksSquare,
    legalMoves: legalMoves, genPseudo: genPseudo,
    fresh: fresh, play: play, applyMove: applyMove, replay: replay,
    colorName: colorName, colorNum: colorNum, cubeDist: cubeDist,
    pixel: pixel, atPixel: atPixel, evaluate: evaluate, aiMove: aiMove,
    material: material, dump: dump,
    WHITE_PAWN_START: WHITE_PAWN_START, BLACK_PAWN_START: BLACK_PAWN_START
  };
})(typeof window !== 'undefined' ? window : this);
