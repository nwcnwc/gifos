// Play a friend — a table, not a shared scorecard.
//
// Shared round so everyone is filling the same game of thirteen turns. Each
// player then plays THEIR dice and publishes total + filled lines on THEIR
// row. Nobody writes anybody else's row. When every card is full, highest
// total wins.
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
  var round = 1;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;
  var declined = false;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

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

  // Authority for the round: the highest round anyone has published, then the
  // lexicographically smallest id on that round. Deterministic, and it never
  // needs a shared row — each player only ever puts their own id.
  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, by: cand[0].id };
  }

  function snapshot() {
    var g = root.Yahtzee || {};
    return {
      id: me.id,
      name: me.name,
      round: round,
      total: g.total() || 0,
      filled: g.filled() || 0,
      gameover: !!g.gameover(),
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function applyRound(r) {
    usedRound = r;
    round = r;
    roundOver = false;
    if (root.Yahtzee && root.Yahtzee.resetGame) root.Yahtzee.resetGame();
    publish();
  }

  function verdict(players) {
    if (players.length < 2) return null;
    if (!players.every(function (p) { return p.gameover; })) return null;
    var ranked = players.slice().sort(function (a, b) {
      return (b.total || 0) - (a.total || 0);
    });
    if (ranked[0].total === ranked[1].total) return { kind: 'tie', a: ranked[0], b: ranked[1] };
    return { kind: 'score', winner: ranked[0] };
  }

  function render() {
    if (!on) return;
    var players = live(lastList);
    var v = verdict(players);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    var html = '';
    players.sort(function (a, b) {
      if (!!a.gameover !== !!b.gameover) return a.gameover ? 1 : -1;
      return (b.total || 0) - (a.total || 0);
    });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      var tag = p.gameover
        ? ('done · ' + (p.total || 0))
        : ((p.filled || 0) + '/13 · ' + (p.total || 0));
      html += '<li class="' + (mine ? 'me' : '') + (p.gameover ? ' win' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + tag + '</span></li>';
    });
    scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v) {
      roundOver = true;
      if (v.kind === 'tie') {
        status.textContent = 'Tie at ' + (v.a.total || 0) + '.';
      } else {
        var mineWin = v.winner.id === me.id;
        var who = mineWin ? 'You' : (v.winner.name || 'They');
        status.textContent = who + ' wins with ' + (v.winner.total || 0) + '.';
      }
      again.hidden = false;
    } else {
      roundOver = false;
      again.hidden = true;
      var g = root.Yahtzee || {};
      if (!others.length) {
        status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can fill your card in the meantime — they sit the same round.';
      } else if (g.gameover && g.gameover()) {
        status.textContent = 'Your card is full at ' + (g.total() || 0) + '. Waiting for the others.';
      } else {
        status.textContent = others.length === 1
          ? ((others[0].name || 'Friend') + ' is on ' + (others[0].filled || 0) + '/13.')
          : (others.length + ' playing. Highest total when every card is full.');
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && ad.round !== usedRound) applyRound(ad.round);
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function startTable() {
    on = true;
    root.Yahtzee.mp = true;
    document.body.classList.add('friend');
    $('friend-bar').hidden = false;
    $('friendBtn').hidden = true;
    round = 1;
    usedRound = 0;
    roundOver = false;
    seenAt = {};
    if (!usedRound) applyRound(round);
    beat();
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(beat, HB_MS);
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      var s = $('friend-status');
      if (s) s.textContent = 'Play a friend needs a GifOS room.';
      return;
    }
    room = room || api.db('room');
    var who = (me.id && me.id !== 'local')
      ? Promise.resolve(me)
      : (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' }));
    who.then(function (id) {
      if (id && id.id) { me.id = id.id; me.name = id.name || 'You'; }
      else if (!me.id) { me.id = 'local'; me.name = 'You'; }
      declined = false;
      watch();
      startTable();
    }).catch(function () {});
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) return;
    room = room || api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || me.id || 'local';
      me.name = (id && id.name) || me.name || 'You';
      if (subscribed) return;
      subscribed = true;
      room.subscribe(function (list) {
        lastList = list || [];
        if (!on) {
          if (declined) return;
          var others = live(lastList).filter(function (p) { return p.id && p.id !== me.id; });
          if (others.length) startTable();
        } else {
          onRoom(lastList);
        }
      });
    }).catch(function () {});
  }

  function leave() {
    on = false;
    declined = true;
    root.Yahtzee.mp = false;
    roundOver = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('friendBtn').hidden = false;
    $('againBtn').hidden = true;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (root.Yahtzee && root.Yahtzee.restoreSolo) root.Yahtzee.restoreSolo();
    else if (root.Yahtzee && root.Yahtzee.resetGame) root.Yahtzee.resetGame();
  }

  function playAgain() {
    if (!on || !roundOver) return;
    round = (usedRound || round || 1) + 1;
    applyRound(round);
  }

  function onChange() {
    if (!on) return;
    publish();
    render();
  }

  root.Yahtzee = root.Yahtzee || {};
  root.Yahtzee.Mp = {
    enter: enter,
    leave: leave,
    playAgain: playAgain,
    onChange: onChange,
    watch: watch,
    get on() { return on; },
    get roundOver() { return roundOver; }
  };

  $('friendBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('againBtn').addEventListener('click', function (e) { e.preventDefault(); playAgain(); });
})(window);
