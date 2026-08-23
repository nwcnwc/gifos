// One Stroke rules. A picture is an ordered stack of strokes. Each seat
// may add exactly one stroke per turn; the host is the only writer of
// the picture row. Classic script — no import/export.
(function (root) {
  'use strict';

  var MAX_PTS = 192;
  var MAX_SEATS = 8;
  var MAX_TITLE = 40;
  var COLORS = ['#f4efe6', '#e85d4c', '#f4c95d', '#6dce7a', '#6eb5ff', '#c9a0ff', '#ff8ad4'];
  var WIDTHS = [0.012, 0.022, 0.038];
  var SUGGESTIONS = [
    'A secret',
    'Two cats',
    'The weather',
    'A map',
    'Untitled',
    'After dark',
    'Something we made',
    'A small storm'
  ];

  function clone(p) {
    return JSON.parse(JSON.stringify(p));
  }

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function clamp01(n) {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function legalPts(pts) {
    if (!pts || !pts.length || pts.length < 2 || pts.length > MAX_PTS) return null;
    var out = [], i, p, x, y, last, dx, dy;
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      if (!isFinite(p.x) || !isFinite(p.y)) return null;
      x = clamp01(round3(p.x));
      y = clamp01(round3(p.y));
      last = out[out.length - 1];
      if (last) {
        dx = x - last.x;
        dy = y - last.y;
        if (dx * dx + dy * dy < 1e-10 && i !== pts.length - 1) continue;
      }
      out.push({ x: x, y: y });
    }
    return out.length >= 2 ? out : null;
  }

  function legalStroke(intent) {
    if (!intent) return null;
    if (COLORS.indexOf(intent.c) < 0) return null;
    if (WIDTHS.indexOf(intent.w) < 0) return null;
    var pts = legalPts(intent.pts);
    if (!pts) return null;
    return { pts: pts, c: intent.c, w: intent.w };
  }

  function sanitizeTitle(s) {
    if (typeof s !== 'string') return '';
    var t = s.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim();
    if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE).trim();
    return t;
  }

  function fresh(seatIds, opts) {
    opts = opts || {};
    var seats = [];
    var i, id;
    for (i = 0; i < (seatIds || []).length && seats.length < MAX_SEATS; i++) {
      id = seatIds[i];
      if (!id || seats.indexOf(id) >= 0) continue;
      seats.push(id);
    }
    return {
      id: 'picture',
      host: opts.host || seats[0] || '',
      seats: seats,
      names: opts.names ? clone(opts.names) : {},
      strokes: [],
      turn: 0,
      seq: opts.seq || 0,
      phase: 'draw',
      round: 1,
      title: '',
      suggestions: (opts.suggestions || SUGGESTIONS).slice(),
      votes: {},
      startedAt: opts.now || 0
    };
  }

  function actorOf(pic) {
    if (!pic || pic.phase !== 'draw' || !pic.seats || !pic.seats.length) return null;
    return pic.seats[pic.turn] || null;
  }

  function drewThisRound(pic, playerId) {
    var n = (pic.seats && pic.seats.length) || 0;
    if (!n) return false;
    var start = pic.strokes.length - (pic.strokes.length % n);
    var i;
    for (i = start; i < pic.strokes.length; i++) {
      if (pic.strokes[i] && pic.strokes[i].by === playerId) return true;
    }
    return false;
  }

  function maybeEndRound(pic) {
    if (pic.phase !== 'draw') return pic;
    if (pic.seats.length < 2) return pic;
    if (pic.turn !== 0) return pic;
    if (!pic.strokes.length) return pic;
    pic.phase = 'vote';
    pic.votes = {};
    return pic;
  }

  function winningTitle(pic) {
    var counts = {}, i, id, t, best = '', bestN = 0;
    var votes = pic.votes || {};
    for (i = 0; i < pic.seats.length; i++) {
      id = pic.seats[i];
      t = votes[id];
      if (!t) continue;
      counts[t] = (counts[t] || 0) + 1;
    }
    function prefer(a, b) {
      var ia = pic.suggestions.indexOf(a);
      var ib = pic.suggestions.indexOf(b);
      if (ia >= 0 && ib < 0) return true;
      if (ia < 0 && ib >= 0) return false;
      if (ia >= 0 && ib >= 0) return ia < ib;
      return a < b;
    }
    for (t in counts) {
      if (!Object.prototype.hasOwnProperty.call(counts, t)) continue;
      if (counts[t] > bestN || (counts[t] === bestN && prefer(t, best))) {
        bestN = counts[t];
        best = t;
      }
    }
    return best || 'Untitled';
  }

  function applyIntent(pic, playerId, intent) {
    if (!pic || !playerId || !intent) return null;
    if (intent.seq !== pic.seq) return null;
    var next, s, title, allIn, i;

    if (intent.kind === 'stroke') {
      if (pic.phase !== 'draw') return null;
      if (actorOf(pic) !== playerId) return null;
      if (drewThisRound(pic, playerId)) return null;
      s = legalStroke(intent);
      if (!s) return null;
      next = clone(pic);
      next.strokes = pic.strokes.concat([{
        n: pic.strokes.length,
        by: playerId,
        pts: s.pts,
        c: s.c,
        w: s.w
      }]);
      next.seq = pic.seq + 1;
      next.turn = (pic.turn + 1) % Math.max(1, pic.seats.length);
      return maybeEndRound(next);
    }

    if (intent.kind === 'vote') {
      if (pic.phase !== 'vote') return null;
      if (pic.seats.indexOf(playerId) < 0) return null;
      title = sanitizeTitle(intent.title);
      if (!title) return null;
      next = clone(pic);
      next.votes = pic.votes ? clone(pic.votes) : {};
      if (next.votes[playerId] === title) return null;
      next.votes[playerId] = title;
      allIn = true;
      for (i = 0; i < next.seats.length; i++) {
        if (!next.votes[next.seats[i]]) { allIn = false; break; }
      }
      if (allIn) {
        next.title = winningTitle(next);
        next.phase = 'play';
        next.seq = pic.seq + 1;
      }
      return next;
    }

    if (intent.kind === 'again') {
      if (pic.phase !== 'play') return null;
      if (pic.seats.indexOf(playerId) < 0) return null;
      next = clone(pic);
      next.phase = 'draw';
      next.turn = 0;
      next.seq = pic.seq + 1;
      next.votes = {};
      next.round = (pic.round || 1) + 1;
      return next;
    }

    if (intent.kind === 'new') {
      if (pic.phase !== 'play' && pic.phase !== 'vote' && pic.phase !== 'draw') return null;
      if (pic.seats.indexOf(playerId) < 0) return null;
      next = fresh(pic.seats, {
        host: pic.host,
        names: pic.names,
        seq: pic.seq + 1,
        suggestions: pic.suggestions,
        now: pic.startedAt
      });
      return next;
    }

    return null;
  }

  // Host batch: walk rows in order. A second stroke from the same seat in
  // the same turn is skipped, then refused by applyIntent if it still lands.
  function applyIntents(pic, rows) {
    var cur = pic, i, row, next, sawStroke = {};
    for (i = 0; i < (rows || []).length; i++) {
      row = rows[i];
      if (!row || !row.id || !row.intent) continue;
      if (row.intent.kind === 'stroke' && sawStroke[row.id]) continue;
      next = applyIntent(cur, row.id, row.intent);
      if (next) {
        if (row.intent.kind === 'stroke') sawStroke[row.id] = true;
        cur = next;
      }
    }
    return cur === pic ? null : cur;
  }

  function skipAbsent(pic, liveIds) {
    if (!pic || pic.phase !== 'draw') return null;
    var actor = actorOf(pic);
    if (!actor) return null;
    if (liveIds && liveIds[actor]) return null;
    if (!pic.seats.length) return null;
    var next = clone(pic);
    next.turn = (pic.turn + 1) % pic.seats.length;
    next.seq = pic.seq + 1;
    return maybeEndRound(next);
  }

  function playback(picOrStrokes) {
    var list = Array.isArray(picOrStrokes)
      ? picOrStrokes
      : ((picOrStrokes && picOrStrokes.strokes) || []);
    return list.slice().sort(function (a, b) {
      var na = (a && a.n != null) ? a.n : 0;
      var nb = (b && b.n != null) ? b.n : 0;
      if (na !== nb) return na - nb;
      return 0;
    });
  }

  function pathLen(pts) {
    var n = 0, i;
    for (i = 1; i < (pts || []).length; i++) {
      n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return n;
  }

  function compactPts(pts) {
    var out = [], i, p, x, y, last, dx, dy;
    for (i = 0; i < (pts || []).length && out.length < MAX_PTS; i++) {
      p = pts[i];
      if (!p) continue;
      x = clamp01(round3(+p.x));
      y = clamp01(round3(+p.y));
      last = out[out.length - 1];
      if (last) {
        dx = x - last.x;
        dy = y - last.y;
        if (dx * dx + dy * dy < 0.000018 && i !== pts.length - 1) continue;
      }
      out.push({ x: x, y: y });
    }
    return out;
  }

  root.OS = {
    MAX_PTS: MAX_PTS,
    MAX_SEATS: MAX_SEATS,
    MAX_TITLE: MAX_TITLE,
    COLORS: COLORS,
    WIDTHS: WIDTHS,
    SUGGESTIONS: SUGGESTIONS,
    fresh: fresh,
    legalPts: legalPts,
    legalStroke: legalStroke,
    sanitizeTitle: sanitizeTitle,
    actorOf: actorOf,
    drewThisRound: drewThisRound,
    applyIntent: applyIntent,
    applyIntents: applyIntents,
    skipAbsent: skipAbsent,
    playback: playback,
    compactPts: compactPts,
    pathLen: pathLen,
    winningTitle: winningTitle
  };
})(typeof window !== 'undefined' ? window : this);
