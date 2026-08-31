/* Same-level race. Each player owns one row. The shared level is the
 * highest round anyone published; first to match the goal wins. */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var hbTimer = 0;
  var round = 1;
  var myLevel = null;
  var usedLevel = null;
  var usedRound = 0;
  var seenAt = {};
  var lastList = [];
  var solvedAt = 0;
  var roundOver = false;
  var declined = false;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
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
    var g = root.LGBApp;
    return {
      id: me.id,
      name: me.name,
      levelId: myLevel || (g && g.levelId),
      round: round,
      commands: g ? g.commandCount : 0,
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
    if (root.LGBApp) root.LGBApp.goLevel(levelId, { race: true, fresh: true });
    publish();
  }

  function verdict(players) {
    var won = players.filter(function (p) { return p.solved; });
    if (!won.length) return null;
    won.sort(function (a, b) {
      return (a.solvedAt || a.at || 0) - (b.solvedAt || b.at || 0) ||
        (a.commands || 0) - (b.commands || 0);
    });
    return { winner: won[0] };
  }

  function paint(list) {
    lastList = list || [];
    var players = live(lastList);
    var bar = $('friend-bar');
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    if (!on) {
      if (bar) bar.hidden = true;
      return;
    }
    if (bar) bar.hidden = false;
    var ad = adopted(lastList);
    if (ad && (ad.levelId !== usedLevel || ad.round !== usedRound)) {
      applyLevel(ad.levelId, ad.round);
    }
    var v = verdict(players);
    if (v && !roundOver) {
      roundOver = true;
      if (again) again.hidden = false;
    }
    if (status) {
      if (players.length < 2) status.textContent = 'Waiting for a friend… send the Invite in the bar above.';
      else if (v) {
        status.textContent = (v.winner.id === me.id ? 'You' : (v.winner.name || 'Friend')) +
          ' solved it in ' + (v.winner.commands || 0) + ' commands.';
      } else {
        var lv = root.LGB_LEVELS && root.LGB_LEVELS.levels[myLevel];
        status.textContent = 'Same lesson' + (lv ? ': ' + lv.name : '') + '. First to match the goal wins.';
      }
    }
    if (scores) {
      scores.innerHTML = players.map(function (p) {
        var you = p.id === me.id ? ' (you)' : '';
        var mark = p.solved ? ' ✓' : '';
        return '<li' + (p.id === me.id ? ' class="me"' : '') + '>' +
          esc(p.name || 'Someone') + you + ' · ' + (p.commands || 0) + ' cmds' + mark + '</li>';
      }).join('');
    }
    if (again) again.hidden = !v;
  }

  function ingest(list) {
    paint(list);
  }

  var Net = {
    init: function () {
      api = root.gifos;
      if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
      return Promise.resolve()
        .then(function () { return api.me ? api.me() : { id: 'local', name: 'You' }; })
        .then(function (id) {
          me.id = id && id.id ? id.id : 'local';
          me.name = (id && id.name) || 'You';
          room = api.db('players');
          var n = 0;
          return new Promise(function (resolve) {
            var done = false;
            var finish = function () {
              if (done) return;
              done = true;
              resolve({ owner: true, others: n });
            };
            setTimeout(finish, 1800);
            room.subscribe(function (list) {
              var players = live(list || []);
              n = Math.max(0, players.length - 1);
              ingest(list || []);
              if (players.length > 1) finish();
            });
          });
        })
        .catch(function () { return { owner: true, others: 0 }; });
    },
    join: function (levelId) {
      if (declined) return;
      on = true;
      myLevel = levelId;
      round = Math.max(round, usedRound, 1);
      if ($('friend-bar')) $('friend-bar').hidden = false;
      publish();
      if (!hbTimer) hbTimer = setInterval(publish, HB_MS);
    },
    leave: function () {
      on = false;
      roundOver = false;
      if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
      if ($('friend-bar')) $('friend-bar').hidden = true;
      if (room && me.id) room.delete(me.id).catch(function () {});
    },
    live: function () { return on; },
    onSolved: function () {
      if (!on) return;
      if (!solvedAt) solvedAt = now();
      publish();
    },
    onCommand: function () { if (on) publish(); },
    onLevel: function (levelId) {
      myLevel = levelId;
      if (!on) return;
      round += 1;
      usedLevel = levelId;
      usedRound = round;
      roundOver = false;
      solvedAt = 0;
      publish();
    },
    nextRound: function (levelId) {
      if (!on) return;
      round += 1;
      applyLevel(levelId, round);
    },
    me: function () { return me; }
  };

  root.LGBNet = Net;
})(window);
