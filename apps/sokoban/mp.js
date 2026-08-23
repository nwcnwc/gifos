// Play a friend — a race on the same warehouse, not a shared floor.
//
// Shared (round, levelId) so both people work the same room. Each player
// publishes solved + move count on THEIR row. Nobody writes anybody else's
// row, and the floor itself never leaves this device. First to park every
// box wins. Invite is OS chrome.
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
  var myLevel = null;
  var round = 1;
  var usedLevel = null;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;
  var solvedAt = 0;
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
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  // Highest round anyone has published, then the lexicographically smallest
  // id on that round. Deterministic; never needs a shared row.
  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.levelId; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, levelId: cand[0].levelId, by: cand[0].id };
  }

  function snapshot() {
    var g = root.SKGame;
    return {
      id: me.id,
      name: me.name,
      levelId: myLevel || (g && g.levelId),
      round: round,
      moves: g ? g.moves : 0,
      pushes: g ? g.pushes : 0,
      parked: g ? g.parked : 0,
      total: g ? g.total : 0,
      solved: !!(g && g.solved),
      solvedAt: solvedAt || 0,
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function applyLevel(levelId, r) {
    usedLevel = levelId;
    usedRound = r;
    round = r;
    myLevel = levelId;
    roundOver = false;
    solvedAt = 0;
    if (root.SKGame) root.SKGame.goLevel(levelId, { race: true, fresh: true });
    publish();
  }

  function verdict(players) {
    var won = players.filter(function (p) { return p.solved; });
    if (!won.length) return null;
    won.sort(function (a, b) {
      return (a.solvedAt || a.at || 0) - (b.solvedAt || b.at || 0) ||
        (a.moves || 0) - (b.moves || 0) ||
        (a.pushes || 0) - (b.pushes || 0);
    });
    return { winner: won[0] };
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
      if (a.solved && b.solved) return (a.solvedAt || 0) - (b.solvedAt || 0);
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      return (a.moves || 0) - (b.moves || 0);
    });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      var tag = p.solved
        ? ('solved · ' + (p.moves || 0))
        : ((p.moves || 0) + ' move' + ((p.moves || 0) === 1 ? '' : 's') +
          ' · ' + (p.parked || 0) + '/' + (p.total || 0));
      html += '<li class="' + (mine ? 'me' : '') + (p.solved ? ' win' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + tag + '</span></li>';
    });
    scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v) {
      roundOver = true;
      var mineWin = v.winner.id === me.id;
      var who = mineWin ? 'You' : (v.winner.name || 'They');
      status.textContent = who + ' parked every box' +
        (v.winner.moves != null ? ' in ' + v.winner.moves + ' move' + (v.winner.moves === 1 ? '' : 's') : '') + '.';
      again.hidden = false;
    } else {
      roundOver = false;
      again.hidden = true;
      if (!others.length) {
        status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can push in the meantime — they get the same warehouse.';
      } else if (root.SKGame && root.SKGame.solved) {
        status.textContent = 'You parked them. Waiting to see if anyone was first.';
      } else {
        status.textContent = others.length === 1
          ? ((others[0].name || 'Friend') + ' is on ' + (others[0].moves || 0) + ' move' + ((others[0].moves || 0) === 1 ? '' : 's') + '.')
          : (others.length + ' playing. First to park every box wins.');
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.levelId !== usedLevel || ad.round !== usedRound)) {
      if (ad.by !== me.id) myLevel = ad.levelId;
      applyLevel(ad.levelId, ad.round);
    }
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function startRace() {
    on = true;
    document.body.classList.add('friend');
    $('friend-bar').hidden = false;
    $('friendBtn').hidden = true;
    $('levels').disabled = true;
    myLevel = (root.SKGame && root.SKGame.levelId) || 1;
    round = 1;
    usedLevel = null;
    usedRound = 0;
    roundOver = false;
    solvedAt = 0;
    seenAt = {};
    if (!usedLevel) applyLevel(myLevel, round);
    beat();
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(beat, HB_MS);
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Play a friend needs a GifOS room.';
      return;
    }
    room = room || api.db('players');
    var who = (me.id && me.id !== 'local')
      ? Promise.resolve(me)
      : (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' }));
    who.then(function (id) {
      if (id && id.id) { me.id = id.id; me.name = id.name || 'You'; }
      else if (!me.id) { me.id = 'local'; me.name = 'You'; }
      declined = false;
      watch();
      startRace();
    }).catch(function () {});
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) return;
    room = room || api.db('players');
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
          if (others.length) startRace();
        } else {
          onRoom(lastList);
        }
      });
    }).catch(function () {});
  }

  function leave() {
    on = false;
    declined = true;
    roundOver = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('friendBtn').hidden = false;
    $('againBtn').hidden = true;
    $('levels').disabled = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function playAgain() {
    if (!on || !roundOver) return;
    var next = root.SK && root.SK.nextId(usedLevel || myLevel);
    myLevel = next;
    round = (usedRound || round || 1) + 1;
    applyLevel(myLevel, round);
  }

  function onSolved() {
    if (!on) return;
    if (!solvedAt) solvedAt = now();
    publish();
    render();
  }

  function onChange() {
    if (!on) return;
    publish();
    render();
  }

  root.SKMp = {
    enter: enter,
    leave: leave,
    playAgain: playAgain,
    onSolved: onSolved,
    onChange: onChange,
    watch: watch,
    get on() { return on; }
  };

  $('friendBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('againBtn').addEventListener('click', function (e) { e.preventDefault(); playAgain(); });
})(window);
