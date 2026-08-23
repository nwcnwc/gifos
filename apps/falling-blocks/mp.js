// Play a friend — a race, not a shared board.
//
// Shared seed so both boards spawn the same sequence of shapes. Each player
// then plays THEIR board and publishes score + lines + the well on THEIR row.
// Nobody writes anybody else's row. Last one still stacking wins; if both
// boards fill up, highest score among the stuck boards takes it.
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
  var lastPub = 0;

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
    var FB = root.FB || {};
    return {
      id: me.id,
      name: me.name,
      seed: mySeed,
      round: round,
      score: FB.score || 0,
      lines: FB.lines || 0,
      over: !!(FB.over || (typeof lose !== 'undefined' && lose)),
      board: FB.packBoard ? FB.packBoard() : '',
      piece: FB.packPiece ? FB.packPiece() : '',
      cx: (typeof currentX === 'number') ? currentX : 0,
      cy: (typeof currentY === 'number') ? currentY : 0,
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    room.put(snapshot()).catch(function () {});
  }

  function applySeed(seed, r) {
    usedSeed = seed;
    usedRound = r;
    round = r;
    roundOver = false;
    root.FB.frozen = false;
    root.FB.over = false;
    root.FB.random = mulberry32(seed >>> 0);
    if (root.FB.banner) root.FB.banner('');
    if (typeof newGame === 'function') newGame();
    var pb = $('playbutton');
    if (pb) pb.disabled = true;
    lastPub = 0;
    publish();
  }

  function verdict(players) {
    if (players.length < 2) return null;
    var alive = players.filter(function (p) { return !p.over; });
    if (alive.length === 1) return { kind: 'last', winner: alive[0] };
    if (alive.length > 1) return null;
    var ranked = players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    if ((ranked[0].score || 0) === (ranked[1].score || 0)) return { kind: 'tie', a: ranked[0], b: ranked[1] };
    return { kind: 'score', winner: ranked[0] };
  }

  function pickOther(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) return null;
    others.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return others[0];
  }

  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var v = verdict(players);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    var wrap = $('them-wrap');
    var html = '';
    players.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      var tag = p.over ? 'out' : 'stacking';
      html += '<li class="' + (mine ? 'me' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + (p.score || 0) + ' · ' + (p.lines || 0) + ' lines · ' + tag + '</span>' +
        '</li>';
    });
    scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var other = pickOther(players);
    if (wrap) wrap.hidden = !other;
    if (other) {
      var nm = $('them-name');
      if (nm) nm.textContent = other.name || 'Friend';
      if (root.FB.paintThem) root.FB.paintThem(other);
    }

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v) {
      roundOver = true;
      root.FB.frozen = true;
      if (typeof clearAllIntervals === 'function') clearAllIntervals();
      if (v.kind === 'tie') {
        status.textContent = 'Tie at ' + (v.a.score || 0) + '.';
        if (root.FB.banner) root.FB.banner('Tie!', 'lose');
      } else {
        var mineWin = v.winner.id === me.id;
        var who = mineWin ? 'You' : (v.winner.name || 'They');
        var why = v.kind === 'last' ? ' still stacking' : ' wins on score';
        status.textContent = who + why + ' (' + (v.winner.score || 0) + ').';
        if (root.FB.banner) root.FB.banner(mineWin ? 'You win!' : (v.winner.name || 'They') + ' wins!', mineWin ? 'win' : 'lose');
      }
      again.hidden = false;
    } else {
      roundOver = false;
      again.hidden = true;
      if (!others.length) {
        status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can play in the meantime — they start from the same shapes.';
      } else if (root.FB.over) {
        status.textContent = 'You’re out. Waiting to see if anyone still stacking beats ' + (root.FB.score || 0) + '.';
        if (root.FB.banner) root.FB.banner('You’re out', 'lose');
      } else {
        status.textContent = others.length === 1
          ? (others[0].name || 'Friend') + ' is on ' + (others[0].score || 0) + '.'
          : others.length + ' playing. Last one stacking, or highest score when the boards fill.';
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
    renderMp();
  }

  function beat() {
    if (!on) return;
    lastPub = 0;
    publish();
    renderMp();
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
      root.FB.mp = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('friendBtn').hidden = true;
      var mn = $('mine-name');
      if (mn) mn.textContent = 'You';
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
    root.FB.mp = false;
    root.FB.frozen = false;
    root.FB.random = null;
    roundOver = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('friendBtn').hidden = false;
    $('againBtn').hidden = true;
    var wrap = $('them-wrap');
    if (wrap) wrap.hidden = true;
    if (root.FB.banner) root.FB.banner('');
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (typeof clearAllIntervals === 'function') clearAllIntervals();
    if (typeof init === 'function') init();
    var pb = $('playbutton');
    if (pb) pb.disabled = false;
    if (root.FB.paintHud) root.FB.paintHud();
  }

  function playAgain() {
    if (!on || !roundOver) return;
    mySeed = newSeed();
    round = (usedRound || round || 1) + 1;
    applySeed(mySeed, round);
  }

  function onActuate() {
    if (!on) return;
    publish();
    renderMp();
  }

  function onRestart() {
    if (!on) return false;
    if (roundOver) playAgain();
    return true;
  }

  root.FB = root.FB || {};
  root.FB.Mp = {
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
