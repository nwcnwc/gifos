// A compact but complete chess rules model: legal-move generation with king
// safety, castling, en passant and promotion, plus FEN in/out and UCI move
// mapping. The Stockfish engine is authoritative for its own moves (we just
// apply the UCI string it returns); this model exists so the human side gets
// correct click-to-move highlighting and so we can render checkmate/stalemate.
//
// Board: a 64-char string, index = y*8 + x, with y=0 = rank 8 (top) and
// x=0 = file a — the same convention the default Chess app uses. Uppercase is
// White, lowercase Black, '.' is empty.
(function () {
  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';

  const at = (bd, x, y) => (x < 0 || x > 7 || y < 0 || y > 7) ? null : bd[y * 8 + x];
  const isW = (p) => p >= 'A' && p <= 'Z';
  const white = (p) => p !== '.' && isW(p);
  const black = (p) => p !== '.' && !isW(p);

  function fresh() {
    return { board: START, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: null, half: 0, full: 1 };
  }
  function clone(s) {
    return { board: s.board, turn: s.turn, castle: { K: s.castle.K, Q: s.castle.Q, k: s.castle.k, q: s.castle.q }, ep: s.ep ? [s.ep[0], s.ep[1]] : null, half: s.half, full: s.full };
  }

  // Is square (tx,ty) attacked by the given side?
  function attacked(bd, tx, ty, byWhite) {
    const pd = byWhite ? 1 : -1; // the attacking pawn sits one rank "behind" the target
    for (const dx of [-1, 1]) { const p = at(bd, tx + dx, ty + pd); if (p && p === (byWhite ? 'P' : 'p')) return true; }
    for (const d of KN) { const p = at(bd, tx + d[0], ty + d[1]); if (p && p === (byWhite ? 'N' : 'n')) return true; }
    for (const d of KING) { const p = at(bd, tx + d[0], ty + d[1]); if (p && p === (byWhite ? 'K' : 'k')) return true; }
    for (const d of ROOK) { let nx = tx + d[0], ny = ty + d[1]; for (;;) { const p = at(bd, nx, ny); if (p === null) break; if (p !== '.') { if (byWhite ? (p === 'R' || p === 'Q') : (p === 'r' || p === 'q')) return true; break; } nx += d[0]; ny += d[1]; } }
    for (const d of BISHOP) { let nx = tx + d[0], ny = ty + d[1]; for (;;) { const p = at(bd, nx, ny); if (p === null) break; if (p !== '.') { if (byWhite ? (p === 'B' || p === 'Q') : (p === 'b' || p === 'q')) return true; break; } nx += d[0]; ny += d[1]; } }
    return false;
  }
  function kingPos(bd, w) { const k = w ? 'K' : 'k'; const i = bd.indexOf(k); return i < 0 ? null : [i % 8, (i / 8) | 0]; }
  function inCheck(s, w) { const kp = kingPos(s.board, w); return kp ? attacked(s.board, kp[0], kp[1], !w) : false; }

  // Pseudo-legal moves for the side to move (king-safety not yet checked).
  function pseudo(s) {
    const bd = s.board, wh = s.turn === 'w', out = [];
    const mineP = wh ? white : black, foeP = wh ? black : white;
    const add = (fx, fy, tx, ty, extra) => { out.push(Object.assign({ from: [fx, fy], to: [tx, ty] }, extra || {})); };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const p = bd[y * 8 + x]; if (p === '.' || !mineP(p)) continue;
      const t = p.toLowerCase();
      if (t === 'p') {
        const dir = wh ? -1 : 1, start = wh ? 6 : 1, promoRank = wh ? 0 : 7;
        // forward
        if (at(bd, x, y + dir) === '.') {
          if (y + dir === promoRank) ['q', 'r', 'b', 'n'].forEach((pr) => add(x, y, x, y + dir, { promo: pr }));
          else add(x, y, x, y + dir);
          if (y === start && at(bd, x, y + 2 * dir) === '.') add(x, y, x, y + 2 * dir, { dbl: true });
        }
        // captures + en passant
        for (const dx of [-1, 1]) {
          const tx = x + dx, ty = y + dir, q = at(bd, tx, ty);
          if (q && q !== '.' && foeP(q)) {
            if (ty === promoRank) ['q', 'r', 'b', 'n'].forEach((pr) => add(x, y, tx, ty, { promo: pr }));
            else add(x, y, tx, ty);
          } else if (s.ep && s.ep[0] === tx && s.ep[1] === ty) {
            add(x, y, tx, ty, { ep: true });
          }
        }
      } else if (t === 'n') {
        for (const d of KN) { const q = at(bd, x + d[0], y + d[1]); if (q !== null && (q === '.' || foeP(q))) add(x, y, x + d[0], y + d[1]); }
      } else if (t === 'k') {
        for (const d of KING) { const q = at(bd, x + d[0], y + d[1]); if (q !== null && (q === '.' || foeP(q))) add(x, y, x + d[0], y + d[1]); }
        // castling: rights set, squares empty, king not in/through check
        const rank = wh ? 7 : 0;
        if (y === rank && x === 4 && !attacked(bd, 4, rank, !wh)) {
          const cK = wh ? s.castle.K : s.castle.k, cQ = wh ? s.castle.Q : s.castle.q;
          if (cK && at(bd, 5, rank) === '.' && at(bd, 6, rank) === '.' && (wh ? bd[rank * 8 + 7] === 'R' : bd[rank * 8 + 7] === 'r') &&
            !attacked(bd, 5, rank, !wh) && !attacked(bd, 6, rank, !wh)) add(4, rank, 6, rank, { castle: 'K' });
          if (cQ && at(bd, 3, rank) === '.' && at(bd, 2, rank) === '.' && at(bd, 1, rank) === '.' && (wh ? bd[rank * 8 + 0] === 'R' : bd[rank * 8 + 0] === 'r') &&
            !attacked(bd, 3, rank, !wh) && !attacked(bd, 2, rank, !wh)) add(4, rank, 2, rank, { castle: 'Q' });
        }
      } else {
        const rays = t === 'r' ? ROOK : t === 'b' ? BISHOP : ROOK.concat(BISHOP);
        for (const d of rays) { let nx = x + d[0], ny = y + d[1]; for (;;) { const q = at(bd, nx, ny); if (q === null) break; if (q === '.') { add(x, y, nx, ny); } else { if (foeP(q)) add(x, y, nx, ny); break; } nx += d[0]; ny += d[1]; } }
      }
    }
    return out;
  }

  // Apply a move to a fresh state (assumes the move is legal/pseudo-legal).
  function make(s, mv) {
    const n = clone(s); const a = n.board.split('');
    const wh = s.turn === 'w';
    const [fx, fy] = mv.from, [tx, ty] = mv.to;
    let p = a[fy * 8 + fx];
    const captured = a[ty * 8 + tx];
    a[fy * 8 + fx] = '.';
    // en passant capture removes the pawn beside the target
    if (mv.ep) a[fy * 8 + tx] = '.';
    // promotion
    if (mv.promo) p = wh ? mv.promo.toUpperCase() : mv.promo;
    a[ty * 8 + tx] = p;
    // castling: move the rook too
    if (mv.castle) {
      const rank = wh ? 7 : 0;
      if (mv.castle === 'K') { a[rank * 8 + 5] = a[rank * 8 + 7]; a[rank * 8 + 7] = '.'; }
      else { a[rank * 8 + 3] = a[rank * 8 + 0]; a[rank * 8 + 0] = '.'; }
    }
    n.board = a.join('');
    // castling rights
    if (p === 'K') { n.castle.K = n.castle.Q = false; }
    if (p === 'k') { n.castle.k = n.castle.q = false; }
    const touch = (x, y) => {
      if (x === 0 && y === 7) n.castle.Q = false; if (x === 7 && y === 7) n.castle.K = false;
      if (x === 0 && y === 0) n.castle.q = false; if (x === 7 && y === 0) n.castle.k = false;
    };
    touch(fx, fy); touch(tx, ty);
    // en passant target (only when a pawn goes two)
    n.ep = mv.dbl ? [fx, (fy + ty) / 2] : null;
    // clocks
    n.half = (p.toLowerCase() === 'p' || (captured && captured !== '.')) ? 0 : s.half + 1;
    if (!wh) n.full = s.full + 1;
    n.turn = wh ? 'b' : 'w';
    return n;
  }

  function legal(s) { return pseudo(s).filter((mv) => { const n = make(s, mv); return !inCheck(n, s.turn === 'w'); }); }

  function status(s) {
    const moves = legal(s);
    if (moves.length) return inCheck(s, s.turn === 'w') ? 'check' : 'normal';
    return inCheck(s, s.turn === 'w') ? 'checkmate' : 'stalemate';
  }

  function toFEN(s) {
    const rows = [];
    for (let y = 0; y < 8; y++) { let row = '', run = 0; for (let x = 0; x < 8; x++) { const c = s.board[y * 8 + x]; if (c === '.') run++; else { if (run) { row += run; run = 0; } row += c; } } if (run) row += run; rows.push(row); }
    let cs = (s.castle.K ? 'K' : '') + (s.castle.Q ? 'Q' : '') + (s.castle.k ? 'k' : '') + (s.castle.q ? 'q' : ''); if (!cs) cs = '-';
    const ep = s.ep ? 'abcdefgh'[s.ep[0]] + (8 - s.ep[1]) : '-';
    return rows.join('/') + ' ' + s.turn + ' ' + cs + ' ' + ep + ' ' + s.half + ' ' + s.full;
  }

  const sqToUci = (x, y) => 'abcdefgh'[x] + (8 - y);
  const moveToUci = (mv) => sqToUci(mv.from[0], mv.from[1]) + sqToUci(mv.to[0], mv.to[1]) + (mv.promo || '');
  function uciToMove(s, uci) {
    const norm = String(uci || '').trim().toLowerCase();
    return legal(s).find((mv) => moveToUci(mv) === norm) || legal(s).find((mv) => moveToUci(mv).slice(0, 4) === norm.slice(0, 4)) || null;
  }

  window.GM = window.GM || {};
  window.GM.Chess = { fresh, clone, legal, make, status, inCheck, toFEN, moveToUci, uciToMove, sqToUci, START };
})();
