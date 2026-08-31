/* Same-level race. Each player owns one row. The shared level is the
 * highest round anyone published; first to match the goal wins.
 *
 * Invite remounts the GIF in a new room. `on` dies with the page, so
 * join cannot be a one-shot 1.8s window: keep watching, rejoin if we
 * were racing, and a guest (info.owner === false) joins without a tap.
 * The owner/lead row wins a tie so the host's lesson is the one that
 * lands, not whoever published intro-commits first. */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var owner = true;
  var on = false;
  var subscribed = false;
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

  function othersOf(list) {
    return live(list).filter(function (p) { return p.id && p.id !== me.id; });
  }

  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.levelId; });
    if (!cand.length) return null;
    var leads = cand.filter(function (p) { return p.lead; });
    if (leads.length) cand = leads;
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
      lead: !!owner,
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function markRacing(v) {
    var g = root.LGBApp;
    if (!g) return;
    g.racing = !!v;
    if (g.touchSave) g.touchSave();
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

  function showBar(show) {
    var bar = $('friend-bar');
    var btn = $('friendBtn');
    if (bar) bar.hidden = !show;
    if (btn) btn.hidden = !!show;
  }

  function paint(list) {
    lastList = list || [];
    var players = live(lastList);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    if (!on) {
      showBar(false);
      return;
    }
    showBar(true);
    var ad = adopted(lastList);
    if (ad && (ad.levelId !== usedLevel || ad.round !== usedRound)) {
      var follow = !owner || (ad.round || 1) > usedRound;
      if (follow) applyLevel(ad.levelId, ad.round);
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

  function join(levelId) {
    if (declined) return;
    var already = on;
    on = true;
    if (owner) markRacing(true);
    myLevel = levelId || myLevel || (root.LGBApp && root.LGBApp.levelId);
    round = Math.max(round, usedRound, 1);
    showBar(true);
    if (!already) {
      usedLevel = null;
      usedRound = 0;
    }
    var ad = adopted(lastList);
    if (!owner && ad && ad.levelId) {
      applyLevel(ad.levelId, ad.round);
    } else {
      usedLevel = myLevel;
      usedRound = round;
      publish();
    }
    if (!hbTimer) hbTimer = setInterval(publish, HB_MS);
  }

  function maybeAutoJoin() {
    if (on || declined) return;
    var others = othersOf(lastList);
    var racing = !!(root.LGBApp && root.LGBApp.racing);
    if (!owner || others.length || racing) {
      var ad = adopted(lastList);
      var mine = (root.LGBApp && root.LGBApp.levelId) || myLevel;
      join(owner || racing ? mine : ((ad && ad.levelId) || mine));
    }
  }

  function ingest(list) {
    lastList = list || [];
    maybeAutoJoin();
    paint(lastList);
  }

  function bootJoin() {
    maybeAutoJoin();
    if (on) paint(lastList);
  }

  var Net = {
    init: function () {
      api = root.gifos;
      if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
      var infoP = api.info
        ? api.info().then(function (i) { owner = !!(i && i.owner); return owner; })
            .catch(function () { owner = true; return true; })
        : Promise.resolve(true);
      return infoP.then(function () {
        return api.me ? api.me() : { id: 'local', name: 'You' };
      }).then(function (id) {
        me.id = id && id.id ? id.id : 'local';
        me.name = (id && id.name) || 'You';
        room = api.db('players');
        return new Promise(function (resolve) {
          var done = false;
          var finish = function () {
            if (done) return;
            done = true;
            resolve({ owner: owner, others: othersOf(lastList).length });
          };
          setTimeout(finish, 1800);
          if (subscribed) {
            ingest(lastList);
            finish();
            return;
          }
          subscribed = true;
          room.subscribe(function (list) {
            ingest(list || []);
            finish();
          });
        });
      }).catch(function () { return { owner: true, others: 0 }; });
    },
    join: join,
    bootJoin: bootJoin,
    leave: function () {
      on = false;
      declined = true;
      roundOver = false;
      markRacing(false);
      if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
      showBar(false);
      if (room && me.id) room.delete(me.id).catch(function () {});
    },
    live: function () { return on; },
    owner: function () { return owner; },
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
})(typeof window !== 'undefined' ? window : this);
