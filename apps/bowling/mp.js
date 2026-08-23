/* Take turns. Each player writes their score on THEIR row. Nobody writes
 * anybody else's. Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var STALE_MS = 4000;
  var HB_MS = 1000;
  var PUBLISH_HZ = 12;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var lastList = [];
  var seenAt = {};
  var lastPub = 0;
  var round = 1;
  var hadOther = false;

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

  function othersOf(players) {
    return players.filter(function (p) { return p.id !== me.id; });
  }

  function completed(p) {
    return (p.frames && p.frames.length) || 0;
  }

  function midFrame(p) {
    return !!(p.cur && p.cur.length && !p.done);
  }

  /* Fewest finished frames bowls next. A player who has started a frame
   * finishes it. Roster order is id. Derived from own rows only. */
  function whoseTurn(players) {
    var roster = players.slice().sort(function (a, b) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    var open = roster.filter(function (p) { return !p.done; });
    if (!open.length) return null;
    var mid = open.filter(midFrame);
    if (mid.length) return mid[0];
    var minC = 99;
    open.forEach(function (p) {
      var c = completed(p);
      if (c < minC) minC = c;
    });
    var cand = open.filter(function (p) { return completed(p) === minC; });
    return cand[0] || null;
  }

  function adoptedRound(players) {
    var maxR = 1;
    players.forEach(function (p) {
      if ((p.round || 1) > maxR) maxR = p.round || 1;
    });
    return maxR;
  }

  function snapshot(game) {
    var rec = {
      id: me.id,
      name: me.name,
      at: now(),
      round: round,
      frames: game ? game.frames : [],
      cur: game ? game.cur : [],
      total: game ? root.Bowl.Score.total(game.frames) : 0,
      done: !!(game && root.Bowl.Score.gameOver(game.frames)),
      standing: game ? game.standing() : 10
    };
    if (game) {
      rec.lane = game.pack();
      rec.aimX = game.ball.x;
    }
    return rec;
  }

  function publish(game, force) {
    if (!on || !room || !me.id) return;
    var t = now();
    if (!force) {
      if (t - lastPub < 1000 / PUBLISH_HZ) return;
    }
    lastPub = t;
    room.put(snapshot(game)).catch(function () {});
  }

  var Mp = {
    me: function () { return me; },
    on: function () { return on; },
    round: function () { return round; },
    setRound: function (r) { round = r; },
    live: function () { return live(lastList); },
    others: function () { return othersOf(live(lastList)); },
    turn: function () { return whoseTurn(live(lastList)); },
    myTurn: function () {
      if (!on || !me.id) return true;
      var players = live(lastList);
      if (othersOf(players).length === 0) return true;
      var w = whoseTurn(players);
      return !!(w && w.id === me.id);
    },
    adoptedRound: function () { return adoptedRound(live(lastList)); },
    publish: publish,
    esc: esc,
    enter: enter,
    leave: leave,
    onList: null
  };

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var players = live(lastList);
    var other = othersOf(players).length > 0;
    if (other && !hadOther) hadOther = true;
    if (Mp.onList) Mp.onList(players, hadOther && other);
  }

  function beat(game) {
    if (!on) return;
    publish(game, true);
  }

  function enter(game) {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onList) Mp.onList([], false);
      return;
    }
    room = api.db('players');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      hadOther = false;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      beat(game);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () { beat(game); }, HB_MS);
    }).catch(function () {});
  }

  function leave() {
    on = false;
    hadOther = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
  }

  root.BowlMp = Mp;
})(window);
