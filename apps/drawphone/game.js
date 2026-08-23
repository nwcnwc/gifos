// Drawphone chain rules. No server. Host applies intents; players only
// publish their own turn. Telephone: word → drawing → guess → drawing → …
(function (root) {
  'use strict';
  var DP = root.DP || (root.DP = {});
  DP.MIN = 2;

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  DP.pickWord = function (rng) {
    var list = DP.WORDS || ['cat'];
    rng = rng || Math.random;
    return list[(rng() * list.length) | 0];
  };

  DP.turnsWanted = function (n, wordFirst) {
    var T = n | 0;
    if (T < 1) T = 1;
    if (wordFirst) {
      if (T % 2 === 0) T++;
      if (T < 3) T = 3;
    } else {
      if (T % 2 === 1) T++;
      if (T < 2) T = 2;
    }
    return T;
  };

  DP.expectedKind = function (b) {
    if (!b) return 'word';
    if (b.wordFirst) return (b.turn % 2 === 0) ? 'word' : 'draw';
    return (b.turn % 2 === 0) ? 'draw' : 'word';
  };

  DP.actorOn = function (b, chainIndex) {
    if (!b || !b.order || !b.chains || !b.chains[chainIndex]) return null;
    var n = b.order.length, owner = b.chains[chainIndex].owner, i, idx = -1;
    for (i = 0; i < n; i++) if (b.order[i] === owner) idx = i;
    if (idx < 0) return null;
    return b.order[(idx + (b.turn | 0)) % n];
  };

  DP.actors = function (b) {
    var seen = {}, out = [], i, id;
    if (!b || !b.chains) return out;
    for (i = 0; i < b.chains.length; i++) {
      id = DP.actorOn(b, i);
      if (id && !seen[id]) { seen[id] = 1; out.push(id); }
    }
    return out;
  };

  DP.promptFor = function (b, playerId) {
    if (!b || b.phase !== 'play') return null;
    var i, actor, chain, last;
    for (i = 0; i < b.chains.length; i++) {
      actor = DP.actorOn(b, i);
      if (actor !== playerId) continue;
      chain = b.chains[i];
      last = chain.links.length ? chain.links[chain.links.length - 1] : null;
      return {
        chain: i,
        kind: DP.expectedKind(b),
        last: last,
        turn: b.turn,
        turns: b.turns
      };
    }
    return null;
  };

  function capStrokes(strokes) {
    if (!strokes || !strokes.length) return [];
    var out = [], i, s, p, j, n;
    for (i = 0; i < strokes.length && out.length < 250; i++) {
      s = strokes[i];
      if (!s || !s.p || !s.p.length) continue;
      p = [];
      n = s.p.length;
      if (n > 600) n = 600;
      for (j = 0; j < n; j++) p.push(s.p[j] | 0);
      if (p.length >= 2) {
        out.push({
          c: String(s.c || '#111111').slice(0, 16),
          w: Math.min(24, Math.max(1, s.w | 0)),
          p: p
        });
      }
    }
    return out;
  }

  DP.capStrokes = capStrokes;

  DP.start = function (people, opts) {
    opts = opts || {};
    var wordFirst = !!opts.wordFirst;
    var rng = opts.rng || Math.random;
    var ids = [], names = {}, i, j, t, p;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (!p || !p.id) continue;
      ids.push(p.id);
      names[p.id] = p.name || 'Player';
    }
    for (i = ids.length - 1; i > 0; i--) {
      j = (rng() * (i + 1)) | 0;
      t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    var T = DP.turnsWanted(ids.length, wordFirst);
    var chains = [];
    for (i = 0; i < ids.length; i++) {
      chains.push({
        id: i,
        owner: ids[i],
        links: wordFirst ? [] : [{ type: 'word', by: null, word: DP.pickWord(rng), seed: true }]
      });
    }
    var host = opts.host || ids.slice().sort()[0];
    return {
      id: 'board',
      phase: 'play',
      wordFirst: wordFirst,
      turn: 0,
      turns: T,
      seq: 1,
      order: ids,
      chains: chains,
      names: names,
      host: host,
      startedAt: Date.now ? Date.now() : 0
    };
  };

  DP.applyIntents = function (board, intentsById) {
    if (!board || board.phase !== 'play') return null;
    var need = DP.actors(board);
    var kind = DP.expectedKind(board);
    var i, id, intent, word;
    if (!need.length) return null;
    for (i = 0; i < need.length; i++) {
      intent = intentsById[need[i]];
      if (!intent || intent.seq !== board.seq || intent.kind !== kind) return null;
      if (kind === 'word') {
        word = intent.word ? String(intent.word).replace(/^\s+|\s+$/g, '') : '';
        if (!word) return null;
      } else {
        if (!intent.strokes || !intent.strokes.length) return null;
      }
    }
    var next = clone(board);
    for (i = 0; i < next.chains.length; i++) {
      id = DP.actorOn(board, i);
      intent = intentsById[id];
      var link = { type: kind, by: id };
      if (kind === 'word') link.word = String(intent.word).replace(/^\s+|\s+$/g, '').slice(0, 80);
      else link.strokes = capStrokes(intent.strokes);
      next.chains[i].links.push(link);
    }
    next.turn = (next.turn | 0) + 1;
    next.seq = (next.seq | 0) + 1;
    if (next.turn >= next.turns) next.phase = 'results';
    return next;
  };

  DP.firstWord = function (chain) {
    var i, L;
    if (!chain || !chain.links) return '';
    for (i = 0; i < chain.links.length; i++) {
      L = chain.links[i];
      if (L && L.type === 'word' && L.word) return L.word;
    }
    return '';
  };

  DP.lastWord = function (chain) {
    var i, L;
    if (!chain || !chain.links) return '';
    for (i = chain.links.length - 1; i >= 0; i--) {
      L = chain.links[i];
      if (L && L.type === 'word' && L.word) return L.word;
    }
    return '';
  };
})(typeof window !== 'undefined' ? window : this);
