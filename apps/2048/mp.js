// Play a friend — a race, not a shared board.
//
// Shared seed so both boards spawn the same opening tiles. Each player then
// plays THEIR board and publishes score + board hash on THEIR row. Nobody
// writes anybody else's row. First to the 2048 tile wins; if boards fill up
// first, highest score among the stuck boards takes it.
//
// Invite is OS chrome. This file only tells the player to press Invite.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var mySeed = 0;
  var round = 1;
  var usedSeed = null;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function newSeed() { return (Math.random() * 0x100000000) >>> 0; }

  function boardHash(grid) {
    var h = 2166136261;
    if (!grid || !grid.eachCell) return '0';
    grid.eachCell(function (x, y, tile) {
      var v = tile ? tile.value : 0;
      h ^= v;
      h = Math.imul(h, 16777619);
    });
    return (h >>> 0).toString(16);
  }

  function maxTile(grid) {
    var m = 0;
    if (!grid || !grid.eachCell) return 0;
    grid.eachCell(function (x, y, tile) {
      if (tile && tile.value > m) m = tile.value;
    });
    return m;
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      var rec = seenAt[p.id];
      if (t - rec.seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  // Authority for (round, seed): the highest round anyone has published, then
  // the lexicographically smallest id on that round. Deterministic, and it
  // never needs a shared row — each player only ever puts their own id.
  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.seed != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, seed: cand[0].seed, by: cand[0].id };
  }

  function snapshot() {
    var g = root.G2048 && root.G2048.game;
    return {
      id: me.id,
      name: me.name,
      seed: mySeed,
      round: round,
      score: g ? g.score : 0,
      hash: g ? boardHash(g.grid) : '0',
      max: g ? maxTile(g.grid) : 0,
      won: !!(g && g.won),
      over: !!(g && g.over),
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function applySeed(seed, r) {
    usedSeed = seed;
    usedRound = r;
    round = r;
    roundOver = false;
    root.G2048.frozen = false;
    root.G2048.random = mulberry32(seed >>> 0);
    var g = root.G2048.game;
    if (g && g.resetBoard) g.resetBoard();
    publish();
  }

  function verdict(players) {
    if (!players.length) return null;
    var won = players.filter(function (p) { return p.won; });
    if (won.length) {
      won.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      return { kind: '2048', winner: won[0] };
    }
    if (players.length < 2) return null;
    if (!players.every(function (p) { return p.over; })) return null;
    var ranked = players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    if (ranked[0].score === ranked[1].score) return { kind: 'tie', a: ranked[0], b: ranked[1] };
    return { kind: 'score', winner: ranked[0] };
  }

  function overlay(text, won) {
    var el = document.querySelector('.game-message');
    if (!el) return;
    el.classList.remove('game-won', 'game-over');
    if (!text) return;
    el.classList.add(won ? 'game-won' : 'game-over');
    var p = el.getElementsByTagName('p')[0];
    if (p) p.textContent = text;
  }

  function fmt(n) {
    return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function chipClass(max) {
    if (!max) return '';
    if (max >= 4096) return 'chip chip-super';
    return 'chip chip-' + max;
  }

  function render() {
    if (!on) return;
    var players = live(lastList);
    var v = verdict(players);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    var html = '';
    players.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      var max = p.max || 0;
      // No '2048' tag: reaching it freezes the board, so the chip beside it
      // already reads 2048 and the row is already lit by .win.
      var tag = !p.won && p.over ? 'out' : '';
      html += '<li class="' + (mine ? 'me' : '') + (p.won ? ' win' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="score">' + fmt(p.score || 0) + '</span>' +
        (max ? '<span class="' + chipClass(max) + '">' + max + '</span>' : '') +
        (tag ? '<span class="tag">' + tag + '</span>' : '') +
        '</li>';
    });
    scores.innerHTML = html;

    // The list above is the ONLY place a score is printed. This line says what
    // the list cannot — what to do next, who is out, why a round ended — and
    // never repeats a number sitting an inch to its left.
    var mineRow = players.filter(function (p) { return p.id === me.id; })[0];
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v) {
      roundOver = true;
      root.G2048.frozen = true;
      if (v.kind === 'tie') {
        status.textContent = 'Tie — nobody reached 2048.';
        overlay('Tie!', false);
      } else {
        var mineWin = v.winner.id === me.id;
        var nm = mineWin ? '' : v.winner.name;
        var who = mineWin ? 'You' : (nm || 'They');
        // 'You' and the 'They' fallback take a plural verb; a name does not.
        var wins = (mineWin || !nm) ? ' win' : ' wins';
        status.textContent = v.kind === '2048'
          ? who + ' reached 2048 first.'
          : who + wins + ' on score.';
        overlay(who + wins + '!', mineWin);
      }
      again.hidden = false;
    } else {
      roundOver = false;
      again.hidden = true;
      var g = root.G2048.game;
      if (!others.length) {
        status.innerHTML = 'Press <b>Invite</b> to send the link. Same tiles — first to 2048.';
      } else if (g && g.over && !g.won) {
        // The overlay across the board already says you're out.
        status.textContent = 'Highest score wins if nobody reaches 2048.';
        overlay('You’re out', false);
      } else if (g && g.won) {
        status.textContent = 'You reached 2048.';
      } else if (others.length === 1) {
        // A gap is the one thing two printed scores do not tell you.
        var lead = ((mineRow ? mineRow.score : g ? g.score : 0) || 0) - (others[0].score || 0);
        status.textContent = lead > 0 ? 'You’re ' + fmt(lead) + ' ahead.'
          : lead < 0 ? 'You’re ' + fmt(-lead) + ' behind.'
          : 'Dead even.';
      } else {
        status.textContent = others.length + ' playing. First to 2048.';
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.seed !== usedSeed || ad.round !== usedRound)) {
      if (ad.by !== me.id) mySeed = ad.seed;
      applySeed(ad.seed, ad.round);
    }
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      var s = $('friend-status');
      $('friend-bar').hidden = false;
      if (s) s.textContent = 'Play a friend needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      root.G2048.mp = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('friendBtn').hidden = true;
      mySeed = newSeed();
      round = 1;
      usedSeed = null;
      usedRound = 0;
      roundOver = false;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedSeed) applySeed(mySeed, round);
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
  }

  function leave() {
    on = false;
    root.G2048.mp = false;
    root.G2048.frozen = false;
    root.G2048.random = null;
    roundOver = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('friendBtn').hidden = false;
    $('againBtn').hidden = true;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    overlay('');
    var g = root.G2048.game;
    if (g) {
      g.actuator.continueGame();
      g.setup();
    }
  }

  function playAgain() {
    if (!on || !roundOver) return;
    mySeed = newSeed();
    round = (usedRound || round || 1) + 1;
    applySeed(mySeed, round);
  }

  function onActuate(game) {
    if (!on) return;
    publish();
    render();
    if (game && game.won) {
      root.G2048.frozen = true;
    }
  }

  function onRestart() {
    if (!on) return false;
    if (roundOver) playAgain();
    return true;
  }

  root.G2048 = root.G2048 || {};
  root.G2048.Mp = {
    enter: enter,
    leave: leave,
    playAgain: playAgain,
    onActuate: onActuate,
    onRestart: onRestart,
    mulberry32: mulberry32
  };

  $('friendBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('againBtn').addEventListener('click', function (e) { e.preventDefault(); playAgain(); });
})(window);
